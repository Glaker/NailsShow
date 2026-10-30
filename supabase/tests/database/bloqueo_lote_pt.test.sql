-- ---------------------------------------------------------------------------
-- pgTAP · RN-51 / RN-52 sobre producto terminado (20261001160000/160100).
--
-- Un lote de producto terminado (orden de producción) liberado es despachable;
-- bloqueado por retiro de mercado deja de serlo y su venta se rechaza; con el
-- bloqueo levantado por Dirección Técnica, sale y la salida lleva su lote.
-- La pregunta es siempre gmp.lote_despachable() (CLAUDE.md §4).
--
-- Corre con `supabase test db` (CI, .github/workflows/ci.yml). Todo dentro de
-- una transacción que se deshace.
-- ---------------------------------------------------------------------------

begin;
select plan(7);

-- Sesión de un usuario: los claims que pone el hook de access token.
create function pg_temp.como(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    (select json_build_object('sub', id, 'usuario_id', id, 'rol', rol, 'roles', json_build_array(rol),
                              'role', 'authenticated')::text
       from core.usuarios where email = p_email), true);
  set local role authenticated;
end;
$$;

insert into core.usuarios (nombre_completo, email, rol, sector) values
  ('DT de prueba', 'dt@pgtap', 'DIRECCION_TECNICA', 'DIRECCION_TECNICA'),
  ('GP de prueba', 'gp@pgtap', 'GERENCIA_PRODUCCION', 'PRODUCCION'),
  ('Calle 5 de prueba', 'c5@pgtap', 'ENCARGADA_STOCK', 'DEPOSITO');

create temporary table t (clave text primary key, valor uuid) on commit drop;
grant all on t to authenticated;
insert into t values ('duo', (select id from gmp.productos where codigo_interno = 'DUO01'));

-- Un lote producido y liberado, con 4 unidades en fábrica.
select pg_temp.como('dt@pgtap');
with x as (
  insert into gmp.formulas_fabricacion (producto_id, version)
  values ((select valor from t where clave = 'duo'), '99') returning id)
insert into t select 'formula', id from x;
select pg_temp.como('gp@pgtap');
with x as (
  insert into comercial.pedidos (numero, cliente) values ('PGTAP-1', 'Ana') returning id)
insert into t select 'p1', id from x;
insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario)
values ((select valor from t where clave = 'p1'), (select valor from t where clave = 'duo'), 4, 1);
update comercial.pedidos set estado = 'CONFIRMADO' where id = (select valor from t where clave = 'p1');
with x as (
  insert into gmp.ordenes_produccion (formula_id, producto_id, jornada, partida, cantidad_teorica)
  values ((select valor from t where clave = 'formula'), (select valor from t where clave = 'duo'), current_date, 99, 1)
  returning id)
insert into t select 'orden', id from x;
insert into comercial.pedido_ordenes (pedido_id, orden_id)
values ((select valor from t where clave = 'p1'), (select valor from t where clave = 'orden'));
-- Terminar el pedido descuenta los materiales de DUO01 (la bolsita 105BOL), y
-- en una base vacía no hay stock: 20261020120000 lo dejó en cero. Se cuenta
-- stock de cada material, como en planta, antes de terminar.
select pg_temp.como('dt@pgtap');
select comercial.registrar_conteo(ma.insumo_id, 100, 'stock para la prueba', false)
  from gmp.materiales_acondicionamiento ma
 where ma.producto_id = (select valor from t where clave = 'duo') and ma.activo;
select pg_temp.como('gp@pgtap');
select comercial.terminar_pedido((select valor from t where clave = 'p1'));
-- Liberación de atajo, como liberarAtajo de pglite/lib.mjs: los triggers de
-- ordenes_produccion exigen etapas y control de calidad (20261016120000), que
-- acá no se prueban. Se apagan solo para este UPDATE, dentro de la
-- transacción que se deshace al final; lo hace el dueño de la tabla.
reset role;
alter table gmp.ordenes_produccion disable trigger user;
update gmp.ordenes_produccion
   set estado = 'LIBERADA',
       terminada_por = (select id from core.usuarios where email = 'dt@pgtap'), terminada_en = now(),
       liberada_por = (select id from core.usuarios where email = 'dt@pgtap'), liberada_en = now()
 where id = (select valor from t where clave = 'orden');
alter table gmp.ordenes_produccion enable trigger user;

-- Un segundo pedido que se lleva esas 4 unidades.
select pg_temp.como('gp@pgtap');
with x as (
  insert into comercial.pedidos (numero, cliente) values ('PGTAP-2', 'Beto') returning id)
insert into t select 'p2', id from x;
insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario)
values ((select valor from t where clave = 'p2'), (select valor from t where clave = 'duo'), 4, 1);
update comercial.pedidos set estado = 'CONFIRMADO' where id = (select valor from t where clave = 'p2');

select ok(gmp.lote_despachable((select valor from t where clave = 'orden')),
          'RN-51: el lote de producto terminado liberado es despachable');

select pg_temp.como('dt@pgtap');
insert into gmp.bloqueos_lote (orden_id, motivo, detalle)
values ((select valor from t where clave = 'orden'), 'RETIRO_MERCADO', 'retiro de prueba');

select ok(not gmp.lote_despachable((select valor from t where clave = 'orden')),
          'RN-52: el lote bloqueado por retiro de mercado deja de ser despachable');
select matches(gmp.impedimento_despacho_orden((select valor from t where clave = 'orden')), 'RN-52',
               'el motivo del impedimento cita RN-52');
select throws_like(
  $$insert into gmp.bloqueos_lote (motivo, detalle) values ('INVESTIGACION', 'sin lote')$$,
  '%bloqueos_lote_un_lote%',
  'un bloqueo es de un lote de insumo o de uno de producto terminado');

select pg_temp.como('c5@pgtap');
select throws_like(
  format($$select comercial.despachar_pedido(%L, %L::jsonb, 'PTF', false)$$,
         (select valor from t where clave = 'p2'),
         json_build_array(json_build_object('producto_id', (select valor from t where clave = 'duo'), 'cantidad', 4))),
  '%bloqueados%',
  'RN-52: la venta de un lote bloqueado se rechaza');

select pg_temp.como('dt@pgtap');
update gmp.bloqueos_lote set levantado = true, levantado_motivo = 'retiro descartado'
 where orden_id = (select valor from t where clave = 'orden');

select pg_temp.como('c5@pgtap');
select lives_ok(
  format($$select comercial.despachar_pedido(%L, %L::jsonb, 'PTF', false)$$,
         (select valor from t where clave = 'p2'),
         json_build_array(json_build_object('producto_id', (select valor from t where clave = 'duo'), 'cantidad', 4))),
  'levantado el bloqueo por la DT, el lote sale');
select is(
  (select orden_id from comercial.movimientos_pt
    where documento_id = (select valor from t where clave = 'p2') and tipo = 'SALIDA_VENTA'),
  (select valor from t where clave = 'orden'),
  'la salida registra el lote despachado');

select * from finish();
rollback;

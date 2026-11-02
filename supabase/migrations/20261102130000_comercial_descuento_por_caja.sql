-- ---------------------------------------------------------------------------
-- Propósito : Descuento por caja cerrada en los pedidos de venta. Cada producto
--             que se vende en caja tiene su porcentaje por defecto y cuántas
--             unidades trae la caja; Ventas lo marca en el renglón y puede
--             cambiar el porcentaje. Se carga la lista de cajas de Ventas.
-- Reglas    : §4.12.1 (precios versionados: el porcentaje vigente es el
--             último cargado), RN-50. Pedido del 2026-11-02
--             (D-descuento-caja-1).
-- Fecha     : 2026-11-02
-- ---------------------------------------------------------------------------
--
-- CÓMO SE CALCULA.
-- El descuento de caja se aplica sobre el precio promocional, después del
-- descuento del pedido (escala o fijo), y se suma a él: no lo reemplaza.
--   precio final por unidad = redondeo(redondeo(promo × (1 − pedido %)) × (1 − caja %))
-- Con el pedido sin descuento, una caja de 98 monómeros de 100 ml da
-- 8.500 × 98 × 0,95 = 791.350, el precio final de la lista de cajas.
--
-- POR QUÉ NO 16 %.
-- La lista de precios mostraba la caja de monómero con «16 %» sobre el precio
-- de lista. Es la suma de dos cosas distintas: el 11 % del precio
-- promocional (que ya está en precio_promo) y el 5 % de la caja. Acá se
-- guarda solo el de la caja.
--
-- QUÉ SE CARGA.
-- Las 11 cajas con código y las 8 de aromas (sin código: cada aroma es un
-- producto, y la caja se arma combinándolos). Las de aromas llevan el mismo
-- porcentaje en cada aroma. El removedor de litro (195) y los sanitizantes de
-- 1 L (NS-397, NS-398, NS-399) quedan cargados aunque hoy no están en la lista
-- mayorista: sin precio promocional no se pueden vender por la planilla.

create table comercial.descuentos_caja (
  id            uuid primary key default gen_random_uuid(),
  -- Desempata dos cargas del mismo momento: la última es la vigente.
  orden         bigint generated always as identity,
  producto_id   uuid not null references gmp.productos(id),
  unidades_caja integer not null check (unidades_caja > 0),
  porcentaje    numeric(5,2) not null check (porcentaje between 0 and 100),
  descripcion   text,
  cargado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en    timestamptz not null default now()
);

comment on table comercial.descuentos_caja is
  'Descuento por caja cerrada de cada producto, versionado: rige el último cargado. No se edita ni se borra '
  '(D-descuento-caja-1).';

create index descuentos_caja_producto_idx on comercial.descuentos_caja (producto_id, orden desc);
create index descuentos_caja_cargado_por_idx on comercial.descuentos_caja (cargado_por);

alter table comercial.descuentos_caja enable row level security;
alter table comercial.descuentos_caja force  row level security;

grant select, insert on comercial.descuentos_caja to authenticated;

create policy descuentos_caja_select_authenticated on comercial.descuentos_caja
  for select to authenticated using (core.rol() is not null);
comment on policy descuentos_caja_select_authenticated on comercial.descuentos_caja is
  '§3.3: consulta para todos los roles.';

create policy descuentos_caja_insert_ventas on comercial.descuentos_caja
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') and cargado_por = core.usuario_actual());
comment on policy descuentos_caja_insert_ventas on comercial.descuentos_caja is
  'Lo carga quien carga la lista mayorista (Ventas, Administración, Gerencia), a su nombre. Sin UPDATE ni DELETE.';

select core.adjuntar_auditoria('comercial.descuentos_caja');

create view comercial.v_descuentos_caja with (security_invoker = true) as
select distinct on (producto_id) producto_id, unidades_caja, porcentaje, descripcion, cargado_en
  from comercial.descuentos_caja
 order by producto_id, orden desc;

comment on view comercial.v_descuentos_caja is
  'Descuento por caja vigente de cada producto (D-descuento-caja-1).';
grant select on comercial.v_descuentos_caja to authenticated;

-- El renglón marcado con descuento por caja. NULL = no lleva.
alter table comercial.pedido_renglones
  add column descuento_caja_pct numeric(5,2)
    check (descuento_caja_pct is null or descuento_caja_pct between 0 and 100);

comment on column comercial.pedido_renglones.descuento_caja_pct is
  'Venta mayorista: % de descuento por caja cerrada que marcó Ventas en el renglón, sobre el precio con el '
  'descuento del pedido. NULL = sin descuento por caja (D-descuento-caja-1).';

-- Copia de 20261019130100 con un cambio (NUEVO): el descuento por caja.
create or replace function comercial.recalcular_venta(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_base   numeric;
  v_desc   numeric;
begin
  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found or not v_pedido.es_venta
     or v_pedido.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
    return;
  end if;
  select coalesce(sum(cantidad * coalesce(precio_base, 0)), 0) into v_base
    from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado;
  v_desc := coalesce(v_pedido.descuento_pct, comercial.descuento_por_monto(v_base));

  update comercial.pedido_renglones r
     set precio_final    = x.final,
         precio_unitario = round(x.final / (1 + r.alicuota_iva / 100), 4)
    from (select id,
                 case when precio_manual then precio_final
                      -- NUEVO (D-descuento-caja-1): × (1 − caja %), redondeado a pesos.
                      else round(round(round(precio_base / greatest(coalesce(
                             (select unidades_pack from comercial.v_lista_mayorista l
                               where l.producto_id = rr.producto_id), 1), 1)
                             * (1 - v_desc / 100), 0)
                             * (1 - coalesce(rr.descuento_caja_pct, 0) / 100), 0)
                           * coalesce((select unidades_pack from comercial.v_lista_mayorista l
                                        where l.producto_id = rr.producto_id), 1), 2)
                 end as final
            from comercial.pedido_renglones rr
           where rr.pedido_id = p_pedido_id and not rr.anulado
             and (rr.precio_manual or rr.precio_base is not null)) x
   where r.id = x.id
     and (r.precio_final is distinct from x.final
          or r.precio_unitario is distinct from round(x.final / (1 + r.alicuota_iva / 100), 4));
end;
$$;

comment on function comercial.recalcular_venta(uuid) is
  'Pedido de venta todavía no aprobado: aplica el descuento del pedido (el fijado o el de la escala) y, si el '
  'renglón lo marca, el de caja. Precio final por unidad = redondeo(redondeo(promo × (1 − pedido %)) × '
  '(1 − caja %)), × unidades del pack (D-descuento-caja-1).';

-- Datos: la lista de cajas de Ventas del 2026-11-02, a nombre de la Dirección
-- Técnica activa como las otras cargas de precios; desde acá lo cambia Ventas.
do $$
declare
  v_autor  uuid;
  v_faltan text;
begin
  select id into v_autor from core.usuarios
   where rol = 'DIRECCION_TECNICA' and activo
   order by es_dt_titular desc, creado_en limit 1;
  if v_autor is null then
    raise exception 'No hay Dirección Técnica activa a cuyo nombre cargar los descuentos por caja.';
  end if;
  perform set_config('request.jwt.claims', json_build_object('usuario_id', v_autor::text)::text, true);

  create temp table carga_cajas on commit drop as
  select t.*, p.id as producto_id
    from (values
      ('101', 98, 5, 'CAJA101 · Monómero 100 ml'),
      ('102', 70, 5, 'CAJA102 · Monómero 250 ml'),
      ('103', 16, 5, 'CAJA103 · Monómero 500 ml'),
      ('105', 91, 5, 'CAJA105 · Primer baja acidez, bandeja cerrada'),
      ('387', 91, 5, 'CAJA387 · Primer ácido, bandeja cerrada'),
      ('377', 91, 5, 'CAJA377 · Nail Prep, bandeja cerrada'),
      ('384', 98, 5, 'CAJA384 · Clarificador 100 ml'),
      ('385', 70, 5, 'CAJA385 · Clarificador 250 ml'),
      ('386', 15, 5, 'CAJA386 · Clarificador 1 L'),
      ('192', 112, 5, 'CAJA192 · Removedor 120 ml'),
      ('195', 15, 5, 'CAJA195 · Removedor 1 L'),
      ('381', 91, 8, 'Aceite de cutícula 8 ml, bandeja cerrada (aromas)'),
      ('382', 91, 8, 'Aceite de cutícula 8 ml, bandeja cerrada (aromas)'),
      ('383', 91, 8, 'Aceite de cutícula 8 ml, bandeja cerrada (aromas)'),
      ('364', 50, 10, 'Crema exfoliante 240 ml (aromas)'),
      ('365', 50, 10, 'Crema exfoliante 240 ml (aromas)'),
      ('366', 50, 10, 'Crema exfoliante 240 ml (aromas)'),
      ('367', 98, 10, 'Crema exfoliante 100 ml (aromas)'),
      ('368', 98, 10, 'Crema exfoliante 100 ml (aromas)'),
      ('369', 98, 10, 'Crema exfoliante 100 ml (aromas)'),
      ('370', 50, 10, 'Crema humectante 240 ml (aromas)'),
      ('371', 50, 10, 'Crema humectante 240 ml (aromas)'),
      ('372', 50, 10, 'Crema humectante 240 ml (aromas)'),
      ('373', 98, 10, 'Crema humectante 100 ml (aromas)'),
      ('374', 98, 10, 'Crema humectante 100 ml (aromas)'),
      ('375', 98, 10, 'Crema humectante 100 ml (aromas)'),
      ('NS-397', 15, 5, 'Sanitizante 1 L (aromas)'),
      ('NS-398', 15, 5, 'Sanitizante 1 L (aromas)'),
      ('NS-399', 15, 5, 'Sanitizante 1 L (aromas)'),
      ('391', 40, 5, 'Sanitizante 200 ml con gatillo (aromas)'),
      ('393', 40, 5, 'Sanitizante 200 ml con gatillo (aromas)'),
      ('395', 40, 5, 'Sanitizante 200 ml con gatillo (aromas)'),
      ('392', 60, 5, 'Sanitizante 125 ml (aromas)'),
      ('394', 60, 5, 'Sanitizante 125 ml (aromas)'),
      ('396', 60, 5, 'Sanitizante 125 ml (aromas)')
    ) as t (codigo, unidades, porcentaje, descripcion)
    left join gmp.productos p on p.codigo_interno = t.codigo;

  select string_agg(codigo, ', ') into v_faltan from carga_cajas where producto_id is null;
  if v_faltan is not null then
    raise exception 'Faltan en el catálogo de productos: %', v_faltan;
  end if;

  insert into comercial.descuentos_caja (producto_id, unidades_caja, porcentaje, descripcion, cargado_por)
  select producto_id, unidades, porcentaje, descripcion, v_autor from carga_cajas;
end;
$$;

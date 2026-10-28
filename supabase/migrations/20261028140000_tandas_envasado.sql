-- ---------------------------------------------------------------------------
-- Propósito : Envasado por días. Un granel se hace una vez y se envasa en
--             varios días: con el granel aprobado por Calidad, Gerencia de
--             Producción carga lo que salió cada día (tanda), con las
--             unidades de cada hermano. Cada tanda entra al stock de fábrica
--             con el lote de la orden (retenido hasta que la DT libere) y
--             descuenta envase, etiqueta y demás de ese día; la materia prima
--             del granel se descuenta una vez, con la primera tanda. La orden
--             se da por terminada cuando Naza lo dice. Las tandas quedan en el
--             batch record.
-- Reglas    : D-tandas-1 (2026-10-28: después del granel aprobado, mismo
--             lote con tandas por día, envases y etiquetas por día, solo
--             Gerencia de Producción carga lo que salió). RN-51, RN-54 /
--             invariante 8, invariante 7 (comercial → gmp → core).
-- Fecha     : 2026-10-28
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Unidades previstas y tandas (gmp: es parte del batch record)
-- ===========================================================================

alter table gmp.ordenes_produccion
  add column unidades_previstas integer check (unidades_previstas is null or unidades_previstas > 0);
comment on column gmp.ordenes_produccion.unidades_previstas is
  'Unidades que se espera envasar del granel, si se cargaron al abrir la orden (D-tandas-1). Para mostrar lo pendiente.';

create table gmp.orden_tandas (
  id             uuid primary key default gen_random_uuid(),
  orden_id       uuid not null references gmp.ordenes_produccion(id),
  numero         integer not null check (numero > 0),
  fecha          date not null,
  producto_id    uuid not null references gmp.productos(id),
  unidades       integer not null check (unidades > 0),
  observaciones  text,
  registrada_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrada_en  timestamptz not null default now(),
  unique (orden_id, numero, producto_id)
);
comment on table gmp.orden_tandas is
  'Lo que se envasó cada día del granel de una orden, por producto (hermanos incluidos). Una tanda (numero) puede '
  'tener varias filas, una por producto (D-tandas-1). Sin UPDATE ni DELETE (RN-54).';
create index orden_tandas_producto_idx on gmp.orden_tandas (producto_id);
-- unidades_por_tandas busca las órdenes de un pedido.
create index if not exists pedido_ordenes_pedido_idx on comercial.pedido_ordenes (pedido_id);
create index orden_tandas_registrada_por_idx on gmp.orden_tandas (registrada_por);

alter table gmp.orden_tandas enable row level security;
alter table gmp.orden_tandas force  row level security;
grant select, insert on gmp.orden_tandas to authenticated;
create policy orden_tandas_select_authenticated on gmp.orden_tandas
  for select to authenticated using (core.rol() is not null);
comment on policy orden_tandas_select_authenticated on gmp.orden_tandas is
  '§3.3: consulta para todos los roles; es parte del batch record.';
create policy orden_tandas_insert_gerencia_produccion on gmp.orden_tandas
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION') and registrada_por = core.usuario_actual()
              and coalesce(current_setting('gmp.registrando_tanda', true), '') = orden_id::text);
comment on policy orden_tandas_insert_gerencia_produccion on gmp.orden_tandas is
  'RN-54: lo que salió lo carga Gerencia de Producción, a su nombre, solo por comercial.registrar_tanda, que descuenta '
  'los insumos en la misma transacción (D-tandas-1).';
select core.adjuntar_auditoria('gmp.orden_tandas');

-- ===========================================================================
-- 2. Consumos por tanda
-- ===========================================================================

-- La materia prima va con tanda_numero null (una vez por orden); envase,
-- etiqueta y demás, con el número de la tanda.
alter table comercial.orden_consumos add column tanda_numero integer check (tanda_numero is null or tanda_numero > 0);
alter table comercial.orden_consumos drop constraint orden_consumos_orden_id_insumo_id_key;
alter table comercial.orden_consumos
  add constraint orden_consumos_orden_tanda_insumo_key unique nulls not distinct (orden_id, tanda_numero, insumo_id);
comment on column comercial.orden_consumos.tanda_numero is
  'Null: materia prima de la fórmula (una vez por orden). Con número: acondicionamiento de esa tanda (D-tandas-1).';

alter policy orden_consumos_insert_gerencia_produccion on comercial.orden_consumos
  with check (
    core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
    and exists (select 1 from gmp.ordenes_produccion o
                 where o.id = orden_id
                   and (o.estado = 'TERMINADA'
                        or (o.estado = 'ABIERTA'
                            and coalesce(current_setting('gmp.registrando_tanda', true), '') = o.id::text))));
comment on policy orden_consumos_insert_gerencia_produccion on comercial.orden_consumos is
  'Lo escriben comercial.terminar_orden (orden terminada) y comercial.registrar_tanda (orden abierta, en la misma '
  'transacción que la tanda), D-tandas-1. Sin UPDATE ni DELETE (RN-54).';

-- Envases etiquetados que usó una tanda (cubren envase y etiqueta).
create table comercial.tanda_etiquetados (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references gmp.ordenes_produccion(id),
  tanda_numero  integer not null,
  etiquetado_id uuid not null references comercial.etiquetados(id),
  producto_id   uuid not null references gmp.productos(id),
  cantidad      numeric(14,4) not null check (cantidad > 0),
  creado_en     timestamptz not null default now()
);
comment on table comercial.tanda_etiquetados is
  'Envases etiquetados que usó una tanda de envasado, del más viejo al más nuevo (D-tandas-1).';
create index tanda_etiquetados_orden_idx on comercial.tanda_etiquetados (orden_id, tanda_numero);
create index tanda_etiquetados_etiquetado_idx on comercial.tanda_etiquetados (etiquetado_id);
create index tanda_etiquetados_producto_idx on comercial.tanda_etiquetados (producto_id);
alter table comercial.tanda_etiquetados enable row level security;
alter table comercial.tanda_etiquetados force  row level security;
grant select, insert on comercial.tanda_etiquetados to authenticated;
create policy tanda_etiquetados_select_authenticated on comercial.tanda_etiquetados
  for select to authenticated using (core.rol() is not null);
comment on policy tanda_etiquetados_select_authenticated on comercial.tanda_etiquetados is
  '§3.3: consulta para todos los roles.';
create policy tanda_etiquetados_insert_gerencia_produccion on comercial.tanda_etiquetados
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION')
              and coalesce(current_setting('gmp.registrando_tanda', true), '') = orden_id::text);
comment on policy tanda_etiquetados_insert_gerencia_produccion on comercial.tanda_etiquetados is
  'Lo escribe solo comercial.registrar_tanda (GP). Sin UPDATE ni DELETE (RN-54).';
select core.adjuntar_auditoria('comercial.tanda_etiquetados');

-- Copia de 20261021120000: lo que usó una tanda también sale del saldo.
create or replace view comercial.v_etiquetados_saldo with (security_invoker = true) as
select e.id as etiquetado_id, e.producto_id, e.cantidad, e.fecha, e.registrado_en,
       a.etiquetado_id is not null as anulado,
       case when a.etiquetado_id is not null then 0
            else e.cantidad - coalesce((select sum(pe.cantidad) from comercial.pedido_etiquetados pe
                                         where pe.etiquetado_id = e.id), 0)
                            -- NUEVO en 20261028140000.
                            - coalesce((select sum(te.cantidad) from comercial.tanda_etiquetados te
                                         where te.etiquetado_id = e.id), 0)
       end as saldo
  from comercial.etiquetados e
  left join comercial.etiquetado_anulaciones a on a.etiquetado_id = e.id;

-- ===========================================================================
-- 3. Descontar de stock, del lote que vence primero
-- ===========================================================================
--
-- La misma vuelta de registrar_etiquetado y terminar_orden, una sola vez:
-- p_consumo es la fila de comercial.orden_consumos que sustenta las bajas.

create or replace function comercial.descontar_insumo_orden(p_consumo uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_c        comercial.orden_consumos%rowtype;
  v_nombre   text;
  v_ficha    text;
  v_articulo uuid;
  v_restante numeric(16,4);
  v_toma     numeric(16,4);
  v_retenido numeric(16,4);
  pos        record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Descontar insumos de una orden es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from comercial.orden_consumos where id = p_consumo;
  select nombre, lower(unidad_medida) into v_nombre, v_ficha from gmp.insumos_catalogo where id = v_c.insumo_id;
  v_articulo := comercial.articulo_de_insumo(v_c.insumo_id);
  v_restante := v_c.cantidad;
  for pos in
    select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
      from comercial.v_saldos_stock s
      join gmp.lotes_insumo l on l.id = s.lote_insumo_id
     where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
       and gmp.lote_consumible(s.lote_insumo_id)
     order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
  loop
    if lower(pos.unidad) is distinct from v_ficha then
      raise exception 'El lote de % está en % y la ficha en %: no se puede descontar sin convertir.',
        v_nombre, pos.unidad, v_c.unidad using errcode = 'check_violation';
    end if;
    v_toma := least(v_restante, pos.saldo);
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
    values
      (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma, p_motivo,
       'ORDEN_CONSUMO', v_c.id);
    v_restante := v_restante - v_toma;
    exit when v_restante <= 0;
  end loop;

  if v_restante > 0 then
    -- Lo que queda y no se puede usar (cuarentena, análisis, vencido).
    select coalesce(sum(s.saldo), 0) into v_retenido
      from comercial.v_saldos_stock s join gmp.lotes_insumo l on l.id = s.lote_insumo_id
     where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
       and not gmp.lote_consumible(s.lote_insumo_id);
    raise exception 'No alcanza %: faltan % %.%', v_nombre, v_restante, v_c.unidad,
      case when v_retenido > 0
           then ' Hay más en stock, pero sin aprobar: calidad tiene que liberarlo antes de usarlo.'
           else ' Si está en planta, falta registrarlo (recepción o ajuste). No se cargó nada.' end
      using errcode = 'check_violation';
  end if;
end;
$$;
comment on function comercial.descontar_insumo_orden(uuid, text) is
  'Baja de stock lo que dice una fila de comercial.orden_consumos, de los lotes consumibles que vencen primero. '
  'Todo o nada (D-consumo-orden-1, D-tandas-1).';
revoke execute on function comercial.descontar_insumo_orden(uuid, text) from public, anon;
grant execute on function comercial.descontar_insumo_orden(uuid, text) to authenticated;

-- La materia prima de la fórmula, una vez por orden (la vuelta de
-- 20261028120000, sacada de terminar_orden para usarla también en la
-- primera tanda).
create or replace function comercial.consumir_mp_orden(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  mp         record;
  v_ficha    text;
  v_necesita numeric(16,4);
  v_consumo  uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Descontar insumos de una orden es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_orden from gmp.ordenes_produccion where id = p_id;
  if exists (select 1 from comercial.orden_consumos where orden_id = p_id and tanda_numero is null)
     or (select tercero_id from gmp.productos where id = v_orden.producto_id) is not null then
    return;
  end if;
  if lower(v_orden.unidad) not in ('kg', 'l') then
    raise exception 'La orden % está en «%»: para descontar la materia prima tiene que estar en kg o L.',
      v_orden.numero, v_orden.unidad using errcode = 'check_violation';
  end if;
  for mp in
    select c.insumo_id, sum(c.masa_kg) as masa_kg, sum(c.volumen_l) as volumen_l,
           bool_or(c.masa_kg is null) as sin_masa, bool_or(c.volumen_l is null) as sin_volumen,
           i.nombre, i.unidad_medida
      from gmp.calcular_lote(v_orden.formula_id,
             p_volumen_l => case when lower(v_orden.unidad) = 'l' then v_orden.cantidad_teorica end,
             p_masa_kg   => case when lower(v_orden.unidad) = 'l' then null else v_orden.cantidad_teorica end) c
      join gmp.insumos_catalogo i on i.id = c.insumo_id
     group by c.insumo_id, i.nombre, i.unidad_medida
  loop
    v_ficha := lower(coalesce(mp.unidad_medida, ''));
    if v_ficha not in ('g', 'kg', 'ml', 'l') then
      raise exception 'La ficha de % está en «%»: un componente de fórmula va en g, kg, ml o L.',
        mp.nombre, coalesce(mp.unidad_medida, 'ninguna unidad') using errcode = 'check_violation';
    end if;
    v_necesita := case
      when v_ficha in ('g', 'kg') and not mp.sin_masa then comercial.convertir_cantidad(mp.masa_kg, 'kg', v_ficha)
      when v_ficha in ('ml', 'l') and not mp.sin_volumen then comercial.convertir_cantidad(mp.volumen_l, 'l', v_ficha)
    end;
    if v_necesita is null then
      raise exception
        'Para descontar % hace falta su densidad: la ficha está en % y la fórmula lo da en %. '
        'Cargala en Densidades y volvé a intentar.',
        mp.nombre, coalesce(mp.unidad_medida, 'ninguna unidad'), case when mp.sin_masa then 'volumen' else 'masa' end
        using errcode = 'check_violation';
    end if;
    v_necesita := round(v_necesita, 4);
    continue when v_necesita <= 0;

    insert into comercial.orden_consumos (orden_id, insumo_id, unidad, cantidad)
    values (p_id, mp.insumo_id, mp.unidad_medida, v_necesita)
    returning id into v_consumo;
    perform comercial.descontar_insumo_orden(v_consumo,
      format('Orden %s, lote %s', v_orden.numero, v_orden.numero_lote));
  end loop;
end;
$$;
comment on function comercial.consumir_mp_orden(uuid) is
  'Descuenta la materia prima de la fórmula por la cantidad teórica de la orden, una vez (D-consumo-orden-1).';
revoke execute on function comercial.consumir_mp_orden(uuid) from public, anon;
grant execute on function comercial.consumir_mp_orden(uuid) to authenticated;

-- Unidades de un producto que ya envasaron las tandas de las órdenes de un
-- pedido: esas ya descontaron su envase y su etiqueta.
create or replace function comercial.unidades_por_tandas(p_pedido_id uuid, p_producto_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(t.unidades), 0)
    from comercial.pedido_ordenes po
    join gmp.orden_tandas t on t.orden_id = po.orden_id
   where po.pedido_id = p_pedido_id and t.producto_id = p_producto_id;
$$;
revoke execute on function comercial.unidades_por_tandas(uuid, uuid) from public, anon;
grant execute on function comercial.unidades_por_tandas(uuid, uuid) to authenticated;

-- ===========================================================================
-- 4. El pedido no vuelve a descontar lo que envasaron las tandas
-- ===========================================================================

-- Copia de 20261021120000: a lo pedido se le resta lo envasado por tandas
-- (todo el acondicionamiento), y después lo que cubren los etiquetados.
create or replace function comercial.necesidad_pedido_neta(p_pedido_id uuid)
returns table (insumo_id uuid, necesario numeric)
language sql
stable
set search_path = ''
as $$
  with base as (
    select r.pedido_id, r.producto_id, p.tercero_id,
           -- NUEVO en 20261028140000.
           greatest(r.cantidad - case when p.tercero_id is null
                                      then comercial.unidades_por_tandas(r.pedido_id, r.producto_id) else 0 end,
                    0) as cantidad
      from comercial.pedido_renglones r
      join comercial.pedidos p on p.id = r.pedido_id
     where r.pedido_id = p_pedido_id and not r.anulado
  ),
  renglones as (
    select b.producto_id, b.cantidad,
           case when b.tercero_id is not null then 0
                else coalesce(
                  (select sum(pe.cantidad) from comercial.pedido_etiquetados pe
                    where pe.pedido_id = b.pedido_id and pe.producto_id = b.producto_id),
                  least(b.cantidad, comercial.etiquetados_en_stock(b.producto_id)))
           end as cubierto
      from base b
  )
  select
    m.insumo_id,
    case
      when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
        then ceil(sum((r.cantidad - case when m.rol in ('ENVASE', 'ETIQUETA') then r.cubierto else 0 end)
                      * m.cantidad_por_unidad / (1 - m.merma)))
      else round(sum((r.cantidad - case when m.rol in ('ENVASE', 'ETIQUETA') then r.cubierto else 0 end)
                     * m.cantidad_por_unidad / (1 - m.merma)), 4)
    end
  from renglones r
  join gmp.materiales_acondicionamiento m on m.producto_id = r.producto_id and m.activo
  join gmp.insumos_catalogo i on i.id = m.insumo_id
  group by m.insumo_id, i.unidad_medida;
$$;

-- Copia de 20261021120000 con un cambio (NUEVO): los etiquetados se toman
-- para lo que no envasaron las tandas.

CREATE OR REPLACE FUNCTION comercial.terminar_pedido(
  p_pedido_id  uuid,
  p_consumos   jsonb DEFAULT '[]'::jsonb,
  p_produccion jsonb DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_pedido    comercial.pedidos%rowtype;
  r           record;
  v_consumo   uuid;
  v_articulo  uuid;
  v_restante  numeric(16,4);
  v_toma      numeric(16,4);
  v_titular   uuid;
  v_propio    uuid;
  v_nombre_titular text;
  pos         record;
  res         record;
  ep          record;
  v_dep       uuid;
  ren         record;
  et          record;
  v_falta_et  numeric(14,4);
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Terminar un pedido es de Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Solo se termina un pedido enviado o en producción (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;
  -- NUEVO en 20261028140000: con una orden que se envasa por tandas, el
  -- pedido se termina cuando termina la orden (si no, se descuenta y se carga
  -- dos veces).
  if exists (select 1 from comercial.pedido_ordenes po
               join gmp.ordenes_produccion o on o.id = po.orden_id
              where po.pedido_id = p_pedido_id and o.estado = 'ABIERTA'
                and exists (select 1 from gmp.orden_tandas t where t.orden_id = o.id)) then
    raise exception 'La orden de este pedido se está envasando por días: terminá la orden y después el pedido.'
      using errcode = 'check_violation';
  end if;

  -- NUEVO en 20261021120000: los envases etiquetados que cubren el pedido.
  if v_pedido.tercero_id is null then
    for ren in
      select producto_id, cantidad
        from comercial.pedido_renglones
       where pedido_id = p_pedido_id and not anulado
    loop
      -- Dos pedidos del mismo producto terminándose a la vez no toman el
      -- mismo etiquetado. Lock por producto: etiquetados no admite UPDATE,
      -- así que FOR UPDATE no es posible.
      perform pg_advisory_xact_lock(hashtextextended('etiquetado|' || ren.producto_id::text, 0));
      -- NUEVO en 20261028140000: lo que envasaron las tandas ya tiene envase y etiqueta.
      v_falta_et := greatest(ren.cantidad - comercial.unidades_por_tandas(p_pedido_id, ren.producto_id), 0);
      for et in
        select s.etiquetado_id, s.saldo
          from comercial.v_etiquetados_saldo s
         where s.producto_id = ren.producto_id and s.saldo > 0
         order by s.fecha, s.registrado_en
      loop
        exit when v_falta_et <= 0;
        insert into comercial.pedido_etiquetados (pedido_id, etiquetado_id, producto_id, cantidad)
        values (p_pedido_id, et.etiquetado_id, ren.producto_id, least(v_falta_et, et.saldo));
        v_falta_et := v_falta_et - least(v_falta_et, et.saldo);
      end loop;
    end loop;
  end if;

  for r in
    with teorico as (
      select n.insumo_id, n.necesario from comercial.necesidad_pedido_neta(p_pedido_id) n
    ),
    informado as (
      select (e ->> 'insumo_id')::uuid        as insumo_id,
             (e ->> 'cantidad')::numeric      as cantidad,
             nullif(btrim(e ->> 'motivo'), '') as motivo,
             nullif(e ->> 'origen', '')        as origen
        from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    )
    select
      coalesce(t.insumo_id, i.insumo_id)       as insumo_id,
      coalesce(t.necesario, 0)                 as teorica,
      coalesce(i.cantidad, t.necesario)        as usada,
      i.motivo,
      i.origen,
      c.nombre,
      c.unidad_medida,
      c.tercero_id                             as propio
    from teorico t
    full join informado i on i.insumo_id = t.insumo_id
    join gmp.insumos_catalogo c on c.id = coalesce(t.insumo_id, i.insumo_id)
    order by c.nombre
  loop
    if r.usada is null or r.usada < 0 then
      raise exception 'La cantidad usada de % no es válida.', r.nombre using errcode = 'check_violation';
    end if;
    if r.usada <> r.teorica and r.motivo is null then
      raise exception 'Usaste % % de % y la receta dice %: escribí el motivo de la diferencia.',
        r.usada, coalesce(r.unidad_medida, ''), r.nombre, r.teorica
        using errcode = 'check_violation';
    end if;
    if r.unidad_medida is null then
      raise exception 'El insumo % no tiene unidad de medida confirmada en el catálogo.', r.nombre
        using errcode = 'check_violation';
    end if;

    v_titular := case r.origen
                   when 'NAILSHOW' then null
                   when 'TERCERO'  then v_pedido.tercero_id
                   else comercial.origen_insumo(p_pedido_id, r.insumo_id)
                 end;
    if v_titular is not null and v_titular is distinct from v_pedido.tercero_id then
      raise exception 'No se consume material de un cliente tercerizado para otro (%).', r.nombre
        using errcode = 'check_violation';
    end if;
    if r.propio is not null and v_titular is distinct from r.propio then
      raise exception '«%» es propio del cliente tercerizado: sale de su stock.', r.nombre
        using errcode = 'check_violation';
    end if;
    v_nombre_titular := coalesce((select nombre from gmp.terceros where id = v_titular), 'Nail Show');

    insert into comercial.pedido_consumos
      (pedido_id, insumo_id, unidad, cantidad_teorica, cantidad_real, motivo_diferencia, tercero_id)
    values
      (p_pedido_id, r.insumo_id, r.unidad_medida, r.teorica, r.usada, r.motivo, v_titular)
    returning id into v_consumo;

    continue when r.usada = 0;

    v_articulo := comercial.articulo_de_insumo(r.insumo_id);
    v_restante := r.usada;

    for pos in
      select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
        from comercial.v_saldos_stock s
        join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo
         and s.saldo > 0
         and l.tercero_id is not distinct from v_titular
         and gmp.lote_consumible(s.lote_insumo_id)
       order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
    loop
      if pos.unidad is distinct from r.unidad_medida then
        raise exception
          'El lote de % está en % y la receta en %: no se puede descontar sin convertir.',
          r.nombre, pos.unidad, r.unidad_medida
          using errcode = 'check_violation';
      end if;

      v_toma := least(v_restante, pos.saldo);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
         format('Pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO_CONSUMO', v_consumo);
      v_restante := v_restante - v_toma;
      exit when v_restante <= 0;
    end loop;

    if v_restante > 0 then
      raise exception
        'No alcanza el stock de % de % (%): faltan % %. No se descontó nada del pedido. '
        'Si el material está en planta, falta registrarlo: recepción o ajuste de inventario.',
        v_nombre_titular, r.nombre, (select codigo_interno from gmp.insumos_catalogo where id = r.insumo_id),
        v_restante, r.unidad_medida
        using errcode = 'check_violation';
    end if;

    v_restante := r.usada;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_stock
       where insumo_id = r.insumo_id
         and tercero_id is not distinct from v_titular
         and para_tercero_id is not distinct from v_pedido.tercero_id
         and (pedido_id is null or pedido_id = p_pedido_id)
         and not liberada and vence_en > now()
       order by (pedido_id is null), vence_en, creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_stock set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;
  end loop;

  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;

  -- NUEVO en 20260929110000: cuánto se produjo y adónde va.
  if v_pedido.tercero_id is null then
    perform set_config('comercial.terminando_pedido', p_pedido_id::text, true);

    if p_produccion is null or jsonb_array_length(p_produccion) = 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      select rr.producto_id,
             coalesce(v_pedido.destino_deposito_id, (select id from gmp.depositos where numero = 'PTF')),
             'ENTRADA_PRODUCCION',
             sum(rr.cantidad),
             format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente),
             'PEDIDO',
             p_pedido_id
        from comercial.pedido_renglones rr
       where rr.pedido_id = p_pedido_id and not rr.anulado
       group by rr.producto_id;
    else
      for ep in
        select (x ->> 'producto_id')::uuid                    as producto_id,
               (x ->> 'cantidad')::numeric                    as cantidad,
               coalesce(nullif(x ->> 'deposito', ''), 'PTF')  as deposito
          from jsonb_array_elements(p_produccion) x
      loop
        if ep.cantidad is null or ep.cantidad < 0 then
          raise exception 'La cantidad producida no es válida.' using errcode = 'check_violation';
        end if;
        continue when ep.cantidad = 0;
        select id into v_dep from gmp.depositos where numero = ep.deposito and numero in ('PTF', 'C5') and activo;
        if v_dep is null then
          raise exception 'Lo producido va a la fábrica (PTF) o a Calle 5 (C5).' using errcode = 'check_violation';
        end if;
        insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
        values (ep.producto_id, v_dep, 'ENTRADA_PRODUCCION', ep.cantidad,
                format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id);
      end loop;
    end if;

    -- Lo producido para un cliente que va a Calle 5 queda reservado para su
    -- pedido, hasta lo pedido: si no, se lo puede llevar otro.
    if not v_pedido.para_stock then
      insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
      select m.producto_id, m.deposito_id, p_pedido_id,
             least(sum(m.cantidad), (select sum(rr.cantidad) from comercial.pedido_renglones rr
                                      where rr.pedido_id = p_pedido_id and rr.producto_id = m.producto_id and not rr.anulado)),
             format('Producido para el pedido %s', v_pedido.numero)
        from comercial.movimientos_pt m
        join gmp.depositos d on d.id = m.deposito_id and d.numero = 'C5'
       where m.documento_tipo = 'PEDIDO' and m.documento_id = p_pedido_id and m.tipo = 'ENTRADA_PRODUCCION'
       group by m.producto_id, m.deposito_id;
    end if;

    perform set_config('comercial.terminando_pedido', '', true);
  end if;
end;
$function$;


-- ===========================================================================
-- 5. Terminar la orden: solo Gerencia de Producción
-- ===========================================================================
--
-- Copia de 20261028130000. NUEVO: lo que salió lo carga Gerencia de
-- Producción, no la DT (D-tandas-1); la materia prima va por
-- comercial.consumir_mp_orden. Si hubo tandas, lo obtenido ya entró: no se
-- vuelve a cargar.

create or replace function comercial.terminar_orden(p_id uuid, p_cantidad numeric, p_unidades integer,
                                                    p_reparto jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  v_pedido   uuid;
  rp         record;
  v_reparto  jsonb;
  v_suma     integer;
  v_abierta  boolean;
begin
  -- NUEVO en 20261028140000.
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Lo que salió de la orden lo carga Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  -- 20261028120000: descuenta solo la orden que pasa de abierta a terminada
  -- en esta llamada.
  v_abierta := exists (select 1 from gmp.ordenes_produccion where id = p_id and estado = 'ABIERTA');
  perform gmp.terminar_orden(p_id, p_cantidad, p_unidades);

  perform pg_advisory_xact_lock(hashtextextended('orden|' || p_id::text, 0));
  select * into v_orden from gmp.ordenes_produccion where id = p_id;

  if v_abierta then
    perform comercial.consumir_mp_orden(p_id);
  end if;

  if exists (select 1 from comercial.movimientos_pt where orden_id = p_id and tipo = 'ENTRADA_PRODUCCION') then
    -- 20261028130000: un reparto que no se va a aplicar no se calla.
    if p_reparto is not null and jsonb_array_length(p_reparto) > 0 then
      raise exception 'Lo obtenido de la orden % ya entró al stock: para cambiar de cuál hermano es, usá «Corregir reparto».',
        v_orden.numero using errcode = 'check_violation';
    end if;
    return;
  end if;
  if coalesce(p_unidades, 0) <= 0 then
    return;
  end if;

  -- 20261028130000: cuántas de cada hermano.
  v_reparto := case when p_reparto is null or jsonb_array_length(p_reparto) = 0
                    then jsonb_build_array(jsonb_build_object('producto_id', v_orden.producto_id, 'unidades', p_unidades))
                    else p_reparto end;
  select coalesce(sum((x ->> 'unidades')::integer), 0) into v_suma from jsonb_array_elements(v_reparto) x;
  if v_suma <> p_unidades then
    raise exception 'Lo repartido entre los hermanos suma % y las unidades obtenidas son %.', v_suma, p_unidades
      using errcode = 'check_violation';
  end if;

  perform set_config('comercial.terminando_orden', p_id::text, true);
  for rp in
    select (x ->> 'producto_id')::uuid as producto_id, (x ->> 'unidades')::integer as unidades
      from jsonb_array_elements(v_reparto) x
  loop
    if rp.unidades < 0 then
      raise exception 'Las unidades de cada hermano no pueden ser negativas.' using errcode = 'check_violation';
    end if;
    if not gmp.son_hermanos(v_orden.producto_id, rp.producto_id) then
      raise exception 'Ese producto no es hermano del de la orden %: cargalo en «Productos hermanos».', v_orden.numero
        using errcode = 'check_violation';
    end if;
    continue when rp.unidades = 0;

    -- El pedido de Nail Show de esta orden que lleva el producto, si es uno solo.
    select case when count(*) = 1 then (array_agg(p.id))[1] end into v_pedido
      from comercial.pedido_ordenes po
      join comercial.pedidos p on p.id = po.pedido_id
     where po.orden_id = p_id and p.tercero_id is null and p.eliminado_en is null
       and exists (select 1 from comercial.pedido_renglones r
                    where r.pedido_id = p.id and r.producto_id = rp.producto_id and not r.anulado);

    insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
    values (rp.producto_id, (select id from gmp.depositos where numero = 'PTF'), 'ENTRADA_PRODUCCION', rp.unidades,
            format('Producción de la orden %s, lote %s', v_orden.numero, v_orden.numero_lote),
            case when v_pedido is null then 'ORDEN' else 'PEDIDO' end, coalesce(v_pedido, p_id), p_id);
  end loop;
  perform set_config('comercial.terminando_orden', '', true);
end;
$$;

-- ===========================================================================
-- 6. Cargar lo que salió en el día
-- ===========================================================================
--
-- p_reparto: [{producto_id, unidades}] de ese día (el producto de la orden y
-- sus hermanos). Con el granel aprobado por Calidad (o su control marcado
-- «no aplica»). Por producto: primero los envases etiquetados que hay, después
-- envase, etiqueta y lo demás de su lista de materiales; el producto entra a la
-- fábrica con el lote de la orden, retenido. p_finaliza termina la orden con
-- p_cantidad_obtenida y el total de las tandas. Todo o nada.

create or replace function comercial.registrar_tanda(
  p_orden_id           uuid,
  p_fecha              date,
  p_reparto            jsonb,
  p_observaciones      text default null,
  p_finaliza           boolean default false,
  p_cantidad_obtenida  numeric default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  v_numero   integer;
  v_total    integer;
  v_tercero  boolean;
  v_pedido   uuid;
  v_motivo   text;
  v_consumo  uuid;
  v_falta    numeric(14,4);
  rp         record;
  et         record;
  m          record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Lo que salió de la orden lo carga Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe.' using errcode = 'check_violation';
  end if;
  if v_orden.estado <> 'ABIERTA' then
    raise exception 'La orden % está %: no se le cargan más tandas.', v_orden.numero, lower(v_orden.estado::text)
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from gmp.op_etapas where orden_id = p_orden_id and etapa = 'CC_GRANEL'
                   and (coalesce((datos ->> 'aprobado')::boolean, false)
                        or coalesce((datos ->> 'no_aplica')::boolean, false))) then
    raise exception 'El granel de la orden % todavía no está aprobado por Calidad (R.50.10.1).', v_orden.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.pedido_ordenes po
              where po.orden_id = p_orden_id
                and exists (select 1 from comercial.pedido_consumos c where c.pedido_id = po.pedido_id)) then
    raise exception 'El pedido de la orden % ya se terminó con lo producido: no se le cargan tandas.', v_orden.numero
      using errcode = 'check_violation';
  end if;
  -- comercial.hoy(): la fecha de Buenos Aires, no la UTC.
  if p_fecha is null or p_fecha < v_orden.jornada or p_fecha > comercial.hoy() then
    raise exception 'La fecha del envasado va desde la elaboración (%) hasta hoy.', to_char(v_orden.jornada, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_reparto, '[]')) x
              where coalesce((x ->> 'unidades')::integer, 0) < 0) then
    raise exception 'Las unidades no pueden ser negativas.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_reparto, '[]')) x
              where not gmp.son_hermanos(v_orden.producto_id, (x ->> 'producto_id')::uuid)) then
    raise exception 'Hay un producto que no es hermano del de la orden %: cargalo en «Productos hermanos».',
      v_orden.numero using errcode = 'check_violation';
  end if;
  select coalesce(sum((x ->> 'unidades')::integer), 0) into v_total
    from jsonb_array_elements(coalesce(p_reparto, '[]')) x;
  if v_total = 0 and not p_finaliza then
    raise exception 'Cargá cuántas unidades salieron.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('orden|' || p_orden_id::text, 0));
  perform set_config('gmp.registrando_tanda', p_orden_id::text, true);
  v_tercero := (select tercero_id from gmp.productos where id = v_orden.producto_id) is not null;

  if v_total > 0 then
    select coalesce(max(numero), 0) + 1 into v_numero from gmp.orden_tandas where orden_id = p_orden_id;
    v_motivo := format('Orden %s, lote %s, tanda %s', v_orden.numero, v_orden.numero_lote, v_numero);

    insert into gmp.orden_tandas (orden_id, numero, fecha, producto_id, unidades, observaciones)
    select p_orden_id, v_numero, p_fecha, (x ->> 'producto_id')::uuid, sum((x ->> 'unidades')::integer),
           nullif(btrim(coalesce(p_observaciones, '')), '')
      from jsonb_array_elements(p_reparto) x
     where (x ->> 'unidades')::integer > 0
     group by 1, 2, 3, 4;

    if not v_tercero then
      -- La materia prima del granel, con la primera tanda.
      perform comercial.consumir_mp_orden(p_orden_id);

      -- Envases etiquetados primero (cubren envase y etiqueta).
      for rp in select producto_id, unidades from gmp.orden_tandas where orden_id = p_orden_id and numero = v_numero
      loop
        perform pg_advisory_xact_lock(hashtextextended('etiquetado|' || rp.producto_id::text, 0));
        v_falta := rp.unidades;
        for et in
          select s.etiquetado_id, s.saldo from comercial.v_etiquetados_saldo s
           where s.producto_id = rp.producto_id and s.saldo > 0
           order by s.fecha, s.registrado_en
        loop
          exit when v_falta <= 0;
          insert into comercial.tanda_etiquetados (orden_id, tanda_numero, etiquetado_id, producto_id, cantidad)
          values (p_orden_id, v_numero, et.etiquetado_id, rp.producto_id, least(v_falta, et.saldo));
          v_falta := v_falta - least(v_falta, et.saldo);
        end loop;
      end loop;

      -- El resto de la lista de materiales, sumado por insumo entre productos.
      for m in
        select ma.insumo_id, i.unidad_medida,
               case when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
                    then ceil(sum((t.unidades - case when ma.rol in ('ENVASE', 'ETIQUETA')
                                                     then coalesce(te.cubierto, 0) else 0 end)
                                  * ma.cantidad_por_unidad / (1 - ma.merma)))
                    else round(sum((t.unidades - case when ma.rol in ('ENVASE', 'ETIQUETA')
                                                      then coalesce(te.cubierto, 0) else 0 end)
                                   * ma.cantidad_por_unidad / (1 - ma.merma)), 4)
               end as necesario
          from gmp.orden_tandas t
          join gmp.materiales_acondicionamiento ma on ma.producto_id = t.producto_id and ma.activo
          join gmp.insumos_catalogo i on i.id = ma.insumo_id
          left join lateral (select sum(x.cantidad) as cubierto from comercial.tanda_etiquetados x
                              where x.orden_id = t.orden_id and x.tanda_numero = t.numero
                                and x.producto_id = t.producto_id) te on true
         where t.orden_id = p_orden_id and t.numero = v_numero
         group by ma.insumo_id, i.unidad_medida
      loop
        continue when m.necesario <= 0;
        if m.unidad_medida is null then
          raise exception 'Un material de la lista no tiene unidad de medida en el catálogo.' using errcode = 'check_violation';
        end if;
        insert into comercial.orden_consumos (orden_id, tanda_numero, insumo_id, unidad, cantidad)
        values (p_orden_id, v_numero, m.insumo_id, m.unidad_medida, m.necesario)
        returning id into v_consumo;
        perform comercial.descontar_insumo_orden(v_consumo, v_motivo);
      end loop;
    end if;

    -- Al stock de fábrica, con el lote de la orden (retenido hasta liberar).
    perform set_config('comercial.terminando_orden', p_orden_id::text, true);
    for rp in select producto_id, unidades from gmp.orden_tandas where orden_id = p_orden_id and numero = v_numero
    loop
      select case when count(*) = 1 then (array_agg(p.id))[1] end into v_pedido
        from comercial.pedido_ordenes po
        join comercial.pedidos p on p.id = po.pedido_id
       where po.orden_id = p_orden_id and p.tercero_id is null and p.eliminado_en is null
         and exists (select 1 from comercial.pedido_renglones r
                      where r.pedido_id = p.id and r.producto_id = rp.producto_id and not r.anulado);
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
      values (rp.producto_id, (select id from gmp.depositos where numero = 'PTF'), 'ENTRADA_PRODUCCION', rp.unidades,
              format('Producción de la orden %s, lote %s, tanda %s', v_orden.numero, v_orden.numero_lote, v_numero),
              case when v_pedido is null then 'ORDEN' else 'PEDIDO' end, coalesce(v_pedido, p_orden_id), p_orden_id);
    end loop;
    perform set_config('comercial.terminando_orden', '', true);
  end if;

  perform set_config('gmp.registrando_tanda', '', true);

  if p_finaliza then
    if p_cantidad_obtenida is null or p_cantidad_obtenida < 0 then
      raise exception 'Para terminar la orden, cargá la cantidad de granel obtenida.' using errcode = 'check_violation';
    end if;
    perform comercial.terminar_orden(p_orden_id, p_cantidad_obtenida,
      (select coalesce(sum(unidades), 0)::integer from gmp.orden_tandas where orden_id = p_orden_id));
  end if;
  return v_numero;
end;
$$;
comment on function comercial.registrar_tanda(uuid, date, jsonb, text, boolean, numeric) is
  'Lo que se envasó en el día del granel de una orden (D-tandas-1): tanda en el batch record, acondicionamiento '
  'descontado, materia prima con la primera, producto en la fábrica con el lote retenido. p_finaliza termina la orden.';
revoke execute on function comercial.registrar_tanda(uuid, date, jsonb, text, boolean, numeric) from public, anon;
grant execute on function comercial.registrar_tanda(uuid, date, jsonb, text, boolean, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Propósito : Costo aproximado de un insumo que carga Gerencia de Producción
--             al completar qué lleva cada producto (envase, etiqueta, extras y
--             materias primas de la fórmula), opcional. Ej.: «el tacho de
--             20 L de alcohol sale $ 85.000».
-- Reglas    : D-38 (el costo de referencia lo fija Finanzas): el estimado NO
--             compite con eso. Entra último en la prioridad de
--             comercial.v_costo_referencia (Finanzas > último lote > apertura
--             > estimado) y siempre como provisorio. Pedido del 2026-10-21
--             (D-costo-estimado-1).
-- Fecha     : 2026-10-21
-- ---------------------------------------------------------------------------
--
-- No va en comercial.costos_referencia porque ese precio gana sobre lo
-- realmente pagado: una estimación de planta pisaría costos de compra. Acá
-- solo llena el hueco de un insumo que todavía no tiene ningún costo, y
-- desaparece sola en cuanto llega su primera compra con costo.

create table comercial.costos_estimados (
  id          uuid primary key default gen_random_uuid(),
  orden       bigint generated always as identity,
  insumo_id   uuid not null references gmp.insumos_catalogo(id),
  -- Lo que sale la presentación, en pesos: «$ 85.000 por 20 l».
  importe     numeric(16,4) not null check (importe > 0),
  cantidad    numeric(16,4) not null default 1 check (cantidad > 0),
  unidad      text not null check (lower(unidad) in ('g', 'kg', 'ml', 'l', 'unidad')),
  cargado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en  timestamptz not null default now()
);

comment on table comercial.costos_estimados is
  'Costo aproximado de un insumo cargado por Gerencia de Producción (D-costo-estimado-1). Append-only: el último '
  'cargado es el que vale. Solo se usa si el insumo no tiene precio de Finanzas, lote con costo ni apertura.';

create index costos_estimados_insumo_idx on comercial.costos_estimados (insumo_id, orden desc);
create index costos_estimados_cargado_por_idx on comercial.costos_estimados (cargado_por);

alter table comercial.costos_estimados enable row level security;
alter table comercial.costos_estimados force row level security;
grant select, insert on comercial.costos_estimados to authenticated;

create policy costos_estimados_select_costos on comercial.costos_estimados
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy costos_estimados_select_costos on comercial.costos_estimados is
  'D-38: lo ven los roles de costos.';
create policy costos_estimados_insert_gerencia_produccion on comercial.costos_estimados
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'FINANZAS') and cargado_por = core.usuario_actual());
comment on policy costos_estimados_insert_gerencia_produccion on comercial.costos_estimados is
  'Lo estima Gerencia de Producción (o Finanzas), a su nombre (D-costo-estimado-1). Sin UPDATE ni DELETE: el '
  'último cargado reemplaza al anterior.';

select core.adjuntar_auditoria('comercial.costos_estimados');

-- ===========================================================================
-- Costo de referencia con el estimado al final
-- ===========================================================================
--
-- Copia de 20261010120000 con una fuente más, la última: ESTIMADO. Mismas
-- columnas y mismo orden. Un estimado siempre sale «desactualizado» (vale
-- como provisorio, igual que una apertura vieja).

create or replace view comercial.v_costo_referencia
with (security_invoker = true) as
with manual as (
  select distinct on (r.insumo_id)
         r.insumo_id, r.id,
         round(r.importe_neto * r.tipo_cambio
               / comercial.convertir_cantidad(r.cantidad, r.unidad, i.unidad_medida, comercial.densidad_insumo(r.insumo_id)), 6)
           as costo, r.vigente_desde as fecha
    from comercial.costos_referencia r
    join gmp.insumos_catalogo i on i.id = r.insumo_id
   where r.vigente_desde <= comercial.hoy() and (r.vigente_hasta is null or r.vigente_hasta >= comercial.hoy())
   order by r.insumo_id, r.vigente_desde desc, r.orden desc
),
ultimo as (
  select distinct on (c.insumo_id) c.insumo_id, c.id, c.costo_unitario_ars as costo, c.fecha_costo as fecha
    from comercial.v_costos_lote_unitario c
   where c.origen = 'RECEPCION' and c.costo_unitario_ars is not null
   order by c.insumo_id, c.fecha_costo desc nulls last, c.cargado_en desc
),
apertura as (
  select distinct on (c.insumo_id) c.insumo_id, c.id, c.costo_unitario_ars as costo, c.fecha_costo as fecha,
         case when cl.tipo_cambio is null then c.tipo_cambio end as tc_serie
    from comercial.v_costos_lote_unitario c
    join comercial.costos_lote cl on cl.id = c.id
   where c.origen = 'APERTURA' and c.costo_unitario_ars is not null
   order by c.insumo_id, c.fecha_costo desc nulls last, c.cargado_en desc
),
apertura_sin_costo as (
  select distinct on (c.insumo_id) c.insumo_id,
         case when c.precio_neto_ars is null then 'Falta el tipo de cambio de la serie A3500'
              when c.unidad_medida is null then 'El insumo no tiene unidad en el catálogo'
              else 'Sin densidad: la presentación en ' || c.unidad || ' no se puede pasar a ' || c.unidad_medida
         end as motivo
    from comercial.v_costos_lote_unitario c
   where c.origen = 'APERTURA' and c.importe is not null and c.costo_unitario_ars is null
   order by c.insumo_id, c.fecha_costo desc nulls last
),
-- NUEVO en 20261021140000: el estimado de Gerencia de Producción.
estimado as (
  select distinct on (e.insumo_id)
         e.insumo_id,
         round(e.importe
               / comercial.convertir_cantidad(e.cantidad, e.unidad, i.unidad_medida, comercial.densidad_insumo(e.insumo_id)), 6)
           as costo, (e.cargado_en at time zone 'America/Argentina/Buenos_Aires')::date as fecha
    from comercial.costos_estimados e
    join gmp.insumos_catalogo i on i.id = e.insumo_id
   order by e.insumo_id, e.orden desc
),
corte as (
  select pc.corte_apertura from comercial.v_parametros_costo pc
),
resuelto as (
  select i.id as insumo_id, i.codigo_interno, i.nombre, i.tipo, i.unidad_medida,
         coalesce(m.costo, u.costo, a.costo, es.costo) as costo_unitario_ars,
         case when m.costo is not null then 'MANUAL'
              when u.costo is not null then 'ULTIMO_LOTE'
              when a.costo is not null then 'APERTURA'
              when es.costo is not null then 'ESTIMADO' end as origen,
         case when m.costo is not null then m.fecha
              when u.costo is not null then u.fecha
              when a.costo is not null then a.fecha
              else es.fecha end as fecha,
         m.costo as costo_manual, m.id as costo_referencia_id, m.fecha as manual_desde,
         u.costo as costo_ultimo_lote, u.id as ultimo_costo_lote_id, u.fecha as ultimo_lote_fecha,
         a.costo as costo_apertura, a.fecha as apertura_fecha,
         a.tc_serie, s.motivo as motivo_apertura,
         (select p.motivo from comercial.costos_apertura_pendientes p where p.insumo_id = i.id) as motivo_pendiente
    from gmp.insumos_catalogo i
    left join manual m on m.insumo_id = i.id
    left join ultimo u on u.insumo_id = i.id
    left join apertura a on a.insumo_id = i.id
    left join apertura_sin_costo s on s.insumo_id = i.id
    left join estimado es on es.insumo_id = i.id
   where i.activo
)
select r.insumo_id, r.codigo_interno, r.nombre, r.tipo, r.unidad_medida, r.costo_unitario_ars, r.origen, r.fecha,
       r.costo_manual, r.costo_referencia_id, r.manual_desde,
       r.costo_ultimo_lote, r.ultimo_costo_lote_id, r.ultimo_lote_fecha,
       r.costo_apertura, r.apertura_fecha,
       case when r.costo_unitario_ars is not null
            then r.origen = 'ESTIMADO'
              or (r.origen = 'APERTURA' and (r.fecha is null or r.fecha < (select corte_apertura from corte)))
       end as desactualizado,
       case when r.costo_unitario_ars is null
            then coalesce(case r.motivo_pendiente
                            when 'FALTA_CANTIDAD' then 'Falta la cantidad de la presentación'
                            when 'DOLAR_A_REVISAR' then 'Dólares a revisar: no coinciden con el unitario en pesos'
                          end, r.motivo_apertura)
       end as pendiente,
       case when r.origen = 'APERTURA' then r.tc_serie end as tipo_cambio_aplicado,
       case when r.origen = 'APERTURA' and r.tc_serie is not null
            then (select t.mes from comercial.v_tipo_cambio_activo t) end as tipo_cambio_mes
  from resuelto r;

comment on view comercial.v_costo_referencia is
  'Costo de referencia por insumo, neto y en la unidad del catálogo: manual de Finanzas vigente (neto de IVA), si no '
  'el último lote recibido (con accesorios), si no la planilla de apertura, si no el estimado de Gerencia de '
  'Producción (20261021140000). desactualizado = apertura vieja o estimado (provisorio, D-42, D-costo-estimado-1); '
  'pendiente = por qué un insumo de la planilla quedó sin costo.';

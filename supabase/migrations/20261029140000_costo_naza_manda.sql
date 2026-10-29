-- ---------------------------------------------------------------------------
-- Propósito : El costo de un insumo es siempre el último precio que cargó
--             Gerencia de Producción (desde el catálogo de insumos, tareas de
--             carga o la fórmula), aunque tenga costo de Finanzas, de una
--             compra o de la apertura; cada carga nueva lo reemplaza. Deja de
--             ser un estimado provisorio. Sin precio de Gerencia de Producción
--             sigue el orden de antes: Finanzas, último lote, apertura.
-- Reglas    : D-costo-naza-1 (codirector técnico, 2026-10-29), que cambia la
--             prioridad de D-38 y D-costo-estimado-1. RN-50 (cada precio queda
--             en comercial.costos_estimados con quién y cuándo; no se edita).
-- Fecha     : 2026-10-29
-- ---------------------------------------------------------------------------
--
-- Copia de 20261021140000 con la prioridad cambiada (marcado NUEVO). Las
-- columnas no cambian: el origen sigue llamándose 'ESTIMADO'.

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
-- El precio que carga Gerencia de Producción (catálogo, tareas de carga,
-- fórmula). NUEVO en 20261029140000: es el que manda.
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
         -- NUEVO en 20261029140000: primero lo de Gerencia de Producción.
         coalesce(es.costo, m.costo, u.costo, a.costo) as costo_unitario_ars,
         case when es.costo is not null then 'ESTIMADO'
              when m.costo is not null then 'MANUAL'
              when u.costo is not null then 'ULTIMO_LOTE'
              when a.costo is not null then 'APERTURA' end as origen,
         case when es.costo is not null then es.fecha
              when m.costo is not null then m.fecha
              when u.costo is not null then u.fecha
              else a.fecha end as fecha,
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
            -- NUEVO en 20261029140000: el de Gerencia de Producción ya no es provisorio.
            then (r.origen = 'APERTURA' and (r.fecha is null or r.fecha < (select corte_apertura from corte)))
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
  'Costo de referencia por insumo, neto y en la unidad del catálogo: el último precio que cargó Gerencia de '
  'Producción (D-costo-naza-1, 20261029140000), si no el manual de Finanzas vigente (neto de IVA), si no el último '
  'lote recibido (con accesorios), si no la planilla de apertura. desactualizado = apertura vieja (D-42); '
  'pendiente = por qué un insumo de la planilla quedó sin costo.';

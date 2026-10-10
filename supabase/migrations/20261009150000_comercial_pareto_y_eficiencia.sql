-- ---------------------------------------------------------------------------
-- Propósito : Fase 4 del módulo de costos: Pareto ABC de productos por
--             facturación (cortes configurables), margen de cada producto para
--             la matriz facturación × margen, rotación y días de stock por
--             insumo con su capital inmovilizado, comparativa de precios por
--             proveedor, y alertas de precio por debajo del costo o del margen
--             mínimo.
-- Reglas    : R-10, D-38, D-49 (la facturación por producto sale de
--             factura_renglones), D-50 (criterios de esta fase), RN-50.
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Parámetros: cortes del Pareto, y cada parámetro rige por separado
-- ===========================================================================
--
-- parametros_costo es versionada. Hasta acá regía la última fila entera, así
-- que una fila que sólo cambiaba el costo hora devolvía el umbral y el margen
-- a su valor por defecto (los NOT NULL DEFAULT se completaban solos). Desde
-- esta migración cada parámetro es «el último no nulo»: una fila nueva cambia
-- sólo lo que trae.

alter table comercial.parametros_costo
  alter column umbral_variacion drop not null, alter column umbral_variacion drop default,
  alter column margen_minimo drop not null, alter column margen_minimo drop default,
  alter column vigencia_cotizacion_dias drop not null, alter column vigencia_cotizacion_dias drop default,
  alter column serie_tipo_cambio drop not null, alter column serie_tipo_cambio drop default,
  add column corte_a numeric(6,4) check (corte_a > 0 and corte_a < 1),
  add column corte_b numeric(6,4) check (corte_b > 0 and corte_b < 1),
  add constraint parametros_costo_cortes check (corte_a is null or corte_b is null or corte_a < corte_b);

comment on column comercial.parametros_costo.corte_a is 'Pareto: clase A hasta este acumulado de facturación (80 %).';
comment on column comercial.parametros_costo.corte_b is 'Pareto: clase B hasta este acumulado (95 %); el resto, C.';

-- Mismas columnas y orden que la vigente, más los cortes al final. Cada
-- parámetro, el último no nulo; sin ninguno, el valor por defecto.
create or replace view comercial.v_parametros_costo
with (security_invoker = true) as
select (select h.costo_hora from comercial.parametros_costo h
         where h.costo_hora is not null order by h.orden desc limit 1) as costo_hora,
       coalesce((select h.umbral_variacion from comercial.parametros_costo h
                  where h.umbral_variacion is not null order by h.orden desc limit 1), 0.05) as umbral_variacion,
       coalesce((select h.margen_minimo from comercial.parametros_costo h
                  where h.margen_minimo is not null order by h.orden desc limit 1), 0.25) as margen_minimo,
       coalesce((select h.vigencia_cotizacion_dias from comercial.parametros_costo h
                  where h.vigencia_cotizacion_dias is not null order by h.orden desc limit 1), 7) as vigencia_cotizacion_dias,
       coalesce((select h.serie_tipo_cambio from comercial.parametros_costo h
                  where h.serie_tipo_cambio is not null order by h.orden desc limit 1), 'A3500') as serie_tipo_cambio,
       p.cargado_por, p.cargado_en,
       coalesce((select h.corte_a from comercial.parametros_costo h
                  where h.corte_a is not null order by h.orden desc limit 1), 0.80) as corte_a,
       coalesce((select h.corte_b from comercial.parametros_costo h
                  where h.corte_b is not null order by h.orden desc limit 1), 0.95) as corte_b
  from (select 1) d
  left join lateral (select * from comercial.parametros_costo order by orden desc limit 1) p on true
 where core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
    or current_user not in ('authenticated', 'anon');

comment on view comercial.v_parametros_costo is
  'Parámetros vigentes: cada uno, el último valor no nulo cargado (una fila nueva cambia sólo lo que trae); sin '
  'ninguno, el valor por defecto. Sin rol de costos, ninguna fila. El escape por current_user (fuera de '
  'authenticated/anon) es para migraciones y funciones SECURITY DEFINER; vale mientras ningún rol dedicado reciba '
  'SELECT sobre esta vista.';

-- ===========================================================================
-- 2. Pareto ABC con margen, para un período
-- ===========================================================================

create function comercial.pareto(p_desde date, p_hasta date)
returns table (
  producto_id      uuid,
  codigo_interno   text,
  producto         text,
  unidades         numeric,
  facturacion      numeric,
  participacion    numeric,
  acumulado        numeric,
  clase            text,
  costo_variable   numeric,
  margen           numeric,
  margen_pct       numeric,
  costo_incompleto boolean
)
language sql
stable
set search_path = ''
as $$
  with ventas as (
    select v.producto_id, sum(v.unidades) as unidades, sum(v.facturacion) as facturacion,
           sum(v.costo_variable) as costo_variable,
           bool_or(v.costo_unitario is null or v.faltantes > 0) as costo_incompleto
      from comercial.v_costo_ventas_mes v
     where v.mes between date_trunc('month', p_desde)::date and date_trunc('month', p_hasta)::date
     group by v.producto_id
    having sum(v.facturacion) > 0
  ),
  total as (select sum(facturacion) as t from ventas),
  ordenado as (
    select v.*, v.facturacion / t.t as participacion,
           sum(v.facturacion) over (order by v.facturacion desc, v.producto_id rows unbounded preceding) / t.t
             as acumulado,
           -- Acumulado ANTES de este producto: un producto que cruza el corte
           -- es todavía de la clase del corte (el 80 % lo completa él).
           coalesce(sum(v.facturacion) over (order by v.facturacion desc, v.producto_id
                                             rows between unbounded preceding and 1 preceding), 0) / t.t
             as previo
      from ventas v, total t
  ),
  cortes as (select corte_a, corte_b from comercial.v_parametros_costo)
  select o.producto_id, p.codigo_interno, p.nombre, o.unidades, o.facturacion,
         round(o.participacion, 6), round(o.acumulado, 6),
         case when o.previo < k.corte_a then 'A' when o.previo < k.corte_b then 'B' else 'C' end,
         o.costo_variable,
         -- Sin costo completo no hay margen (D-50): ni porcentual ni absoluto.
         case when not o.costo_incompleto then o.facturacion - o.costo_variable end,
         case when o.facturacion > 0 and not o.costo_incompleto
              then round((o.facturacion - o.costo_variable) / o.facturacion, 6) end,
         o.costo_incompleto
    from ordenado o
    join gmp.productos p on p.id = o.producto_id
    cross join cortes k
   where core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
   order by o.facturacion desc;
$$;

comment on function comercial.pareto(date, date) is
  'Pareto ABC de productos por facturación neta (factura_renglones, D-49) en el período: A hasta corte_a del '
  'acumulado (80 %), B hasta corte_b (95 %), C el resto. Un producto que cruza un corte queda en la clase de abajo '
  'del corte. Con igual facturación desempata el id (dos productos iguales justo sobre un corte pueden quedar en '
  'clases distintas). Productos con facturación neta ≤ 0 en el período (NC mayores que lo facturado) no entran ni '
  'cuentan en el total. Margen nulo = costo incompleto (no se muestra un margen inventado).';

-- ===========================================================================
-- 3. Rotación, días de stock y capital inmovilizado por insumo
-- ===========================================================================

create view comercial.v_rotacion_insumos
with (security_invoker = true) as
with salidas as (
  -- Consumo de producción de los últimos 90 días, sin los anulados (la
  -- anulación es un ENTRADA_AJUSTE que apunta al original).
  select l.insumo_id, m.unidad, sum(-m.cantidad) as cantidad
    from comercial.movimientos_stock m
    join gmp.lotes_insumo l on l.id = m.lote_insumo_id
   where m.tipo = 'SALIDA_CONSUMO_PRODUCCION'
     and m.ocurrido_en >= now() - interval '90 days'
     and not exists (select 1 from comercial.movimientos_stock x where x.anula_a_movimiento_id = m.id)
   group by l.insumo_id, m.unidad
),
consumo as (
  -- Se convierte una vez por unidad, no por movimiento; lo que no se puede
  -- convertir se cuenta en vez de desaparecer de la suma.
  select s.insumo_id,
         sum(comercial.convertir_cantidad(s.cantidad, s.unidad, i.unidad_medida, comercial.densidad_insumo(s.insumo_id)))
           as consumo_90d,
         count(*) filter (where comercial.convertir_cantidad(s.cantidad, s.unidad, i.unidad_medida,
                                                             comercial.densidad_insumo(s.insumo_id)) is null)
           as unidades_sin_convertir
    from salidas s
    join gmp.insumos_catalogo i on i.id = s.insumo_id
   group by s.insumo_id
),
stock as (
  select insumo_id, codigo_interno, insumo, unidad_medida,
         sum(saldo_unidad_catalogo) as saldo, sum(valor_ars) as valor_ars,
         count(*) filter (where valor_ars is null) as lotes_sin_costo
    from comercial.v_stock_valorizado_insumos
   group by insumo_id, codigo_interno, insumo, unidad_medida
)
select s.insumo_id, s.codigo_interno, s.insumo, s.unidad_medida, s.saldo, s.valor_ars, s.lotes_sin_costo,
       coalesce(c.consumo_90d, 0) as consumo_90d,
       round(coalesce(c.consumo_90d, 0) / 90, 4) as consumo_diario,
       case when s.saldo > 0 and coalesce(c.consumo_90d, 0) > 0 then round(s.saldo / (c.consumo_90d / 90), 1) end
         as dias_de_stock,
       case when s.saldo > 0 and coalesce(c.consumo_90d, 0) > 0 then round(c.consumo_90d * 365 / 90 / s.saldo, 2) end
         as rotacion_anual,
       coalesce(c.unidades_sin_convertir, 0) as consumos_sin_convertir
  from stock s
  left join consumo c on c.insumo_id = s.insumo_id;

comment on view comercial.v_rotacion_insumos is
  'Por insumo con saldo: valor (capital inmovilizado, R-10), consumo de producción de los últimos 90 días sin los '
  'anulados, días de stock (saldo / consumo diario) y rotación anual (consumo anualizado / saldo). Sin consumo o con '
  'saldo ≤ 0, días nulos. consumos_sin_convertir > 0 = parte del consumo en una unidad que no se pudo llevar a la '
  'del catálogo (falta densidad): el consumo está subestimado. Sin rol de costos, ninguna fila.';

-- ===========================================================================
-- 4. Comparativa de precios por proveedor para un mismo insumo
-- ===========================================================================

create view comercial.v_precios_proveedor
with (security_invoker = true) as
with ipc_hoy as (
  select s.valor from comercial.series_macro s where s.serie = 'IPC' order by s.mes desc limit 1
),
compras as (
  select c.insumo_id, c.codigo_interno, c.insumo, c.unidad_medida, c.proveedor_id, c.fecha_costo, c.cargado_en,
         c.precio_unitario_ars, i.valor as ipc_mes
    from comercial.v_costos_lote_unitario c
    left join comercial.series_macro i on i.serie = 'IPC' and i.mes = date_trunc('month', c.fecha_costo)::date
   where c.origen = 'RECEPCION' and c.precio_unitario_ars is not null and c.proveedor_id is not null
),
ajustadas as (
  -- En pesos de hoy con el IPC del mes de la compra; sin IPC de ese mes, nominal.
  select k.*, k.precio_unitario_ars * coalesce((select valor from ipc_hoy) / nullif(k.ipc_mes, 0), 1) as precio_hoy
    from compras k
)
select a.insumo_id, a.codigo_interno, a.insumo, a.unidad_medida, a.proveedor_id, pr.razon_social as proveedor,
       count(*) as compras,
       max(a.fecha_costo) as ultima_compra,
       (array_agg(a.precio_unitario_ars order by a.fecha_costo desc nulls last, a.cargado_en desc))[1] as ultimo_precio,
       round(avg(a.precio_hoy), 6) as precio_promedio_hoy,
       round(min(a.precio_hoy), 6) as precio_minimo_hoy,
       count(*) filter (where a.ipc_mes is null) as compras_sin_ajustar
  from ajustadas a
  join gmp.proveedores pr on pr.id = a.proveedor_id
 group by a.insumo_id, a.codigo_interno, a.insumo, a.unidad_medida, a.proveedor_id, pr.razon_social;

comment on view comercial.v_precios_proveedor is
  'Por insumo y proveedor: compras, último precio unitario (neto, sin accesorios) y promedio y mínimo llevados a '
  'pesos de hoy con el IPC. compras_sin_ajustar = compras de un mes sin IPC cargado, que entran nominales. Sale de '
  'los lotes recibidos; sin rol de costos, vacía.';

-- ===========================================================================
-- 5. Alertas de precio contra costo (agregadas en esta fase, D-50)
-- ===========================================================================

create view comercial.v_alertas_precio
with (security_invoker = true) as
with costo as (
  -- La foto más reciente de cada producto (la del mes, o la anterior si en el
  -- mes nadie abrió costos todavía).
  select distinct on (f.producto_id) f.producto_id, f.costo_unitario, f.faltantes, f.mes as mes_costo
    from comercial.fotos_costo_producto f
   where f.mes <= date_trunc('month', comercial.hoy())::date and f.costo_unitario > 0
   order by f.producto_id, f.mes desc
),
precios as (
  select c.producto_id, h.banda, h.precio_neto
    from costo c
    cross join lateral comercial.historia_precios(c.producto_id, 1) h
)
select p.producto_id, pr.codigo_interno, pr.nombre as producto, p.banda, p.precio_neto, c.costo_unitario,
       round((p.precio_neto - c.costo_unitario) / p.precio_neto, 6) as margen_pct,
       case when p.precio_neto < c.costo_unitario then 'BAJO_COSTO' else 'BAJO_MARGEN_MINIMO' end as alerta,
       c.faltantes > 0 as costo_incompleto,
       c.mes_costo
  from precios p
  join costo c on c.producto_id = p.producto_id
  join gmp.productos pr on pr.id = p.producto_id
  cross join comercial.v_parametros_costo k
 where p.precio_neto > 0
   and (p.precio_neto < c.costo_unitario or (p.precio_neto - c.costo_unitario) / p.precio_neto < k.margen_minimo);

comment on view comercial.v_alertas_precio is
  'Bandas de precio vigentes (netas) por debajo del costo del producto o con margen sobre el precio menor que el '
  'mínimo de Finanzas, contra la foto de costo más reciente (mes_costo). costo_incompleto = el costo real es mayor: '
  'la alerta se queda corta.';

grant select on comercial.v_rotacion_insumos, comercial.v_precios_proveedor, comercial.v_alertas_precio
  to authenticated;
grant execute on function comercial.pareto(date, date) to authenticated;

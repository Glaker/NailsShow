-- ---------------------------------------------------------------------------
-- Propósito : Fase 3 del módulo de costos: renglones de factura (foto de lo
--             facturado), costos fijos y otros gastos (operativos e
--             inversiones amortizables), resultado de gestión mensual y punto
--             de equilibrio multiproducto.
-- Reglas    : D-43 (sin comprobante se carga igual), D-46 (comercial.gastos es
--             la fuente del resultado; tesorería es caja), D-48 (mano de obra
--             no absorbida), D-49 (renglones de factura), RN-50, RN-56, RN-59.
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- RESULTADO DE GESTIÓN, NO FISCAL. Todo esto sirve para decidir; la valuación
-- contable y el resultado impositivo los hace el estudio contable (R-10).
--
-- INGRESOS = FACTURAS AUTORIZADAS. Un pedido no es un ingreso hasta que se
-- factura. La foto de lo facturado por producto (factura_renglones) se toma al
-- emitir, con la misma cuenta que comercial.preparar_factura, y una nota de
-- crédito copia los renglones de su factura (la NC es siempre por el total).
--
-- MANO DE OBRA SIN CONTARLA DOS VECES (D-48). La nómina de producción se carga
-- como gasto de la categoría «Nómina de producción», pero NO suma como costo
-- fijo: la parte que ya va en el costo de lo vendido (minutos × costo hora de
-- las unidades facturadas) se resta, y sólo queda como costo de estructura la
-- «mano de obra no absorbida» = nómina de producción − mano de obra de lo
-- vendido. Así la nómina entra una sola vez, completa.

-- ===========================================================================
-- 1. Renglones de factura
-- ===========================================================================

create table comercial.factura_renglones (
  id               uuid primary key default gen_random_uuid(),
  factura_id       uuid not null references comercial.facturas(id),
  producto_id      uuid not null references gmp.productos(id),
  cantidad         numeric(14,4) not null check (cantidad > 0),
  precio_unitario  numeric(16,4) not null,
  alicuota_iva     numeric(5,2) not null,
  -- Ingreso neto del renglón: cantidad × precio neto; en factura C (emisor
  -- monotributista o exento) el total, porque no hay débito fiscal.
  importe_neto     numeric(16,2) not null,
  creado_en        timestamptz not null default now(),
  unique (factura_id, producto_id)
);

create index factura_renglones_producto_idx on comercial.factura_renglones (producto_id);

-- Auditoría antes de cargar nada: el backfill de abajo también queda asentado.
select core.adjuntar_auditoria('comercial.factura_renglones');

comment on table comercial.factura_renglones is
  'Foto de lo facturado por producto, tomada al emitir (D-49). La NC copia los renglones de su factura. Los importes '
  'son positivos; el signo lo pone comprobante = NOTA_CREDITO. El redondeo por renglón puede diferir en centavos del '
  'neto de la factura, que se redondea por alícuota. Quien lea esta tabla filtra por el estado de su factura: una '
  'RECHAZADA que se reintentó deja sus renglones.';

-- Misma cuenta que comercial.preparar_factura (20261001160100): en una venta
-- se factura lo despachado (salidas de PT del pedido), si no lo pedido.
create function comercial.fn_factura_renglones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suma numeric;
  v_n    integer;
begin
  if new.comprobante = 'NOTA_CREDITO' then
    insert into comercial.factura_renglones (factura_id, producto_id, cantidad, precio_unitario, alicuota_iva, importe_neto)
    select new.id, r.producto_id, r.cantidad, r.precio_unitario, r.alicuota_iva, r.importe_neto
      from comercial.factura_renglones r
     where r.factura_id = new.factura_asociada_id;
    return new;
  end if;
  insert into comercial.factura_renglones (factura_id, producto_id, cantidad, precio_unitario, alicuota_iva, importe_neto)
  select new.id, x.producto_id, x.cantidad, x.precio_unitario, x.alicuota_iva,
         round(x.cantidad * x.precio_unitario * case when new.tipo = 'C' then 1 + x.alicuota_iva / 100 else 1 end, 2)
    from (
      select r.producto_id,
             case when p.es_venta then least(r.cantidad, coalesce(d.cantidad, 0)) else r.cantidad end as cantidad,
             r.precio_unitario, r.alicuota_iva
        from comercial.pedido_renglones r
        join comercial.pedidos p on p.id = r.pedido_id
        left join (
          select m.producto_id, sum(-m.cantidad) as cantidad
            from comercial.movimientos_pt m
           where m.documento_tipo = 'PEDIDO' and m.documento_id = new.pedido_id and m.tipo = 'SALIDA_VENTA'
           group by m.producto_id
        ) d on d.producto_id = r.producto_id
       where r.pedido_id = new.pedido_id and not r.anulado and r.precio_unitario is not null
    ) x
   where x.cantidad > 0;
  -- La foto tiene que cuadrar con lo facturado (preparar_factura calcula en
  -- otra sentencia: un despacho concurrente podría correrlo). Si no cuadra,
  -- no se emite: mejor reintentar que guardar una foto distinta de la factura.
  select coalesce(sum(importe_neto), 0), count(*) into v_suma, v_n
    from comercial.factura_renglones where factura_id = new.id;
  if abs(v_suma - new.importe_neto) > 0.01 * (v_n + 1) then
    raise exception 'Los renglones (%) no cuadran con el neto de la factura (%). Volvé a preparar la factura.',
      v_suma, new.importe_neto using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function comercial.fn_factura_renglones() is
  'SECURITY DEFINER: quien emite la factura no escribe renglones a mano; los toma la base de lo que se facturó. El '
  'INSERT no tiene política: funciona porque el dueño (postgres) tiene BYPASSRLS.';

create trigger trg_factura_renglones
  after insert on comercial.facturas
  for each row execute function comercial.fn_factura_renglones();

revoke execute on function comercial.fn_factura_renglones() from public, anon;

-- Lo ya emitido antes de esta migración: misma cuenta, de lo que hay hoy.
insert into comercial.factura_renglones (factura_id, producto_id, cantidad, precio_unitario, alicuota_iva, importe_neto)
select f.id, x.producto_id, x.cantidad, x.precio_unitario, x.alicuota_iva,
       round(x.cantidad * x.precio_unitario * case when f.tipo = 'C' then 1 + x.alicuota_iva / 100 else 1 end, 2)
  from comercial.facturas f
  join comercial.pedidos p on p.id = f.pedido_id
  cross join lateral (
    select r.producto_id,
           case when p.es_venta then least(r.cantidad, coalesce(d.cantidad, 0)) else r.cantidad end as cantidad,
           r.precio_unitario, r.alicuota_iva
      from comercial.pedido_renglones r
      left join (
        select m.producto_id, sum(-m.cantidad) as cantidad
          from comercial.movimientos_pt m
         where m.documento_tipo = 'PEDIDO' and m.documento_id = f.pedido_id and m.tipo = 'SALIDA_VENTA'
         group by m.producto_id
      ) d on d.producto_id = r.producto_id
     where r.pedido_id = f.pedido_id and not r.anulado and r.precio_unitario is not null
  ) x
 where f.comprobante = 'FACTURA' and x.cantidad > 0;

-- El backfill reconstruye con lo de hoy (lo despachado puede haber cambiado
-- después de facturar): se informa toda factura cuyo detalle no cuadre.
do $$
declare
  v_lista text;
begin
  select string_agg(coalesce(f.numero::text, f.id::text) || ' (' || f.importe_neto || ' vs ' || coalesce(r.suma, 0) || ')', ', ')
    into v_lista
    from comercial.facturas f
    left join (select factura_id, sum(importe_neto) as suma from comercial.factura_renglones group by factura_id) r
           on r.factura_id = f.id
   where f.comprobante = 'FACTURA' and abs(f.importe_neto - coalesce(r.suma, 0)) > 0.05;
  if v_lista is not null then
    raise notice 'Facturas cuyo detalle reconstruido no cuadra con el neto (revisar a mano): %', v_lista;
  end if;
end;
$$;

insert into comercial.factura_renglones (factura_id, producto_id, cantidad, precio_unitario, alicuota_iva, importe_neto)
select nc.id, r.producto_id, r.cantidad, r.precio_unitario, r.alicuota_iva, r.importe_neto
  from comercial.facturas nc
  join comercial.factura_renglones r on r.factura_id = nc.factura_asociada_id
 where nc.comprobante = 'NOTA_CREDITO';

-- ===========================================================================
-- 2. Categorías de gasto y gastos
-- ===========================================================================

create type comercial.clase_gasto_enum as enum ('FIJO', 'OPERATIVO', 'INVERSION');
comment on type comercial.clase_gasto_enum is
  'FIJO: costo de estructura del mes (alquiler, sueldos no productivos, honorarios). OPERATIVO: gasto del mes '
  '(librería, limpieza, misceláneos). INVERSION: se amortiza en su vida útil, no pega entero en el mes.';

create table comercial.categorias_gasto (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null unique check (length(btrim(nombre)) > 0),
  clase                 comercial.clase_gasto_enum not null,
  es_nomina_produccion  boolean not null default false,
  activa                boolean not null default true,
  creado_por            uuid references core.usuarios(id) default core.usuario_actual(),
  creado_en             timestamptz not null default now(),
  constraint categorias_gasto_nomina_es_fija check (not es_nomina_produccion or clase = 'FIJO')
);

create unique index categorias_gasto_una_nomina on comercial.categorias_gasto (es_nomina_produccion)
  where es_nomina_produccion;

comment on table comercial.categorias_gasto is
  'Categorías de costos fijos y otros gastos. «Nómina de producción» es especial: no suma como fijo, se usa para la '
  'mano de obra no absorbida (D-48). creado_por nulo = categoría inicial de la migración.';

select core.adjuntar_auditoria('comercial.categorias_gasto');

insert into comercial.categorias_gasto (nombre, clase, es_nomina_produccion, creado_por) values
  ('Alquiler', 'FIJO', false, null),
  ('Servicios (luz, gas, agua, internet)', 'FIJO', false, null),
  ('Sueldos no productivos', 'FIJO', false, null),
  ('Honorarios profesionales', 'FIJO', false, null),
  ('Seguros', 'FIJO', false, null),
  ('Impuestos y tasas', 'FIJO', false, null),
  ('Nómina de producción', 'FIJO', true, null),
  ('Otros fijos', 'FIJO', false, null),
  ('Librería y oficina', 'OPERATIVO', false, null),
  ('Limpieza', 'OPERATIVO', false, null),
  -- No el flete de compras: ése va en el costo del lote (costos_accesorios).
  ('Envíos a clientes', 'OPERATIVO', false, null),
  ('Mantenimiento', 'OPERATIVO', false, null),
  ('Misceláneos', 'OPERATIVO', false, null),
  ('Maquinaria', 'INVERSION', false, null),
  ('Equipos e informática', 'INVERSION', false, null),
  ('Mejoras edilicias', 'INVERSION', false, null);

create table comercial.gastos (
  id                uuid primary key default gen_random_uuid(),
  categoria_id      uuid not null references comercial.categorias_gasto(id),
  -- Mes al que corresponde (devengado), no el del pago.
  mes               date not null check (mes = date_trunc('month', mes)::date),
  fecha             date not null default comercial.hoy(),
  descripcion       text not null check (length(btrim(descripcion)) > 0),
  tipo_comprobante  comercial.comprobante_costo_enum not null,
  importe           numeric(16,4) not null check (importe >= 0),
  incluye_iva       boolean,
  alicuota_iva      numeric(5,2) check (alicuota_iva in (0, 10.5, 21, 27)),
  moneda            text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  tipo_cambio       numeric(14,6) not null default 1,
  importe_neto_ars  numeric(16,4) generated always as
                    (comercial.importe_neto_ars(importe, tipo_comprobante, incluye_iva, alicuota_iva, tipo_cambio)) stored,
  vida_util_meses   integer check (vida_util_meses between 1 and 600),
  comprobante_url   text,
  rectifica_a       uuid unique references comercial.gastos(id),
  motivo            text,
  cargado_por       uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en        timestamptz not null default now(),
  constraint gastos_iva_solo_factura_a check (
    (tipo_comprobante = 'FACTURA_A' and incluye_iva is not null and alicuota_iva is not null)
    or (tipo_comprobante <> 'FACTURA_A' and incluye_iva is null and alicuota_iva is null)),
  constraint gastos_tipo_cambio
    check ((moneda = 'ARS' and tipo_cambio = 1) or (moneda <> 'ARS' and tipo_cambio > 0)),
  constraint gastos_rectificacion_con_motivo
    check (rectifica_a is null or length(btrim(coalesce(motivo, ''))) > 0)
);

select core.adjuntar_auditoria('comercial.gastos');

create index gastos_mes_idx on comercial.gastos (mes);
create index gastos_categoria_idx on comercial.gastos (categoria_id);

comment on table comercial.gastos is
  'Costos fijos y otros gastos (D-46: fuente del resultado de gestión). Inmutables: se corrigen rectificando (una '
  'fila con importe 0 lo quita). Sin comprobante se carga igual (D-43). Una inversión exige vida útil y se amortiza '
  'en partes iguales desde su mes (v_amortizaciones).';

-- Inversión ⇔ vida útil; la rectificación es de la misma categoría.
create function comercial.fn_gasto_coherente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_clase comercial.clase_gasto_enum;
begin
  new.cargado_en := now();
  select clase into v_clase from comercial.categorias_gasto
   where id = new.categoria_id and (activa or new.rectifica_a is not null);
  if v_clase is null then
    raise exception 'La categoría está desactivada.' using errcode = 'check_violation';
  end if;
  if (v_clase = 'INVERSION') <> (new.vida_util_meses is not null) then
    raise exception 'Una inversión lleva vida útil en meses, y sólo una inversión.' using errcode = 'check_violation';
  end if;
  if new.rectifica_a is not null and not exists (
    select 1 from comercial.gastos where id = new.rectifica_a and categoria_id = new.categoria_id
  ) then
    raise exception 'La rectificación tiene que ser de la misma categoría que el gasto que corrige.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_gasto_coherente
  before insert on comercial.gastos
  for each row execute function comercial.fn_gasto_coherente();

create view comercial.v_gastos
with (security_invoker = true) as
select g.*, c.nombre as categoria, c.clase, c.es_nomina_produccion
  from comercial.gastos g
  join comercial.categorias_gasto c on c.id = g.categoria_id
 where not exists (select 1 from comercial.gastos r where r.rectifica_a = g.id);

comment on view comercial.v_gastos is 'Gastos vigentes (los que nadie rectificó), con su categoría y clase.';

create view comercial.v_amortizaciones
with (security_invoker = true) as
select g.id as gasto_id, g.categoria, g.descripcion,
       (g.mes + make_interval(months => n))::date as mes,
       round(g.importe_neto_ars / g.vida_util_meses, 2) as cuota
  from comercial.v_gastos g
  cross join lateral generate_series(0, g.vida_util_meses - 1) n
 where g.clase = 'INVERSION' and g.importe_neto_ars > 0;

comment on view comercial.v_amortizaciones is
  'Cuota mensual de cada inversión: neto / vida útil, desde su mes y durante su vida útil.';

-- ===========================================================================
-- 3. Ventas por producto y mes, y resultado de gestión
-- ===========================================================================

create view comercial.v_ventas_producto_mes
with (security_invoker = true) as
select date_trunc('month', f.fecha)::date as mes, r.producto_id,
       sum(case when f.comprobante = 'NOTA_CREDITO' then -r.cantidad else r.cantidad end) as unidades,
       sum(case when f.comprobante = 'NOTA_CREDITO' then -r.importe_neto else r.importe_neto end) as facturacion
  from comercial.factura_renglones r
  join comercial.facturas f on f.id = r.factura_id
 where f.estado = 'AUTORIZADA' and f.ambiente = 'PRODUCCION'
 group by 1, 2;

comment on view comercial.v_ventas_producto_mes is
  'Unidades y facturación neta por producto y mes, de facturas autorizadas en producción, menos sus notas de crédito.';

-- Costo de lo vendido con la foto del costo de ESE mes (D-47); si ese mes no
-- tiene foto, la más reciente anterior. Sin ninguna, queda sin costo y se
-- avisa (costo_incompleto).
create view comercial.v_costo_ventas_mes
with (security_invoker = true) as
select v.mes, v.producto_id, v.unidades, v.facturacion,
       f.mes as mes_foto, f.costo_unitario, f.mano_de_obra, f.faltantes,
       round(v.unidades * f.costo_unitario, 2) as costo_variable,
       round(v.unidades * coalesce(f.mano_de_obra, 0), 2) as mano_de_obra_vendida
  from comercial.v_ventas_producto_mes v
  left join lateral (
    select fc.mes, fc.costo_unitario, fc.mano_de_obra, fc.faltantes
      from comercial.fotos_costo_producto fc
     where fc.producto_id = v.producto_id and fc.mes <= v.mes
     order by fc.mes desc limit 1
  ) f on true;

comment on view comercial.v_costo_ventas_mes is
  'Por producto y mes: unidades y facturación vendidas, con el costo de la foto de ese mes (o la anterior más '
  'reciente). Una NC se costea con la foto del mes de la NC, no de su factura: la reversión puede no ser exacta.';

create view comercial.v_resultado_gestion
with (security_invoker = true) as
with meses as (
  select (date_trunc('month', comercial.hoy()) - make_interval(months => g))::date as mes
    from generate_series(0, 23) g
),
ventas as (
  select mes, sum(facturacion) as facturacion, sum(costo_variable) as costo_variable,
         sum(mano_de_obra_vendida) as mano_de_obra_vendida,
         count(*) filter (where costo_unitario is null) as productos_sin_costo,
         count(*) filter (where faltantes > 0) as productos_costo_incompleto
    from comercial.v_costo_ventas_mes group by mes
),
gastos as (
  select mes,
         sum(importe_neto_ars) filter (where clase = 'FIJO' and not es_nomina_produccion) as costos_fijos,
         sum(importe_neto_ars) filter (where es_nomina_produccion) as nomina_produccion,
         sum(importe_neto_ars) filter (where clase = 'OPERATIVO') as gastos_operativos,
         sum(importe_neto_ars) filter (where tipo_comprobante = 'SIN_COMPROBANTE') as sin_comprobante,
         sum(importe_neto_ars) filter (where clase <> 'INVERSION') as gastos_del_mes
    from comercial.v_gastos group by mes
),
amort as (
  select mes, sum(cuota) as amortizaciones from comercial.v_amortizaciones group by mes
),
base as (
  select m.mes,
         coalesce(v.facturacion, 0) as facturacion,
         coalesce(v.costo_variable, 0) as costo_variable,
         coalesce(v.mano_de_obra_vendida, 0) as mano_de_obra_vendida,
         coalesce(g.costos_fijos, 0) as costos_fijos,
         coalesce(g.nomina_produccion, 0) as nomina_produccion,
         coalesce(g.gastos_operativos, 0) as gastos_operativos,
         coalesce(a.amortizaciones, 0) as amortizaciones,
         coalesce(g.sin_comprobante, 0) as gastos_sin_comprobante,
         coalesce(v.productos_sin_costo, 0) as productos_sin_costo,
         coalesce(v.productos_costo_incompleto, 0) as productos_costo_incompleto
    from meses m
    left join ventas v on v.mes = m.mes
    left join gastos g on g.mes = m.mes
    left join amort a on a.mes = m.mes
),
calculo as (
  select b.*,
         -- D-48: sin nómina cargada no se supone nada (queda en cero).
         case when b.nomina_produccion > 0 then b.nomina_produccion - b.mano_de_obra_vendida else 0 end
           as mano_de_obra_no_absorbida,
         b.facturacion - b.costo_variable as margen_contribucion
    from base b
)
select c.mes, c.facturacion, c.costo_variable, c.margen_contribucion,
       case when c.facturacion > 0 then round(c.margen_contribucion / c.facturacion, 6) end as margen_contribucion_pct,
       c.costos_fijos, c.nomina_produccion, c.mano_de_obra_vendida, c.mano_de_obra_no_absorbida,
       c.gastos_operativos, c.amortizaciones,
       c.costos_fijos + c.mano_de_obra_no_absorbida + c.gastos_operativos + c.amortizaciones as costos_estructura,
       c.costo_variable + c.costos_fijos + c.mano_de_obra_no_absorbida + c.gastos_operativos + c.amortizaciones
         as costos_totales,
       c.facturacion - (c.costo_variable + c.costos_fijos + c.mano_de_obra_no_absorbida + c.gastos_operativos
                        + c.amortizaciones) as resultado,
       -- Punto de equilibrio multiproducto con el mix real del mes. Para el
       -- equilibrio la nómina de producción es fija (no cambia con lo que se
       -- venda): estructura = fijos + nómina + operativos + amortizaciones, y el
       -- margen se toma SIN la mano de obra (D-48). Usar la no absorbida acá
       -- mezclaría la nómina como fija y como variable a la vez.
       c.costos_fijos + c.nomina_produccion + c.gastos_operativos + c.amortizaciones as estructura_equilibrio,
       c.margen_contribucion + c.mano_de_obra_vendida as margen_sin_mano_de_obra,
       case when c.facturacion > 0 and c.margen_contribucion + c.mano_de_obra_vendida > 0
            then round((c.costos_fijos + c.nomina_produccion + c.gastos_operativos + c.amortizaciones)
                       / ((c.margen_contribucion + c.mano_de_obra_vendida) / c.facturacion), 2) end
         as facturacion_equilibrio,
       c.gastos_sin_comprobante, c.productos_sin_costo, c.productos_costo_incompleto
  from calculo c
 where core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
 order by c.mes;

comment on view comercial.v_resultado_gestion is
  'Resultado de GESTIÓN por mes (no fiscal): facturación neta − costo de lo vendido (foto del mes) − costos fijos − '
  'mano de obra no absorbida (D-48) − gastos operativos − amortizaciones. Punto de equilibrio = (fijos + nómina + '
  'operativos + amortizaciones) / margen sin mano de obra %, con el mix del mes (D-48). productos_sin_costo > 0 = el '
  'costo de lo vendido está incompleto.';

-- D-46: el «resultado mensual» de Administración deja de contar egresos de
-- tesorería como gasto; los toma de comercial.gastos (devengado) más las
-- amortizaciones. Mismas columnas que la versión de 20261001170000.
create or replace view comercial.v_resultado_mensual
with (security_invoker = true) as
with ventas as (
  select date_trunc('month', fecha)::date as periodo,
         sum(case when comprobante = 'NOTA_CREDITO' then -importe_neto else importe_neto end) as ventas_netas
    from comercial.facturas
   where estado = 'AUTORIZADA' and ambiente = 'PRODUCCION'
   group by 1
),
compras as (
  select date_trunc('month', fecha)::date as periodo,
         sum(case when tipo = 'FACTURA_A' then importe_neto + coalesce(importe_otros, 0)
                  when tipo = 'NOTA_CREDITO_A' then -(importe_neto + coalesce(importe_otros, 0))
                  when tipo::text like 'NOTA_CREDITO%' then -importe_total
                  else importe_total end) as compras
    from comercial.comprobantes_proveedor
   where anulado_en is null
   group by 1
),
gastos as (
  select mes as periodo, sum(importe) as otros_egresos
    from (
      select mes, importe_neto_ars as importe from comercial.v_gastos where clase <> 'INVERSION'
      union all
      select mes, cuota from comercial.v_amortizaciones
    ) x
   group by 1
)
select coalesce(v.periodo, c.periodo, g.periodo) as periodo,
       coalesce(v.ventas_netas, 0) as ventas_netas,
       coalesce(c.compras, 0) as compras,
       coalesce(g.otros_egresos, 0) as otros_egresos,
       coalesce(v.ventas_netas, 0) - coalesce(c.compras, 0) - coalesce(g.otros_egresos, 0) as resultado
  from ventas v
  full join compras c on c.periodo = v.periodo
  full join gastos g on g.periodo = coalesce(v.periodo, c.periodo)
 -- Las amortizaciones generan meses futuros: no se muestran hasta que llegan.
 where coalesce(v.periodo, c.periodo, g.periodo) <= date_trunc('month', comercial.hoy())::date;

comment on view comercial.v_resultado_mensual is
  'Resultado mensual de Administración (ventas − compras − otros gastos). Desde 20261009140000 los otros gastos salen '
  'de comercial.gastos y sus amortizaciones (D-46), no de los egresos de tesorería. Ojo (D-51): un servicio cargado '
  'como comprobante de proveedor y además como gasto cuenta dos veces acá; v_resultado_gestion no usa compras.';

-- ===========================================================================
-- 4. RLS, permisos y auditoría
-- ===========================================================================

alter table comercial.factura_renglones enable row level security;
alter table comercial.factura_renglones force  row level security;
alter table comercial.categorias_gasto  enable row level security;
alter table comercial.categorias_gasto  force  row level security;
alter table comercial.gastos            enable row level security;
alter table comercial.gastos            force  row level security;

grant select on comercial.factura_renglones to authenticated;
grant select, insert on comercial.categorias_gasto, comercial.gastos to authenticated;
grant update (activa) on comercial.categorias_gasto to authenticated;
grant select on comercial.v_gastos, comercial.v_amortizaciones, comercial.v_ventas_producto_mes,
  comercial.v_costo_ventas_mes, comercial.v_resultado_gestion to authenticated;

-- Renglones: los ve quien ve la factura (la política de facturas se aplica
-- dentro del exists, que corre con los permisos de quien consulta).
create policy factura_renglones_select_authenticated on comercial.factura_renglones
  for select to authenticated
  using (exists (select 1 from comercial.facturas f where f.id = factura_id));
comment on policy factura_renglones_select_authenticated on comercial.factura_renglones is
  'D-49: mismo alcance que comercial.facturas. Los escribe sólo el trigger de emisión.';

create policy categorias_gasto_select_costos on comercial.categorias_gasto
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy categorias_gasto_select_costos on comercial.categorias_gasto is
  'D-38, más el Administrador del sistema, que ve Reportes (v_resultado_mensual).';
create policy categorias_gasto_insert_finanzas on comercial.categorias_gasto
  for insert to authenticated
  with check (core.es_rol('FINANZAS') and creado_por = core.usuario_actual());
comment on policy categorias_gasto_insert_finanzas on comercial.categorias_gasto is
  'Las categorías las arma Finanzas. RN-50.';
create policy categorias_gasto_update_finanzas on comercial.categorias_gasto
  for update to authenticated
  using (core.es_rol('FINANZAS')) with check (core.es_rol('FINANZAS'));
comment on policy categorias_gasto_update_finanzas on comercial.categorias_gasto is
  'Sólo activar o desactivar (GRANT de columna). Una categoría no se borra.';

create policy gastos_select_costos on comercial.gastos
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy gastos_select_costos on comercial.gastos is
  'D-38, más el Administrador del sistema: Reportes (v_resultado_mensual) lee los gastos; sin esto le mostraría '
  'otros egresos en cero y un resultado inflado.';
create policy gastos_insert_costos on comercial.gastos
  for insert to authenticated
  with check (
    cargado_por = core.usuario_actual()
    and core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
    and (core.es_rol('FINANZAS')
         or exists (select 1 from comercial.categorias_gasto c where c.id = categoria_id and c.clase <> 'FIJO'))
  );
comment on policy gastos_insert_costos on comercial.gastos is
  'D-38, RN-50: costos fijos sólo Finanzas; otros gastos e inversiones también Gerencia, Administración y Gerencia '
  'de Producción. Cualquiera de ellos puede corregir (rectificar) un gasto ajeno: queda a su nombre en la '
  'auditoría y en la fila nueva.';


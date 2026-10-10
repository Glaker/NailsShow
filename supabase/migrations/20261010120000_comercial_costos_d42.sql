-- ---------------------------------------------------------------------------
-- Propósito : Reglas de Finanzas sobre el costo de la planilla de apertura y la
--             carga de costos (D-42, resuelta el 2026-10-10):
--             IVA en el costo de referencia manual (se carga con o sin IVA y se
--             normaliza a neto), fecha de corte de la apertura editable,
--             etiqueta DESACTUALIZADO, insumos pendientes por falta de cantidad
--             de la presentación, y costos de apertura en dólares convertidos
--             con el tipo de cambio activo de la serie A3500.
-- Reglas    : D-42, R-10, D-38, D-54, RN-50.
-- Fecha     : 2026-10-10
-- ---------------------------------------------------------------------------
--
-- Va antes de la rectificación de la carga de apertura (20261010120100), que
-- usa lo que se define acá: costo de apertura en dólares sin tipo de cambio
-- propio, anulación de un costo de apertura y la tabla de pendientes.

-- ===========================================================================
-- 1. Fecha de corte de la apertura (parámetro versionado)
-- ===========================================================================

alter table comercial.parametros_costo add column corte_apertura date;
comment on column comercial.parametros_costo.corte_apertura is
  'D-42: un costo de referencia con fecha anterior a ésta, o sin fecha, se muestra DESACTUALIZADO (sigue valiendo '
  'como provisorio). Sin valor cargado rige 2025-01-01, el que fijó Finanzas.';

-- Mismas columnas y orden que la vigente (20261009150000), más el corte al final.
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
                  where h.corte_b is not null order by h.orden desc limit 1), 0.95) as corte_b,
       coalesce((select h.corte_apertura from comercial.parametros_costo h
                  where h.corte_apertura is not null order by h.orden desc limit 1), date '2025-01-01') as corte_apertura
  from (select 1) d
  left join lateral (select * from comercial.parametros_costo order by orden desc limit 1) p on true
 where core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
    or current_user not in ('authenticated', 'anon');

comment on view comercial.v_parametros_costo is
  'Parámetros vigentes: cada uno, el último valor no nulo cargado (una fila nueva cambia sólo lo que trae); sin '
  'ninguno, el valor por defecto (corte de la apertura: 2025-01-01, D-42). Sin rol de costos, ninguna fila. El escape '
  'por current_user (fuera de authenticated/anon) es para migraciones y funciones SECURITY DEFINER; vale mientras '
  'ningún rol dedicado reciba SELECT sobre esta vista.';

-- ===========================================================================
-- 2. Costo de referencia manual con o sin IVA
-- ===========================================================================
--
-- Finanzas puede tipear el precio como figura en la factura. Se guarda lo que
-- tipeó (importe, incluye_iva, alícuota) y el neto se deriva. Es un precio de
-- referencia, no una compra: Finanzas lo da como neto de IVA (D-42), sin la
-- distinción por comprobante de comercial.importe_neto_ars.

alter table comercial.costos_referencia
  add column incluye_iva boolean not null default false,
  add column alicuota_iva numeric(5,2) check (alicuota_iva in (10.5, 21, 27));
alter table comercial.costos_referencia
  add constraint costos_referencia_iva check (incluye_iva = (alicuota_iva is not null)),
  add column importe_neto numeric(16,4) generated always as
    (round(case when incluye_iva then importe / (1 + alicuota_iva / 100) else importe end, 4)) stored;

comment on table comercial.costos_referencia is
  'Precio de referencia que carga Finanzas por insumo, con o sin IVA (importe_neto es el que costea, D-42). Gana sobre '
  'el último lote mientras esté vigente. Nunca toca costos_lote: lo pagado no se reescribe. Append-only salvo '
  'vigente_hasta, para darlo de baja.';
comment on column comercial.costos_referencia.importe is
  'Lo que tipeó Finanzas, por `cantidad` `unidad`. Con IVA si incluye_iva; el neto está en importe_neto.';
comment on column comercial.costos_referencia.importe_neto is 'Importe sin IVA (D-42). Es el que costea.';

-- En un BEFORE UPDATE la columna generada todavía no está calculada en NEW: se
-- deja afuera de la comparación (se deriva de columnas que sí se comparan).
create or replace function comercial.fn_costo_referencia_baja()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'vigente_hasta' - 'importe_neto') <> (to_jsonb(old) - 'vigente_hasta' - 'importe_neto') then
    raise exception 'Un precio de referencia no se edita: se carga uno nuevo. Sólo se le puede poner fecha de fin.'
      using errcode = 'check_violation';
  end if;
  if old.vigente_hasta is not null and (new.vigente_hasta is null or new.vigente_hasta > old.vigente_hasta) then
    raise exception 'La fecha de fin sólo se adelanta.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 3. Costo de apertura: dólares con la serie y anulación
-- ===========================================================================
--
-- D-42: un costo de la planilla en dólares guarda el monto en dólares y su
-- fecha, sin tipo de cambio propio (los implícitos de la planilla no son
-- coherentes). Se convierte con el tipo de cambio activo de la serie y la
-- vista dice cuál se aplicó. Sólo la apertura: una compra guarda el tipo de
-- cambio del día en que se pagó.
--
-- Anulación: un costo de apertura que ya no vale (falta la cantidad de la
-- presentación) se rectifica con una fila sin importe. No es un costo cero,
-- es «sin costo»: el insumo deja de costear y sus productos quedan incompletos.

alter table comercial.costos_lote alter column tipo_cambio drop not null;
alter table comercial.costos_lote alter column importe drop not null;
alter table comercial.costos_lote drop constraint costos_lote_tipo_cambio;
-- Cada rama decide sola: un tipo_cambio nulo no puede pasar porque una
-- comparación dé NULL (un CHECK que da NULL se cumple).
alter table comercial.costos_lote add constraint costos_lote_tipo_cambio check (
  (moneda = 'ARS' and tipo_cambio is not distinct from 1)
  or (moneda <> 'ARS' and tipo_cambio is not null and tipo_cambio > 0)
  or (moneda <> 'ARS' and tipo_cambio is null and origen = 'APERTURA'));
alter table comercial.costos_lote add constraint costos_lote_anulacion check (
  importe is not null or (rectifica_a is not null and origen = 'APERTURA'));

comment on column comercial.costos_lote.tipo_cambio is
  'Pesos por dólar a la fecha de la compra, si se pagó en dólares. Nulo sólo en apertura en dólares: se convierte con '
  'el tipo de cambio activo de la serie (v_tipo_cambio_activo, D-42).';
comment on column comercial.costos_lote.importe is
  'Importe pagado por `cantidad` `unidad`. Nulo sólo en una rectificación de apertura que anula el costo (D-42).';

-- El tipo de cambio activo: el último mes cargado de la serie A3500; en el
-- mismo mes, el de cierre antes que el promedio (es un valor a hoy, no un flujo).
create view comercial.v_tipo_cambio_activo
with (security_invoker = true) as
select s.serie, s.mes, s.valor, s.es_provisorio
  from comercial.series_macro s
 where s.serie in ('TC_A3500_CIERRE', 'TC_A3500_PROMEDIO')
 order by s.mes desc, (s.serie = 'TC_A3500_CIERRE') desc
 limit 1;

comment on view comercial.v_tipo_cambio_activo is
  'Tipo de cambio con que se convierten los costos de apertura en dólares (D-42): último mes cargado de la serie '
  'A3500, cierre antes que promedio. Sin serie cargada, ninguna fila y esos costos quedan pendientes.';

-- Mismas columnas y orden que la vigente (20261009120300), más el mes del tipo
-- de cambio de la serie al final. `tipo_cambio` es el aplicado.
create or replace view comercial.v_costos_lote
with (security_invoker = true) as
with vigentes as (
  select c.*
    from comercial.costos_lote c
   where not exists (select 1 from comercial.costos_lote r where r.rectifica_a = c.id)
),
accesorios as (
  select a.recepcion_id, sum(a.importe_neto_ars) as total
    from comercial.costos_accesorios a
   where not exists (select 1 from comercial.costos_accesorios r where r.rectifica_a = a.id)
   group by a.recepcion_id
),
base as (
  select v.*, l.recepcion_id, l.insumo_id, i.codigo_interno, i.nombre as insumo, i.unidad_medida,
         (rc.fecha_hora at time zone 'America/Argentina/Buenos_Aires')::date as fecha_recepcion, rc.proveedor_id,
         sum(v.importe_neto_ars) over (partition by l.recepcion_id) as suma_recepcion,
         case when v.tipo_cambio is null and v.origen = 'APERTURA' and v.moneda <> 'ARS' then t.valor end as tc_serie,
         case when v.tipo_cambio is null and v.origen = 'APERTURA' and v.moneda <> 'ARS' then t.mes end as tc_serie_mes
    from vigentes v
    join gmp.lotes_insumo l on l.id = v.lote_insumo_id
    join gmp.insumos_catalogo i on i.id = l.insumo_id
    left join gmp.recepciones rc on rc.id = l.recepcion_id
    left join comercial.v_tipo_cambio_activo t on true
)
select b.id, b.lote_insumo_id, b.insumo_id, b.codigo_interno, b.insumo, b.recepcion_id, b.fecha_recepcion,
       b.proveedor_id, b.origen, b.tipo_comprobante, b.importe, b.moneda,
       coalesce(b.tipo_cambio, b.tc_serie)::numeric(14,6) as tipo_cambio, b.cantidad, b.unidad,
       coalesce(b.fecha_costo, b.fecha_recepcion) as fecha_costo,
       coalesce(b.importe_neto_ars, round(b.importe * b.tc_serie, 4))::numeric(16,4) as precio_neto_ars,
       case when b.recepcion_id is not null and b.suma_recepcion > 0
            then round(coalesce(a.total, 0) * b.importe_neto_ars / b.suma_recepcion, 4)
            else 0 end as accesorios_ars,
       b.unidad_medida,
       comercial.convertir_cantidad(b.cantidad, b.unidad, b.unidad_medida, comercial.densidad_insumo(b.insumo_id))
         as cantidad_en_unidad_catalogo,
       b.cargado_por, b.cargado_en,
       b.tc_serie_mes as tipo_cambio_serie_mes
  from base b
  left join accesorios a on a.recepcion_id = b.recepcion_id;

comment on column comercial.v_costos_lote.tipo_cambio is
  'Tipo de cambio aplicado: el de la compra, o el activo de la serie si es apertura en dólares (tipo_cambio_serie_mes).';

-- ===========================================================================
-- 4. Insumos pendientes de la planilla de apertura
-- ===========================================================================
--
-- Un líquido o polvo cuyo «PESO» no trae cantidad y unidad claras no se puede
-- costear: el «Unitario» es el precio de la presentación y sin su tamaño no hay
-- precio por gramo. Queda acá con lo que la planilla sí dice, para que Finanzas
-- lo complete (Excel de pendientes → importación). Se resuelve solo cuando el
-- insumo tiene costo por otra vía; la fila queda como registro.

create table comercial.costos_apertura_pendientes (
  id             uuid primary key default gen_random_uuid(),
  insumo_id      uuid not null unique references gmp.insumos_catalogo(id),
  importe        numeric(16,4) not null check (importe > 0),
  moneda         text not null check (moneda in ('ARS', 'USD')),
  fecha_costo    date,
  motivo         text not null check (motivo in ('FALTA_CANTIDAD', 'DOLAR_A_REVISAR')),
  peso_planilla  text,
  detalle        text,
  cargado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en     timestamptz not null default now()
);

comment on table comercial.costos_apertura_pendientes is
  'D-42: insumos de la planilla de apertura que no se pueden costear tal cual: FALTA_CANTIDAD (líquido o polvo sin '
  'cantidad de la presentación) o DOLAR_A_REVISAR (el monto en dólares no es coherente con el «Unitario» en pesos: '
  'se deja para que Finanzas lo confirme en vez de cargar un valor erróneo). importe = «Unitario» (o U$D de la '
  'presentación) tal cual la planilla; peso_planilla = lo que decía la columna PESO. Lo carga la migración de '
  'apertura; nadie lo edita.';

create trigger trg_costos_apertura_pendientes_sello before insert on comercial.costos_apertura_pendientes
  for each row execute function comercial.fn_sello_carga();

alter table comercial.costos_apertura_pendientes enable row level security;
alter table comercial.costos_apertura_pendientes force  row level security;
grant select on comercial.costos_apertura_pendientes to authenticated;

create policy costos_apertura_pendientes_select_costos on comercial.costos_apertura_pendientes
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy costos_apertura_pendientes_select_costos on comercial.costos_apertura_pendientes is
  'D-38: lo ven los roles de costos. Sin políticas de escritura: lo carga la migración de apertura (D-42).';

select core.adjuntar_auditoria('comercial.costos_apertura_pendientes');

-- ===========================================================================
-- 5. Costo de referencia: neto de IVA, DESACTUALIZADO y pendientes
-- ===========================================================================
--
-- Mismas columnas y orden que la vigente (20261009120300), más al final:
--   desactualizado : el costo que rige es de APERTURA con fecha anterior al
--                    corte, o sin fecha. Vale como provisorio (D-42). Un precio
--                    manual de Finanzas confirma el costo y no lleva la marca.
--   pendiente      : por qué un insumo de la planilla no tiene costo.
--   tipo_cambio_aplicado / tipo_cambio_mes : si el costo que rige es de
--                    apertura en dólares, con qué tipo de cambio de la serie se
--                    convirtió.

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
corte as (
  select pc.corte_apertura from comercial.v_parametros_costo pc
),
resuelto as (
  select i.id as insumo_id, i.codigo_interno, i.nombre, i.tipo, i.unidad_medida,
         coalesce(m.costo, u.costo, a.costo) as costo_unitario_ars,
         case when m.costo is not null then 'MANUAL'
              when u.costo is not null then 'ULTIMO_LOTE'
              when a.costo is not null then 'APERTURA' end as origen,
         case when m.costo is not null then m.fecha
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
   where i.activo
)
select r.insumo_id, r.codigo_interno, r.nombre, r.tipo, r.unidad_medida, r.costo_unitario_ars, r.origen, r.fecha,
       r.costo_manual, r.costo_referencia_id, r.manual_desde,
       r.costo_ultimo_lote, r.ultimo_costo_lote_id, r.ultimo_lote_fecha,
       r.costo_apertura, r.apertura_fecha,
       case when r.costo_unitario_ars is not null
            then r.origen = 'APERTURA' and (r.fecha is null or r.fecha < (select corte_apertura from corte))
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
  'el último lote recibido (con accesorios), si no la planilla de apertura. desactualizado = apertura con fecha '
  'anterior al corte o sin fecha (provisorio, D-42); pendiente = por qué un insumo de la planilla quedó sin costo.';

-- Lo que hay que completar, en la forma de la plantilla de importación.
create view comercial.v_costos_pendientes
with (security_invoker = true) as
select r.insumo_id, r.codigo_interno, r.nombre, r.unidad_medida, r.pendiente,
       coalesce(p.importe, c.importe) as importe,
       coalesce(p.moneda, c.moneda) as moneda,
       c.cantidad, c.unidad,
       case when p.id is not null then p.fecha_costo else c.fecha_costo end as fecha_costo,
       p.peso_planilla, p.detalle
  from comercial.v_costo_referencia r
  left join comercial.costos_apertura_pendientes p on p.insumo_id = r.insumo_id
  left join lateral (
    select v.importe, v.moneda, v.cantidad, v.unidad, v.fecha_costo
      from comercial.v_costos_lote v
     where v.insumo_id = r.insumo_id and v.origen = 'APERTURA' and v.importe is not null
     order by v.fecha_costo desc nulls last
     limit 1
  ) c on true
 where r.pendiente is not null;

comment on view comercial.v_costos_pendientes is
  'Insumos sin costo por un motivo de la planilla de apertura (D-42), con lo que la planilla dice: el Excel de '
  'pendientes sale de acá, se completa y se reimporta como costo de referencia.';

grant select on comercial.v_tipo_cambio_activo, comercial.v_costos_pendientes to authenticated;

-- ===========================================================================
-- 6. Costeo de productos: el motivo del pendiente llega al desglose
-- ===========================================================================
--
-- Igual que 20261009120310, salvo que un insumo pendiente dice por qué
-- («Falta la cantidad de la presentación») en vez de «Insumo sin costo».

create or replace function comercial.costos_productos(p_productos uuid[] default null)
returns table (
  producto_id     uuid,
  orden           integer,
  tipo            text,
  componente      text,
  insumo_id       uuid,
  codigo_interno  text,
  cantidad        numeric,
  unidad          text,
  merma           numeric,
  costo_unitario  numeric,
  origen_costo    text,
  subtotal        numeric,
  falta           text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_refs     jsonb;
  v_hora     numeric;
  v_prod     record;
  v_formula  uuid;
  v_minutos  numeric;
  v_pesada   gmp.renglon_pesada[];
  v_err      text;
begin
  -- insumo → costo por unidad de catálogo (c), origen (o), gramos por unidad de
  -- catálogo (g) y, si no tiene costo, por qué (p).
  select coalesce(jsonb_object_agg(cr.insumo_id::text, jsonb_build_object(
           'c', cr.costo_unitario_ars,
           'o', cr.origen,
           'p', cr.pendiente,
           'g', comercial.convertir_cantidad(1, cr.unidad_medida, 'g', comercial.densidad_insumo(cr.insumo_id)))), '{}')
    into v_refs
    from comercial.v_costo_referencia cr
   where cr.costo_unitario_ars is not null or cr.pendiente is not null;
  select pc.costo_hora into v_hora from comercial.v_parametros_costo pc;

  for v_prod in
    select p.id, p.contenido_neto, p.unidad_contenido
      from gmp.productos p
     where (p_productos is null and p.activo) or p.id = any (p_productos)
  loop
    -- Granel
    select fc.formula_id into v_formula from comercial.formula_para_costo(v_prod.id) fc;
    v_pesada := null;
    v_err := null;
    if v_formula is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric, 'Sin fórmula'::text;
    elsif v_prod.contenido_neto is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric,
                          'Sin contenido neto por unidad'::text;
    else
      begin
        select array_agg(x) into v_pesada
          from gmp.calcular_lote(
                 v_formula,
                 p_volumen_l => case when v_prod.unidad_contenido = 'mL' then v_prod.contenido_neto end,
                 p_masa_kg   => case when v_prod.unidad_contenido = 'g'  then v_prod.contenido_neto end
               ) x;
      exception when check_violation or raise_exception or no_data_found then
        get stacked diagnostics v_err = message_text;
      end;
      if v_err is not null then
        return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                            null::text, null::numeric, null::numeric, null::text, null::numeric,
                            'No se pudo escalar la fórmula: ' || v_err;
      elsif v_pesada is null then
        return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                            null::text, null::numeric, null::numeric, null::text, null::numeric,
                            'Fórmula sin componentes'::text;
      else
        return query
          select v_prod.id, p.orden, 'GRANEL'::text, p.componente, p.insumo_id, p.codigo_interno,
                 p.masa_kg, 'g'::text, 0::numeric,
                 k.c / k.g, k.o,
                 round(p.masa_kg * k.c / k.g, 4),
                 case when p.insumo_id is null then 'Componente sin insumo de catálogo'
                      when k.c is null then coalesce(k.p, 'Insumo sin costo')
                      when k.g is null then 'Unidad del insumo incompatible con gramos' end
            from unnest(v_pesada) p
            left join lateral (
              select (v_refs -> p.insumo_id::text ->> 'c')::numeric as c,
                     v_refs -> p.insumo_id::text ->> 'o' as o,
                     v_refs -> p.insumo_id::text ->> 'p' as p,
                     nullif((v_refs -> p.insumo_id::text ->> 'g')::numeric, 0) as g
            ) k on true;
      end if;
    end if;

    -- Acondicionamiento: cantidad por unidad (unidad del catálogo) / (1 − merma).
    return query
      select v_prod.id, 1000 + (row_number() over (order by i.codigo_interno))::integer, 'ACONDICIONAMIENTO'::text,
             i.nombre, m.insumo_id, i.codigo_interno, m.cantidad_por_unidad, i.unidad_medida, m.merma,
             (v_refs -> m.insumo_id::text ->> 'c')::numeric, v_refs -> m.insumo_id::text ->> 'o',
             round(m.cantidad_por_unidad / (1 - m.merma) * (v_refs -> m.insumo_id::text ->> 'c')::numeric, 4),
             case when v_refs -> m.insumo_id::text ->> 'c' is null
                  then coalesce(v_refs -> m.insumo_id::text ->> 'p', 'Insumo sin costo') end
        from gmp.materiales_acondicionamiento m
        join gmp.insumos_catalogo i on i.id = m.insumo_id
       where m.producto_id = v_prod.id and m.activo;

    -- Mano de obra
    select mp.minutos_por_unidad into v_minutos
      from comercial.minutos_producto mp where mp.producto_id = v_prod.id order by mp.orden desc limit 1;
    return query
      select v_prod.id, 2000, 'MANO_DE_OBRA'::text, 'Mano de obra'::text, null::uuid, null::text, v_minutos,
             'min'::text, 0::numeric, round(v_hora / 60, 6), 'COSTO_HORA'::text, round(v_minutos * v_hora / 60, 4),
             case when v_minutos is null then 'Sin minutos por unidad'
                  when v_hora is null then 'Sin costo hora' end;
  end loop;
end;
$$;

comment on function comercial.costos_productos(uuid[]) is
  'Desglose del costo unitario: granel (formula_para_costo × contenido), acondicionamiento (cantidad / (1 − merma)) '
  'y mano de obra (minutos × costo hora / 60). Las filas con `falta` no suman; un insumo pendiente de la planilla '
  'de apertura dice por qué (D-42).';

-- ===========================================================================
-- 7. Importación de costos de referencia con IVA
-- ===========================================================================
--
-- Igual que 20261009170000 más dos columnas: incluye_iva («SI»/«NO», por
-- defecto NO) y alicuota (obligatoria con SI).

create or replace function comercial.importar_costos_referencia(p_archivo text, p_hash text, p_filas jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r       jsonb;
  v_ins   record;
  v_iva   boolean;
  v_n     integer := 0;
  v_fila  integer := 0;
begin
  if not core.es_rol('FINANZAS') then
    raise exception 'Los costos de referencia los importa Finanzas.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_archivo, ''))) = 0 or coalesce(lower(p_hash), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Faltan el nombre del archivo o su SHA-256.' using errcode = 'check_violation';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'La planilla no tiene renglones.' using errcode = 'check_violation';
  end if;
  for r in select * from jsonb_array_elements(p_filas) loop
    v_fila := v_fila + 1;
    select id, activo into v_ins from gmp.insumos_catalogo where codigo_interno = r ->> 'codigo_insumo';
    if v_ins.id is null then
      raise exception 'Renglón %: no existe el insumo «%».', v_fila, r ->> 'codigo_insumo' using errcode = 'check_violation';
    elsif not v_ins.activo then
      raise exception 'Renglón %: el insumo «%» está inactivo.', v_fila, r ->> 'codigo_insumo' using errcode = 'check_violation';
    end if;
    -- Tipos estrictos: sin interpretar textos (DateStyle, separadores de miles).
    if jsonb_typeof(r -> 'importe') is distinct from 'number'
       or (r ? 'cantidad' and jsonb_typeof(r -> 'cantidad') not in ('number', 'null'))
       or (r ? 'tipo_cambio' and jsonb_typeof(r -> 'tipo_cambio') not in ('number', 'null'))
       or (r ? 'alicuota' and jsonb_typeof(r -> 'alicuota') not in ('number', 'null'))
       or (r ->> 'vigente_desde' is not null and r ->> 'vigente_desde' !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'Renglón % («%»): importe, cantidad, tipo de cambio y alícuota van como número y la fecha como AAAA-MM-DD.',
        v_fila, r ->> 'codigo_insumo' using errcode = 'check_violation';
    end if;
    if coalesce(r ->> 'incluye_iva', 'NO') not in ('SI', 'NO') then
      raise exception 'Renglón % («%»): incluye_iva va como SI o NO.', v_fila, r ->> 'codigo_insumo'
        using errcode = 'check_violation';
    end if;
    v_iva := coalesce(r ->> 'incluye_iva', 'NO') = 'SI';
    if v_iva <> (r ->> 'alicuota' is not null) then
      raise exception 'Renglón % («%»): con IVA incluido va la alícuota (10,5, 21 o 27); sin IVA, sin alícuota.',
        v_fila, r ->> 'codigo_insumo' using errcode = 'check_violation';
    end if;
    begin
      insert into comercial.costos_referencia (insumo_id, importe, incluye_iva, alicuota_iva, cantidad, unidad, moneda,
                                               tipo_cambio, vigente_desde, motivo)
      values (v_ins.id, (r ->> 'importe')::numeric, v_iva, (r ->> 'alicuota')::numeric,
              coalesce((r ->> 'cantidad')::numeric, 1), r ->> 'unidad',
              coalesce(r ->> 'moneda', 'ARS'),
              case when coalesce(r ->> 'moneda', 'ARS') = 'ARS' then 1 else (r ->> 'tipo_cambio')::numeric end,
              coalesce((r ->> 'vigente_desde')::date, comercial.hoy()),
              coalesce(nullif(btrim(r ->> 'motivo'), ''), 'Importación ' || btrim(p_archivo)));
    exception when data_exception or integrity_constraint_violation then
      raise exception 'Renglón % («%»): %', v_fila, r ->> 'codigo_insumo', sqlerrm using errcode = 'check_violation';
    end;
    v_n := v_n + 1;
  end loop;
  perform set_config('comercial.importando', 'si', true);
  insert into comercial.importaciones (plantilla, archivo, hash_archivo, filas, datos)
  values ('costos_materias_primas', btrim(p_archivo), lower(p_hash), v_n, p_filas);
  perform set_config('comercial.importando', '', true);
  return v_n;
end;
$$;

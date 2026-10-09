-- ---------------------------------------------------------------------------
-- Propósito : Fase 1 del módulo de costos. Costo histórico por lote (lo que se
--             pagó), costos accesorios por recepción prorrateados por valor,
--             costo de referencia por insumo resuelto por prioridad (manual de
--             Finanzas → último lote → apertura), costo hora y minutos por
--             producto, costo unitario de cada producto, series macro (IPC y
--             tipo de cambio A3500), aviso de variación real de precio y
--             conciliación lotes contra comprobante del proveedor.
-- Reglas    : R-10 (identificación específica; reemplaza R-02 y responde D-36),
--             D-38 (quién ve y carga costos), D-39 a D-44
--             (docs/DECISIONES_ABIERTAS.md), RN-50 (auditoría), RN-65
--             (recepción física y fiscal separadas: el costo no toca gmp).
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- COSTEO DE GESTIÓN. Todo lo de este archivo sirve para conocer el costo real
-- y fijar precios. No es la valuación contable de inventario: ésa la valida el
-- estudio contable (R-10).
--
-- FUENTE ÚNICA DEL COSTO DE UN LOTE: comercial.costos_lote. gmp.recepciones
-- tiene `monto` y `moneda` (extensión administrativa de 20260904140300) y
-- comercial.comprobantes_proveedor tiene el total fiscal; ninguno de los dos
-- costea. El comprobante sólo se concilia contra los lotes (v_conciliacion_recepcion).
--
-- IVA. Nail Show es Responsable Inscripta: el IVA de una factura A es crédito
-- fiscal y no es costo. En cualquier otro comprobante (B, C, IVA no
-- discriminado, o sin comprobante) no hay crédito que recuperar y el importe
-- entero es costo. La regla vive en una sola función, comercial.importe_neto_ars.
-- El neto se guarda; el valor con IVA se deriva.
--
-- SIN COMPROBANTE (D-43). Compras y gastos pagados en efectivo se cargan igual:
-- el objetivo es el costo real. No se bloquea ni se desalienta. La recepción
-- en gmp sigue exigiendo proveedor y registro, como siempre.
--
-- CORRECCIONES. Nada de esto se edita: un costo mal cargado se corrige con una
-- fila nueva que apunta a la original (`rectifica_a`) y dice por qué. La vigente
-- es la que nadie rectificó.

-- ===========================================================================
-- 1. Enumeraciones y funciones puras
-- ===========================================================================

create type comercial.comprobante_costo_enum as enum
  ('FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'NO_DISCRIMINADO', 'SIN_COMPROBANTE');
comment on type comercial.comprobante_costo_enum is
  'Comprobante de una compra o gasto. Sólo FACTURA_A discrimina IVA recuperable; en los demás el IVA es costo (D-43).';

create type comercial.origen_costo_enum as enum ('RECEPCION', 'APERTURA');

create type comercial.concepto_accesorio_enum as enum
  ('FLETE', 'SEGURO', 'ARANCELES', 'DESPACHANTE', 'OTRO');

create type comercial.serie_macro_enum as enum ('IPC', 'TC_A3500_PROMEDIO', 'TC_A3500_CIERRE');
comment on type comercial.serie_macro_enum is
  'IPC nivel general del INDEC y tipo de cambio mayorista A3500 del BCRA (promedio del mes para flujos, cierre '
  'para saldos). Otra serie de tipo de cambio se agrega con un valor nuevo, no reemplazando éste.';

-- Neto en pesos. La única definición de qué parte de un importe es costo.
create function comercial.importe_neto_ars(
  p_importe     numeric,
  p_comprobante comercial.comprobante_costo_enum,
  p_incluye_iva boolean,
  p_alicuota    numeric,
  p_tipo_cambio numeric
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
           case when p_comprobante = 'FACTURA_A' and p_incluye_iva
                then p_importe / (1 + p_alicuota / 100)
                else p_importe end
           * p_tipo_cambio, 4);
$$;
comment on function comercial.importe_neto_ars is
  'Neto en pesos de un importe cargado. Factura A con IVA incluido: se descuenta la alícuota (crédito fiscal). '
  'Cualquier otro caso, incluido sin comprobante y la carga de apertura (comprobante nulo): el importe entero.';

-- Pasa una cantidad entre g, kg, ml, l y UNIDAD, sin distinguir mayúsculas (el
-- catálogo real usa «g», «kg», «ml» y «UNIDAD»). Masa ↔ volumen sólo con
-- densidad (g/mL); sin ella devuelve nulo en vez de suponer un valor.
create function comercial.convertir_cantidad(
  p_cantidad numeric, p_desde text, p_hacia text, p_densidad numeric default null
) returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  fd numeric; fh numeric; dd text; dh text; v numeric;
begin
  select f, d into fd, dd
    from (values ('g', 1, 'M'), ('kg', 1000, 'M'), ('ml', 1, 'V'), ('l', 1000, 'V'), ('unidad', 1, 'U')) t(u, f, d)
   where u = lower(btrim(p_desde));
  select f, d into fh, dh
    from (values ('g', 1, 'M'), ('kg', 1000, 'M'), ('ml', 1, 'V'), ('l', 1000, 'V'), ('unidad', 1, 'U')) t(u, f, d)
   where u = lower(btrim(p_hacia));
  if fd is null or fh is null then
    return null;
  end if;
  v := p_cantidad * fd;                       -- en g, mL o unidades
  if dd <> dh then
    if dd = 'U' or dh = 'U' or p_densidad is null or p_densidad <= 0 then
      return null;
    end if;
    v := case when dd = 'M' then v / p_densidad else v * p_densidad end;
  end if;
  return v / fh;
end;
$$;
comment on function comercial.convertir_cantidad is
  'Convierte entre g, kg, mL, L y UNIDAD. Entre masa y volumen exige densidad en g/mL; sin ella, nulo.';

-- Densidad de un insumo a 20 °C, si tiene modelo cargado. Nulo si no.
create function comercial.densidad_insumo(p_insumo_id uuid)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ref uuid;
begin
  select d.id into v_ref
    from gmp.insumos_catalogo i
    join gmp.densidades_referencia d on d.id = i.densidad_referencia_id
   where i.id = p_insumo_id and 20 between d.valido_desde_c and d.valido_hasta_c;
  if v_ref is null then
    return null;  -- sin modelo o fuera de su rango: sin densidad, no se supone
  end if;
  return gmp.densidad_a(v_ref, 20);
exception when check_violation or no_data_found then
  return null;  -- lo que gmp.densidad_a rechaza; cualquier otro error sube
end;
$$;

-- El momento de carga lo pone la base, no el cliente: ordena «el último».
create function comercial.fn_sello_carga()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cargado_en := now();
  return new;
end;
$$;

-- Fecha de hoy en Argentina: la sesión de Supabase corre en UTC y después de
-- las 21 h el día (y a fin de mes, el mes del IPC) sería el siguiente.
create function comercial.hoy()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- ===========================================================================
-- 2. Costo histórico por lote
-- ===========================================================================

create table comercial.costos_lote (
  id                uuid primary key default gen_random_uuid(),
  lote_insumo_id    uuid not null references gmp.lotes_insumo(id),
  origen            comercial.origen_costo_enum not null default 'RECEPCION',
  -- Nulo sólo en la carga de apertura: la planilla no dice con qué comprobante
  -- se compró y su costo se toma como neto (D-42).
  tipo_comprobante  comercial.comprobante_costo_enum,
  importe           numeric(16,4) not null check (importe >= 0),
  incluye_iva       boolean,
  alicuota_iva      numeric(5,2) check (alicuota_iva in (0, 10.5, 21, 27)),
  moneda            text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  tipo_cambio       numeric(14,6) not null default 1,
  cantidad          numeric(16,4) not null check (cantidad > 0),
  unidad            text not null check (lower(unidad) in ('g', 'kg', 'ml', 'l', 'unidad')),
  fecha_costo       date,
  importe_neto_ars  numeric(16,4) generated always as
                    (comercial.importe_neto_ars(importe, tipo_comprobante, incluye_iva, alicuota_iva, tipo_cambio)) stored,
  rectifica_a       uuid unique references comercial.costos_lote(id),
  motivo            text,
  cargado_por       uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en        timestamptz not null default now(),
  constraint costos_lote_comprobante_por_origen
    check ((origen = 'RECEPCION') = (tipo_comprobante is not null)),
  constraint costos_lote_iva_solo_factura_a
    check ((tipo_comprobante is not distinct from 'FACTURA_A') = (incluye_iva is not null and alicuota_iva is not null)),
  constraint costos_lote_tipo_cambio
    check ((moneda = 'ARS' and tipo_cambio = 1) or (moneda <> 'ARS' and tipo_cambio > 0)),
  constraint costos_lote_rectificacion_con_motivo
    check (rectifica_a is null or length(btrim(coalesce(motivo, ''))) > 0)
);

comment on table comercial.costos_lote is
  'Lo que se pagó por un lote de insumo (R-10, identificación específica). Inmutable: se corrige con una fila que '
  'rectifica a la anterior. El costo unitario con accesorios sale de v_costos_lote.';
comment on column comercial.costos_lote.cantidad is
  'Cantidad pagada, en `unidad`. Puede diferir de la unidad del catálogo (lote en kg, catálogo en g): se normaliza en la vista.';
comment on column comercial.costos_lote.fecha_costo is
  'Fecha del precio. En recepción, la de la compra; en apertura, la «FECHA ACT» de la planilla (nula si no la tenía).';
comment on column comercial.costos_lote.tipo_cambio is
  'Pesos por dólar a la fecha de la compra, si se pagó en dólares. Moneda original e importe original quedan guardados.';

create unique index costos_lote_original_idx on comercial.costos_lote (lote_insumo_id) where rectifica_a is null;
create index costos_lote_lote_idx on comercial.costos_lote (lote_insumo_id);

-- ===========================================================================
-- 3. Costos accesorios por recepción (flete, seguro, aranceles, despachante)
-- ===========================================================================

create table comercial.costos_accesorios (
  id                uuid primary key default gen_random_uuid(),
  recepcion_id      uuid not null references gmp.recepciones(id),
  concepto          comercial.concepto_accesorio_enum not null,
  descripcion       text,
  tipo_comprobante  comercial.comprobante_costo_enum not null,
  importe           numeric(16,4) not null check (importe >= 0),
  incluye_iva       boolean,
  alicuota_iva      numeric(5,2) check (alicuota_iva in (0, 10.5, 21, 27)),
  moneda            text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  tipo_cambio       numeric(14,6) not null default 1,
  fecha_costo       date,
  importe_neto_ars  numeric(16,4) generated always as
                    (comercial.importe_neto_ars(importe, tipo_comprobante, incluye_iva, alicuota_iva, tipo_cambio)) stored,
  rectifica_a       uuid unique references comercial.costos_accesorios(id),
  motivo            text,
  cargado_por       uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en        timestamptz not null default now(),
  constraint costos_accesorios_iva_solo_factura_a
    check ((tipo_comprobante = 'FACTURA_A') = (incluye_iva is not null and alicuota_iva is not null)),
  constraint costos_accesorios_tipo_cambio
    check ((moneda = 'ARS' and tipo_cambio = 1) or (moneda <> 'ARS' and tipo_cambio > 0)),
  constraint costos_accesorios_rectificacion_con_motivo
    check (rectifica_a is null or length(btrim(coalesce(motivo, ''))) > 0)
);

comment on table comercial.costos_accesorios is
  'Costos de una recepción que no son de un lote (flete, seguro, aranceles, despachante). Se prorratean por valor '
  'entre los lotes con costo de esa recepción: costo_i = precio_i + accesorios × precio_i / Σ precio_j (D-40). '
  'Quitar uno es rectificarlo con importe 0.';

create index costos_accesorios_recepcion_idx on comercial.costos_accesorios (recepcion_id);

-- Una rectificación apunta a una fila del mismo lote (o recepción) y conserva
-- su origen. El origen tiene que coincidir con el lote: APERTURA sólo sobre
-- lotes del saldo de apertura, RECEPCION sólo sobre lotes recibidos. Si no, un
-- costo de apertura se presentaría como «último lote» y dispararía avisos.
create function comercial.fn_costo_coherente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ant record;
begin
  new.cargado_en := now();
  if tg_table_name = 'costos_lote' then
    if new.rectifica_a is not null then
      select lote_insumo_id, origen into v_ant from comercial.costos_lote where id = new.rectifica_a;
      if v_ant.lote_insumo_id <> new.lote_insumo_id or v_ant.origen <> new.origen then
        raise exception 'La rectificación tiene que ser del mismo lote y del mismo origen que el costo que corrige.'
          using errcode = 'check_violation';
      end if;
    elsif new.origen = 'APERTURA' and not exists (
      select 1 from gmp.lotes_insumo where id = new.lote_insumo_id and migracion_apertura_id is not null
    ) then
      raise exception 'El costo de apertura va sólo sobre lotes del saldo de apertura.' using errcode = 'check_violation';
    elsif new.origen = 'RECEPCION' and not exists (
      select 1 from gmp.lotes_insumo where id = new.lote_insumo_id and recepcion_id is not null
    ) then
      raise exception 'Este lote no vino de una recepción: su costo es de apertura (lo carga Finanzas).'
        using errcode = 'check_violation';
    end if;
  else
    if new.rectifica_a is not null and not exists (
      select 1 from comercial.costos_accesorios where id = new.rectifica_a and recepcion_id = new.recepcion_id
    ) then
      raise exception 'La rectificación tiene que ser de la misma recepción.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_costo_lote_coherente
  before insert on comercial.costos_lote
  for each row execute function comercial.fn_costo_coherente();
create trigger trg_costo_accesorio_coherente
  before insert on comercial.costos_accesorios
  for each row execute function comercial.fn_costo_coherente();

-- Costo vigente de cada lote, con los accesorios prorrateados y el unitario
-- llevado a la unidad del catálogo.
create view comercial.v_costos_lote
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
         sum(v.importe_neto_ars) over (partition by l.recepcion_id) as suma_recepcion
    from vigentes v
    join gmp.lotes_insumo l on l.id = v.lote_insumo_id
    join gmp.insumos_catalogo i on i.id = l.insumo_id
    left join gmp.recepciones rc on rc.id = l.recepcion_id
)
select b.id, b.lote_insumo_id, b.insumo_id, b.codigo_interno, b.insumo, b.recepcion_id, b.fecha_recepcion,
       b.proveedor_id, b.origen, b.tipo_comprobante, b.importe, b.moneda, b.tipo_cambio, b.cantidad, b.unidad,
       coalesce(b.fecha_costo, b.fecha_recepcion) as fecha_costo,
       b.importe_neto_ars as precio_neto_ars,
       case when b.recepcion_id is not null and b.suma_recepcion > 0
            then round(coalesce(a.total, 0) * b.importe_neto_ars / b.suma_recepcion, 4)
            else 0 end as accesorios_ars,
       b.unidad_medida,
       comercial.convertir_cantidad(b.cantidad, b.unidad, b.unidad_medida, comercial.densidad_insumo(b.insumo_id))
         as cantidad_en_unidad_catalogo,
       b.cargado_por, b.cargado_en
  from base b
  left join accesorios a on a.recepcion_id = b.recepcion_id;

-- El unitario se calcula sobre la vista anterior para no repetir el prorrateo.
create view comercial.v_costos_lote_unitario
with (security_invoker = true) as
select v.*,
       v.precio_neto_ars + v.accesorios_ars as costo_total_ars,
       case when v.cantidad_en_unidad_catalogo > 0
            then round((v.precio_neto_ars + v.accesorios_ars) / v.cantidad_en_unidad_catalogo, 6) end
         as costo_unitario_ars,
       case when v.cantidad_en_unidad_catalogo > 0
            then round(v.precio_neto_ars / v.cantidad_en_unidad_catalogo, 6) end
         as precio_unitario_ars
  from comercial.v_costos_lote v;

comment on view comercial.v_costos_lote_unitario is
  'Costo vigente por lote. costo_unitario_ars incluye accesorios prorrateados y está en la unidad del catálogo '
  '(nulo si el catálogo no tiene unidad o si pasar masa a volumen pide una densidad que el insumo no tiene).';

-- ===========================================================================
-- 4. Costo de referencia (Finanzas) y su resolución por prioridad
-- ===========================================================================

create table comercial.costos_referencia (
  id             uuid primary key default gen_random_uuid(),
  orden          bigint generated always as identity,
  insumo_id      uuid not null references gmp.insumos_catalogo(id),
  -- Neto (sin IVA) por `cantidad` `unidad`: «$12.000 los 500 g».
  importe        numeric(16,4) not null check (importe > 0),
  cantidad       numeric(16,4) not null default 1 check (cantidad > 0),
  unidad         text not null check (lower(unidad) in ('g', 'kg', 'ml', 'l', 'unidad')),
  moneda         text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  tipo_cambio    numeric(14,6) not null default 1,
  vigente_desde  date not null default comercial.hoy(),
  vigente_hasta  date,
  motivo         text,
  cargado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en     timestamptz not null default now(),
  constraint costos_referencia_tipo_cambio
    check ((moneda = 'ARS' and tipo_cambio = 1) or (moneda <> 'ARS' and tipo_cambio > 0)),
  constraint costos_referencia_vigencia
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

comment on table comercial.costos_referencia is
  'Precio de referencia que carga Finanzas por insumo, neto. Gana sobre el último lote mientras esté vigente. '
  'Nunca toca costos_lote: lo pagado no se reescribe. Append-only salvo vigente_hasta, para darlo de baja.';

create index costos_referencia_insumo_idx on comercial.costos_referencia (insumo_id, vigente_desde desc, orden desc);

-- La única columna que cambia es vigente_hasta, y sólo para acortar.
create function comercial.fn_costo_referencia_baja()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'vigente_hasta') <> (to_jsonb(old) - 'vigente_hasta') then
    raise exception 'Un precio de referencia no se edita: se carga uno nuevo. Sólo se le puede poner fecha de fin.'
      using errcode = 'check_violation';
  end if;
  if old.vigente_hasta is not null and (new.vigente_hasta is null or new.vigente_hasta > old.vigente_hasta) then
    raise exception 'La fecha de fin sólo se adelanta.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_costo_referencia_baja
  before update on comercial.costos_referencia
  for each row execute function comercial.fn_costo_referencia_baja();

-- Un precio de Finanzas en una unidad que no se puede llevar a la del catálogo
-- (kg para un insumo en UNIDAD, o ml sin densidad) quedaría ignorado en
-- silencio por la vista. Se rechaza al cargarlo.
create function comercial.fn_costo_referencia_alta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unidad text;
begin
  new.cargado_en := now();
  select unidad_medida into v_unidad from gmp.insumos_catalogo where id = new.insumo_id;
  if comercial.convertir_cantidad(new.cantidad, new.unidad, v_unidad, comercial.densidad_insumo(new.insumo_id)) is null then
    raise exception 'No se puede pasar % a la unidad del catálogo de este insumo (%). Cargá el precio en %.',
      new.unidad, coalesce(v_unidad, 'sin unidad'), coalesce(v_unidad, 'la unidad del catálogo')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_costo_referencia_alta
  before insert on comercial.costos_referencia
  for each row execute function comercial.fn_costo_referencia_alta();

create view comercial.v_costo_referencia
with (security_invoker = true) as
with manual as (
  select distinct on (r.insumo_id)
         r.insumo_id, r.id,
         round(r.importe * r.tipo_cambio
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
  select distinct on (c.insumo_id) c.insumo_id, c.id, c.costo_unitario_ars as costo, c.fecha_costo as fecha
    from comercial.v_costos_lote_unitario c
   where c.origen = 'APERTURA' and c.costo_unitario_ars is not null
   order by c.insumo_id, c.fecha_costo desc nulls last, c.cargado_en desc
)
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
       a.costo as costo_apertura, a.fecha as apertura_fecha
  from gmp.insumos_catalogo i
  left join manual m on m.insumo_id = i.id
  left join ultimo u on u.insumo_id = i.id
  left join apertura a on a.insumo_id = i.id
 where i.activo;

comment on view comercial.v_costo_referencia is
  'Costo de referencia por insumo, neto y en la unidad del catálogo: manual de Finanzas vigente, si no el último '
  'lote recibido (con accesorios), si no la planilla de apertura. Muestra los tres para comparar.';

-- ===========================================================================
-- 5. Parámetros (costo hora, umbral, margen mínimo) y minutos por producto
-- ===========================================================================

create table comercial.parametros_costo (
  id                        uuid primary key default gen_random_uuid(),
  orden                     bigint generated always as identity,
  costo_hora                numeric(14,2) check (costo_hora >= 0),
  umbral_variacion          numeric(6,4) not null default 0.05 check (umbral_variacion between 0 and 1),
  margen_minimo             numeric(6,4) not null default 0.25 check (margen_minimo >= 0 and margen_minimo < 1),
  vigencia_cotizacion_dias  integer not null default 7 check (vigencia_cotizacion_dias > 0),
  serie_tipo_cambio         text not null default 'A3500' check (serie_tipo_cambio in ('A3500')),
  motivo                    text,
  cargado_por               uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en                timestamptz not null default now()
);

comment on table comercial.parametros_costo is
  'Parámetros del módulo, versionados: rige la última fila; el costo hora, el último no nulo (una fila que sólo '
  'cambia el umbral no lo borra). Sin filas rigen los valores por defecto (5 %, 25 %, 7 días, A3500).';
comment on column comercial.parametros_costo.costo_hora is
  'Costo laboral TOTAL de producción por hora productiva: sueldos + cargas sociales + SAC + vacaciones, dividido por '
  'las horas efectivamente productivas. No es el sueldo bruto por hora.';
comment on column comercial.parametros_costo.margen_minimo is
  'Margen sobre el precio, m = (P − C) / P, por debajo del cual el cotizador pide justificación.';

create view comercial.v_parametros_costo
with (security_invoker = true) as
select (select h.costo_hora from comercial.parametros_costo h
         where h.costo_hora is not null order by h.orden desc limit 1) as costo_hora,
       coalesce(p.umbral_variacion, 0.05) as umbral_variacion,
       coalesce(p.margen_minimo, 0.25) as margen_minimo,
       coalesce(p.vigencia_cotizacion_dias, 7) as vigencia_cotizacion_dias,
       coalesce(p.serie_tipo_cambio, 'A3500') as serie_tipo_cambio,
       p.cargado_por, p.cargado_en
  from (select 1) d
  left join lateral (select * from comercial.parametros_costo order by orden desc limit 1) p on true
 -- Sin el rol, ninguna fila: no los valores por defecto como si fueran los reales.
 where core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
    or current_user not in ('authenticated', 'anon');

create table comercial.minutos_producto (
  id                  uuid primary key default gen_random_uuid(),
  orden               bigint generated always as identity,
  producto_id         uuid not null references gmp.productos(id),
  minutos_por_unidad  numeric(10,3) not null check (minutos_por_unidad >= 0),
  motivo              text,
  cargado_por         uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en          timestamptz not null default now()
);

comment on table comercial.minutos_producto is
  'Minutos de mano de obra directa por unidad de producto. Append-only: rige el último.';

create index minutos_producto_idx on comercial.minutos_producto (producto_id, orden desc);

create trigger trg_parametros_costo_sello before insert on comercial.parametros_costo
  for each row execute function comercial.fn_sello_carga();
create trigger trg_minutos_producto_sello before insert on comercial.minutos_producto
  for each row execute function comercial.fn_sello_carga();

-- ===========================================================================
-- 6. Series macro (IPC, tipo de cambio)
-- ===========================================================================

create table comercial.series_macro (
  id             uuid primary key default gen_random_uuid(),
  serie          comercial.serie_macro_enum not null,
  mes            date not null check (mes = date_trunc('month', mes)::date),
  valor          numeric(18,6) not null check (valor > 0),
  fuente         text not null check (length(btrim(fuente)) > 0),
  es_provisorio  boolean not null default false,
  cargado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en     timestamptz not null default now(),
  unique (serie, mes)
);

comment on table comercial.series_macro is
  'Series mensuales que carga Finanzas: IPC (índice) y tipo de cambio A3500 promedio y de cierre (pesos por dólar). '
  'Un provisorio se pasa a definitivo editando la fila; el cambio queda en core.auditoria. La conversión vive en '
  'src/lib/moneda.ts.';

create trigger trg_series_macro_sello before insert on comercial.series_macro
  for each row execute function comercial.fn_sello_carga();

-- ===========================================================================
-- 7. Aviso de variación real del precio de compra
-- ===========================================================================

create table comercial.avisos_costo (
  id                         uuid primary key default gen_random_uuid(),
  costo_lote_id              uuid not null unique references comercial.costos_lote(id),
  insumo_id                  uuid not null references gmp.insumos_catalogo(id),
  costo_referencia_id        uuid not null references comercial.costos_referencia(id),
  precio_lote_unitario       numeric(18,6) not null,
  costo_referencia_unitario  numeric(18,6) not null,
  -- Sin escala fija: un error grueso de unidad (precio mil veces el de
  -- referencia) tiene que generar el aviso, no abortar la carga del lote.
  variacion_nominal          numeric not null,
  ipc_acumulado              numeric,
  variacion_real             numeric not null,
  umbral                     numeric(6,4) not null,
  creado_en                  timestamptz not null default now(),
  visto_por                  uuid references core.usuarios(id),
  visto_en                   timestamptz,
  constraint avisos_costo_visto_con_autor check ((visto_por is null) = (visto_en is null))
);

comment on table comercial.avisos_costo is
  'Un lote cuyo precio difiere del costo de referencia manual de Finanzas más que el umbral, en términos reales: '
  '(1 + nominal) / (1 + IPC acumulado) − 1 (D-41). Ninguno de los dos valores gana en silencio. Sin IPC cargado para '
  'alguno de los dos meses, el IPC acumulado queda nulo y se compara la variación nominal.';

create index avisos_costo_insumo_idx on comercial.avisos_costo (insumo_id);
create index avisos_costo_referencia_idx on comercial.avisos_costo (costo_referencia_id);
create index avisos_costo_sin_ver_idx on comercial.avisos_costo (creado_en desc) where visto_en is null;

-- Visto: una sola vez, a nombre de quien lo marca y con la hora de la base.
create function comercial.fn_aviso_visto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.visto_en is not null then
    raise exception 'El aviso ya figura como visto.' using errcode = 'check_violation';
  end if;
  new.visto_por := core.usuario_actual();
  new.visto_en  := now();
  return new;
end;
$$;

create trigger trg_aviso_visto
  before update on comercial.avisos_costo
  for each row execute function comercial.fn_aviso_visto();

create function comercial.fn_aviso_variacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_insumo   uuid;
  v_unidad   text;
  v_fecha    date;
  v_ref      record;
  v_cant     numeric;
  v_precio   numeric;
  v_nominal  numeric;
  v_ipc_ref  numeric;
  v_ipc_lote numeric;
  v_ipc      numeric;
  v_real     numeric;
  v_umbral   numeric;
begin
  if new.origen <> 'RECEPCION' then
    return new;
  end if;
  select l.insumo_id, i.unidad_medida, coalesce(new.fecha_costo, (r.fecha_hora at time zone 'America/Argentina/Buenos_Aires')::date, comercial.hoy())
    into v_insumo, v_unidad, v_fecha
    from gmp.lotes_insumo l
    join gmp.insumos_catalogo i on i.id = l.insumo_id
    left join gmp.recepciones r on r.id = l.recepcion_id
   where l.id = new.lote_insumo_id;

  select m.id, m.costo, m.fecha into v_ref
    from (select costo_referencia_id as id, costo_manual as costo, manual_desde as fecha
            from comercial.v_costo_referencia where insumo_id = v_insumo) m
   where m.id is not null;
  if v_ref.id is null or v_ref.costo is null or v_ref.costo = 0 then
    return new;
  end if;

  v_cant := comercial.convertir_cantidad(new.cantidad, new.unidad, v_unidad, comercial.densidad_insumo(v_insumo));
  if v_cant is null or v_cant = 0 then
    return new;
  end if;
  v_precio  := new.importe_neto_ars / v_cant;
  v_nominal := v_precio / v_ref.costo - 1;

  select valor into v_ipc_ref from comercial.series_macro
   where serie = 'IPC' and mes = date_trunc('month', v_ref.fecha)::date;
  select valor into v_ipc_lote from comercial.series_macro
   where serie = 'IPC' and mes = date_trunc('month', v_fecha)::date;
  v_ipc  := case when v_ipc_ref > 0 and v_ipc_lote > 0 then v_ipc_lote / v_ipc_ref - 1 end;
  v_real := (1 + v_nominal) / (1 + coalesce(v_ipc, 0)) - 1;

  select umbral_variacion into v_umbral from comercial.v_parametros_costo;
  if abs(v_real) > v_umbral then
    insert into comercial.avisos_costo
      (costo_lote_id, insumo_id, costo_referencia_id, precio_lote_unitario, costo_referencia_unitario,
       variacion_nominal, ipc_acumulado, variacion_real, umbral)
    values
      (new.id, v_insumo, v_ref.id, round(v_precio, 6), v_ref.costo,
       round(v_nominal, 6), round(v_ipc, 6), round(v_real, 6), v_umbral);
  end if;
  return new;
end;
$$;

comment on function comercial.fn_aviso_variacion() is
  'SECURITY DEFINER: quien carga el lote (Gerencia de Producción) no escribe avisos; el aviso lo genera la base. '
  'Compara el precio del lote SIN accesorios contra el costo de referencia manual vigente.';

create trigger trg_aviso_variacion
  after insert on comercial.costos_lote
  for each row execute function comercial.fn_aviso_variacion();

-- ===========================================================================
-- 8. Conciliación de lotes contra el comprobante del proveedor (D-44)
-- ===========================================================================

create view comercial.v_conciliacion_recepcion
with (security_invoker = true) as
with comprobantes as (
  select cp.recepcion_id,
         sum(case when cp.tipo = 'FACTURA_A' then cp.importe_neto
                  when cp.tipo in ('FACTURA_B', 'FACTURA_C') then cp.importe_total
                  when cp.tipo = 'NOTA_CREDITO_A' then -cp.importe_neto
                  else -cp.importe_total end) as neto_comprobantes,
         count(*) filter (where cp.tipo::text like 'FACTURA%') as comprobantes
    from comercial.comprobantes_proveedor cp
   where cp.recepcion_id is not null
     and cp.anulado_en is null
     and cp.tipo <> 'SIN_FACTURA'
   group by cp.recepcion_id
  having count(*) filter (where cp.tipo::text like 'FACTURA%') > 0
),
lotes as (
  select l.recepcion_id,
         count(*) as lotes,
         count(c.id) as lotes_con_costo,
         coalesce(sum(c.precio_neto_ars), 0) as neto_lotes
    from gmp.lotes_insumo l
    left join comercial.v_costos_lote c on c.lote_insumo_id = l.id
   where l.recepcion_id is not null
   group by l.recepcion_id
)
select r.id as recepcion_id, r.numero as recepcion, (r.fecha_hora at time zone 'America/Argentina/Buenos_Aires')::date as fecha, r.proveedor_id,
       k.comprobantes, k.neto_comprobantes, l.lotes, l.lotes_con_costo, l.neto_lotes,
       l.neto_lotes - k.neto_comprobantes as diferencia,
       abs(l.neto_lotes - k.neto_comprobantes) > 1 or l.lotes_con_costo < l.lotes as con_aviso
  from comprobantes k
  join gmp.recepciones r on r.id = k.recepcion_id
  join lotes l on l.recepcion_id = r.id;

comment on view comercial.v_conciliacion_recepcion is
  'Suma de netos de los lotes de una recepción contra el neto de sus facturas de proveedor (en B y C, el total), '
  'menos sus notas de crédito no anuladas. '
  'Sin accesorios. No incluye compras sin factura (SIN_FACTURA o sin comprobante): no hay nada contra qué conciliar. '
  'Aviso si difieren más de $1 o si hay lotes sin costo.';

-- ===========================================================================
-- 9. Costo unitario de un producto
-- ===========================================================================
--
-- Costo = Σ granel + Σ acondicionamiento + mano de obra.
-- Granel: la fórmula escalada por gmp.calcular_lote (la misma que usa
-- Producción; no se reescribe). calcular_lote redondea la masa a 0,1 g, que en
-- un frasco de 14 g se come los componentes chicos (pigmentos, fragancias: los
-- caros). Por eso se calcula una tanda de 1000 unidades: con contenido en g,
-- masa_kg de la tanda = contenido; con mL, volumen_l de la tanda = contenido. La
-- masa en kg de cada componente en la tanda es, numéricamente, sus gramos por
-- unidad. El rendimiento de la fórmula ya agranda la masa: es la merma del granel.
--
-- QUÉ FÓRMULA. La vigente; si no hay, la última que no esté dada de baja. Al
-- 2026-10-09 la base tiene 1 fórmula VIGENTE y 46 en BORRADOR: exigir la
-- vigente dejaría casi todo sin costo. El costeo es de gestión, no libera nada,
-- y v_costo_producto dice con qué estado de fórmula se calculó (D-39). Entre
-- variedades del mismo producto, la de vigencia más reciente.

create function comercial.formula_para_costo(p_producto_id uuid)
returns table (formula_id uuid, estado gmp.estado_documento_enum, version text)
language sql
stable
set search_path = ''
as $$
  select f.id, f.estado, f.version
    from gmp.formulas_fabricacion f
   where f.producto_id = p_producto_id and f.estado <> 'DADO_DE_BAJA'
   order by (f.estado = 'VIGENTE') desc, f.vigencia_desde desc nulls last, f.creado_en desc
   limit 1;
$$;

-- Desglose de varios productos (todos los activos si p_productos es nulo). El
-- costo de referencia se resuelve UNA vez por llamada y se consulta como mapa:
-- resolverlo por producto recalcula la vista entera ~480 veces.
create function comercial.costos_productos(p_productos uuid[] default null)
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
  -- insumo → costo por unidad de catálogo (c), origen (o) y gramos por unidad de catálogo (g).
  select coalesce(jsonb_object_agg(cr.insumo_id::text, jsonb_build_object(
           'c', cr.costo_unitario_ars,
           'o', cr.origen,
           'g', comercial.convertir_cantidad(1, cr.unidad_medida, 'g', comercial.densidad_insumo(cr.insumo_id)))), '{}')
    into v_refs
    from comercial.v_costo_referencia cr
   where cr.costo_unitario_ars is not null;
  select pc.costo_hora into v_hora from comercial.v_parametros_costo pc;

  for v_prod in
    select p.id, p.contenido_neto, p.unidad_contenido
      from gmp.productos p
     where (p_productos is null and p.activo) or p.id = any (p_productos)
  loop
    -- Granel
    select fc.formula_id into v_formula from comercial.formula_para_costo(v_prod.id) fc;
    v_pesada := null;
    if v_formula is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric, 'Sin fórmula'::text;
    elsif v_prod.contenido_neto is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric,
                          'Sin contenido neto por unidad'::text;
    else
      -- Sólo calcular_lote va dentro del bloque, y sólo se atrapan los errores
      -- que levanta por diseño (sin densidad, sin objetivo, fórmula inexistente).
      -- Cualquier otro sube: un error inesperado no se disfraza de dato faltante.
      begin
        select array_agg(x) into v_pesada
          from gmp.calcular_lote(
                 v_formula,
                 p_volumen_l => case when v_prod.unidad_contenido = 'mL' then v_prod.contenido_neto end,
                 p_masa_kg   => case when v_prod.unidad_contenido = 'g'  then v_prod.contenido_neto end
               ) x;
      exception when check_violation or raise_exception or no_data_found then
        get stacked diagnostics v_err = message_text;
        return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                            null::text, null::numeric, null::numeric, null::text, null::numeric,
                            'No se pudo escalar la fórmula: ' || v_err;
      end;
      if v_pesada is not null then
        return query
          select v_prod.id, p.orden, 'GRANEL'::text, p.componente, p.insumo_id, p.codigo_interno,
                 p.masa_kg, 'g'::text, 0::numeric,
                 k.c / k.g, k.o,
                 round(p.masa_kg * k.c / k.g, 4),
                 case when p.insumo_id is null then 'Componente sin insumo de catálogo'
                      when k.c is null then 'Insumo sin costo'
                      when k.g is null then 'Unidad del insumo incompatible con gramos' end
            from unnest(v_pesada) p
            left join lateral (
              select (v_refs -> p.insumo_id::text ->> 'c')::numeric as c,
                     v_refs -> p.insumo_id::text ->> 'o' as o,
                     nullif((v_refs -> p.insumo_id::text ->> 'g')::numeric, 0) as g
            ) k on true;
      end if;
    end if;

    -- Acondicionamiento: cantidad por unidad en la unidad del catálogo del insumo.
    return query
      select v_prod.id, 1000 + (row_number() over (order by i.codigo_interno))::integer, 'ACONDICIONAMIENTO'::text,
             i.nombre, m.insumo_id, i.codigo_interno, m.cantidad_por_unidad, i.unidad_medida, m.merma,
             (v_refs -> m.insumo_id::text ->> 'c')::numeric, v_refs -> m.insumo_id::text ->> 'o',
             round(m.cantidad_por_unidad * (1 + m.merma) * (v_refs -> m.insumo_id::text ->> 'c')::numeric, 4),
             case when v_refs -> m.insumo_id::text is null then 'Insumo sin costo' end
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
  'Desglose del costo unitario: granel (formula_para_costo × contenido), acondicionamiento (con merma) y mano de obra '
  '(minutos × costo hora / 60). Las filas con `falta` no suman: el total queda incompleto y lo dice.';

create function comercial.costo_producto(p_producto_id uuid)
returns table (
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
language sql
stable
set search_path = ''
as $$
  select c.orden, c.tipo, c.componente, c.insumo_id, c.codigo_interno, c.cantidad, c.unidad, c.merma,
         c.costo_unitario, c.origen_costo, c.subtotal, c.falta
    from comercial.costos_productos(array[p_producto_id]) c
   order by c.orden;
$$;

comment on function comercial.costo_producto(uuid) is 'Desglose de un producto (ver costos_productos).';

create view comercial.v_costo_producto
with (security_invoker = true) as
select p.id as producto_id, p.codigo_interno, p.nombre, p.origen, p.contenido_neto, p.unidad_contenido,
       f.estado as formula_estado, f.version as formula_version,
       sum(c.subtotal) filter (where c.tipo = 'GRANEL') as granel,
       sum(c.subtotal) filter (where c.tipo = 'ACONDICIONAMIENTO') as acondicionamiento,
       sum(c.subtotal) filter (where c.tipo = 'MANO_DE_OBRA') as mano_de_obra,
       sum(c.subtotal) as costo_unitario,
       count(*) filter (where c.falta is not null) as faltantes,
       count(*) filter (where c.falta is null) as componentes_costeados
  from comercial.costos_productos() c
  join gmp.productos p on p.id = c.producto_id
  left join lateral comercial.formula_para_costo(p.id) f on true
 group by p.id, f.estado, f.version;

comment on view comercial.v_costo_producto is
  'Costo unitario por producto activo. faltantes > 0 = costo incompleto (falta fórmula, contenido, costo de algún '
  'insumo, minutos o costo hora). formula_estado distinto de VIGENTE = costeado con un borrador (D-39). ponytail: '
  'escala la fórmula de cada producto en cada lectura; la foto mensual de la Fase 2 lo materializa.';

-- ===========================================================================
-- 10. RLS, permisos y auditoría
-- ===========================================================================
--
-- Leen costos: FINANZAS, GERENCIA, ADMINISTRACION (§3.3) y GERENCIA_PRODUCCION
-- (D-38: carga el costo al recibir y usa el cotizador). Nadie más: ni
-- operarios, ni Control de Calidad, ni Ventas, ni la encargada de stock.

alter table comercial.costos_lote        enable row level security;
alter table comercial.costos_lote        force  row level security;
alter table comercial.costos_accesorios  enable row level security;
alter table comercial.costos_accesorios  force  row level security;
alter table comercial.costos_referencia  enable row level security;
alter table comercial.costos_referencia  force  row level security;
alter table comercial.parametros_costo   enable row level security;
alter table comercial.parametros_costo   force  row level security;
alter table comercial.minutos_producto   enable row level security;
alter table comercial.minutos_producto   force  row level security;
alter table comercial.series_macro       enable row level security;
alter table comercial.series_macro       force  row level security;
alter table comercial.avisos_costo       enable row level security;
alter table comercial.avisos_costo       force  row level security;

grant select, insert on comercial.costos_lote, comercial.costos_accesorios, comercial.costos_referencia,
  comercial.parametros_costo, comercial.minutos_producto, comercial.series_macro to authenticated;
grant select on comercial.avisos_costo to authenticated;
grant update (vigente_hasta) on comercial.costos_referencia to authenticated;
grant update (valor, fuente, es_provisorio) on comercial.series_macro to authenticated;
grant update (visto_por, visto_en) on comercial.avisos_costo to authenticated;
grant select on comercial.v_costos_lote, comercial.v_costos_lote_unitario, comercial.v_costo_referencia,
  comercial.v_parametros_costo, comercial.v_conciliacion_recepcion, comercial.v_costo_producto to authenticated;
grant execute on function comercial.importe_neto_ars(numeric, comercial.comprobante_costo_enum, boolean, numeric, numeric),
  comercial.convertir_cantidad(numeric, text, text, numeric), comercial.densidad_insumo(uuid),
  comercial.costo_producto(uuid), comercial.costos_productos(uuid[]), comercial.formula_para_costo(uuid),
  comercial.hoy() to authenticated;
revoke execute on function comercial.fn_aviso_variacion() from public, anon;

-- costos_lote
create policy costos_lote_select_costos on comercial.costos_lote
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy costos_lote_select_costos on comercial.costos_lote is
  '§3.3 «Ver costos» (ADM, GG) más FINANZAS y GERENCIA_PRODUCCION por D-38.';
create policy costos_lote_insert_costos on comercial.costos_lote
  for insert to authenticated
  with check (
    core.es_rol('FINANZAS', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
    and cargado_por = core.usuario_actual()
    and (origen = 'RECEPCION' or core.es_rol('FINANZAS'))
  );
comment on policy costos_lote_insert_costos on comercial.costos_lote is
  'D-38, RN-50: carga quien recibe (Gerencia de Producción), Administración y Finanzas. El costo de apertura (lote '
  'del saldo inicial sin costo en la planilla, o su corrección) sólo lo carga Finanzas (D-42).';

-- costos_accesorios
create policy costos_accesorios_select_costos on comercial.costos_accesorios
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy costos_accesorios_select_costos on comercial.costos_accesorios is 'Igual que costos_lote (D-38).';
create policy costos_accesorios_insert_costos on comercial.costos_accesorios
  for insert to authenticated
  with check (core.es_rol('FINANZAS', 'ADMINISTRACION', 'GERENCIA_PRODUCCION') and cargado_por = core.usuario_actual());
comment on policy costos_accesorios_insert_costos on comercial.costos_accesorios is 'Igual que costos_lote (D-40).';

-- costos_referencia
create policy costos_referencia_select_costos on comercial.costos_referencia
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy costos_referencia_select_costos on comercial.costos_referencia is 'D-38.';
create policy costos_referencia_insert_finanzas on comercial.costos_referencia
  for insert to authenticated
  with check (core.es_rol('FINANZAS') and cargado_por = core.usuario_actual());
comment on policy costos_referencia_insert_finanzas on comercial.costos_referencia is
  'El costo de referencia lo fija sólo Finanzas.';
create policy costos_referencia_update_finanzas on comercial.costos_referencia
  for update to authenticated
  using (core.es_rol('FINANZAS')) with check (core.es_rol('FINANZAS'));
comment on policy costos_referencia_update_finanzas on comercial.costos_referencia is
  'Sólo para darlo de baja (vigente_hasta); el trigger rechaza cualquier otro cambio.';

-- parametros_costo
create policy parametros_costo_select_costos on comercial.parametros_costo
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy parametros_costo_select_costos on comercial.parametros_costo is
  'Quien cotiza ve el costo hora pero no lo cambia (D-38).';
create policy parametros_costo_insert_finanzas on comercial.parametros_costo
  for insert to authenticated
  with check (core.es_rol('FINANZAS') and cargado_por = core.usuario_actual());
comment on policy parametros_costo_insert_finanzas on comercial.parametros_costo is
  'Costo hora, umbral de aviso y margen mínimo: sólo Finanzas.';

-- minutos_producto
create policy minutos_producto_select_costos on comercial.minutos_producto
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy minutos_producto_select_costos on comercial.minutos_producto is 'D-38.';
create policy minutos_producto_insert_costos on comercial.minutos_producto
  for insert to authenticated
  with check (core.es_rol('FINANZAS', 'GERENCIA_PRODUCCION') and cargado_por = core.usuario_actual());
comment on policy minutos_producto_insert_costos on comercial.minutos_producto is
  'Los minutos los conoce Producción y los revisa Finanzas.';

-- series_macro
create policy series_macro_select_costos on comercial.series_macro
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy series_macro_select_costos on comercial.series_macro is 'Las leen los gráficos de costos (D-38).';
create policy series_macro_insert_finanzas on comercial.series_macro
  for insert to authenticated
  with check (core.es_rol('FINANZAS') and cargado_por = core.usuario_actual());
comment on policy series_macro_insert_finanzas on comercial.series_macro is 'IPC y tipo de cambio: sólo Finanzas.';
create policy series_macro_update_finanzas on comercial.series_macro
  for update to authenticated
  using (core.es_rol('FINANZAS')) with check (core.es_rol('FINANZAS'));
comment on policy series_macro_update_finanzas on comercial.series_macro is
  'Pasar un provisorio a definitivo o corregir un valor. Queda en core.auditoria.';

-- avisos_costo
create policy avisos_costo_select_finanzas on comercial.avisos_costo
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA'));
comment on policy avisos_costo_select_finanzas on comercial.avisos_costo is
  'El aviso es para Finanzas; Gerencia lo ve.';
create policy avisos_costo_update_finanzas on comercial.avisos_costo
  for update to authenticated
  using (core.es_rol('FINANZAS')) with check (core.es_rol('FINANZAS') and visto_por = core.usuario_actual());
comment on policy avisos_costo_update_finanzas on comercial.avisos_costo is
  'Marcarlo como visto. El GRANT de columna impide tocar el resto; el trigger fija quién y cuándo.';

select core.adjuntar_auditoria('comercial.costos_lote');
select core.adjuntar_auditoria('comercial.costos_accesorios');
select core.adjuntar_auditoria('comercial.costos_referencia');
select core.adjuntar_auditoria('comercial.parametros_costo');
select core.adjuntar_auditoria('comercial.minutos_producto');
select core.adjuntar_auditoria('comercial.series_macro');
select core.adjuntar_auditoria('comercial.avisos_costo');

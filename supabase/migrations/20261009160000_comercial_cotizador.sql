-- ---------------------------------------------------------------------------
-- Propósito : Fase 5 del módulo de costos: cotizador. Una cotización arma el
--             costo de un producto que puede existir o no (insumos del
--             catálogo, insumos nuevos escritos a mano, costos libres, mano de
--             obra), fija precio o margen, y al emitirse se congela con número
--             correlativo para generar el PDF del cliente.
-- Reglas    : RN-50, RN-55 (numeración correlativa sin huecos con contador y
--             FOR UPDATE, no sequence), D-38 (quién ve costos), D-52 (criterios
--             del cotizador, quién cotiza), D-53 (clientes potenciales).
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- UNA SOLA CUENTA. El costo de cada línea es cantidad (llevada a la unidad del
-- precio) × precio por unidad / (1 − merma): la misma regla de merma que
-- costos_productos y que los faltantes de 20260917120000. Un producto copiado
-- al cotizador cuesta lo mismo que en su panel (lo verifica probar_cotizador).
-- La pantalla calcula en vivo con el mismo algoritmo (src/lib/cotizador.ts);
-- al emitir, el servidor recalcula todo y lo que se guarda es lo suyo.
--
-- PRECIO NETO Y PRECIO MOSTRADO (D-52). La cotización trabaja en neto: costo,
-- margen y precio_unitario son sin IVA. Lo que ve el cliente es el precio
-- mostrado: el neto si la leyenda es «más IVA», o neto × (1 + alícuota) si es
-- «con IVA incluido». El redondeo se aplica al precio mostrado (el número que
-- el cliente lee), y con «precio fijado» el precio que se escribe es el
-- mostrado: se le saca el IVA antes de calcular el margen.
--
-- NADA DEL COTIZADOR TOCA GMP. Un insumo escrito a mano vive en la cotización.
-- «Proponer para el catálogo» deja una solicitud a Dirección Técnica; el
-- catálogo es parte del registro de calidad y no se escribe desde acá.

-- El momento de carga lo pone la base (lo usan las tablas de abajo).
create function comercial.fn_sello_creado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_en := now();
  return new;
end;
$$;

-- ===========================================================================
-- 1. Contador correlativo (RN-55) y clientes potenciales
-- ===========================================================================

create table comercial.contadores (
  ambito  text not null,
  anio    integer not null,
  ultimo  integer not null default 0,
  primary key (ambito, anio)
);

select core.adjuntar_auditoria('comercial.contadores');

comment on table comercial.contadores is
  'Numeración correlativa sin huecos (RN-55): se incrementa con un upsert dentro de la misma transacción que usa el '
  'número (si esa transacción se revierte, el número vuelve). Nunca una sequence. Sin GRANT para nadie: sólo la '
  'escribe siguiente_numero (SECURITY DEFINER), que funciona porque su dueño (postgres) tiene BYPASSRLS.';

create function comercial.siguiente_numero(p_ambito text, p_anio integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into comercial.contadores (ambito, anio, ultimo) values (p_ambito, p_anio, 1)
  on conflict (ambito, anio) do update set ultimo = comercial.contadores.ultimo + 1
  returning ultimo;
$$;

revoke execute on function comercial.siguiente_numero(text, integer) from public, anon, authenticated;

create table comercial.clientes_potenciales (
  id           uuid primary key default gen_random_uuid(),
  razon_social text not null check (length(btrim(razon_social)) > 0),
  cuit         text check (cuit is null or (cuit ~ '^[0-9]{11}$' and comercial.cuit_valido(cuit))),
  contacto     text,
  email        text,
  -- Cuando se convierte en cliente, apunta a él.
  cliente_id   uuid unique references comercial.clientes(id),
  creado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en    timestamptz not null default now()
);

select core.adjuntar_auditoria('comercial.clientes_potenciales');

create trigger trg_clientes_potenciales_sello before insert on comercial.clientes_potenciales
  for each row execute function comercial.fn_sello_creado();

comment on table comercial.clientes_potenciales is
  'Clientes potenciales del cotizador (D-53): razón social y, si se sabe, CUIT y contacto. No entran al padrón de '
  'facturación (comercial.clientes) hasta convertirse; cliente_id enlaza al cliente cuando se convierte (el cambio '
  'queda en core.auditoria).';

-- ===========================================================================
-- 2. Cotizaciones y sus líneas
-- ===========================================================================

create type comercial.estado_cotizacion_enum as enum ('BORRADOR', 'EMITIDA', 'ANULADA');
create type comercial.destino_cotizacion_enum as enum ('CLIENTE', 'POTENCIAL', 'INTERNO');
create type comercial.tipo_linea_cotizacion_enum as enum ('CATALOGO', 'NUEVO', 'LIBRE');

create table comercial.cotizaciones (
  id                     uuid primary key default gen_random_uuid(),
  numero                 integer,
  anio                   integer,
  estado                 comercial.estado_cotizacion_enum not null default 'BORRADOR',
  titulo                 text not null check (length(btrim(titulo)) > 0),
  producto_base_id       uuid references gmp.productos(id),
  -- Contenido por unidad (60 g) y volumen del pedido (unidades): D-52.
  contenido_cantidad     numeric(12,3) check (contenido_cantidad > 0),
  contenido_unidad       text check (contenido_unidad in ('g', 'mL', 'unidades')),
  cantidad_cotizada      numeric(14,2) not null default 1 check (cantidad_cotizada > 0),
  destino                comercial.destino_cotizacion_enum not null default 'INTERNO',
  cliente_id             uuid references comercial.clientes(id),
  cliente_potencial_id   uuid references comercial.clientes_potenciales(id),
  incluir_mano_obra      boolean not null default true,
  minutos_por_unidad     numeric(10,3) check (minutos_por_unidad >= 0),
  -- Margen sobre el precio (m = (P − C) / P) o recargo sobre el costo (k = (P − C) / C).
  modo_margen            text not null default 'SOBRE_PRECIO' check (modo_margen in ('SOBRE_PRECIO', 'SOBRE_COSTO')),
  -- Una de las dos entradas: precio mostrado o margen; la otra se calcula.
  fija                   text not null default 'MARGEN' check (fija in ('MARGEN', 'PRECIO')),
  margen_objetivo        numeric(8,6) check (margen_objetivo >= 0),
  precio_objetivo        numeric(16,2) check (precio_objetivo > 0),
  redondeo               numeric(10,2) not null default 1 check (redondeo in (0.01, 1, 10, 100)),
  leyenda_iva            text not null default 'MAS_IVA' check (leyenda_iva in ('MAS_IVA', 'IVA_INCLUIDO')),
  alicuota_iva           numeric(5,2) not null default 21 check (alicuota_iva in (0, 10.5, 21, 27)),
  vigencia_dias          integer not null check (vigencia_dias > 0),
  observaciones          text,
  justificacion_margen   text,
  -- Lo que se congela al emitir (lo calcula el servidor). Precio neto.
  costo_unitario         numeric(18,4),
  precio_unitario        numeric(18,4),
  emitida_en             timestamptz,
  emitida_por            uuid references core.usuarios(id),
  vence_el               date,
  foto                   jsonb,
  anulada_en             timestamptz,
  anulada_por            uuid references core.usuarios(id),
  motivo_anulacion       text,
  duplicada_de           uuid references comercial.cotizaciones(id),
  creado_por             uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en              timestamptz not null default now(),
  constraint cotizaciones_destino check (
    (destino = 'CLIENTE') = (cliente_id is not null)
    and (destino = 'POTENCIAL') = (cliente_potencial_id is not null)),
  constraint cotizaciones_entrada check (
    (fija = 'MARGEN' and margen_objetivo is not null) or (fija = 'PRECIO' and precio_objetivo is not null)),
  constraint cotizaciones_margen_valido check (
    margen_objetivo is null or modo_margen = 'SOBRE_COSTO' or margen_objetivo < 1),
  constraint cotizaciones_emitida_completa check (
    estado = 'BORRADOR'
    or (numero is not null and anio is not null and emitida_en is not null and emitida_por is not null
        and foto is not null and precio_unitario is not null and vence_el is not null)),
  constraint cotizaciones_anulada_con_motivo check (
    (estado = 'ANULADA') = (anulada_en is not null and length(btrim(coalesce(motivo_anulacion, ''))) > 0))
);

select core.adjuntar_auditoria('comercial.cotizaciones');

create unique index cotizaciones_numero_idx on comercial.cotizaciones (anio, numero) where numero is not null;
create index cotizaciones_creado_por_idx on comercial.cotizaciones (creado_por, creado_en desc);
create index cotizaciones_cliente_idx on comercial.cotizaciones (cliente_id) where cliente_id is not null;
create index cotizaciones_potencial_idx on comercial.cotizaciones (cliente_potencial_id) where cliente_potencial_id is not null;

comment on table comercial.cotizaciones is
  'Cotizaciones (Fase 5). BORRADOR se edita; EMITIDA está congelada (foto) y sólo pasa a ANULADA con motivo; para '
  'cambiarla se duplica. El PDF sale de la foto y nunca muestra costos ni composición. Precios netos (D-52).';

create table comercial.cotizacion_lineas (
  id                    uuid primary key default gen_random_uuid(),
  cotizacion_id         uuid not null references comercial.cotizaciones(id),
  orden                 integer not null,
  tipo                  comercial.tipo_linea_cotizacion_enum not null,
  insumo_id             uuid references gmp.insumos_catalogo(id),
  nombre                text not null check (length(btrim(nombre)) > 0),
  -- Cantidad por unidad de producto terminado (en LIBRE, veces el importe).
  cantidad              numeric(16,6) not null check (cantidad > 0),
  unidad                text not null check (lower(unidad) in ('g', 'kg', 'ml', 'l', 'unidad')),
  -- Insumo nuevo o costo libre: precio cargado a mano por presentación.
  precio                numeric(16,4) check (precio >= 0),
  cantidad_presentacion numeric(16,4) check (cantidad_presentacion > 0),
  unidad_presentacion   text check (lower(unidad_presentacion) in ('g', 'kg', 'ml', 'l', 'unidad')),
  -- El precio trae IVA RECUPERABLE (factura A): se descuenta. Si el IVA no se
  -- recupera (monotributista, factura B o C, sin factura), va en false: el
  -- importe entero es costo, como en comercial.importe_neto_ars (D-43).
  incluye_iva           boolean,
  alicuota_iva          numeric(5,2) check (alicuota_iva in (0, 10.5, 21, 27)),
  densidad              numeric(9,5) check (densidad > 0),
  merma                 numeric(6,4) not null default 0 check (merma >= 0 and merma < 1),
  anulada               boolean not null default false,
  creado_en             timestamptz not null default now(),
  constraint cotizacion_lineas_tipo check (
    (tipo = 'CATALOGO' and insumo_id is not null and precio is null)
    or (tipo = 'NUEVO' and insumo_id is null and precio is not null and cantidad_presentacion is not null
        and unidad_presentacion is not null and incluye_iva is not null)
    or (tipo = 'LIBRE' and insumo_id is null and precio is not null and incluye_iva is not null)),
  constraint cotizacion_lineas_iva check (incluye_iva is distinct from true or alicuota_iva is not null)
);

select core.adjuntar_auditoria('comercial.cotizacion_lineas');

create unique index cotizacion_lineas_orden_idx on comercial.cotizacion_lineas (cotizacion_id, orden) where not anulada;
create index cotizacion_lineas_cotizacion_idx on comercial.cotizacion_lineas (cotizacion_id);
create index cotizacion_lineas_insumo_idx on comercial.cotizacion_lineas (insumo_id) where insumo_id is not null;

comment on table comercial.cotizacion_lineas is
  'Componentes de una cotización. CATALOGO toma el costo de referencia vigente; NUEVO es un insumo escrito a mano '
  '(precio por la presentación que se eligió, normalizado al calcular); LIBRE es un importe por unidad (flete, un '
  'servicio, un análisis) × cantidad. Una línea se quita marcándola anulada (no hay DELETE).';

-- Cotización: al cargarla nada de lo que pone la emisión; emitida o anulada
-- no se toca salvo anularla (quién y cuándo lo pone la base); emitir y numerar
-- sólo desde emitir_cotizacion. Líneas: sólo de un borrador, bloqueándolo para
-- que no se emita a la vez.
create function comercial.fn_cotizacion_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado comercial.estado_cotizacion_enum;
begin
  if tg_table_name = 'cotizacion_lineas' then
    select estado into v_estado from comercial.cotizaciones where id = new.cotizacion_id for share;
    if v_estado is distinct from 'BORRADOR' then
      raise exception 'La cotización ya se emitió: no se cambia. Duplicala para hacer otra.' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and (old.cotizacion_id <> new.cotizacion_id or (old.anulada and not new.anulada)) then
      raise exception 'Una línea no cambia de cotización ni se recupera: cargala de nuevo.' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' then
      new.creado_en := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estado <> 'BORRADOR' then
      raise exception 'Una cotización se emite con comercial.emitir_cotizacion.' using errcode = 'check_violation';
    end if;
    new.numero := null; new.anio := null; new.foto := null; new.emitida_en := null; new.emitida_por := null;
    new.costo_unitario := null; new.precio_unitario := null; new.vence_el := null;
    new.anulada_en := null; new.anulada_por := null; new.motivo_anulacion := null;
    new.creado_en := now();
    return new;
  end if;

  if old.estado = 'BORRADOR' then
    if new.estado <> 'BORRADOR' and current_user <> 'postgres' then
      raise exception 'Una cotización se emite con comercial.emitir_cotizacion.' using errcode = 'check_violation';
    end if;
    if new.estado = 'BORRADOR' then
      new.anulada_en := null; new.anulada_por := null; new.motivo_anulacion := null;
    end if;
    return new;
  end if;

  -- Emitida o anulada: lo único que se permite es anular una emitida, con motivo.
  if not (old.estado = 'EMITIDA' and new.estado = 'ANULADA'
          and (to_jsonb(new) - array['estado', 'anulada_en', 'anulada_por', 'motivo_anulacion'])
              = (to_jsonb(old) - array['estado', 'anulada_en', 'anulada_por', 'motivo_anulacion'])) then
    raise exception 'Una cotización emitida no se edita: se anula con motivo o se duplica.' using errcode = 'check_violation';
  end if;
  new.anulada_en := now();
  new.anulada_por := core.usuario_actual();
  return new;
end;
$$;

create trigger trg_cotizacion_inmutable
  before insert or update on comercial.cotizaciones
  for each row execute function comercial.fn_cotizacion_inmutable();
create trigger trg_cotizacion_linea_inmutable
  before insert or update on comercial.cotizacion_lineas
  for each row execute function comercial.fn_cotizacion_inmutable();

-- ===========================================================================
-- 3. Cálculo (el mismo que src/lib/cotizador.ts)
-- ===========================================================================

-- Unidad base de una unidad: g para masa, ml para volumen, unidad.
create function comercial.unidad_base(p_unidad text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(p_unidad)) when 'g' then 'g' when 'kg' then 'g' when 'ml' then 'ml' when 'l' then 'ml'
                                     when 'unidad' then 'unidad' end;
$$;

create function comercial.costear_cotizacion(p_id uuid)
returns table (
  linea_id        uuid,
  orden           integer,
  tipo            text,
  nombre          text,
  cantidad        numeric,
  unidad          text,
  precio_base     numeric,
  unidad_base     text,
  cantidad_base   numeric,
  densidad        numeric,
  origen_precio   text,
  merma           numeric,
  subtotal        numeric,
  falta           text
)
language sql
stable
set search_path = ''
as $$
  with l as (
    select x.*, cr.costo_unitario_ars as costo_catalogo, cr.origen as origen_catalogo, cr.unidad_medida,
           coalesce(x.densidad, comercial.densidad_insumo(x.insumo_id)) as dens
      from comercial.cotizacion_lineas x
      left join comercial.v_costo_referencia cr on cr.insumo_id = x.insumo_id
     where x.cotizacion_id = p_id and not x.anulada
  ),
  p as (
    select l.*,
           -- Precio neto por unidad base (g, ml o unidad).
           case l.tipo
             when 'CATALOGO' then l.costo_catalogo
                                  / nullif(comercial.convertir_cantidad(1, l.unidad_medida, comercial.unidad_base(l.unidad_medida)), 0)
             when 'NUEVO' then (case when l.incluye_iva then l.precio / (1 + l.alicuota_iva / 100) else l.precio end)
                               / nullif(comercial.convertir_cantidad(l.cantidad_presentacion, l.unidad_presentacion,
                                                                     comercial.unidad_base(l.unidad_presentacion)), 0)
             when 'LIBRE' then case when l.incluye_iva then l.precio / (1 + l.alicuota_iva / 100) else l.precio end
           end as pb,
           case l.tipo
             when 'CATALOGO' then comercial.unidad_base(l.unidad_medida)
             when 'NUEVO' then comercial.unidad_base(l.unidad_presentacion)
             else 'unidad' end as ub
      from l
  ),
  c as (
    select p.*,
           case when p.tipo = 'LIBRE' then p.cantidad
                else comercial.convertir_cantidad(p.cantidad, p.unidad, p.ub, p.dens) end as cant_base
      from p
  )
  select c.id, c.orden, c.tipo::text, c.nombre, c.cantidad, c.unidad, round(c.pb, 6), c.ub, c.cant_base, c.dens,
         case c.tipo when 'CATALOGO' then c.origen_catalogo when 'NUEVO' then 'MANUAL_COTIZACION' else 'LIBRE' end,
         c.merma,
         case when c.pb is not null and c.cant_base is not null
              then round(c.cant_base * c.pb / (1 - c.merma), 4) end,
         case when c.tipo = 'CATALOGO' and c.costo_catalogo is null then 'Insumo sin costo de referencia'
              when c.pb is null then 'Precio o unidad sin convertir'
              when c.cant_base is null then 'Falta la densidad para pasar ' || c.unidad || ' a ' || c.ub end
    from c
   order by c.orden;
$$;

comment on function comercial.costear_cotizacion(uuid) is
  'Costo por línea de una cotización: cantidad (llevada a la unidad base del precio, con densidad si mezcla masa y '
  'volumen; sin densidad la línea no se costea) × precio neto por unidad base / (1 − merma). Insumo del catálogo = '
  'costo de referencia vigente. Precio manual: se descuenta el IVA sólo si es recuperable (incluye_iva).';

-- Precio NETO a partir del margen o del precio mostrado (D-52).
create function comercial.precio_cotizacion(p_costo numeric, p_modo text, p_fija text, p_margen numeric,
                                            p_precio numeric, p_redondeo numeric, p_leyenda text, p_alicuota numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with f as (select case when p_leyenda = 'IVA_INCLUIDO' then 1 + p_alicuota / 100 else 1 end as k)
  select case when p_fija = 'PRECIO' then p_precio / f.k
              else round((case when p_modo = 'SOBRE_PRECIO' then p_costo / (1 - p_margen)
                               else p_costo * (1 + p_margen) end) * f.k / p_redondeo, 0) * p_redondeo / f.k end
    from f;
$$;

comment on function comercial.precio_cotizacion is
  'Precio neto. Margen sobre el precio: P = C / (1 − m). Recargo sobre el costo: P = C × (1 + k). El redondeo (0,01, '
  '1, 10 o 100) se aplica al precio que lee el cliente (con IVA si la leyenda es IVA_INCLUIDO). Con precio fijado, el '
  'precio escrito es el mostrado y se le saca el IVA.';

-- ===========================================================================
-- 4. Emitir, anular, duplicar
-- ===========================================================================

create function comercial.emitir_cotizacion(p_id uuid, p_justificacion text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       comercial.cotizaciones%rowtype;
  v_lineas  jsonb;
  v_falta   text;
  v_mat     numeric;
  v_hora    numeric;
  v_mo      numeric := 0;
  v_costo   numeric;
  v_precio  numeric;
  v_mostrado numeric;
  v_margen  numeric;
  v_minimo  numeric;
  v_justif  text;
  v_numero  integer;
  v_anio    integer := extract(year from comercial.hoy())::int;
  v_cliente jsonb;
begin
  if not core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION') then
    raise exception 'No tenés permiso para emitir cotizaciones.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from comercial.cotizaciones where id = p_id for update;
  if not found or v_c.estado <> 'BORRADOR'
     or (v_c.creado_por <> core.usuario_actual() and not core.es_rol('FINANZAS', 'GERENCIA')) then
    raise exception 'La cotización no existe, ya se emitió o no es tuya.' using errcode = 'check_violation';
  end if;

  -- El servidor recalcula todo: lo de la pantalla era sólo para ver en vivo.
  select jsonb_agg(to_jsonb(x) order by x.orden), sum(x.subtotal), string_agg(x.falta, '; ')
    into v_lineas, v_mat, v_falta
    from comercial.costear_cotizacion(p_id) x;
  if v_lineas is null then
    raise exception 'La cotización no tiene componentes.' using errcode = 'check_violation';
  end if;
  if v_falta is not null then
    raise exception 'No se puede emitir con componentes sin costo: %', v_falta using errcode = 'check_violation';
  end if;
  select costo_hora, margen_minimo into v_hora, v_minimo from comercial.v_parametros_costo;
  if v_c.incluir_mano_obra then
    if v_hora is null or v_c.minutos_por_unidad is null then
      raise exception 'Para incluir mano de obra hacen falta el costo hora (Finanzas) y los minutos por unidad.'
        using errcode = 'check_violation';
    end if;
    v_mo := round(v_c.minutos_por_unidad * v_hora / 60, 4);
  end if;
  v_costo  := round(v_mat + v_mo, 4);
  v_precio := round(comercial.precio_cotizacion(v_costo, v_c.modo_margen, v_c.fija, v_c.margen_objetivo,
                                                v_c.precio_objetivo, v_c.redondeo, v_c.leyenda_iva, v_c.alicuota_iva), 4);
  if v_precio is null or v_precio <= 0 then
    raise exception 'El precio tiene que ser mayor que cero.' using errcode = 'check_violation';
  end if;
  v_mostrado := round(case when v_c.leyenda_iva = 'IVA_INCLUIDO' then v_precio * (1 + v_c.alicuota_iva / 100)
                           else v_precio end, 2);
  v_margen := (v_precio - v_costo) / v_precio;
  v_justif := coalesce(nullif(btrim(p_justificacion), ''), nullif(btrim(v_c.justificacion_margen), ''));
  if v_margen < v_minimo and v_justif is null then
    raise exception 'El margen (%) queda debajo del mínimo (%): escribí por qué se cotiza así.',
      round(v_margen * 100, 1), round(v_minimo * 100, 1) using errcode = 'check_violation';
  end if;

  select case v_c.destino
           when 'CLIENTE' then (select jsonb_build_object('razon_social', razon_social, 'documento', numero_documento,
                                                          'tipo_documento', tipo_documento)
                                  from comercial.clientes where id = v_c.cliente_id)
           when 'POTENCIAL' then (select jsonb_build_object('razon_social', razon_social, 'documento', cuit,
                                                            'contacto', contacto)
                                    from comercial.clientes_potenciales where id = v_c.cliente_potencial_id)
         end into v_cliente;

  v_numero := comercial.siguiente_numero('cotizacion', v_anio);

  update comercial.cotizaciones
     set estado = 'EMITIDA', numero = v_numero, anio = v_anio,
         emitida_en = now(), emitida_por = core.usuario_actual(),
         vence_el = comercial.hoy() + v_c.vigencia_dias,
         costo_unitario = v_costo, precio_unitario = v_precio,
         justificacion_margen = v_justif,
         foto = jsonb_build_object(
           'lineas', v_lineas, 'costo_materiales', v_mat, 'mano_de_obra', v_mo, 'costo_hora', v_hora,
           'minutos_por_unidad', v_c.minutos_por_unidad, 'costo_unitario', v_costo, 'precio_unitario', v_precio,
           'margen_sobre_precio', round(v_margen, 6),
           'recargo_sobre_costo', case when v_costo > 0 then round((v_precio - v_costo) / v_costo, 6) end,
           'margen_minimo', v_minimo, 'cliente', v_cliente,
           -- Lo que va al PDF (y sólo esto): precios mostrados, nada de costos.
           'pdf', jsonb_build_object(
             'numero', v_numero, 'anio', v_anio, 'fecha', comercial.hoy(),
             'vence_el', comercial.hoy() + v_c.vigencia_dias, 'destino', v_c.destino, 'cliente', v_cliente,
             'titulo', v_c.titulo, 'contenido_cantidad', v_c.contenido_cantidad,
             'contenido_unidad', v_c.contenido_unidad, 'cantidad', v_c.cantidad_cotizada,
             'precio_unitario', v_mostrado, 'total', round(v_mostrado * v_c.cantidad_cotizada, 2),
             'leyenda_iva', v_c.leyenda_iva, 'alicuota_iva', v_c.alicuota_iva,
             'observaciones', v_c.observaciones,
             'emitida_por', (select nombre_completo from core.usuarios where id = core.usuario_actual())))
   where id = p_id;
  return v_numero;
end;
$$;

comment on function comercial.emitir_cotizacion(uuid, text) is
  'Emite (congela) una cotización: recalcula en el servidor, numera con contador (RN-55), fija vencimiento, exige '
  'justificación si el margen queda bajo el mínimo de Finanzas, y guarda la foto (con el bloque pdf, sin costos). '
  'SECURITY DEFINER: numera y escribe el estado que el trigger no deja escribir desde la API.';

create function comercial.anular_cotizacion(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Escribí el motivo de la anulación.' using errcode = 'check_violation';
  end if;
  -- Quién y cuándo los pone el trigger.
  update comercial.cotizaciones set estado = 'ANULADA', motivo_anulacion = btrim(p_motivo)
   where id = p_id and estado = 'EMITIDA';
  if not found then
    raise exception 'Sólo se anula una cotización emitida que puedas ver.' using errcode = 'check_violation';
  end if;
end;
$$;

create function comercial.duplicar_cotizacion(p_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_nueva uuid;
begin
  insert into comercial.cotizaciones
    (titulo, producto_base_id, contenido_cantidad, contenido_unidad, cantidad_cotizada, destino, cliente_id,
     cliente_potencial_id, incluir_mano_obra, minutos_por_unidad, modo_margen, fija, margen_objetivo,
     precio_objetivo, redondeo, leyenda_iva, alicuota_iva, vigencia_dias, observaciones, duplicada_de)
  select titulo, producto_base_id, contenido_cantidad, contenido_unidad, cantidad_cotizada, destino, cliente_id,
         cliente_potencial_id, incluir_mano_obra, minutos_por_unidad, modo_margen, fija, margen_objetivo,
         precio_objetivo, redondeo, leyenda_iva, alicuota_iva,
         (select vigencia_cotizacion_dias from comercial.v_parametros_costo), observaciones, id
    from comercial.cotizaciones where id = p_id
  returning id into v_nueva;
  if v_nueva is null then
    raise exception 'La cotización no existe o no la podés ver.' using errcode = 'check_violation';
  end if;
  insert into comercial.cotizacion_lineas
    (cotizacion_id, orden, tipo, insumo_id, nombre, cantidad, unidad, precio, cantidad_presentacion,
     unidad_presentacion, incluye_iva, alicuota_iva, densidad, merma)
  select v_nueva, orden, tipo, insumo_id, nombre, cantidad, unidad, precio, cantidad_presentacion,
         unidad_presentacion, incluye_iva, alicuota_iva, densidad, merma
    from comercial.cotizacion_lineas where cotizacion_id = p_id and not anulada;
  return v_nueva;
end;
$$;

comment on function comercial.duplicar_cotizacion(uuid) is
  'Copia una cotización (emitida o no) como borrador nuevo, con la vigencia por defecto de Finanzas. La original no '
  'cambia y queda en el historial.';

-- Partir de un producto existente: su composición (la del panel) como líneas.
create function comercial.lineas_desde_producto(p_cotizacion_id uuid, p_producto_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n    integer;
  v_base integer;
begin
  select coalesce(max(orden), 0) into v_base
    from comercial.cotizacion_lineas where cotizacion_id = p_cotizacion_id and not anulada;
  insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, insumo_id, nombre, cantidad, unidad, merma)
  select p_cotizacion_id, v_base + (row_number() over (order by c.orden))::int, 'CATALOGO', c.insumo_id, c.componente,
         c.cantidad, case when c.tipo = 'GRANEL' then 'g' else c.unidad end, coalesce(c.merma, 0)
    from comercial.costo_producto(p_producto_id) c
   where c.tipo <> 'MANO_DE_OBRA' and c.insumo_id is not null and c.cantidad > 0
     and (c.tipo = 'GRANEL' or lower(c.unidad) in ('g', 'kg', 'ml', 'l', 'unidad'));
  get diagnostics v_n = row_count;
  update comercial.cotizaciones
     set producto_base_id = p_producto_id,
         minutos_por_unidad = coalesce(minutos_por_unidad,
           (select mp.minutos_por_unidad from comercial.minutos_producto mp
             where mp.producto_id = p_producto_id order by mp.orden desc limit 1))
   where id = p_cotizacion_id;
  return v_n;
end;
$$;

comment on function comercial.lineas_desde_producto(uuid, uuid) is
  'Carga en una cotización en borrador la composición de un producto existente (granel en g por unidad, '
  'acondicionamiento con su merma) y sus minutos por unidad, a continuación de las líneas que ya tenga. El producto '
  'no cambia.';

-- ===========================================================================
-- 5. Solicitudes a Dirección Técnica para el catálogo
-- ===========================================================================

create table comercial.solicitudes_catalogo (
  id                  uuid primary key default gen_random_uuid(),
  cotizacion_linea_id uuid not null references comercial.cotizacion_lineas(id),
  nombre              text not null,
  detalle             text,
  estado              text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'ATENDIDA', 'DESCARTADA')),
  respuesta           text,
  atendida_por        uuid references core.usuarios(id),
  atendida_en         timestamptz,
  creado_por          uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en           timestamptz not null default now(),
  constraint solicitudes_catalogo_atendida check ((estado = 'PENDIENTE') = (atendida_en is null))
);

select core.adjuntar_auditoria('comercial.solicitudes_catalogo');

create index solicitudes_catalogo_linea_idx on comercial.solicitudes_catalogo (cotizacion_linea_id);
create index solicitudes_catalogo_creado_por_idx on comercial.solicitudes_catalogo (creado_por);

comment on table comercial.solicitudes_catalogo is
  '«Proponer para el catálogo» desde una línea de cotización: un aviso a Dirección Técnica. No crea nada en gmp: un '
  'insumo del catálogo exige código, proveedor y calificación, y eso lo decide la DT.';

-- Nace pendiente; la DT la atiende una vez (quién y cuándo lo pone la base).
create function comercial.fn_solicitud_catalogo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.estado := 'PENDIENTE'; new.respuesta := null; new.atendida_por := null; new.atendida_en := null;
    new.creado_en := now();
    return new;
  end if;
  if old.estado <> 'PENDIENTE' or new.estado = 'PENDIENTE' then
    raise exception 'La solicitud ya fue atendida (o se intenta volver atrás).' using errcode = 'check_violation';
  end if;
  new.atendida_por := core.usuario_actual();
  new.atendida_en := now();
  return new;
end;
$$;

create trigger trg_solicitud_catalogo
  before insert or update on comercial.solicitudes_catalogo
  for each row execute function comercial.fn_solicitud_catalogo();

-- ===========================================================================
-- 6. RLS, permisos y auditoría
-- ===========================================================================
--
-- Cotizan Finanzas, Gerencia y Gerencia de Producción (D-52). Cada uno ve las
-- suyas; Finanzas y Gerencia, todas. Contadores: sin GRANT ni política.

alter table comercial.contadores           enable row level security;
alter table comercial.contadores           force  row level security;
alter table comercial.clientes_potenciales enable row level security;
alter table comercial.clientes_potenciales force  row level security;
alter table comercial.cotizaciones         enable row level security;
alter table comercial.cotizaciones         force  row level security;
alter table comercial.cotizacion_lineas    enable row level security;
alter table comercial.cotizacion_lineas    force  row level security;
alter table comercial.solicitudes_catalogo enable row level security;
alter table comercial.solicitudes_catalogo force  row level security;

grant select on comercial.clientes_potenciales, comercial.cotizaciones, comercial.cotizacion_lineas,
  comercial.solicitudes_catalogo to authenticated;
grant insert (razon_social, cuit, contacto, email) on comercial.clientes_potenciales to authenticated;
grant update (cliente_id, contacto, email) on comercial.clientes_potenciales to authenticated;
grant insert (titulo, producto_base_id, contenido_cantidad, contenido_unidad, cantidad_cotizada, destino, cliente_id,
              cliente_potencial_id, incluir_mano_obra, minutos_por_unidad, modo_margen, fija, margen_objetivo,
              precio_objetivo, redondeo, leyenda_iva, alicuota_iva, vigencia_dias, observaciones,
              justificacion_margen, duplicada_de)
  on comercial.cotizaciones to authenticated;
grant update (titulo, producto_base_id, contenido_cantidad, contenido_unidad, cantidad_cotizada, destino, cliente_id,
              cliente_potencial_id, incluir_mano_obra, minutos_por_unidad, modo_margen, fija, margen_objetivo,
              precio_objetivo, redondeo, leyenda_iva, alicuota_iva, vigencia_dias, observaciones,
              justificacion_margen, estado, motivo_anulacion)
  on comercial.cotizaciones to authenticated;
grant insert (cotizacion_id, orden, tipo, insumo_id, nombre, cantidad, unidad, precio, cantidad_presentacion,
              unidad_presentacion, incluye_iva, alicuota_iva, densidad, merma)
  on comercial.cotizacion_lineas to authenticated;
grant update (nombre, cantidad, unidad, precio, cantidad_presentacion, unidad_presentacion, incluye_iva, alicuota_iva,
              densidad, merma, anulada)
  on comercial.cotizacion_lineas to authenticated;
grant insert (cotizacion_linea_id, nombre, detalle) on comercial.solicitudes_catalogo to authenticated;
grant update (estado, respuesta) on comercial.solicitudes_catalogo to authenticated;
grant execute on function comercial.costear_cotizacion(uuid),
  comercial.precio_cotizacion(numeric, text, text, numeric, numeric, numeric, text, numeric),
  comercial.emitir_cotizacion(uuid, text), comercial.anular_cotizacion(uuid, text), comercial.duplicar_cotizacion(uuid),
  comercial.lineas_desde_producto(uuid, uuid), comercial.unidad_base(text) to authenticated;
revoke execute on function comercial.emitir_cotizacion(uuid, text) from public, anon;

create policy clientes_potenciales_select_cotizan on comercial.clientes_potenciales
  for select to authenticated using (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'ADMINISTRACION'));
comment on policy clientes_potenciales_select_cotizan on comercial.clientes_potenciales is
  'D-53: quien cotiza y Administración (que los convierte en clientes).';
create policy clientes_potenciales_insert_cotizan on comercial.clientes_potenciales
  for insert to authenticated
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION') and creado_por = core.usuario_actual());
comment on policy clientes_potenciales_insert_cotizan on comercial.clientes_potenciales is 'D-53, RN-50.';
create policy clientes_potenciales_update_comercial on comercial.clientes_potenciales
  for update to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'ADMINISTRACION'))
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'ADMINISTRACION'));
comment on policy clientes_potenciales_update_comercial on comercial.clientes_potenciales is
  'D-53, RN-50: completar contacto o enlazar el cliente cuando se convierte.';

create policy cotizaciones_select_cotizan on comercial.cotizaciones
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA')
         or (core.es_rol('GERENCIA_PRODUCCION') and creado_por = core.usuario_actual()));
comment on policy cotizaciones_select_cotizan on comercial.cotizaciones is
  'D-52: cada uno ve las suyas; Finanzas y Gerencia, todas (con el desglose).';
create policy cotizaciones_insert_cotizan on comercial.cotizaciones
  for insert to authenticated
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION') and creado_por = core.usuario_actual());
comment on policy cotizaciones_insert_cotizan on comercial.cotizaciones is 'D-52, RN-50.';
create policy cotizaciones_update_cotizan on comercial.cotizaciones
  for update to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA')
         or (core.es_rol('GERENCIA_PRODUCCION') and creado_por = core.usuario_actual()))
  with check (core.es_rol('FINANZAS', 'GERENCIA')
              or (core.es_rol('GERENCIA_PRODUCCION') and creado_por = core.usuario_actual()));
comment on policy cotizaciones_update_cotizan on comercial.cotizaciones is
  'D-52, RN-50: editar el borrador o anular una emitida (el trigger limita qué cambia).';

create policy cotizacion_lineas_select_cotizan on comercial.cotizacion_lineas
  for select to authenticated
  using (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id));
comment on policy cotizacion_lineas_select_cotizan on comercial.cotizacion_lineas is
  'D-52: las ve quien ve la cotización.';
create policy cotizacion_lineas_insert_cotizan on comercial.cotizacion_lineas
  for insert to authenticated
  with check (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id));
comment on policy cotizacion_lineas_insert_cotizan on comercial.cotizacion_lineas is
  'D-52, RN-50: las carga quien ve la cotización; el trigger exige que esté en borrador.';
create policy cotizacion_lineas_update_cotizan on comercial.cotizacion_lineas
  for update to authenticated
  using (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id))
  with check (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id));
comment on policy cotizacion_lineas_update_cotizan on comercial.cotizacion_lineas is
  'D-52, RN-50: editar o quitar (anulada) una línea del borrador.';

create policy solicitudes_catalogo_select_authenticated on comercial.solicitudes_catalogo
  for select to authenticated
  using (core.es_rol('DIRECCION_TECNICA') or creado_por = core.usuario_actual());
comment on policy solicitudes_catalogo_select_authenticated on comercial.solicitudes_catalogo is
  'D-52: la DT ve todas; quien propuso, las suyas.';
create policy solicitudes_catalogo_insert_cotizan on comercial.solicitudes_catalogo
  for insert to authenticated
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION') and creado_por = core.usuario_actual()
              and exists (select 1 from comercial.cotizacion_lineas l where l.id = cotizacion_linea_id));
comment on policy solicitudes_catalogo_insert_cotizan on comercial.solicitudes_catalogo is
  'D-52, RN-50: sobre una línea de una cotización que quien propone puede ver.';
create policy solicitudes_catalogo_update_dt on comercial.solicitudes_catalogo
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA'))
  with check (core.es_rol('DIRECCION_TECNICA'));
comment on policy solicitudes_catalogo_update_dt on comercial.solicitudes_catalogo is
  'D-52, RN-50: la DT la atiende o la descarta, con respuesta. Crear el insumo en el catálogo es su circuito.';

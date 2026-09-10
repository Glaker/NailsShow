-- ---------------------------------------------------------------------------
-- Propósito : Muestreo de insumos según I.50.4. Cierra el hueco que quedaba en
--             la transición CUARENTENA → MUESTREADO, que hasta ahora avanzaba
--             el estado sin registrar ningún muestreo.
-- Reglas    : RN-07 (etiqueta R.50.4.1 emitida en el momento del muestreo),
--             RN-08 (tamaño de muestra por categoría),
--             RN-10 (cinco verificaciones previas obligatorias),
--             RN-11 (destino del sobrante por categoría),
--             §4.5 del alcance, §5.1 (transición CUARENTENA → MUESTREADO).
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

create type gmp.categoria_muestreo_enum as enum (
  'MATERIAL_ENVASE_EMPAQUE',
  'MATERIA_PRIMA',
  'SEMIELABORADO_GRANEL',
  'PRODUCTO_TERMINADO'
);

-- RN-11: qué se hace con lo que sobra de la muestra.
create type gmp.destino_muestra_enum as enum (
  'CONTRAMUESTRA',
  'DESCARTE',
  'REUTILIZACION_ENVASE'
);

-- ===========================================================================
-- Categoría de muestreo a partir del tipo de insumo
-- ===========================================================================
--
-- I.50.4 razona por categoría de material, y el catálogo por tipo de insumo.
-- La correspondencia es fija y determinista, así que la resuelve la base: si la
-- eligiera quien carga, dos personas podrían clasificar el mismo material
-- distinto y el tamaño de muestra saldría distinto.

create or replace function gmp.categoria_muestreo(p_tipo gmp.tipo_insumo_enum)
returns gmp.categoria_muestreo_enum
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
           when 'MATERIA_PRIMA'    then 'MATERIA_PRIMA'
           when 'SEMIELABORADO'    then 'SEMIELABORADO_GRANEL'
           -- Envase, empaque y etiqueta comparten el criterio del 5 % de I.50.4.
           else 'MATERIAL_ENVASE_EMPAQUE'
         end::gmp.categoria_muestreo_enum;
$$;

comment on function gmp.categoria_muestreo(gmp.tipo_insumo_enum) is
  'Categoría de muestreo de I.50.4 según el tipo de insumo del catálogo.';

-- ===========================================================================
-- RN-08: tamaño de muestra sugerido
-- ===========================================================================
--
-- «5 % para material de envase y empaque, un tubo de ensayo para materia prima
-- y granel, 30 gr para producto terminado» (I.50.4).
--
-- Es sugerencia, no imposición: el POE admite apartarse y la tabla exige
-- justificarlo. Devuelve también el criterio en texto para que la pantalla
-- muestre de dónde salió el número, en vez de un número sin origen.

create or replace function gmp.tamano_muestra_sugerido(
  p_categoria gmp.categoria_muestreo_enum,
  p_cantidad  numeric,
  p_unidad    text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_categoria
    when 'MATERIAL_ENVASE_EMPAQUE' then
      jsonb_build_object(
        'cantidad', case when p_cantidad is null then null
                         else round(p_cantidad * 0.05, 3) end,
        'unidad',   p_unidad,
        'criterio', '5 % de la cantidad recibida (I.50.4)'
      )
    when 'MATERIA_PRIMA' then
      jsonb_build_object('cantidad', 1, 'unidad', 'tubo de ensayo',
                         'criterio', 'Un tubo de ensayo (I.50.4)')
    when 'SEMIELABORADO_GRANEL' then
      jsonb_build_object('cantidad', 1, 'unidad', 'tubo de ensayo',
                         'criterio', 'Un tubo de ensayo (I.50.4)')
    when 'PRODUCTO_TERMINADO' then
      jsonb_build_object('cantidad', 30, 'unidad', 'g',
                         'criterio', '30 gramos (I.50.4)')
  end;
$$;

comment on function gmp.tamano_muestra_sugerido(gmp.categoria_muestreo_enum, numeric, text) is
  'RN-08: tamaño de muestra sugerido por I.50.4, con el criterio que lo produjo. Editable con justificación.';

-- RN-11: destino del sobrante por categoría.
create or replace function gmp.destino_sobrante_sugerido(p_categoria gmp.categoria_muestreo_enum)
returns gmp.destino_muestra_enum
language sql
immutable
set search_path = ''
as $$
  select case p_categoria
           when 'MATERIA_PRIMA'           then 'CONTRAMUESTRA'
           when 'SEMIELABORADO_GRANEL'    then 'CONTRAMUESTRA'
           when 'PRODUCTO_TERMINADO'      then 'DESCARTE'
           when 'MATERIAL_ENVASE_EMPAQUE' then 'REUTILIZACION_ENVASE'
         end::gmp.destino_muestra_enum;
$$;

comment on function gmp.destino_sobrante_sugerido(gmp.categoria_muestreo_enum) is
  'RN-11 (I.50.4): el sobrante de materia prima y semielaborado va a contramuestra, el de producto terminado a descarte, el de envases puede reutilizarse.';

-- ===========================================================================
-- gmp.muestreos  (§4.5)
-- ===========================================================================

create table gmp.muestreos (
  id                     uuid primary key default gen_random_uuid(),
  numero                 text not null unique default '',
  entidad_tipo           text not null default 'lote_insumo'
                           check (entidad_tipo in ('lote_insumo', 'lote_producto')),
  entidad_id             uuid not null,
  categoria              gmp.categoria_muestreo_enum not null,

  -- RN-08. `cantidad_calculada` guarda lo que el sistema sugirió, para que
  -- después se pueda ver que se tomó otra cosa y por qué.
  cantidad_calculada     numeric(10,3),
  cantidad_tomada        numeric(10,3) not null check (cantidad_tomada > 0),
  unidad                 text not null,
  justificacion_cantidad text,

  -- Solo producto terminado (RN-09). Quedan acá para no partir la tabla; hoy
  -- no se usan porque el circuito de PT no está implementado.
  tamano_envase_gr       numeric(8,2),
  envases_muestreados    integer,

  -- RN-10: las cinco verificaciones previas de I.50.4, obligatorias.
  contenedor_integro     boolean not null,
  contenedor_limpio      boolean not null,
  rotulado_correcto      boolean not null,
  lote_coincide_certificado boolean,
  cantidad_contenedores_verificada integer not null
                           check (cantidad_contenedores_verificada >= 0),

  circunstancia_inusual  text,
  signos_no_conformidad  text,
  destino_sobrante       gmp.destino_muestra_enum not null,
  area_muestreo          text not null check (length(btrim(area_muestreo)) > 0),

  realizado_por          uuid not null references core.usuarios(id) default core.usuario_actual(),
  fecha_hora             timestamptz not null default now(),

  -- RN-08: apartarse del tamaño sugerido se puede, sin decir por qué no.
  constraint muestreos_desvio_justificado check (
    cantidad_calculada is null
    or cantidad_tomada = cantidad_calculada
    or (justificacion_cantidad is not null and length(btrim(justificacion_cantidad)) > 0)
  )
);

comment on table gmp.muestreos is
  'Muestreo de material según I.50.4 (§4.5). Las cinco verificaciones previas de RN-10 son obligatorias y bloqueantes.';
comment on column gmp.muestreos.cantidad_calculada is
  'RN-08: lo que sugirió gmp.tamano_muestra_sugerido(). Se guarda aunque se haya tomado otra cantidad: el desvío es el dato interesante.';
comment on column gmp.muestreos.lote_coincide_certificado is
  'RN-10, cuarta verificación. Admite NULL solo cuando el insumo no exige protocolo del fabricante y por lo tanto no hay certificado contra el cual comparar.';
comment on column gmp.muestreos.signos_no_conformidad is
  'I.50.4: lo observado que podría abrir una no conformidad (PG.60.18). Hoy se registra; la apertura automática llega con el módulo de no conformidades.';

create index muestreos_entidad_idx     on gmp.muestreos (entidad_tipo, entidad_id);
create index muestreos_fecha_idx       on gmp.muestreos (fecha_hora desc);
create index muestreos_realizado_idx   on gmp.muestreos (realizado_por);

create or replace function gmp.fn_numerar_muestreo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anio integer := extract(year from coalesce(new.fecha_hora, now()))::integer;
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := 'M-' || lpad(gmp.siguiente_numero('muestreo', v_anio)::text, 5, '0')
                  || '/' || v_anio::text;
  end if;
  return new;
end;
$$;

create trigger trg_numerar_muestreo
  before insert on gmp.muestreos
  for each row execute function gmp.fn_numerar_muestreo();

-- RN-10, cuarta verificación: si el insumo exige protocolo del fabricante,
-- entonces hay certificado y la correspondencia del lote es obligatoria.
create or replace function gmp.fn_validar_muestreo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_requiere_protocolo boolean;
begin
  if new.entidad_tipo = 'lote_insumo' then
    select i.requiere_protocolo
      into v_requiere_protocolo
      from gmp.lotes_insumo l
      join gmp.insumos_catalogo i on i.id = l.insumo_id
     where l.id = new.entidad_id;

    if not found then
      raise exception 'El lote % no existe.', new.entidad_id;
    end if;

    if coalesce(v_requiere_protocolo, false) and new.lote_coincide_certificado is null then
      raise exception
        'RN-10: este insumo se recibe con protocolo del fabricante, así que hay que verificar que el lote coincida con el certificado (I.50.4).'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validar_muestreo
  before insert on gmp.muestreos
  for each row execute function gmp.fn_validar_muestreo();

-- Un muestreo tampoco se edita: es un registro de lo que se constató.
create or replace function gmp.fn_muestreo_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'Un muestreo registrado no se modifica (I.50.4, práctica BPF). Si hay que corregirlo, corresponde no conformidad según PG.60.18 y un muestreo rectificativo.'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_muestreo_inmutable
  before update on gmp.muestreos
  for each row execute function gmp.fn_muestreo_inmutable();

-- ===========================================================================
-- Registro del muestreo: una sola transacción
-- ===========================================================================
--
-- RN-07 manda emitir la etiqueta R.50.4.1 «en el momento del muestreo». Si el
-- registro, la etiqueta y el avance de estado fueran tres llamadas, existiría
-- un instante con material muestreado y sin identificar, o con estado avanzado
-- y sin registro. Van juntos o no van.

create or replace function gmp.registrar_muestreo(
  p_lote_id                    uuid,
  p_cantidad_tomada            numeric,
  p_unidad                     text,
  p_area_muestreo              text,
  p_contenedor_integro         boolean,
  p_contenedor_limpio          boolean,
  p_rotulado_correcto          boolean,
  p_cantidad_contenedores      integer,
  p_destino_sobrante           gmp.destino_muestra_enum,
  p_lote_coincide_certificado  boolean default null,
  p_justificacion_cantidad     text default null,
  p_circunstancia_inusual      text default null,
  p_signos_no_conformidad      text default null
)
returns gmp.muestreos
language plpgsql
set search_path = ''
as $$
declare
  v_lote      gmp.lotes_insumo%rowtype;
  v_insumo    gmp.insumos_catalogo%rowtype;
  v_proveedor gmp.proveedores%rowtype;
  v_usuario   core.usuarios%rowtype;
  v_categoria gmp.categoria_muestreo_enum;
  v_sugerido  jsonb;
  v_muestreo  gmp.muestreos%rowtype;
begin
  select * into v_lote from gmp.lotes_insumo where id = p_lote_id for update;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;

  -- §5.1: solo se muestrea lo que está en cuarentena. El estado anterior es
  -- parte de la precondición, no un detalle de pantalla.
  if v_lote.estado <> 'CUARENTENA' then
    raise exception
      'Solo se muestrea material en cuarentena. Este lote está en %.', v_lote.estado
      using errcode = 'check_violation';
  end if;

  -- RN-10: las cinco verificaciones previas son bloqueantes. No alcanza con
  -- registrarlas: si alguna dio mal, el muestreo no se hace.
  if not p_contenedor_integro then
    raise exception 'RN-10: el contenedor no está íntegro. No se muestrea (I.50.4).'
      using errcode = 'check_violation';
  end if;
  if not p_contenedor_limpio then
    raise exception 'RN-10: el contenedor no está limpio. No se muestrea (I.50.4).'
      using errcode = 'check_violation';
  end if;
  if not p_rotulado_correcto then
    raise exception 'RN-10: el rotulado no es correcto. No se muestrea hasta rotular bien (I.50.4, I.20.2).'
      using errcode = 'check_violation';
  end if;
  if p_lote_coincide_certificado = false then
    raise exception
      'RN-10: el lote no coincide con el certificado del proveedor. No se muestrea; corresponde no conformidad (PG.60.18).'
      using errcode = 'check_violation';
  end if;

  select * into v_insumo from gmp.insumos_catalogo where id = v_lote.insumo_id;
  select p.* into v_proveedor
    from gmp.proveedores p
    join gmp.recepciones r on r.proveedor_id = p.id
   where r.id = v_lote.recepcion_id;
  select * into v_usuario from core.usuarios where id = core.usuario_actual();

  v_categoria := gmp.categoria_muestreo(v_insumo.tipo);
  v_sugerido  := gmp.tamano_muestra_sugerido(
                   v_categoria, v_lote.cantidad_unidades, v_lote.unidad);

  insert into gmp.muestreos (
    entidad_tipo, entidad_id, categoria,
    cantidad_calculada, cantidad_tomada, unidad, justificacion_cantidad,
    contenedor_integro, contenedor_limpio, rotulado_correcto,
    lote_coincide_certificado, cantidad_contenedores_verificada,
    circunstancia_inusual, signos_no_conformidad,
    destino_sobrante, area_muestreo
  )
  values (
    'lote_insumo', p_lote_id, v_categoria,
    (v_sugerido ->> 'cantidad')::numeric, p_cantidad_tomada, p_unidad,
    nullif(btrim(coalesce(p_justificacion_cantidad, '')), ''),
    p_contenedor_integro, p_contenedor_limpio, p_rotulado_correcto,
    p_lote_coincide_certificado, p_cantidad_contenedores,
    nullif(btrim(coalesce(p_circunstancia_inusual, '')), ''),
    nullif(btrim(coalesce(p_signos_no_conformidad, '')), ''),
    p_destino_sobrante, p_area_muestreo
  )
  returning * into v_muestreo;

  -- RN-07: la etiqueta R.50.4.1 identifica la muestra que se llevó al
  -- laboratorio. Sus campos son los del registro, literales.
  --
  -- Va con estado MUESTREADO, que I.20.2 no rotula: `gmp.color_rotulo()`
  -- devuelve SIN_ROTULO y eso es correcto. Esta etiqueta identifica una
  -- muestra, no comunica el estado de calidad de un material; si llevara uno de
  -- los cuatro colores reservados, diría algo que I.20.2 no dijo.
  insert into gmp.rotulos (
    tipo_registro, version_formato, entidad_tipo, entidad_id, estado, contenido
  )
  values (
    'R.50.4.1', '00', 'muestreo', v_muestreo.id, 'MUESTREADO',
    jsonb_build_object(
      'material_muestreado',   v_insumo.nombre,
      'numero_interno',        v_lote.numero_registro_interno,
      'codigo_interno',        v_insumo.codigo_interno,
      'lote_proveedor',        v_lote.lote_proveedor,
      'proveedor',             v_proveedor.razon_social,
      'responsable_toma',      v_usuario.nombre_completo,
      'fecha_toma',            v_muestreo.fecha_hora,
      'numero_muestreo',       v_muestreo.numero,
      'cantidad_tomada',       v_muestreo.cantidad_tomada,
      'unidad',                v_muestreo.unidad
    )
  );

  -- El lote avanza a MUESTREADO. Se delega en la función de rotulado, que sabe
  -- que ese estado no cambia el cartel: el material sigue en cuarentena y
  -- conserva su rótulo amarillo hasta que empiece el análisis (I.20.2).
  perform gmp.emitir_rotulo_lote_insumo(p_lote_id, 'MUESTREADO'::gmp.estado_calidad_enum);

  return v_muestreo;
end;
$$;

comment on function gmp.registrar_muestreo is
  'Registra el muestreo de I.50.4, emite la etiqueta R.50.4.1 (RN-07) y avanza el lote a MUESTREADO, todo en una transacción.';

-- ===========================================================================
-- Vista de lectura
-- ===========================================================================

create view gmp.v_muestreos with (security_invoker = true) as
  select
    m.id,
    m.numero,
    m.entidad_tipo,
    m.entidad_id,
    m.categoria,
    m.cantidad_calculada,
    m.cantidad_tomada,
    m.unidad,
    m.justificacion_cantidad,
    m.contenedor_integro,
    m.contenedor_limpio,
    m.rotulado_correcto,
    m.lote_coincide_certificado,
    m.cantidad_contenedores_verificada,
    m.circunstancia_inusual,
    m.signos_no_conformidad,
    m.destino_sobrante,
    m.area_muestreo,
    m.fecha_hora,
    u.nombre_completo   as realizado_por_nombre,
    l.numero_registro_interno,
    l.lote_proveedor,
    i.nombre            as insumo_nombre,
    i.codigo_interno,
    p.razon_social      as proveedor,
    r.id                as rotulo_id
  from gmp.muestreos m
  join core.usuarios u        on u.id = m.realizado_por
  left join gmp.lotes_insumo l      on l.id = m.entidad_id and m.entidad_tipo = 'lote_insumo'
  left join gmp.insumos_catalogo i  on i.id = l.insumo_id
  left join gmp.recepciones re      on re.id = l.recepcion_id
  left join gmp.proveedores p       on p.id = re.proveedor_id
  left join gmp.rotulos r           on r.entidad_tipo = 'muestreo' and r.entidad_id = m.id;

comment on view gmp.v_muestreos is
  'Muestreos con el lote, el insumo, el proveedor y el responsable resueltos.';

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table gmp.muestreos enable row level security;
alter table gmp.muestreos force  row level security;

grant select, insert on gmp.muestreos to authenticated;
grant select on gmp.v_muestreos to authenticated;
grant execute on function gmp.registrar_muestreo(uuid, numeric, text, text, boolean, boolean, boolean, integer, gmp.destino_muestra_enum, boolean, text, text, text) to authenticated;
grant execute on function gmp.tamano_muestra_sugerido(gmp.categoria_muestreo_enum, numeric, text) to authenticated;
grant execute on function gmp.destino_sobrante_sugerido(gmp.categoria_muestreo_enum) to authenticated;
grant execute on function gmp.categoria_muestreo(gmp.tipo_insumo_enum) to authenticated;

create policy muestreos_select_authenticated on gmp.muestreos
  for select to authenticated using (core.rol() is not null);
comment on policy muestreos_select_authenticated on gmp.muestreos is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy muestreos_insert_control_calidad on gmp.muestreos
  for insert to authenticated
  with check (core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA'));
comment on policy muestreos_insert_control_calidad on gmp.muestreos is
  '§3.3: «Registrar muestreo» es de Control de Calidad y Dirección Técnica.';

-- Sin políticas de UPDATE ni de DELETE. El muestreo es un registro de lo
-- constatado: no se edita ni se borra.

select core.adjuntar_auditoria('gmp.muestreos');

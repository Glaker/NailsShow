-- ---------------------------------------------------------------------------
-- Propósito : Rebanada vertical del demo: recepción de insumo (I.20.1), lote
--             con número de registro interno, y rótulo de estado (I.20.2).
-- Reglas    : RN-01 (protocolo de análisis), RN-02 (bulto de peso disparejo se
--             abre y se cuenta), RN-03 (pesada de pigmentos), RN-04 (color del
--             rótulo por estado), RN-05 (el rótulo no se modifica),
--             RN-44 (etiquetas por plancha), RN-48 (inflamables al exterior),
--             RN-50 (auditoría). Máquina de estado de §5.1.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Contadores de numeración
-- ===========================================================================
--
-- CLAUDE.md §7: nada de `sequence` para numeración correlativa. Una secuencia
-- no es transaccional y deja huecos ante un rollback; un correlativo con
-- huecos es lo primero que un inspector pregunta. Tabla de contadores, fila
-- bloqueada dentro de la misma transacción.

create table gmp.contadores (
  ambito text    not null,
  anio   integer not null,
  ultimo integer not null default 0,
  primary key (ambito, anio)
);

comment on table gmp.contadores is
  'Correlativos por ámbito y año. Reemplaza a `sequence`, que deja huecos ante rollback (CLAUDE.md §7).';

create or replace function gmp.siguiente_numero(p_ambito text, p_anio integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo integer;
begin
  -- ON CONFLICT DO UPDATE toma el bloqueo de fila, así que dos transacciones
  -- concurrentes se serializan acá y ninguna repite número. Si la transacción
  -- se deshace, el incremento se deshace con ella y no queda hueco.
  insert into gmp.contadores (ambito, anio, ultimo)
  values (p_ambito, p_anio, 1)
  on conflict (ambito, anio)
    do update set ultimo = gmp.contadores.ultimo + 1
  returning ultimo into v_ultimo;

  return v_ultimo;
end;
$$;

comment on function gmp.siguiente_numero(text, integer) is
  'Siguiente correlativo del ámbito en el año, sin huecos ante rollback.';

-- ===========================================================================
-- Recepciones (§4.3, I.20.1)
-- ===========================================================================

create table gmp.recepciones (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null unique,
  fecha_hora          timestamptz not null default now(),
  proveedor_id        uuid not null references gmp.proveedores(id),
  proveedor_nuevo     boolean not null default false,
  numero_remito       text not null check (length(btrim(numero_remito)) > 0),
  coincide_con_pedido boolean not null,
  observaciones       text,
  -- Extensión administrativa, sin respaldo en I.20.1: proviene del formulario
  -- que usaba la Gerencia de Producción. Sin efecto sobre la lógica regulada.
  numero_ap_factura   text,
  metodo_pago         text,
  monto               numeric(14,2) check (monto is null or monto >= 0),
  moneda              text not null default 'ARS',
  cargado_a_stock     boolean not null default false,
  cargado_por         uuid references core.usuarios(id),
  cargado_en          timestamptz,
  registrado_por      uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en           timestamptz not null default now(),
  constraint recepciones_carga_con_autor check (
    (not cargado_a_stock and cargado_por is null and cargado_en is null)
    or (cargado_a_stock and cargado_por is not null and cargado_en is not null)
  )
);

comment on table gmp.recepciones is
  'Recepción física de mercadería (I.20.1). Una recepción agrupa los lotes de insumo que llegaron con el mismo remito.';
comment on column gmp.recepciones.coincide_con_pedido is
  'I.20.1 paso 2: se verifica que lo recibido coincida con lo pedido antes de continuar.';

create index recepciones_proveedor_idx  on gmp.recepciones (proveedor_id);
create index recepciones_fecha_idx      on gmp.recepciones (fecha_hora desc);

create or replace function gmp.fn_numerar_recepcion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anio integer := extract(year from coalesce(new.fecha_hora, now()))::integer;
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := lpad(gmp.siguiente_numero('recepcion', v_anio)::text, 5, '0')
                  || '/' || v_anio::text;
  end if;
  return new;
end;
$$;

create trigger trg_numerar_recepcion
  before insert on gmp.recepciones
  for each row execute function gmp.fn_numerar_recepcion();

-- ===========================================================================
-- Lotes de insumo (§4.3)
-- ===========================================================================

create table gmp.lotes_insumo (
  id                      uuid primary key default gen_random_uuid(),
  recepcion_id            uuid not null references gmp.recepciones(id),
  insumo_id               uuid not null references gmp.insumos_catalogo(id),
  -- I.20.1 paso 7. El POE manda asignarlo pero no define su formato; se usa
  -- correlativo por año hasta que aparezca la regla. Anotado en
  -- docs/DECISIONES_ABIERTAS.md.
  numero_registro_interno text not null unique,
  lote_proveedor          text not null check (length(btrim(lote_proveedor)) > 0),
  plazo_validez           date,
  cantidad_bultos         integer not null check (cantidad_bultos > 0),
  cantidad_unidades       numeric(14,3) check (cantidad_unidades is null or cantidad_unidades >= 0),
  unidad                  text not null,

  -- I.20.1 paso 3. NULL = no aplica (bulto único, material a granel).
  bultos_peso_similar     boolean,
  unidades_contadas       numeric(14,3),

  -- RN-44, I.20.1 paso 4: las etiquetas se cuentan por plancha.
  planchas_etiquetas      integer check (planchas_etiquetas is null or planchas_etiquetas >= 0),
  etiquetas_por_plancha   integer check (etiquetas_por_plancha is null or etiquetas_por_plancha >= 0),
  total_etiquetas         integer generated always as (planchas_etiquetas * etiquetas_por_plancha) stored,

  -- RN-01, I.20.1 paso 5.
  protocolo_recibido      boolean,
  protocolo_archivo_url   text,
  -- RN-03, I.20.1 paso 5.
  peso_pigmento_kg        numeric(10,4) check (peso_pigmento_kg is null or peso_pigmento_kg >= 0),

  contenedores_limpiados  boolean not null default false,
  estado                  gmp.estado_calidad_enum not null default 'RECIBIDO',
  deposito_actual_id      uuid references gmp.depositos(id),
  registrado_por          uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en               timestamptz not null default now(),

  -- RN-02: si los bultos no pesan parecido, hay que abrirlos y contar.
  constraint lotes_insumo_rn02_conteo_obligatorio check (
    bultos_peso_similar is distinct from false or unidades_contadas is not null
  ),
  -- RN-44: las dos mitades del cálculo van juntas o no van.
  constraint lotes_insumo_rn44_planchas_completas check (
    (planchas_etiquetas is null) = (etiquetas_por_plancha is null)
  )
);

comment on table gmp.lotes_insumo is
  'Lote de insumo recibido (§4.3). Sujeto de la máquina de estado de §5.1 y del rotulado de I.20.2.';
comment on column gmp.lotes_insumo.numero_registro_interno is
  'I.20.1 paso 7. Formato provisional «RI-nnnnn/aaaa»: el POE exige el número pero no define su composición.';
comment on constraint lotes_insumo_rn02_conteo_obligatorio on gmp.lotes_insumo is
  'RN-02 (I.20.1 paso 3): un bulto de peso disparejo se abre y se cuentan las unidades.';

create index lotes_insumo_recepcion_idx on gmp.lotes_insumo (recepcion_id);
create index lotes_insumo_insumo_idx    on gmp.lotes_insumo (insumo_id);
create index lotes_insumo_estado_idx    on gmp.lotes_insumo (estado);

-- ---------------------------------------------------------------------------
-- Validación de alta del lote: RN-01, RN-03, RN-48
-- ---------------------------------------------------------------------------
-- Las tres dependen de la ficha del insumo, en otra tabla, así que no pueden
-- ser CHECK. La aplicación duplica el mensaje, pero la autoridad es esta.

create or replace function gmp.fn_validar_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_insumo gmp.insumos_catalogo%rowtype;
begin
  select * into v_insumo from gmp.insumos_catalogo where id = new.insumo_id;

  if not found then
    raise exception 'El insumo % no existe en el catálogo.', new.insumo_id;
  end if;

  -- RN-01: una materia prima no se recepciona sin protocolo de análisis.
  if v_insumo.requiere_protocolo and coalesce(new.protocolo_recibido, false) = false then
    raise exception
      'RN-01: «%» exige protocolo de análisis del fabricante para ser recepcionado (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-03: los pigmentos se pesan antes de continuar el proceso.
  if v_insumo.requiere_pesada_recepcion and new.peso_pigmento_kg is null then
    raise exception
      'RN-03: «%» se pesa durante la recepción; falta el peso en kg (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-48: el inflamable va al depósito exterior, no lo elige quien carga.
  if v_insumo.es_inflamable and new.deposito_actual_id is null then
    select id into new.deposito_actual_id
      from gmp.depositos
     where tipo_contenido = 'INFLAMABLES' and es_exterior and activo
     limit 1;
  end if;

  return new;
end;
$$;

create trigger trg_validar_lote_insumo
  before insert on gmp.lotes_insumo
  for each row execute function gmp.fn_validar_lote_insumo();

create or replace function gmp.fn_numerar_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anio integer := extract(year from now())::integer;
begin
  if new.numero_registro_interno is null or btrim(new.numero_registro_interno) = '' then
    new.numero_registro_interno :=
      'RI-' || lpad(gmp.siguiente_numero('registro_interno', v_anio)::text, 5, '0')
      || '/' || v_anio::text;
  end if;
  return new;
end;
$$;

create trigger trg_numerar_lote_insumo
  before insert on gmp.lotes_insumo
  for each row execute function gmp.fn_numerar_lote_insumo();

-- ---------------------------------------------------------------------------
-- Máquina de estado de §5.1
-- ---------------------------------------------------------------------------

create or replace function gmp.fn_transicion_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_permitidas text[] := array[
    'RECIBIDO>CUARENTENA',
    'CUARENTENA>MUESTREADO',
    'MUESTREADO>EN_ANALISIS',
    'EN_ANALISIS>APROBADO',
    'EN_ANALISIS>RECHAZADO'
  ];
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not ((old.estado::text || '>' || new.estado::text) = any(v_permitidas)) then
    raise exception
      'Transición de estado no permitida: % → %. La máquina de estado de §5.1 solo admite el avance del circuito; '
      'la corrección de un estado terminal exige no conformidad (PG.60.18), no revertir el estado.',
      old.estado, new.estado
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_transicion_lote_insumo
  before update on gmp.lotes_insumo
  for each row execute function gmp.fn_transicion_lote_insumo();

-- ===========================================================================
-- Rótulos (§4.4, I.20.2)
-- ===========================================================================

-- RN-04. IMMUTABLE porque la usa una columna generada.
-- I.20.1 paso 8 dice ROJO para cuarentena, en contradicción con I.20.2.
-- Prevalece I.20.2, que es el POE específico de rotulado (inconsistencia 1 de §10).
create or replace function gmp.color_rotulo(p_estado gmp.estado_calidad_enum)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_estado
           when 'CUARENTENA'  then 'AMARILLO'
           when 'EN_ANALISIS' then 'GRIS'
           when 'APROBADO'    then 'VERDE'
           when 'RECHAZADO'   then 'ROJO'
           else 'SIN_ROTULO'
         end;
$$;

comment on function gmp.color_rotulo(gmp.estado_calidad_enum) is
  'RN-04 (I.20.2): cuarentena amarillo, en análisis gris, aprobado verde, rechazado rojo.';

create table gmp.rotulos (
  id              uuid primary key default gen_random_uuid(),
  tipo_registro   text not null check (
                    tipo_registro in ('R.20.2.1','R.20.2.2','R.50.4.1','R.40.16.1','R.60.12.1','R.60.4.2','R.60.9.2')
                  ),
  version_formato text not null,
  entidad_tipo    text not null check (entidad_tipo in ('lote_insumo','lote_producto','muestreo','contramuestra')),
  entidad_id      uuid not null,
  estado          gmp.estado_calidad_enum not null,
  color           text generated always as (gmp.color_rotulo(estado)) stored,
  contenido       jsonb not null,
  emitido_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  emitido_en      timestamptz not null default now(),
  vigente         boolean not null default true,
  reemplazado_por uuid references gmp.rotulos(id)
);

comment on table gmp.rotulos is
  'Rótulos de estado (§4.4, I.20.2). RN-05: no se modifican; el cambio de estado emite uno nuevo y marca el anterior no vigente.';
comment on column gmp.rotulos.color is
  'RN-04: derivado del estado, no elegible. Columna generada sobre gmp.color_rotulo().';
comment on column gmp.rotulos.contenido is
  'Campos del formato, tomados literalmente del registro (R.20.2.1 v01: nombre, lote proveedor, proveedor, n° interno, plazo de validez, estatus).';

create index rotulos_entidad_idx on gmp.rotulos (entidad_tipo, entidad_id);
create unique index rotulos_uno_vigente_por_entidad
  on gmp.rotulos (entidad_tipo, entidad_id)
  where vigente;

comment on index gmp.rotulos_uno_vigente_por_entidad is
  'I.20.2: un material lleva un solo rótulo vigente. El anterior se marca no vigente en la misma transacción.';

-- RN-05: el rótulo no se modifica. Lo único que puede cambiar es su vigencia,
-- y en un solo sentido.
create or replace function gmp.fn_rotulo_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.tipo_registro, new.version_formato, new.entidad_tipo, new.entidad_id,
      new.estado, new.contenido, new.emitido_por, new.emitido_en)
     is distinct from
     (old.tipo_registro, old.version_formato, old.entidad_tipo, old.entidad_id,
      old.estado, old.contenido, old.emitido_por, old.emitido_en) then
    raise exception
      'RN-05: un rótulo no se modifica. Ante el cambio de estado se emite un rótulo nuevo y el anterior se marca no vigente (I.20.2).'
      using errcode = 'restrict_violation';
  end if;

  if old.vigente = false and new.vigente = true then
    raise exception 'RN-05: un rótulo dado de baja no vuelve a estar vigente.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger trg_rotulo_inmutable
  before update on gmp.rotulos
  for each row execute function gmp.fn_rotulo_inmutable();

-- ---------------------------------------------------------------------------
-- Emisión de rótulo y avance de estado, en una sola transacción
-- ---------------------------------------------------------------------------
-- I.20.2: «ante el cambio de estado del insumo, se deberá rotular nuevamente».
-- Estado y rótulo se mueven juntos o no se mueven: si el rótulo se emitiera
-- después, existiría una ventana con material en planta cuyo cartel miente.

create or replace function gmp.emitir_rotulo_lote_insumo(
  p_lote_id uuid,
  p_estado  gmp.estado_calidad_enum
)
returns gmp.rotulos
language plpgsql
set search_path = ''
as $$
declare
  v_lote      gmp.lotes_insumo%rowtype;
  v_insumo    gmp.insumos_catalogo%rowtype;
  v_proveedor gmp.proveedores%rowtype;
  v_rotulo    gmp.rotulos%rowtype;
  v_deposito  uuid;
begin
  select * into v_lote from gmp.lotes_insumo where id = p_lote_id for update;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;

  select * into v_insumo    from gmp.insumos_catalogo where id = v_lote.insumo_id;
  select p.* into v_proveedor
    from gmp.proveedores p
    join gmp.recepciones r on r.proveedor_id = p.id
   where r.id = v_lote.recepcion_id;

  -- Precondiciones de RECIBIDO → CUARENTENA (§5.1).
  if p_estado = 'CUARENTENA' then
    if not v_lote.contenedores_limpiados then
      raise exception
        'I.20.1: los contenedores deben limpiarse antes de ingresar el material a cuarentena.'
        using errcode = 'check_violation';
    end if;
    if v_insumo.requiere_protocolo and coalesce(v_lote.protocolo_recibido, false) = false then
      raise exception 'RN-01: falta el protocolo de análisis del fabricante.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- El rótulo anterior se da de baja antes de emitir el nuevo: el índice
  -- parcial `rotulos_uno_vigente_por_entidad` no admite dos vigentes.
  update gmp.rotulos
     set vigente = false
   where entidad_tipo = 'lote_insumo'
     and entidad_id = p_lote_id
     and vigente;

  insert into gmp.rotulos (
    tipo_registro, version_formato, entidad_tipo, entidad_id, estado, contenido
  )
  values (
    'R.20.2.1', '01', 'lote_insumo', p_lote_id, p_estado,
    jsonb_build_object(
      'nombre',             v_insumo.nombre,
      'lote_proveedor',     v_lote.lote_proveedor,
      'proveedor',          v_proveedor.razon_social,
      'numero_interno',     v_lote.numero_registro_interno,
      'codigo_interno',     v_insumo.codigo_interno,
      'plazo_validez',      v_lote.plazo_validez,
      'estatus',            p_estado::text
    )
  )
  returning * into v_rotulo;

  -- Marcar el reemplazo hacia atrás deja la cadena de rótulos legible: cada
  -- rótulo dado de baja apunta al que lo sucedió.
  update gmp.rotulos
     set reemplazado_por = v_rotulo.id
   where entidad_tipo = 'lote_insumo'
     and entidad_id = p_lote_id
     and not vigente
     and reemplazado_por is null;

  -- Destino físico según el estado alcanzado (I.20.1, I.40.16).
  if p_estado = 'CUARENTENA' then
    v_deposito := coalesce(v_lote.deposito_actual_id, v_insumo.deposito_cuarentena_id);
  elsif p_estado = 'APROBADO' then
    v_deposito := coalesce(v_insumo.deposito_aprobado_id, v_lote.deposito_actual_id);
  else
    v_deposito := v_lote.deposito_actual_id;
  end if;

  update gmp.lotes_insumo
     set estado = p_estado,
         deposito_actual_id = v_deposito
   where id = p_lote_id;

  return v_rotulo;
end;
$$;

comment on function gmp.emitir_rotulo_lote_insumo(uuid, gmp.estado_calidad_enum) is
  'Avanza el estado del lote y emite el rótulo correspondiente en la misma transacción (I.20.2, RN-04, RN-05, §5.1).';

grant execute on function gmp.emitir_rotulo_lote_insumo(uuid, gmp.estado_calidad_enum) to authenticated;
grant execute on function gmp.color_rotulo(gmp.estado_calidad_enum) to authenticated;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table gmp.recepciones   enable row level security;
alter table gmp.recepciones   force  row level security;
alter table gmp.lotes_insumo  enable row level security;
alter table gmp.lotes_insumo  force  row level security;
alter table gmp.rotulos       enable row level security;
alter table gmp.rotulos       force  row level security;
alter table gmp.contadores    enable row level security;
alter table gmp.contadores    force  row level security;

grant select, insert, update on gmp.recepciones  to authenticated;
grant select, insert, update on gmp.lotes_insumo to authenticated;
grant select, insert, update on gmp.rotulos      to authenticated;
-- gmp.contadores no recibe ningún GRANT: se toca únicamente desde
-- gmp.siguiente_numero(), que es SECURITY DEFINER.

create policy recepciones_select_authenticated on gmp.recepciones
  for select to authenticated using (core.rol() is not null);
comment on policy recepciones_select_authenticated on gmp.recepciones is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy recepciones_insert_recepcion_fisica on gmp.recepciones
  for insert to authenticated
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'));
comment on policy recepciones_insert_recepcion_fisica on gmp.recepciones is
  '§3.3: «Registrar recepción física de insumo» habilitada a OP, CC, DT y GP.';

-- La carga administrativa (factura, monto, stock) es diferida y de otro sector.
create policy recepciones_update_administracion on gmp.recepciones
  for update to authenticated
  using (core.es_rol('ADMINISTRACION','GERENCIA_PRODUCCION','DIRECCION_TECNICA'))
  with check (core.es_rol('ADMINISTRACION','GERENCIA_PRODUCCION','DIRECCION_TECNICA'));
comment on policy recepciones_update_administracion on gmp.recepciones is
  '§4.3: la carga administrativa de la recepción (factura, monto, stock) es diferida y la hace Administración.';

create policy lotes_insumo_select_authenticated on gmp.lotes_insumo
  for select to authenticated using (core.rol() is not null);
comment on policy lotes_insumo_select_authenticated on gmp.lotes_insumo is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy lotes_insumo_insert_recepcion_fisica on gmp.lotes_insumo
  for insert to authenticated
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'));
comment on policy lotes_insumo_insert_recepcion_fisica on gmp.lotes_insumo is
  '§3.3: el lote se da de alta en la misma operación que la recepción física.';

-- El avance de estado de RECIBIDO a CUARENTENA lo hace quien recepciona; de
-- MUESTREADO en adelante decide Control de Calidad y Dirección Técnica. La
-- máquina de estado de §5.1 acota qué transición es posible; la política acota
-- quién puede intentarla.
create policy lotes_insumo_update_circuito on gmp.lotes_insumo
  for update to authenticated
  using (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'))
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'));
comment on policy lotes_insumo_update_circuito on gmp.lotes_insumo is
  '§3.3 y §5.1: avance del circuito. La transición válida la controla trg_transicion_lote_insumo.';

create policy rotulos_select_authenticated on gmp.rotulos
  for select to authenticated using (core.rol() is not null);
comment on policy rotulos_select_authenticated on gmp.rotulos is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy rotulos_insert_emision on gmp.rotulos
  for insert to authenticated
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'));
comment on policy rotulos_insert_emision on gmp.rotulos is
  '§3.3: «Emitir rótulo de estado» habilitado a OP, CC, DT y GP.';

create policy rotulos_update_baja_vigencia on gmp.rotulos
  for update to authenticated
  using (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'))
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'));
comment on policy rotulos_update_baja_vigencia on gmp.rotulos is
  'RN-05: el único cambio admitido es la baja de vigencia, y lo controla trg_rotulo_inmutable.';

-- Sin políticas de DELETE en ninguna de las tres tablas.
-- gmp.contadores no lleva ninguna política: sin GRANT, no hay acceso que evaluar.

select core.adjuntar_auditoria('gmp.recepciones');
select core.adjuntar_auditoria('gmp.lotes_insumo');
select core.adjuntar_auditoria('gmp.rotulos');
select core.adjuntar_auditoria('gmp.contadores');

-- ---------------------------------------------------------------------------
-- Propósito : Registros de análisis de control de calidad: R.50.5.1 (insumos),
--             R.50.6.1 (semielaborado) y R.50.10.1 (producto a granel). Pasan
--             a ser obligatorios: un lote de insumo o semielaborado no se
--             aprueba ni se rechaza sin su registro, el control del granel se
--             registra con el suyo, y el granel no se fracciona sin aprobar.
-- Reglas    : I.50.5, I.50.6, I.50.10 (CC describe la muestra y DT decide),
--             §5.1 (máquina de estados del lote), RN-50, invariante 1 (un
--             registro no se edita: se rectifica con otro). Pedido del
--             codirector técnico, 2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- UN REGISTRO PARA LOS TRES. Los tres formularios tienen los mismos campos:
-- fecha, operario, número NNN/AAAA, qué se analiza (lote de insumo o lote de
-- granel), tamaño y descripción de la muestra, observaciones y conclusiones,
-- quién controló y APROBADO SÍ/NO. Cambia el código del registro y a qué apunta.
--
-- QUÉ ES SEMIELABORADO. Hoy el semielaborado es un lote de insumo de tipo
-- SEMIELABORADO (cremas y primer comprados a granel): lleva R.50.6.1 en vez de
-- R.50.5.1. El granel que se elabora en una orden lleva R.50.10.1.
--
-- NUMERACIÓN. Correlativa por registro y año, sin huecos: tabla de contadores
-- con bloqueo, no sequence (CLAUDE.md §7).
--
-- LO QUE YA ESTABA. Los lotes aprobados antes de esta migración no tienen
-- registro: la exigencia rige desde ahora, en la transición. No se inventan
-- registros hacia atrás.

create table gmp.contadores_analisis (
  registro text    not null,
  anio     integer not null,
  ultimo   integer not null default 0,
  primary key (registro, anio)
);

create table gmp.registros_analisis (
  id              uuid primary key default gen_random_uuid(),
  registro        text not null check (registro in ('R.50.5.1', 'R.50.6.1', 'R.50.10.1')),
  numero          text not null,
  fecha           date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  lote_insumo_id  uuid references gmp.lotes_insumo(id),
  orden_id        uuid references gmp.ordenes_produccion(id),
  tamano_muestra  text not null check (length(btrim(tamano_muestra)) > 0),
  descripcion     text not null check (length(btrim(descripcion)) > 0),
  conclusiones    text not null check (length(btrim(conclusiones)) > 0),
  aprobado        boolean not null,
  -- Corrección: un registro nuevo que apunta al que corrige, con motivo.
  rectifica_a     uuid unique references gmp.registros_analisis(id),
  motivo          text,
  controlo_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  controlo_en     timestamptz not null default now(),
  unique (registro, numero),
  constraint registros_analisis_un_objeto check (num_nonnulls(lote_insumo_id, orden_id) = 1),
  constraint registros_analisis_granel_en_orden check ((registro = 'R.50.10.1') = (orden_id is not null)),
  constraint registros_analisis_rectificacion check (
    rectifica_a is null or length(btrim(coalesce(motivo, ''))) >= 3
  )
);

comment on table gmp.registros_analisis is
  'Registros de análisis R.50.5.1 (insumo), R.50.6.1 (semielaborado) y R.50.10.1 (granel). No se editan: '
  'se rectifican con otro registro (rectifica_a). El vigente de cada lote es el que nadie rectificó.';

create index registros_analisis_lote_idx  on gmp.registros_analisis (lote_insumo_id) where lote_insumo_id is not null;
create index registros_analisis_orden_idx on gmp.registros_analisis (orden_id) where orden_id is not null;

-- Numera, fija el registro según el tipo de insumo y pone autor y momento.
create or replace function gmp.fn_registro_analisis()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo gmp.tipo_insumo_enum;
  v_anio integer;
  v_n    integer;
  v_prev gmp.registros_analisis%rowtype;
begin
  if not core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') then
    raise exception 'El registro de análisis lo hace Control de Calidad o Dirección Técnica (I.50.5).'
      using errcode = 'insufficient_privilege';
  end if;

  if new.lote_insumo_id is not null then
    select i.tipo into v_tipo
      from gmp.lotes_insumo l join gmp.insumos_catalogo i on i.id = l.insumo_id
     where l.id = new.lote_insumo_id;
    new.registro := case when v_tipo = 'SEMIELABORADO' then 'R.50.6.1' else 'R.50.5.1' end;
  else
    new.registro := 'R.50.10.1';
  end if;

  if new.rectifica_a is not null then
    select * into v_prev from gmp.registros_analisis where id = new.rectifica_a;
    if v_prev.lote_insumo_id is distinct from new.lote_insumo_id
       or v_prev.orden_id is distinct from new.orden_id then
      raise exception 'La rectificación es del mismo lote que el registro que corrige.' using errcode = 'check_violation';
    end if;
  end if;

  v_anio := extract(year from new.fecha)::int;
  insert into gmp.contadores_analisis (registro, anio) values (new.registro, v_anio)
    on conflict (registro, anio) do nothing;
  update gmp.contadores_analisis set ultimo = ultimo + 1
   where registro = new.registro and anio = v_anio
  returning ultimo into v_n;
  new.numero := format('%s/%s', lpad(v_n::text, 3, '0'), v_anio);

  new.controlo_por := core.usuario_actual();
  new.controlo_en := now();
  return new;
end;
$$;

create trigger trg_registro_analisis
  before insert on gmp.registros_analisis
  for each row execute function gmp.fn_registro_analisis();

create or replace function gmp.fn_registro_analisis_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Un registro de análisis no se modifica: se rectifica con otro (invariante 1).'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_registro_analisis_inmutable
  before update or delete on gmp.registros_analisis
  for each row execute function gmp.fn_registro_analisis_inmutable();

-- Vigente: el que ningún otro rectificó.
create view gmp.v_registros_analisis
with (security_invoker = true) as
select r.*, u.nombre_completo as controlo_nombre,
       l.numero_registro_interno as lote_interno,
       not exists (select 1 from gmp.registros_analisis x where x.rectifica_a = r.id) as vigente
  from gmp.registros_analisis r
  left join core.usuarios u on u.id = r.controlo_por
  left join gmp.lotes_insumo l on l.id = r.lote_insumo_id;

comment on view gmp.v_registros_analisis is
  'Registros de análisis con quién controló y si siguen vigentes (no rectificados).';

-- ===========================================================================
-- Exigencias
-- ===========================================================================

-- ¿Hay un registro vigente con este dictamen?
create or replace function gmp.analisis_vigente(p_lote uuid, p_orden uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select r.aprobado
    from gmp.registros_analisis r
   where (r.lote_insumo_id = p_lote or r.orden_id = p_orden)
     and not exists (select 1 from gmp.registros_analisis x where x.rectifica_a = r.id)
   order by r.controlo_en desc
   limit 1;
$$;

-- Lote de insumo: la copia vigente (20260904190000) más la exigencia del
-- registro de análisis para aprobar o rechazar.
create or replace function gmp.fn_transicion_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transicion text;
  v_roles      core.rol_enum[];
  v_dictamen   boolean;
begin
  if new.estado = old.estado then
    return new;
  end if;

  v_transicion := old.estado::text || '>' || new.estado::text;

  v_roles := case v_transicion
    when 'RECIBIDO>CUARENTENA'    then array['OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION']::core.rol_enum[]
    when 'CUARENTENA>MUESTREADO'  then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    when 'MUESTREADO>EN_ANALISIS' then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    when 'EN_ANALISIS>APROBADO'   then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    when 'EN_ANALISIS>RECHAZADO'  then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    else null
  end;

  if v_roles is null then
    raise exception
      'Transición de estado no permitida: % → %. La máquina de estado de §5.1 solo admite el avance del circuito; '
      'la corrección de un estado terminal exige no conformidad (PG.60.18), no revertir el estado.',
      old.estado, new.estado
      using errcode = 'check_violation';
  end if;

  if not core.es_rol(variadic v_roles) then
    raise exception
      'Tu rol no puede llevar un lote de % a %. Según §3.3 esa transición es de: %.',
      old.estado, new.estado, array_to_string(v_roles, ', ')
      using errcode = 'insufficient_privilege';
  end if;

  if v_transicion = 'CUARENTENA>MUESTREADO'
     and not exists (
       select 1 from gmp.muestreos m
        where m.entidad_tipo = 'lote_insumo' and m.entidad_id = new.id
     ) then
    raise exception
      'No se puede marcar el lote como muestreado sin registrar el muestreo (I.50.4, §5.1). '
      'Usá el registro de muestreo, que además emite la etiqueta R.50.4.1 que exige RN-07.'
      using errcode = 'check_violation';
  end if;

  -- I.50.5 / I.50.6: aprobar o rechazar exige el registro de análisis con
  -- ese mismo dictamen.
  if v_transicion in ('EN_ANALISIS>APROBADO', 'EN_ANALISIS>RECHAZADO') then
    v_dictamen := gmp.analisis_vigente(new.id, null);
    if v_dictamen is null or v_dictamen <> (new.estado = 'APROBADO') then
      raise exception
        'Para % el lote hace falta su registro de análisis (R.50.5.1 o R.50.6.1) con ese dictamen.',
        case when new.estado = 'APROBADO' then 'aprobar' else 'rechazar' end
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Etapas de la orden: la copia vigente (20260930110000) más el granel.
create or replace function gmp.fn_op_etapa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado   gmp.estado_orden_enum;
  v_cc       boolean := new.etapa in ('CC_GRANEL', 'CC_PT');
  v_dictamen boolean;
  v_granel   gmp.op_etapas%rowtype;
begin
  select estado into v_estado from gmp.ordenes_produccion where id = new.orden_id;
  if (new.etapa = 'REVISION' and v_estado not in ('ABIERTA', 'TERMINADA'))
     or (new.etapa <> 'REVISION' and v_estado <> 'ABIERTA') then
    raise exception 'La orden está %: esa etapa ya no se registra.', lower(v_estado::text) using errcode = 'check_violation';
  end if;
  if v_cc and not core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') then
    raise exception 'El control de calidad lo registra Control de Calidad o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.etapa = 'REVISION' and not core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD') then
    raise exception 'La revisión del batch record es de Dirección Técnica o Control de Calidad.'
      using errcode = 'insufficient_privilege';
  end if;

  -- I.50.10: el control del granel se registra con su R.50.10.1, y el dictamen
  -- de la etapa es el del registro. «No aplica» (granel tercerizado) no lleva.
  if new.etapa = 'CC_GRANEL' and not coalesce((new.datos ->> 'no_aplica')::boolean, false) then
    v_dictamen := gmp.analisis_vigente(null, new.orden_id);
    if v_dictamen is null then
      raise exception 'El control del granel se registra con su registro de análisis R.50.10.1.'
        using errcode = 'check_violation';
    end if;
    if (new.datos ->> 'aprobado')::boolean is distinct from v_dictamen then
      raise exception 'El dictamen del granel tiene que ser el de su registro R.50.10.1.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- I.50.10: el granel espera la aprobación antes de fraccionarse.
  if new.etapa = 'FRACCIONAMIENTO' and tg_op = 'INSERT' then
    select * into v_granel from gmp.op_etapas where orden_id = new.orden_id and etapa = 'CC_GRANEL';
    if not found or not (
         coalesce((v_granel.datos ->> 'no_aplica')::boolean, false)
      or coalesce((v_granel.datos ->> 'aprobado')::boolean, false)
    ) then
      raise exception 'El granel no está aprobado: no se fracciona hasta su control de calidad (I.50.10).'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.controlo_por is not null then
      raise exception 'Una etapa se registra primero y se controla después.' using errcode = 'check_violation';
    end if;
    new.realizo_por := core.usuario_actual();
    new.realizo_en := now();
    return new;
  end if;

  if old.controlo_por is not null then
    raise exception 'La etapa % ya está controlada: no se modifica.', lower(old.etapa::text)
      using errcode = 'restrict_violation';
  end if;
  if new.realizo_por is distinct from old.realizo_por or new.realizo_en is distinct from old.realizo_en
     or new.etapa is distinct from old.etapa or new.orden_id is distinct from old.orden_id then
    raise exception 'Quién realizó la etapa y cuándo no cambian.' using errcode = 'restrict_violation';
  end if;
  if new.controlo_por is not null then
    new.controlo_por := core.usuario_actual();
    new.controlo_en := now();
    if new.datos is distinct from old.datos or new.observaciones is distinct from old.observaciones then
      raise exception 'Al controlar no se cambian los datos: corregí primero y controlá después.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- Un botón: registro + dictamen en la misma transacción
-- ===========================================================================

-- Lote de insumo o semielaborado: registra el análisis y lleva el lote a
-- APROBADO o RECHAZADO con su rótulo.
create or replace function gmp.dictaminar_lote_insumo(
  p_lote_id      uuid,
  p_tamano       text,
  p_descripcion  text,
  p_conclusiones text,
  p_aprobado     boolean
)
returns gmp.registros_analisis
language plpgsql
set search_path = ''
as $$
declare
  v_registro gmp.registros_analisis%rowtype;
begin
  insert into gmp.registros_analisis (lote_insumo_id, tamano_muestra, descripcion, conclusiones, aprobado)
  values (p_lote_id, btrim(p_tamano), btrim(p_descripcion), btrim(p_conclusiones), p_aprobado)
  returning * into v_registro;
  perform gmp.emitir_rotulo_lote_insumo(
    p_lote_id, case when p_aprobado then 'APROBADO' else 'RECHAZADO' end::gmp.estado_calidad_enum);
  return v_registro;
end;
$$;

-- Granel: registra el R.50.10.1 y la etapa CC_GRANEL con ese dictamen. Si la
-- etapa estaba registrada sin controlar, se corrige con el registro nuevo.
create or replace function gmp.dictaminar_granel(
  p_orden_id     uuid,
  p_tamano       text,
  p_descripcion  text,
  p_conclusiones text,
  p_aprobado     boolean,
  p_rectifica_a  uuid default null,
  p_motivo       text default null
)
returns gmp.registros_analisis
language plpgsql
set search_path = ''
as $$
declare
  v_registro gmp.registros_analisis%rowtype;
  v_datos    jsonb;
begin
  insert into gmp.registros_analisis (orden_id, tamano_muestra, descripcion, conclusiones, aprobado,
                                      rectifica_a, motivo)
  values (p_orden_id, btrim(p_tamano), btrim(p_descripcion), btrim(p_conclusiones), p_aprobado,
          p_rectifica_a, nullif(btrim(coalesce(p_motivo, '')), ''))
  returning * into v_registro;

  v_datos := jsonb_build_object('aprobado', p_aprobado, 'registro_analisis_id', v_registro.id);
  if exists (select 1 from gmp.op_etapas where orden_id = p_orden_id and etapa = 'CC_GRANEL') then
    update gmp.op_etapas set datos = v_datos
     where orden_id = p_orden_id and etapa = 'CC_GRANEL';
  else
    insert into gmp.op_etapas (orden_id, etapa, datos) values (p_orden_id, 'CC_GRANEL', v_datos);
  end if;
  return v_registro;
end;
$$;

-- ===========================================================================
-- RLS, grants, auditoría
-- ===========================================================================

alter table gmp.contadores_analisis enable row level security;
alter table gmp.contadores_analisis force  row level security;
alter table gmp.registros_analisis  enable row level security;
alter table gmp.registros_analisis  force  row level security;

grant select, insert, update on gmp.contadores_analisis to authenticated;
grant select, insert on gmp.registros_analisis to authenticated;
grant select on gmp.v_registros_analisis to authenticated;
grant execute on function gmp.analisis_vigente(uuid, uuid),
  gmp.dictaminar_lote_insumo(uuid, text, text, text, boolean),
  gmp.dictaminar_granel(uuid, text, text, text, boolean, uuid, text) to authenticated;

create policy contadores_analisis_calidad on gmp.contadores_analisis
  for all to authenticated
  using (core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA'))
  with check (core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA'));
comment on policy contadores_analisis_calidad on gmp.contadores_analisis is
  'Numeración de los registros de análisis sin huecos; la usa el trigger al registrar (RN-55 por analogía).';

create policy registros_analisis_select_authenticated on gmp.registros_analisis
  for select to authenticated using (core.rol() is not null);
comment on policy registros_analisis_select_authenticated on gmp.registros_analisis is
  '§3.3: consulta de registros y trazabilidad para todos los roles.';

create policy registros_analisis_insert_calidad on gmp.registros_analisis
  for insert to authenticated
  with check (core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') and controlo_por = core.usuario_actual());
comment on policy registros_analisis_insert_calidad on gmp.registros_analisis is
  'I.50.5, I.50.6, I.50.10: registra Control de Calidad o Dirección Técnica.';

select core.adjuntar_auditoria('gmp.contadores_analisis');
select core.adjuntar_auditoria('gmp.registros_analisis');

-- ---------------------------------------------------------------------------
-- Propósito : Tareas de planta. Gerencia de Producción puede (si quiere)
--             asignar una etapa de una orden a un operario o crear tareas
--             libres («Poner etiquetas a…»). Sin asignación, todos ven todo.
--             La base registra sola quién empezó y terminó y cuándo: los
--             horarios no se tipean. Si dos registran la misma etapa, vale el
--             primero y el segundo recibe un aviso con su nombre.
-- Reglas    : §4.7 (batch record), I.40.16, ME.40.x, RN-50, invariante 1.
--             Pedido del codirector técnico, 2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- QUÉ ES UNA TAREA. Dos clases en la misma tabla:
--   - de etapa (orden_id + etapa): el próximo paso de planta de una orden.
--     No hace falta crearla: la fila aparece cuando alguien la empieza o
--     cuando Producción la asigna. Se termina al registrar la etapa.
--   - libre (descripcion, orden opcional): lo que Producción quiera pedir.
--     Se termina con «Listo».
-- La tarea es organización del trabajo; el registro GMP sigue siendo la etapa
-- del batch record (op_etapas).
--
-- TAREAS DE A VARIOS. La carga uno solo (pedido del 2026-10-14): queda como
-- quien realizó.

create table gmp.tareas_planta (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid references gmp.ordenes_produccion(id),
  etapa         gmp.etapa_orden_enum,
  descripcion   text,
  asignada_a    uuid references core.usuarios(id),
  creada_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  creada_en     timestamptz not null default now(),
  iniciada_por  uuid references core.usuarios(id),
  iniciada_en   timestamptz,
  terminada_por uuid references core.usuarios(id),
  terminada_en  timestamptz,
  anulada       boolean not null default false,
  constraint tareas_planta_etapa_en_orden check (etapa is null or orden_id is not null),
  constraint tareas_planta_que_hacer check (etapa is not null or length(btrim(coalesce(descripcion, ''))) > 0),
  constraint tareas_planta_inicio check ((iniciada_por is null) = (iniciada_en is null)),
  constraint tareas_planta_fin check ((terminada_por is null) = (terminada_en is null))
);

comment on table gmp.tareas_planta is
  'Tareas de planta: etapa de una orden (asignada o empezada) o tarea libre de Producción. Asignar es opcional: '
  'sin asignación la ve todo el personal de planta. Inicio y fin los pone la base.';

create unique index tareas_planta_etapa_unica
  on gmp.tareas_planta (orden_id, etapa) where etapa is not null and not anulada;

create or replace function gmp.fn_tarea_planta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_gestor boolean := core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA');
begin
  if tg_op = 'INSERT' then
    new.creada_por := core.usuario_actual();
    new.creada_en := now();
    if not v_gestor and (new.asignada_a is not null or new.etapa is null) then
      raise exception 'Asignar o crear tareas es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
    end if;
    if new.iniciada_en is not null then
      new.iniciada_por := core.usuario_actual();
      new.iniciada_en := now();
    end if;
    new.terminada_por := null;
    new.terminada_en := null;
    return new;
  end if;

  if (new.orden_id, new.etapa, new.creada_por, new.creada_en)
     is distinct from (old.orden_id, old.etapa, old.creada_por, old.creada_en) then
    raise exception 'Qué tarea es y quién la creó no cambian.' using errcode = 'restrict_violation';
  end if;
  if (new.asignada_a, new.descripcion, new.anulada) is distinct from (old.asignada_a, old.descripcion, old.anulada)
     and not v_gestor then
    raise exception 'Asignar, cambiar o quitar tareas es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;

  -- Inicio y fin: una vez, con quien lo hace y la hora del servidor.
  if old.iniciada_en is not null then
    new.iniciada_por := old.iniciada_por;
    new.iniciada_en := old.iniciada_en;
  elsif new.iniciada_en is not null then
    new.iniciada_por := core.usuario_actual();
    new.iniciada_en := now();
  end if;
  if old.terminada_en is not null then
    new.terminada_por := old.terminada_por;
    new.terminada_en := old.terminada_en;
  elsif new.terminada_en is not null then
    new.terminada_por := core.usuario_actual();
    new.terminada_en := now();
    if new.iniciada_en is null then
      new.iniciada_por := new.terminada_por;
      new.iniciada_en := new.terminada_en;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_tarea_planta
  before insert or update on gmp.tareas_planta
  for each row execute function gmp.fn_tarea_planta();

-- Empezar la etapa de una orden: registra el inicio la primera vez (si ya la
-- empezó otro, devuelve esa). La hora de inicio del batch record sale de acá.
create or replace function gmp.empezar_etapa(p_orden_id uuid, p_etapa gmp.etapa_orden_enum)
returns gmp.tareas_planta
language plpgsql
set search_path = ''
as $$
declare
  v_tarea gmp.tareas_planta%rowtype;
begin
  select * into v_tarea from gmp.tareas_planta
   where orden_id = p_orden_id and etapa = p_etapa and not anulada
   for update;
  if not found then
    insert into gmp.tareas_planta (orden_id, etapa, iniciada_en)
    values (p_orden_id, p_etapa, now())
    returning * into v_tarea;
  elsif v_tarea.iniciada_en is null then
    update gmp.tareas_planta set iniciada_en = now() where id = v_tarea.id returning * into v_tarea;
  end if;
  return v_tarea;
end;
$$;

-- Asignar (o desasignar con null) la etapa de una orden.
create or replace function gmp.asignar_etapa(p_orden_id uuid, p_etapa gmp.etapa_orden_enum, p_usuario uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update gmp.tareas_planta set asignada_a = p_usuario
   where orden_id = p_orden_id and etapa = p_etapa and not anulada;
  if not found then
    insert into gmp.tareas_planta (orden_id, etapa, asignada_a) values (p_orden_id, p_etapa, p_usuario);
  end if;
end;
$$;

-- Tarea libre: empezar y terminar.
create or replace function gmp.empezar_tarea(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update gmp.tareas_planta set iniciada_en = now() where id = p_id and not anulada;
end;
$$;

create or replace function gmp.terminar_tarea(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update gmp.tareas_planta set terminada_en = now() where id = p_id and not anulada;
  if not found then
    raise exception 'La tarea no existe o fue quitada.';
  end if;
end;
$$;

-- Etapas: la de 20261014170100 más «vale el primero» con aviso legible.
create or replace function gmp.fn_op_etapa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado   gmp.estado_orden_enum;
  v_cc       boolean := new.etapa in ('CC_GRANEL', 'CC_PT');
  v_dictamen boolean;
  v_previa   gmp.op_etapas%rowtype;
  v_nombre   text;
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

  if tg_op = 'INSERT' then
    -- Dos personas hicieron la misma etapa: vale la primera (pedido del
    -- 2026-10-14). El segundo intento se rechaza diciendo quién la registró.
    select * into v_previa from gmp.op_etapas where orden_id = new.orden_id and etapa = new.etapa;
    if found then
      select nombre_completo into v_nombre from core.v_nomina where id = v_previa.realizo_por;
      raise exception 'Esta etapa ya la registró % a las %: vale el primer registro.',
        coalesce(v_nombre, 'otra persona'),
        to_char(v_previa.realizo_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI')
        using errcode = 'unique_violation';
    end if;
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

-- RLS, grants, auditoría
alter table gmp.tareas_planta enable row level security;
alter table gmp.tareas_planta force  row level security;

-- Sin DELETE: una tarea se quita con anulada.
grant select, insert, update on gmp.tareas_planta to authenticated;
grant execute on function gmp.empezar_etapa(uuid, gmp.etapa_orden_enum),
  gmp.asignar_etapa(uuid, gmp.etapa_orden_enum, uuid),
  gmp.empezar_tarea(uuid), gmp.terminar_tarea(uuid) to authenticated;

create policy tareas_planta_select_authenticated on gmp.tareas_planta
  for select to authenticated using (core.rol() is not null);
comment on policy tareas_planta_select_authenticated on gmp.tareas_planta is
  '§3.3: consulta para todos los roles. Qué ve cada operario lo filtra la pantalla (asignada o sin asignar).';

create policy tareas_planta_insert_planta on gmp.tareas_planta
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA', 'OPERARIO'));
comment on policy tareas_planta_insert_planta on gmp.tareas_planta is
  'Planta empieza etapas; asignar y crear tareas libres es de Producción (trigger).';

create policy tareas_planta_update_planta on gmp.tareas_planta
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA', 'OPERARIO'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA', 'OPERARIO'));
comment on policy tareas_planta_update_planta on gmp.tareas_planta is
  'Empezar y terminar: planta. Asignar, cambiar y quitar: Producción (trigger).';

select core.adjuntar_auditoria('gmp.tareas_planta');

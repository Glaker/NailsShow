-- ---------------------------------------------------------------------------
-- Propósito : «Tareas»: matriz de Eisenhower del equipo. Cualquiera (salvo
--             operarios) carga una tarea como punto en la matriz, común (la
--             ven y la mueven todos) o propia (solo quien la cargó). Se mueve
--             arrastrando: la posición es urgencia × importancia.
-- Reglas    : RN-50 (auditoría), invariante 3 (RLS forzada). No es un
--             registro GMP: es organización del trabajo, vive en comercial.
--             Pedido del codirector técnico, 2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- POSICIÓN. pos_x de 0 (urgente, izquierda) a 1 (no urgente); pos_y de 0
-- (importante, arriba) a 1 (no importante). Los cuadrantes salen de ahí: no se
-- guardan aparte, porque el punto puede ir en cualquier lugar.
--
-- NO SE BORRA. Una tarea se marca hecha o se archiva (quien la cargó); la
-- fila queda, como todo lo que pasa por la auditoría.

create table comercial.tareas_equipo (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (length(btrim(titulo)) between 1 and 120),
  detalle      text,
  compartida   boolean not null default true,
  pos_x        numeric(5,4) not null default 0.5 check (pos_x between 0 and 1),
  pos_y        numeric(5,4) not null default 0.5 check (pos_y between 0 and 1),
  creada_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  creada_en    timestamptz not null default now(),
  movida_por   uuid references core.usuarios(id),
  movida_en    timestamptz,
  hecha_por    uuid references core.usuarios(id),
  hecha_en     timestamptz,
  archivada    boolean not null default false,
  constraint tareas_equipo_hecha check ((hecha_por is null) = (hecha_en is null))
);

comment on table comercial.tareas_equipo is
  'Matriz de Eisenhower del equipo («Tareas»). pos_x: urgencia (0 urgente), pos_y: importancia (0 importante). '
  'Común: la ven y la mueven todos salvo operarios. Propia: solo quien la cargó. No se borra: hecha o archivada.';

create index tareas_equipo_activas_idx on comercial.tareas_equipo (creada_en) where not archivada and hecha_en is null;

create or replace function comercial.fn_tarea_equipo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_yo uuid := core.usuario_actual();
begin
  if tg_op = 'INSERT' then
    new.creada_por := v_yo;
    new.creada_en := now();
    new.movida_por := null;
    new.movida_en := null;
    new.hecha_por := null;
    new.hecha_en := null;
    new.archivada := false;
    return new;
  end if;

  if (new.creada_por, new.creada_en) is distinct from (old.creada_por, old.creada_en) then
    raise exception 'Quién cargó la tarea y cuándo no cambian.' using errcode = 'restrict_violation';
  end if;
  -- Texto, visibilidad y archivo: solo quien la cargó. Moverla o marcarla
  -- hecha: cualquiera que la vea.
  if (new.titulo, new.detalle, new.compartida, new.archivada)
     is distinct from (old.titulo, old.detalle, old.compartida, old.archivada)
     and old.creada_por is distinct from v_yo then
    raise exception 'Solo quien cargó la tarea puede cambiar su texto, hacerla propia o archivarla.'
      using errcode = 'insufficient_privilege';
  end if;
  if (new.pos_x, new.pos_y) is distinct from (old.pos_x, old.pos_y) then
    new.movida_por := v_yo;
    new.movida_en := now();
  else
    new.movida_por := old.movida_por;
    new.movida_en := old.movida_en;
  end if;
  if old.hecha_en is not null then
    new.hecha_por := old.hecha_por;
    new.hecha_en := old.hecha_en;
  elsif new.hecha_en is not null then
    new.hecha_por := v_yo;
    new.hecha_en := now();
  end if;
  return new;
end;
$$;

create trigger trg_tarea_equipo
  before insert or update on comercial.tareas_equipo
  for each row execute function comercial.fn_tarea_equipo();

alter table comercial.tareas_equipo enable row level security;
alter table comercial.tareas_equipo force  row level security;

-- Sin DELETE: se archiva.
grant select, insert on comercial.tareas_equipo to authenticated;
grant update (titulo, detalle, compartida, pos_x, pos_y, hecha_en, archivada) on comercial.tareas_equipo to authenticated;

create policy tareas_equipo_select_equipo on comercial.tareas_equipo
  for select to authenticated
  using (core.rol() is not null and core.rol() <> 'OPERARIO'
         and (compartida or creada_por = core.usuario_actual()));
comment on policy tareas_equipo_select_equipo on comercial.tareas_equipo is
  'Todos salvo operarios ven las comunes y las propias (pedido del 2026-10-14).';

create policy tareas_equipo_insert_equipo on comercial.tareas_equipo
  for insert to authenticated
  with check (core.rol() is not null and core.rol() <> 'OPERARIO' and creada_por = core.usuario_actual());
comment on policy tareas_equipo_insert_equipo on comercial.tareas_equipo is
  'Carga cualquiera salvo operarios, a su nombre.';

create policy tareas_equipo_update_equipo on comercial.tareas_equipo
  for update to authenticated
  using (core.rol() is not null and core.rol() <> 'OPERARIO'
         and (compartida or creada_por = core.usuario_actual()))
  with check (core.rol() is not null and core.rol() <> 'OPERARIO'
              and (compartida or creada_por = core.usuario_actual()));
comment on policy tareas_equipo_update_equipo on comercial.tareas_equipo is
  'Mueve quien la ve; el texto y el archivo, solo quien la cargó (trigger).';

select core.adjuntar_auditoria('comercial.tareas_equipo');

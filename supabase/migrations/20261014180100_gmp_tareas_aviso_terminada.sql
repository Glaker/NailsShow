-- ---------------------------------------------------------------------------
-- Propósito : Aviso a Gerencia de Producción cuando planta termina una tarea.
--               1. visto_por / visto_en: Producción marca que ya lo vio; hasta
--                  entonces le aparece el puntito de aviso.
--               2. Registrar una etapa de planta (pesada, elaboración,
--                  fraccionamiento) termina su tarea sola, con quien la
--                  registró y la hora del servidor.
-- Reglas    : §4.7. Pedido del codirector técnico, 2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------

alter table gmp.tareas_planta
  add column visto_por uuid references core.usuarios(id),
  add column visto_en  timestamptz,
  add constraint tareas_planta_visto check ((visto_por is null) = (visto_en is null));

comment on column gmp.tareas_planta.visto_en is
  'Cuándo Producción vio que la tarea terminó. NULL con terminada_en = aviso pendiente.';

-- La de 20261014180000 más el «visto», una vez y solo Producción.
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
    if new.terminada_en is not null then
      new.terminada_por := core.usuario_actual();
      new.terminada_en := now();
      new.iniciada_por := coalesce(new.iniciada_por, new.terminada_por);
      new.iniciada_en := coalesce(new.iniciada_en, new.terminada_en);
    end if;
    new.visto_por := null;
    new.visto_en := null;
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

  if old.visto_en is not null then
    new.visto_por := old.visto_por;
    new.visto_en := old.visto_en;
  elsif new.visto_en is not null then
    if not v_gestor then
      raise exception 'Marcar como visto es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
    end if;
    new.visto_por := core.usuario_actual();
    new.visto_en := now();
  end if;
  return new;
end;
$$;

create or replace function gmp.marcar_tarea_vista(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update gmp.tareas_planta set visto_en = now() where id = p_id;
end;
$$;

grant execute on function gmp.marcar_tarea_vista(uuid) to authenticated;

-- Registrar una etapa de planta termina su tarea (la crea si nadie la había
-- empezado, para que el aviso diga quién la hizo).
create or replace function gmp.fn_op_etapa_termina_tarea()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.etapa not in ('PESADA', 'ELABORACION', 'FRACCIONAMIENTO') then
    return new;
  end if;
  update gmp.tareas_planta set terminada_en = now()
   where orden_id = new.orden_id and etapa = new.etapa and not anulada and terminada_en is null;
  if not found and not exists (
    select 1 from gmp.tareas_planta where orden_id = new.orden_id and etapa = new.etapa and not anulada
  ) then
    insert into gmp.tareas_planta (orden_id, etapa, terminada_en) values (new.orden_id, new.etapa, now());
  end if;
  return new;
end;
$$;

create trigger trg_op_etapa_termina_tarea
  after insert on gmp.op_etapas
  for each row execute function gmp.fn_op_etapa_termina_tarea();

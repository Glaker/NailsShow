-- ---------------------------------------------------------------------------
-- Propósito : Planificación de la producción: el día en que Gerencia de
--             Producción empieza a producir cada pedido y cuántos días le
--             lleva, para el calendario y el diagrama de Gantt.
-- Reglas    : RN-50 (auditoría: cada replanificación queda con autor y valor
--             anterior en core.auditoria). Ítem 11 de la cola del 2026-09-24.
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- Es un dato operativo, no un registro regulado: se corrige pisándolo, y la
-- historia queda en la auditoría genérica. Días corridos: el calendario de
-- días hábiles de planta no está definido (queda para cuando se pida).

alter table comercial.pedidos
  add column plan_inicio date,
  add column plan_dias   integer check (plan_dias between 1 and 60),
  add constraint pedidos_plan_completo check ((plan_inicio is null) = (plan_dias is null));

comment on column comercial.pedidos.plan_inicio is
  'Día planificado para empezar a producir el pedido (Gerencia de Producción).';
comment on column comercial.pedidos.plan_dias is
  'Días corridos de producción planificados, desde plan_inicio.';

-- Planifica Producción: los demás roles que editan pedidos no mueven el plan.
create or replace function comercial.fn_pedido_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.plan_inicio, new.plan_dias) is not distinct from (old.plan_inicio, old.plan_dias) then
    return new;
  end if;
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'La planificación de la producción es de Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;
  if old.estado not in ('BORRADOR', 'CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'El pedido % está %: ya no se planifica.', old.numero, lower(old.estado::text)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_pedido_plan
  before update on comercial.pedidos
  for each row execute function comercial.fn_pedido_plan();

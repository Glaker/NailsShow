-- ---------------------------------------------------------------------------
-- Propósito : Una orden de producción abierta sin especificación (Naza ya no
--             la elige: la toma de la fórmula si la tiene) la completa
--             Dirección Técnica después, desde su tablero. Solo de vacía a
--             una vigente o en borrador, y mientras la orden no se liberó,
--             rechazó ni anuló. Lo demás de la orden sigue sin cambiar.
-- Reglas    : D-orden-producto-1 (codirector técnico, 2026-10-27). §4.7: la
--             especificación es contra la que se controla el producto
--             terminado; RN-50 (queda en core.auditoria con el valor
--             anterior, vacío).
-- Fecha     : 2026-10-27
-- ---------------------------------------------------------------------------

-- Copia de 20261016120000 con la especificación liberada dentro de
-- gmp.asignar_especificacion_orden.
create or replace function gmp.fn_orden_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_falta text;
  -- D-orden-producto-1: la especificación que faltaba la completa DT, solo
  -- dentro de gmp.asignar_especificacion_orden (de vacía a una).
  v_libres text[] := array['estado','cantidad_obtenida','unidades_obtenidas','observaciones','terminada_por',
                           'terminada_en','liberada_por','liberada_en','motivo_cierre']
                     || case when coalesce(current_setting('gmp.asignando_especificacion', true), '') = old.id::text
                              and old.especificacion_id is null
                             then array['especificacion_id'] else '{}'::text[] end;
begin
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'El número, el lote y el vencimiento de la orden % no cambian.', old.numero
      using errcode = 'restrict_violation';
  end if;
  if old.estado in ('LIBERADA', 'RECHAZADA', 'ANULADA') then
    raise exception 'La orden % está %: no se modifica.', old.numero, lower(old.estado::text)
      using errcode = 'restrict_violation';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'ABIERTA'   and new.estado in ('TERMINADA', 'ANULADA'))
    or (old.estado = 'TERMINADA' and new.estado in ('LIBERADA', 'RECHAZADA'))
  ) then
    raise exception 'Una orden no pasa de % a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;

  -- Firmas: solo las pone la transición.
  new.terminada_por := old.terminada_por;
  new.terminada_en  := old.terminada_en;
  new.liberada_por  := old.liberada_por;
  new.liberada_en   := old.liberada_en;

  if new.estado = 'TERMINADA' and old.estado = 'ABIERTA' then
    if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
      raise exception 'Termina la orden Gerencia de Producción.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'FRACCIONAMIENTO') then
      raise exception 'Falta registrar el fraccionamiento.' using errcode = 'check_violation';
    end if;
    new.terminada_por := core.usuario_actual();
    new.terminada_en  := now();
  end if;

  if new.estado in ('LIBERADA', 'RECHAZADA') and old.estado = 'TERMINADA' then
    if not core.es_rol('DIRECCION_TECNICA') then
      raise exception 'Libera o rechaza el lote Dirección Técnica.' using errcode = 'insufficient_privilege';
    end if;
    if new.estado = 'LIBERADA' then
      select string_agg(lower(etapa::text) || ' ' || falta, ', ') into v_falta
        from gmp.faltantes_liberacion(new.id);
      if v_falta is not null then
        raise exception 'Todavía no se puede liberar: %.', v_falta using errcode = 'check_violation';
      end if;
      if exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'CC_GRANEL'
                  and not coalesce((datos ->> 'no_aplica')::boolean, false)
                  and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
        raise exception 'El granel no está aprobado en su registro R.50.10.1: el lote no se libera.'
          using errcode = 'check_violation';
      end if;
      if exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'CC_PT'
                  and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
        raise exception 'El control de calidad del producto terminado no está aprobado.'
          using errcode = 'check_violation';
      end if;
    end if;
    new.liberada_por := core.usuario_actual();
    new.liberada_en  := now();
  end if;

  return new;
end;
$$;

create or replace function gmp.asignar_especificacion_orden(p_orden_id uuid, p_especificacion_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden gmp.ordenes_produccion%rowtype;
begin
  if not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'La especificación de una orden la asigna Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe.';
  end if;
  if v_orden.especificacion_id is not null then
    raise exception 'La orden % ya tiene especificación.', v_orden.numero using errcode = 'check_violation';
  end if;
  if v_orden.estado not in ('ABIERTA', 'TERMINADA') then
    raise exception 'La orden % está %: no se le asigna especificación.', v_orden.numero, lower(v_orden.estado::text)
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from gmp.especificaciones
                  where id = p_especificacion_id and estado in ('VIGENTE', 'BORRADOR')) then
    raise exception 'Elegí una especificación vigente o en borrador.' using errcode = 'check_violation';
  end if;
  perform set_config('gmp.asignando_especificacion', p_orden_id::text, true);
  update gmp.ordenes_produccion set especificacion_id = p_especificacion_id where id = p_orden_id;
  perform set_config('gmp.asignando_especificacion', '', true);
end;
$$;

comment on function gmp.asignar_especificacion_orden(uuid, uuid) is
  'DT completa la especificación de una orden que se abrió sin ella (D-orden-producto-1).';
revoke execute on function gmp.asignar_especificacion_orden(uuid, uuid) from public, anon;
grant execute on function gmp.asignar_especificacion_orden(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Propósito : Rectificar una etapa ya controlada de una orden de producción.
--             La etapa controlada no se edita (invariante 1): la rectificación
--             es un registro nuevo que apunta al original, guarda los datos
--             anteriores, los nuevos, quién, cuándo y por qué. La liberación
--             lee los datos vigentes (la última rectificación, o el original).
-- Reglas    : Invariante 1 de CLAUDE.md (corrección por registro rectificativo),
--             RN-50 (auditado). Caso del 2026-11-20: OP-2026-0028 con el
--             control de producto terminado marcado «no aplica» por error; la
--             DT no podía aprobarlo ni liberar el lote. D-rectificar-etapa-1.
-- Fecha     : 2026-11-20
-- ---------------------------------------------------------------------------
--
-- El control del granel (CC_GRANEL) no se rectifica por acá: su dictamen sale
-- del registro de análisis R.50.10.1, que tiene su propio circuito.

-- ===========================================================================
-- 1. Rectificaciones
-- ===========================================================================

create table gmp.op_etapas_rectificaciones (
  id                       uuid primary key default gen_random_uuid(),
  orden                    bigint generated always as identity,
  etapa_id                 uuid not null references gmp.op_etapas(id),
  datos_anteriores         jsonb not null,
  observaciones_anteriores text,
  datos                    jsonb not null,
  observaciones            text,
  motivo                   text not null check (btrim(motivo) <> ''),
  rectifico_por            uuid not null references core.usuarios(id) default core.usuario_actual(),
  rectifico_en             timestamptz not null default now()
);

comment on table gmp.op_etapas_rectificaciones is
  'Rectificación de una etapa controlada (invariante 1, D-rectificar-etapa-1): registro nuevo que apunta al '
  'original con los datos anteriores y los nuevos. Vale la última. Append-only: se carga con gmp.rectificar_etapa.';

create index op_etapas_rectificaciones_etapa_idx on gmp.op_etapas_rectificaciones (etapa_id, orden desc);
create index op_etapas_rectificaciones_rectifico_por_idx on gmp.op_etapas_rectificaciones (rectifico_por);

alter table gmp.op_etapas_rectificaciones enable row level security;
alter table gmp.op_etapas_rectificaciones force  row level security;
grant select on gmp.op_etapas_rectificaciones to authenticated;

-- Sin políticas de escritura: se cargan solo con gmp.rectificar_etapa.
create policy op_etapas_rectificaciones_select_authenticated on gmp.op_etapas_rectificaciones
  for select to authenticated using (core.rol() is not null);
comment on policy op_etapas_rectificaciones_select_authenticated on gmp.op_etapas_rectificaciones is
  'Todo usuario interno ve las rectificaciones, como las etapas. RN-50: se escriben solo por función, auditadas.';

select core.adjuntar_auditoria('gmp.op_etapas_rectificaciones');

create function gmp.fn_rectificacion_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Una rectificación no se modifica: si está mal, se rectifica de nuevo.'
    using errcode = 'restrict_violation';
end;
$$;
create trigger trg_op_etapas_rectificaciones_inmutable before update on gmp.op_etapas_rectificaciones
  for each row execute function gmp.fn_rectificacion_inmutable();

-- Los datos que valen de una etapa: la última rectificación, o los originales.
create function gmp.datos_vigentes(p_etapa_id uuid, p_datos jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce((select r.datos from gmp.op_etapas_rectificaciones r
                    where r.etapa_id = p_etapa_id order by r.orden desc limit 1),
                  p_datos);
$$;
comment on function gmp.datos_vigentes(uuid, jsonb) is
  'Datos vigentes de una etapa (D-rectificar-etapa-1): los de la última rectificación, o los originales.';
revoke execute on function gmp.datos_vigentes(uuid, jsonb) from public, anon;
grant execute on function gmp.datos_vigentes(uuid, jsonb) to authenticated;

create function gmp.rectificar_etapa(p_etapa_id uuid, p_datos jsonb, p_observaciones text, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etapa  gmp.op_etapas%rowtype;
  v_estado gmp.estado_orden_enum;
  v_id     uuid;
  v_ultima gmp.op_etapas_rectificaciones%rowtype;
begin
  select * into v_etapa from gmp.op_etapas where id = p_etapa_id for update;
  if not found then
    raise exception 'La etapa no existe.';
  end if;
  -- Calidad rectifica sus controles; el resto, Dirección Técnica.
  if v_etapa.etapa in ('CC_PT') then
    if not core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') then
      raise exception 'El control de calidad lo rectifica Control de Calidad o Dirección Técnica.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'Rectifica una etapa controlada Dirección Técnica.' using errcode = 'insufficient_privilege';
  end if;
  if v_etapa.etapa = 'CC_GRANEL' then
    raise exception 'El control del granel se corrige con un nuevo registro de análisis R.50.10.1.'
      using errcode = 'check_violation';
  end if;
  if v_etapa.controlo_por is null then
    raise exception 'La etapa todavía no está controlada: corregila directamente.' using errcode = 'check_violation';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Escribí el motivo de la rectificación.' using errcode = 'check_violation';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos de la rectificación no son válidos.' using errcode = 'check_violation';
  end if;
  select estado into v_estado from gmp.ordenes_produccion where id = v_etapa.orden_id;
  if v_estado not in ('ABIERTA', 'TERMINADA') then
    raise exception 'La orden está %: sus etapas ya no se rectifican.', lower(v_estado::text)
      using errcode = 'check_violation';
  end if;

  select * into v_ultima from gmp.op_etapas_rectificaciones
   where etapa_id = p_etapa_id order by orden desc limit 1;
  insert into gmp.op_etapas_rectificaciones
    (etapa_id, datos_anteriores, observaciones_anteriores, datos, observaciones, motivo)
  values (p_etapa_id,
          coalesce(v_ultima.datos, v_etapa.datos),
          case when v_ultima.id is null then v_etapa.observaciones else v_ultima.observaciones end,
          p_datos, nullif(btrim(p_observaciones), ''), btrim(p_motivo))
  returning id into v_id;
  return v_id;
end;
$$;

comment on function gmp.rectificar_etapa(uuid, jsonb, text, text) is
  'Rectifica una etapa controlada de una orden abierta o terminada (D-rectificar-etapa-1): registro nuevo con los '
  'datos anteriores, los nuevos y el motivo. El control de PT, Calidad o DT; el resto, DT. El granel, no.';
revoke execute on function gmp.rectificar_etapa(uuid, jsonb, text, text) from public, anon;
grant execute on function gmp.rectificar_etapa(uuid, jsonb, text, text) to authenticated;

-- ===========================================================================
-- 2. La liberación lee los datos vigentes del control de producto terminado
-- ===========================================================================

-- Copia de la vigente (20261102120000). Cambio: CC_PT con gmp.datos_vigentes.
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
  -- D-liberar-antes-1: liberada antes de terminar el envasado, la orden
  -- admite un único cambio más: el cierre del envasado, que deja lo obtenido
  -- y quién lo cerró. Solo desde comercial.registrar_tanda.
  if old.estado = 'LIBERADA' and new.estado = 'LIBERADA' and old.terminada_en is null
     and coalesce(current_setting('gmp.cerrando_envasado', true), '') = old.id::text then
    if (to_jsonb(new) - array['cantidad_obtenida','unidades_obtenidas','terminada_por','terminada_en'])
       is distinct from (to_jsonb(old) - array['cantidad_obtenida','unidades_obtenidas','terminada_por','terminada_en']) then
      raise exception 'Al cerrar el envasado de la orden % solo se carga lo obtenido.', old.numero
        using errcode = 'restrict_violation';
    end if;
    new.terminada_por := core.usuario_actual();
    new.terminada_en  := now();
    return new;
  end if;
  if old.estado in ('LIBERADA', 'RECHAZADA', 'ANULADA') then
    raise exception 'La orden % está %: no se modifica.', old.numero, lower(old.estado::text)
      using errcode = 'restrict_violation';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'ABIERTA'   and new.estado in ('TERMINADA', 'ANULADA', 'LIBERADA', 'RECHAZADA'))
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

  -- D-liberar-antes-1: también desde ABIERTA, con los mismos requisitos.
  if new.estado in ('LIBERADA', 'RECHAZADA') and old.estado in ('ABIERTA', 'TERMINADA') then
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
      -- NUEVO (D-rectificar-etapa-1): los datos vigentes, rectificación incluida.
      if exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'CC_PT'
                  and coalesce((gmp.datos_vigentes(id, datos) ->> 'aprobado')::boolean, false) is false) then
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

-- Copia de la vigente (20261027150000). Cambio: CC_PT con gmp.datos_vigentes.
create or replace function gmp.liberar_orden(p_id uuid, p_aprobado boolean, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_falta text;
begin
  if not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'Libera o rechaza el lote Dirección Técnica.' using errcode = 'insufficient_privilege';
  end if;
  if p_aprobado then
    select string_agg(lower(etapa::text) || ' ' || falta, ', ') into v_falta from gmp.faltantes_liberacion(p_id);
    if v_falta is not null then
      raise exception 'Todavía no se puede liberar: %.', v_falta using errcode = 'check_violation';
    end if;
    if exists (select 1 from gmp.op_etapas where orden_id = p_id and etapa = 'CC_GRANEL'
                and not coalesce((datos ->> 'no_aplica')::boolean, false)
                and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
      raise exception 'El granel no está aprobado en su registro R.50.10.1: el lote no se libera.'
        using errcode = 'check_violation';
    end if;
    -- NUEVO (D-rectificar-etapa-1): los datos vigentes, rectificación incluida.
    if exists (select 1 from gmp.op_etapas where orden_id = p_id and etapa = 'CC_PT'
                and coalesce((gmp.datos_vigentes(id, datos) ->> 'aprobado')::boolean, false) is false) then
      raise exception 'El control de calidad del producto terminado no está aprobado.' using errcode = 'check_violation';
    end if;
  end if;
  update gmp.ordenes_produccion
     set estado = case when p_aprobado then 'LIBERADA' else 'RECHAZADA' end::gmp.estado_orden_enum,
         liberada_por = core.usuario_actual(), liberada_en = now(),
         motivo_cierre = nullif(btrim(p_motivo), '')
   where id = p_id;
  if not found then
    raise exception 'La orden no existe.';
  end if;
end;
$$;

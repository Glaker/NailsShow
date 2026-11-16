-- ---------------------------------------------------------------------------
-- Propósito : Hada, topes por usuario y reserva del escalado a Sonnet. Cierra
--             tres agujeros de la auditoría de seguridad de P6:
--             1. El tope en USD era solo global: un cliente que fuerza el
--                escalado a Sonnet agotaba el tope diario de todos. Ahora hay
--                tope diario en USD por usuario y límite de escalados por día.
--             2. reserva_usd (0,002) subestima una interacción escalada: una
--                ráfaga concurrente pasaba el tope antes de registrar el gasto.
--                hada_escalar() reserva el costo de Sonnet ANTES de llamarlo,
--                bajo el mismo lock que hada_reservar().
--             3. Si Sonnet fallaba o el cliente abortaba, el cierre bajaba el
--                costo al de Haiku o al de reserva. Ahora hada_cerrar nunca baja
--                lo reservado con tokens 0 o con error.
-- Reglas    : P6 (docs/disenos/P6-hada.md §1.4), RN-50, D-hada-1 (límites y
--             topes), D-61 (escalado a un modelo mayor, como Giorgio).
-- Fecha     : 2026-11-16
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Configuración y registro
-- ===========================================================================

alter table comercial.hada_config
  add column tope_diario_usuario_usd numeric(10, 2) not null default 0.15
    check (tope_diario_usuario_usd > 0),
  add column limite_escalados_dia integer not null default 10
    check (limite_escalados_dia >= 0),
  -- Lo que cuenta una interacción escalada a Sonnet que todavía no se cerró.
  add column reserva_experto_usd numeric(10, 6) not null default 0.05
    check (reserva_experto_usd > 0);

-- Mismo criterio que 20261113220100: por columna, nunca clave_sha256.
grant select (tope_diario_usuario_usd, limite_escalados_dia, reserva_experto_usd)
  on comercial.hada_config to authenticated;
grant update (tope_diario_usuario_usd, limite_escalados_dia, reserva_experto_usd)
  on comercial.hada_config to authenticated;

alter table comercial.hada_interacciones
  add column escalado_en timestamptz;

comment on column comercial.hada_interacciones.escalado_en is
  'P6, D-61: cuándo hada_escalar() reservó el costo de Sonnet. Nulo = no escaló.';

-- ===========================================================================
-- 2. Reservar: suma el tope por usuario y devuelve los escalados que quedan
-- ===========================================================================

create or replace function comercial.hada_reservar(p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario   uuid := core.usuario_actual();
  v_cfg       comercial.hada_config;
  v_demo      boolean;
  v_ahora     timestamptz := now();
  v_desde_dia timestamptz :=
    (v_ahora at time zone 'America/Argentina/Buenos_Aires')::date::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_desde_mes timestamptz :=
    date_trunc('month', v_ahora at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
  v_min       integer;
  v_dia       integer;
  v_esc       integer;
  v_gasto_usr numeric;
  v_gasto_dia numeric;
  v_gasto_mes numeric;
  v_motivo    text;
  v_id        uuid;
begin
  if v_usuario is null or not comercial.cliente_ve_lista() then
    raise exception 'Hada es solo para clientes.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cfg from comercial.hada_config limit 1;
  if not found
     or v_cfg.clave_sha256 is null
     or p_clave is null
     or sha256(convert_to(p_clave, 'UTF8')) <> v_cfg.clave_sha256 then
    raise exception 'Hada no autorizada.' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('comercial.hada'));

  v_demo := comercial.cliente_actual() is null;

  select count(*) filter (where creado_en > v_ahora - interval '60 seconds'),
         count(*) filter (where creado_en >= v_desde_dia),
         count(*) filter (where escalado_en >= v_desde_dia),
         coalesce(sum(costo_usd) filter (where creado_en >= v_desde_dia), 0)
    into v_min, v_dia, v_esc, v_gasto_usr
    from comercial.hada_interacciones
   where usuario_id = v_usuario and creado_en >= v_desde_dia - interval '1 minute';

  select coalesce(sum(costo_usd) filter (where creado_en >= v_desde_dia), 0), coalesce(sum(costo_usd), 0)
    into v_gasto_dia, v_gasto_mes
    from comercial.hada_interacciones
   where creado_en >= v_desde_mes;

  v_motivo := case
    when not v_cfg.activo then 'APAGADO'
    when v_demo and v_cfg.limite_dia_demo = 0 then 'APAGADO'
    when v_gasto_mes + v_cfg.reserva_usd > v_cfg.tope_mensual_usd then 'TOPE'
    when v_gasto_dia + v_cfg.reserva_usd > v_cfg.tope_diario_usd then 'TOPE'
    when v_gasto_usr + v_cfg.reserva_usd > v_cfg.tope_diario_usuario_usd then 'TOPE_USUARIO'
    when v_min >= v_cfg.limite_minuto then 'LIMITE_MINUTO'
    when v_dia >= case when v_demo then v_cfg.limite_dia_demo else v_cfg.limite_dia end then 'LIMITE_DIA'
  end;
  if v_motivo is not null then
    return jsonb_build_object('permitido', false, 'motivo', v_motivo);
  end if;

  insert into comercial.hada_interacciones (usuario_id, es_demo, costo_usd)
  values (v_usuario, v_demo, v_cfg.reserva_usd)
  returning id into v_id;

  return jsonb_build_object('permitido', true, 'id', v_id,
                            'max_lineas', v_cfg.max_lineas,
                            'max_unidades', v_cfg.max_unidades,
                            'max_cajas', v_cfg.max_cajas,
                            'escalados_restantes', greatest(v_cfg.limite_escalados_dia - v_esc, 0));
end;
$$;

comment on function comercial.hada_reservar(text) is
  'Hada (P6, RN-50): toma un cupo si el cliente está dentro de los límites por minuto y día, del tope diario por usuario '
  'y de los topes diario y mensual de todos. Exige HADA_CLAVE y un JWT de cliente. '
  'Devuelve {permitido, id, máximos, escalados_restantes} o {permitido:false, motivo}.';

revoke execute on function comercial.hada_reservar(text) from public, anon;
grant execute on function comercial.hada_reservar(text) to authenticated;

-- ===========================================================================
-- 3. Escalar: reservar el costo de Sonnet antes de llamarlo
-- ===========================================================================

create function comercial.hada_escalar(p_clave text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario   uuid := core.usuario_actual();
  v_cfg       comercial.hada_config;
  v_ahora     timestamptz := now();
  v_desde_dia timestamptz :=
    (v_ahora at time zone 'America/Argentina/Buenos_Aires')::date::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_desde_mes timestamptz :=
    date_trunc('month', v_ahora at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
  v_costo     numeric;
  v_extra     numeric;
  v_esc       integer;
  v_gasto_usr numeric;
  v_gasto_dia numeric;
  v_gasto_mes numeric;
  v_motivo    text;
begin
  if v_usuario is null then
    raise exception 'Sin sesión de usuario.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_cfg from comercial.hada_config limit 1;
  if v_cfg.clave_sha256 is null
     or p_clave is null
     or sha256(convert_to(p_clave, 'UTF8')) <> v_cfg.clave_sha256 then
    raise exception 'Hada no autorizada.' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('comercial.hada'));

  select costo_usd into v_costo
    from comercial.hada_interacciones
   where id = p_id and usuario_id = v_usuario and estado = 'RESERVADA' and escalado_en is null;
  if not found then
    return jsonb_build_object('permitido', false, 'motivo', 'NO_RESERVADA');
  end if;

  -- Lo que suma escalar: la fila ya cuenta con su reserva.
  v_extra := greatest(v_cfg.reserva_experto_usd - v_costo, 0);

  select count(*) filter (where escalado_en >= v_desde_dia),
         coalesce(sum(costo_usd), 0)
    into v_esc, v_gasto_usr
    from comercial.hada_interacciones
   where usuario_id = v_usuario and creado_en >= v_desde_dia;

  select coalesce(sum(costo_usd) filter (where creado_en >= v_desde_dia), 0), coalesce(sum(costo_usd), 0)
    into v_gasto_dia, v_gasto_mes
    from comercial.hada_interacciones
   where creado_en >= v_desde_mes;

  v_motivo := case
    when v_esc >= v_cfg.limite_escalados_dia then 'LIMITE_EXPERTO'
    when v_gasto_mes + v_extra > v_cfg.tope_mensual_usd then 'TOPE'
    when v_gasto_dia + v_extra > v_cfg.tope_diario_usd then 'TOPE'
    when v_gasto_usr + v_extra > v_cfg.tope_diario_usuario_usd then 'TOPE_USUARIO'
  end;
  if v_motivo is not null then
    return jsonb_build_object('permitido', false, 'motivo', v_motivo);
  end if;

  update comercial.hada_interacciones
     set escalado_en = v_ahora, costo_usd = greatest(costo_usd, v_cfg.reserva_experto_usd)
   where id = p_id;

  return jsonb_build_object('permitido', true);
end;
$$;

comment on function comercial.hada_escalar(text, uuid) is
  'Hada (P6, RN-50, D-61): antes de llamar a Sonnet, marca la fila RESERVADA propia como escalada y sube su costo a '
  'reserva_experto_usd, si el usuario no pasó limite_escalados_dia ni los topes. Exige HADA_CLAVE. '
  'Devuelve {permitido:true} o {permitido:false, motivo: NO_RESERVADA | LIMITE_EXPERTO | TOPE | TOPE_USUARIO}.';

revoke execute on function comercial.hada_escalar(text, uuid) from public, anon;
grant execute on function comercial.hada_escalar(text, uuid) to authenticated;

-- ===========================================================================
-- 4. Cerrar: con tokens 0 o con error nunca baja lo reservado
-- ===========================================================================

create or replace function comercial.hada_cerrar(
  p_clave                  text,
  p_id                     uuid,
  p_modelo                 text,
  p_tokens_entrada         integer,
  p_tokens_salida          integer,
  p_tokens_cache_lectura   integer,
  p_tokens_cache_escritura integer,
  p_herramienta            text,
  p_resultado              text,
  p_items_propuestos       integer,
  p_items_validos          integer,
  p_items_rechazados       integer,
  p_rechazos               text[],
  p_latencia_ms            integer,
  p_error                  text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := core.usuario_actual();
  v_cfg     comercial.hada_config;
  v_precio  jsonb;
  v_entrada integer := least(greatest(coalesce(p_tokens_entrada, 0), 0), 200000);
  v_salida  integer := least(greatest(coalesce(p_tokens_salida, 0), 0), 8192);
  v_lectura integer := least(greatest(coalesce(p_tokens_cache_lectura, 0), 0), 200000);
  v_escrit  integer := least(greatest(coalesce(p_tokens_cache_escritura, 0), 0), 200000);
  v_calc    numeric;
  v_filas   integer;
begin
  if v_usuario is null then
    raise exception 'Sin sesión de usuario.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_cfg from comercial.hada_config limit 1;
  if v_cfg.clave_sha256 is null
     or p_clave is null
     or sha256(convert_to(p_clave, 'UTF8')) <> v_cfg.clave_sha256 then
    raise exception 'Hada no autorizada.' using errcode = 'insufficient_privilege';
  end if;

  -- Un modelo sin precio se cobra como el más caro de la tabla.
  v_precio := coalesce(
    v_cfg.precios -> p_modelo,
    (select p.value from jsonb_each(v_cfg.precios) p
      order by (p.value ->> 'salida')::numeric desc limit 1));

  -- Sin tokens (la llamada falló o no devolvió uso) o sin precio utilizable:
  -- nulo, y queda lo reservado.
  if v_entrada + v_salida + v_lectura + v_escrit > 0 then
    v_calc := (  v_entrada * (v_precio ->> 'entrada')::numeric
               + v_salida  * (v_precio ->> 'salida')::numeric
               + v_lectura * (v_precio ->> 'cache_lectura')::numeric
               + v_escrit  * (v_precio ->> 'cache_escritura')::numeric) / 1000000;
  end if;

  -- Con error (Sonnet falló, el cliente abortó) se cobra lo mayor entre lo
  -- calculado y lo reservado: un escalado fallido sigue contando para el tope.
  update comercial.hada_interacciones
     set estado = 'CERRADA', cerrado_en = now(), modelo = left(p_modelo, 100),
         tokens_entrada = v_entrada, tokens_salida = v_salida,
         tokens_cache_lectura = v_lectura, tokens_cache_escritura = v_escrit,
         costo_usd = case
           when v_calc is null then costo_usd
           when p_error is not null then greatest(v_calc, costo_usd)
           else v_calc
         end,
         herramienta = left(p_herramienta, 40), resultado = left(p_resultado, 40),
         items_propuestos = least(greatest(coalesce(p_items_propuestos, 0), 0), 1000),
         items_validos = least(greatest(coalesce(p_items_validos, 0), 0), 1000),
         items_rechazados = least(greatest(coalesce(p_items_rechazados, 0), 0), 1000),
         rechazos = coalesce(p_rechazos[1:30], '{}'),
         latencia_ms = greatest(p_latencia_ms, 0), error = left(p_error, 200)
   where id = p_id and usuario_id = v_usuario and estado = 'RESERVADA';
  get diagnostics v_filas = row_count;
  return v_filas = 1;
end;
$$;

comment on function comercial.hada_cerrar(text, uuid, text, integer, integer, integer, integer, text, text, integer, integer, integer, text[], integer, text) is
  'Hada (P6, RN-50): cierra la fila RESERVADA propia con los tokens y el costo real. Exige HADA_CLAVE. '
  'Con tokens 0 queda lo reservado; con error, lo mayor entre lo calculado y lo reservado. Una fila que no se cierra queda al costo reservado.';

revoke execute on function comercial.hada_cerrar(text, uuid, text, integer, integer, integer, integer, text, text, integer, integer, integer, text[], integer, text) from public, anon;
grant execute on function comercial.hada_cerrar(text, uuid, text, integer, integer, integer, integer, text, text, integer, integer, integer, text[], integer, text) to authenticated;

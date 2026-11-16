-- ---------------------------------------------------------------------------
-- Propósito : Hada, la asistente que arma borradores de pedido en el portal de
--             clientes. Configuración (una fila), registro de interacciones
--             que es a la vez contador de límites, y las dos funciones que usa
--             la Edge Function: reservar cupo antes de llamar al modelo y
--             cerrarlo con el costo real. Sin service_role: las funciones son
--             SECURITY DEFINER, se llaman con el JWT del cliente y exigen el
--             secreto HADA_CLAVE (patrón de D-59, hash en la base).
-- Reglas    : P6, RN-50, D-hada-1 (límites y topes), D-hada-2 (demo apagada),
--             D-hada-3 (sin purga: el registro no guarda texto), D-hada-4.
--             CLAUDE.md §3.3, §3.4, §3.6, §5.
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- PASO MANUAL DESPUÉS DE APLICAR. Hasta que se haga, Hada responde «no estoy
-- disponible»:
--   1. Generar una clave larga: `openssl rand -hex 32`.
--   2. supabase secrets set HADA_CLAVE=<clave> HADA_MODEL=claude-haiku-5-5 \
--        HADA_ORIGENES=<https://dominio-de-la-app[,otro]> --project-ref <ref>
--      HADA_MODEL tiene que ser claude-haiku-5-5 y HADA_ORIGENES la lista de
--      orígenes del portal separados por coma: sin ella todo pedido da 403.
--   3. Desde el editor SQL:
--        update comercial.hada_config
--           set clave_sha256 = sha256(convert_to('<clave>', 'UTF8')), activo = true;
--   La clave no va al repositorio (invariante 5); la base guarda solo el hash.
-- Para apagarla de golpe: `update comercial.hada_config set activo = false`.
-- Retención: sin purga (el trigger de auditoría prohíbe DELETE); las filas no
-- guardan ningún texto del cliente ni de Hada.

-- ===========================================================================
-- 1. Configuración: una sola fila
-- ===========================================================================

create table comercial.hada_config (
  id               uuid primary key default gen_random_uuid(),
  unica            boolean not null default true unique check (unica),
  -- Apagada hasta cargar la clave y activarla a conciencia.
  activo           boolean not null default false,
  limite_minuto    integer not null default 5 check (limite_minuto > 0),
  limite_dia       integer not null default 40 check (limite_dia > 0),
  -- D-hada-2: 0 = la cuenta de demostración no usa Hada.
  limite_dia_demo  integer not null default 0 check (limite_dia_demo >= 0),
  tope_diario_usd  numeric(10, 2) not null default 1.00 check (tope_diario_usd > 0),
  tope_mensual_usd numeric(10, 2) not null default 10.00 check (tope_mensual_usd > 0),
  -- Lo que cuenta una interacción reservada que todavía no se cerró.
  reserva_usd      numeric(10, 6) not null default 0.002 check (reserva_usd > 0),
  -- Máximos de un borrador que valida la Edge Function.
  max_lineas       integer not null default 25 check (max_lineas between 1 and 100),
  max_unidades     integer not null default 500 check (max_unidades between 1 and 100000),
  max_cajas        integer not null default 50 check (max_cajas between 1 and 10000),
  -- Dólares por millón de tokens, por modelo. Estimación: la factura real es la de Anthropic.
  precios          jsonb not null default '{
      "claude-haiku-5-5": {"entrada": 0.10, "salida": 0.50, "cache_lectura": 0.01, "cache_escritura": 0.125}
    }',
  -- SHA-256 de HADA_CLAVE. Sin GRANT de UPDATE: se carga desde el editor SQL.
  clave_sha256     bytea check (octet_length(clave_sha256) = 32),
  cambiado_por     uuid references core.usuarios(id) default core.usuario_actual(),
  cambiado_en      timestamptz not null default now(),
  check (jsonb_typeof(precios) = 'object' and precios <> '{}'::jsonb),
  check (core.giorgio_config_valida('{}'::jsonb, precios))
);

comment on table comercial.hada_config is
  'Configuración de Hada (una fila), P6: interruptor, límites, topes, máximos del borrador, precios y hash de la clave. La historia queda en core.auditoria.';

create or replace function comercial.fn_hada_config_sello()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cambiado_por := core.usuario_actual();
  new.cambiado_en := now();
  return new;
end;
$$;

create trigger trg_hada_config_sello
  before update on comercial.hada_config
  for each row execute function comercial.fn_hada_config_sello();

alter table comercial.hada_config enable row level security;
alter table comercial.hada_config force  row level security;

-- Sin clave_sha256: ni el Administrador del sistema lee el hash.
grant select (id, unica, activo, limite_minuto, limite_dia, limite_dia_demo, tope_diario_usd,
              tope_mensual_usd, reserva_usd, max_lineas, max_unidades, max_cajas, precios,
              cambiado_por, cambiado_en)
  on comercial.hada_config to authenticated;
grant update (activo, limite_minuto, limite_dia, limite_dia_demo, tope_diario_usd, tope_mensual_usd,
              reserva_usd, max_lineas, max_unidades, max_cajas, precios)
  on comercial.hada_config to authenticated;

create policy hada_config_select_administrador_sistema on comercial.hada_config
  for select to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy hada_config_select_administrador_sistema on comercial.hada_config is
  'P6, RN-50: la configuración la lee el Administrador del sistema. Ningún cliente la lee: usa hada_reservar().';

create policy hada_config_update_administrador_sistema on comercial.hada_config
  for update to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy hada_config_update_administrador_sistema on comercial.hada_config is
  'P6, RN-50: solo el Administrador del sistema; sin INSERT ni DELETE (una sola fila). Sin UPDATE de clave_sha256.';

select core.adjuntar_auditoria('comercial.hada_config');

insert into comercial.hada_config default values;

-- ===========================================================================
-- 2. Interacciones: contador y registro, sin ningún texto
-- ===========================================================================

create table comercial.hada_interacciones (
  id                     uuid primary key default gen_random_uuid(),
  usuario_id             uuid not null references core.usuarios(id),
  es_demo                boolean not null default false,
  creado_en              timestamptz not null default now(),
  -- RESERVADA: cupo tomado, la Edge Function todavía no cerró. Cuenta con reserva_usd.
  estado                 text not null default 'RESERVADA' check (estado in ('RESERVADA', 'CERRADA')),
  cerrado_en             timestamptz,
  modelo                 text check (char_length(modelo) <= 100),
  tokens_entrada         integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida          integer not null default 0 check (tokens_salida >= 0),
  tokens_cache_lectura   integer not null default 0 check (tokens_cache_lectura >= 0),
  tokens_cache_escritura integer not null default 0 check (tokens_cache_escritura >= 0),
  costo_usd              numeric(12, 6) not null check (costo_usd >= 0),
  herramienta            text check (char_length(herramienta) <= 40),
  resultado              text check (char_length(resultado) <= 40),
  items_propuestos       smallint not null default 0 check (items_propuestos >= 0),
  items_validos          smallint not null default 0 check (items_validos >= 0),
  items_rechazados       smallint not null default 0 check (items_rechazados >= 0),
  rechazos               text[] not null default '{}',
  latencia_ms            integer check (latencia_ms >= 0),
  error                  text check (char_length(error) <= 200)
);

comment on table comercial.hada_interacciones is
  'Interacciones con Hada (P6). Contador de límites y registro: no guarda el mensaje, la respuesta, nombres ni IP. '
  'Lo escriben solo hada_reservar() y hada_cerrar(). Sin DELETE (auditoría).';

create index hada_interacciones_usuario_idx on comercial.hada_interacciones (usuario_id, creado_en);
create index hada_interacciones_creado_idx on comercial.hada_interacciones (creado_en);

alter table comercial.hada_interacciones enable row level security;
alter table comercial.hada_interacciones force  row level security;

grant select on comercial.hada_interacciones to authenticated;

create policy hada_interacciones_select_administrador_sistema on comercial.hada_interacciones
  for select to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy hada_interacciones_select_administrador_sistema on comercial.hada_interacciones is
  'P6, RN-50: las lee el Administrador del sistema. Un cliente no ve nada, ni lo suyo.';
create policy hada_interacciones_select_gerencia on comercial.hada_interacciones
  for select to authenticated
  using (core.es_rol('GERENCIA'));
comment on policy hada_interacciones_select_gerencia on comercial.hada_interacciones is
  'P6, RN-50: Gerencia lee el consumo de Hada (solo lectura).';

-- Sin políticas de INSERT/UPDATE/DELETE ni GRANT de escritura para ningún rol de
-- la aplicación. hada_reservar() y hada_cerrar() (SECURITY DEFINER, dueño
-- postgres con BYPASSRLS) escriben por el bypass del dueño, como Giorgio. La
-- guarda real del cierre es el WHERE de hada_cerrar (fila propia y RESERVADA).

select core.adjuntar_auditoria('comercial.hada_interacciones');

-- ===========================================================================
-- 3. Reservar cupo
-- ===========================================================================

-- Un cliente (o la cuenta de demostración) con el hash de la clave. Cuenta lo
-- que lleva en el último minuto y en el día (hora de Argentina) más el gasto
-- del día y del mes de todos; si pasa, toma el cupo insertando la fila
-- RESERVADA, todo bajo un lock para que una ráfaga no se cuele (RN-50).
-- Una fila RESERVADA que no se cierra sigue contando con reserva_usd.
create function comercial.hada_reservar(p_clave text)
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
         count(*) filter (where creado_en >= v_desde_dia)
    into v_min, v_dia
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
                            'max_cajas', v_cfg.max_cajas);
end;
$$;

comment on function comercial.hada_reservar(text) is
  'Hada (P6, RN-50): toma un cupo si el cliente está dentro de los límites por minuto y día y de los topes diario y mensual. '
  'Exige HADA_CLAVE (hash en hada_config) y un JWT de cliente. Devuelve {permitido, id, máximos} o {permitido:false, motivo}.';

revoke execute on function comercial.hada_reservar(text) from public, anon;
grant execute on function comercial.hada_reservar(text) to authenticated;

-- ===========================================================================
-- 4. Cerrar con el costo real
-- ===========================================================================

create function comercial.hada_cerrar(
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

  -- Sin precio utilizable, o sin tokens (la llamada al modelo falló o no devolvió
  -- uso), queda el costo de reserva: nunca 0.
  update comercial.hada_interacciones
     set estado = 'CERRADA', cerrado_en = now(), modelo = left(p_modelo, 100),
         tokens_entrada = v_entrada, tokens_salida = v_salida,
         tokens_cache_lectura = v_lectura, tokens_cache_escritura = v_escrit,
         costo_usd = case when v_entrada + v_salida + v_lectura + v_escrit = 0 then v_cfg.reserva_usd else coalesce((  v_entrada * (v_precio ->> 'entrada')::numeric
                      + v_salida  * (v_precio ->> 'salida')::numeric
                      + v_lectura * (v_precio ->> 'cache_lectura')::numeric
                      + v_escrit  * (v_precio ->> 'cache_escritura')::numeric) / 1000000, v_cfg.reserva_usd) end,
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
  'Hada (P6): cierra la fila RESERVADA propia con los tokens y el costo real. Exige HADA_CLAVE. Una fila que no se cierra queda al costo reservado.';

revoke execute on function comercial.hada_cerrar(text, uuid, text, integer, integer, integer, integer, text, text, integer, integer, integer, text[], integer, text) from public, anon;
grant execute on function comercial.hada_cerrar(text, uuid, text, integer, integer, integer, integer, text, text, integer, integer, integer, text[], integer, text) to authenticated;

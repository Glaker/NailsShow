-- ---------------------------------------------------------------------------
-- Propósito : Topes de Giorgio según el presupuesto real (USD 20 por mes de
--             los créditos de API), escalado de las preguntas difíciles a un
--             modelo más capaz, y cierre del registro inventado: tope mensual
--             que corta al llegar, tope diario más bajo para que un día no se
--             coma el mes, y `giorgio_registrar` solo con la clave de la Edge
--             Function.
-- Reglas    : D-59 (actualizada 2026-10-19: clave de registro), D-60
--             (actualizada 2026-10-19: topes), D-61 (escalado a Sonnet). RN-50.
-- Fecha     : 2026-10-19
-- ---------------------------------------------------------------------------
--
-- PASO MANUAL DESPUÉS DE APLICAR (D-59). Hasta que se haga, Giorgio responde
-- «todavía no está configurado»:
--   1. Generar una clave larga al azar, por ejemplo `openssl rand -hex 32`.
--   2. Cargarla como secreto de la Edge Function:
--        supabase secrets set GIORGIO_CLAVE_REGISTRO=<clave> --project-ref <ref>
--   3. Guardar su hash en la base, desde el editor SQL del proyecto:
--        update core.giorgio_config
--           set clave_registro_sha256 = sha256(convert_to('<clave>', 'UTF8'));
--   La clave no va al repositorio (invariante 5); la base guarda solo el hash.

-- ===========================================================================
-- 1. Tope mensual, nuevo tope diario y hash de la clave de registro
-- ===========================================================================

alter table core.giorgio_config
  add column tope_mensual_usd numeric(10, 2) not null default 20.00 check (tope_mensual_usd > 0),
  add column clave_registro_sha256 bytea check (octet_length(clave_registro_sha256) = 32);

comment on column core.giorgio_config.tope_mensual_usd is
  'D-60: gasto máximo de Giorgio en el mes calendario (hora de Argentina). Al llegar, se apaga hasta el mes siguiente.';
comment on column core.giorgio_config.clave_registro_sha256 is
  'D-59: SHA-256 de GIORGIO_CLAVE_REGISTRO, el secreto de la Edge Function. Sin él, core.giorgio_registrar rechaza. '
  'No tiene GRANT de UPDATE para la aplicación: se carga desde el editor SQL.';
comment on table core.giorgio_config is
  'Configuración de Giorgio (una fila): interruptor, topes mensual y diario, límites por rol, precios por modelo '
  'y hash de la clave de registro. La historia de cada cambio queda en core.auditoria.';

-- USD 1 por día con corte al 80 %: hasta USD 0,80 por día. El mensual corta
-- antes si el mes viene cargado.
alter table core.giorgio_config alter column tope_diario_usd set default 1.00;

do $$
declare
  v_filas integer;
begin
  update core.giorgio_config set tope_diario_usd = 1.00;
  get diagnostics v_filas = row_count;
  -- Bajo FORCE RLS sin BYPASSRLS el UPDATE tocaría 0 filas sin error.
  if v_filas <> 1 then
    raise exception 'giorgio_config: se esperaba 1 fila actualizada y fueron %.', v_filas;
  end if;
end;
$$;

grant update (tope_mensual_usd) on core.giorgio_config to authenticated;

-- ===========================================================================
-- 2. ¿Puede preguntar? Ahora también con el tope mensual
-- ===========================================================================

create or replace function core.giorgio_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario   uuid := core.usuario_actual();
  v_roles     core.rol_enum[] := core.roles();
  v_cfg       core.giorgio_config;
  v_limite    integer;
  v_hechas    integer;
  v_gasto_dia numeric;
  v_gasto_mes numeric;
  v_desde_dia timestamptz :=
    core.giorgio_hoy()::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_desde_mes timestamptz :=
    date_trunc('month', core.giorgio_hoy()::timestamp) at time zone 'America/Argentina/Buenos_Aires';
  v_motivo    text;
begin
  if v_usuario is null or cardinality(v_roles) = 0 then
    return jsonb_build_object('permitido', false, 'motivo', 'SIN_SESION');
  end if;

  select * into v_cfg from core.giorgio_config limit 1;
  -- Sin configuración legible, Giorgio queda apagado: falla cerrado.
  if not found then
    return jsonb_build_object('permitido', false, 'motivo', 'APAGADO');
  end if;

  -- Un rol sin límite propio usa el de defecto; con varios roles rige el mayor.
  select max(coalesce((v_cfg.limites_por_rol ->> r::text)::integer, v_cfg.limite_diario_defecto))
    into v_limite
    from unnest(v_roles) r;

  select count(*) into v_hechas
    from core.giorgio_mensajes
   where preguntado_por = v_usuario
     and creado_en >= v_desde_dia;

  select coalesce(sum(costo_usd) filter (where creado_en >= v_desde_dia), 0),
         coalesce(sum(costo_usd), 0)
    into v_gasto_dia, v_gasto_mes
    from core.giorgio_mensajes
   where creado_en >= v_desde_mes;

  v_motivo := case
    when not v_cfg.activo then 'APAGADO'
    -- Sin clave no se puede registrar: mejor no gastar en una respuesta que
    -- no quedaría asentada.
    when v_cfg.clave_registro_sha256 is null then 'SIN_CONFIGURAR'
    when v_gasto_mes >= v_cfg.tope_mensual_usd then 'TOPE_MENSUAL'
    when v_gasto_dia >= v_cfg.tope_diario_usd * v_cfg.corte_proporcion then 'TOPE_GLOBAL'
    when v_hechas >= v_limite then 'LIMITE_USUARIO'
  end;

  return jsonb_build_object(
    'permitido', v_motivo is null,
    'motivo', v_motivo,
    'rol', core.rol(),
    'roles', to_jsonb(v_roles),
    'preguntas_hoy', v_hechas,
    'limite_diario', v_limite
  );
end;
$$;

comment on function core.giorgio_estado() is
  'Si el usuario puede preguntarle a Giorgio ahora (D-60): interruptor, clave de registro cargada, tope mensual, '
  'tope global diario con corte al 80 % y límite diario por usuario. Devuelve también sus roles.';

-- ===========================================================================
-- 3. Registro: solo con la clave de la Edge Function
-- ===========================================================================

-- La versión anterior la podía llamar cualquier usuario con su token y cargar
-- consultas inventadas que se comían los topes de toda la empresa (D-59). La
-- nueva exige la clave que solo tiene la Edge Function.
drop function core.giorgio_registrar(text, text, text, text, integer, integer, integer, integer, text[], smallint, integer, text);

-- Con escalado (D-61) una consulta son hasta 4 llamadas del modelo base y 4
-- del experto, de hasta 1024 tokens de salida cada una. Los recortes quedan
-- como segunda barrera, por si la clave se filtrara.
create function core.giorgio_registrar(
  p_clave                  text,
  p_ruta                   text,
  p_pregunta               text,
  p_respuesta              text,
  p_modelo                 text,
  p_tokens_entrada         integer,
  p_tokens_salida          integer,
  p_tokens_cache_lectura   integer,
  p_tokens_cache_escritura integer,
  p_herramientas           text[],
  p_iteraciones            smallint,
  p_latencia_ms            integer,
  p_error                  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := core.usuario_actual();
  v_cfg     core.giorgio_config;
  v_precio  jsonb;
  v_id      uuid;
  v_entrada integer := least(greatest(coalesce(p_tokens_entrada, 0), 0), 200000);
  v_salida  integer := least(greatest(coalesce(p_tokens_salida, 0), 0), 8192);
  v_lectura integer := least(greatest(coalesce(p_tokens_cache_lectura, 0), 0), 200000);
  v_escrit  integer := least(greatest(coalesce(p_tokens_cache_escritura, 0), 0), 200000);
begin
  if v_usuario is null then
    raise exception 'Sin sesión de usuario.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cfg from core.giorgio_config limit 1;
  if v_cfg.clave_registro_sha256 is null
     or p_clave is null
     or sha256(convert_to(p_clave, 'UTF8')) <> v_cfg.clave_registro_sha256 then
    raise exception 'Registro de Giorgio no autorizado.' using errcode = 'insufficient_privilege';
  end if;

  -- Un modelo sin precio cargado se cobra como el más caro de la tabla: si
  -- quedara en null, sum() lo ignoraría y los topes no cortarían nunca.
  v_precio := coalesce(
    v_cfg.precios -> p_modelo,
    (select p.value from jsonb_each(v_cfg.precios) p
      order by (p.value ->> 'salida')::numeric desc limit 1));

  insert into core.giorgio_mensajes (
    preguntado_por, rol, ruta, pregunta, respuesta, modelo,
    tokens_entrada, tokens_salida, tokens_cache_lectura, tokens_cache_escritura,
    costo_usd, herramientas, iteraciones, latencia_ms, error
  )
  values (
    v_usuario, core.rol(), left(p_ruta, 300),
    -- La consulta ya se pagó: se registra aunque la pregunta llegue mal.
    left(coalesce(nullif(btrim(p_pregunta), ''), '(sin texto)'), 4000),
    left(p_respuesta, 20000), left(p_modelo, 100),
    v_entrada, v_salida, v_lectura, v_escrit,
    -- ponytail: precio único por modelo; con escalado, todo al precio del
    -- experto (sobreestima, lo seguro para los topes).
    (  v_entrada * (v_precio ->> 'entrada')::numeric
     + v_salida  * (v_precio ->> 'salida')::numeric
     + v_lectura * (v_precio ->> 'cache_lectura')::numeric
     + v_escrit  * (v_precio ->> 'cache_escritura')::numeric
    ) / 1000000,
    coalesce(p_herramientas[1:20], '{}'), least(greatest(p_iteraciones, 0), 10)::smallint,
    greatest(p_latencia_ms, 0), left(p_error, 2000)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function core.giorgio_registrar(text, text, text, text, text, integer, integer, integer, integer, text[], smallint, integer, text) is
  'Registra una consulta a Giorgio (D-59). Exige la clave de la Edge Function; usuario y rol salen del JWT; '
  'el costo se estima con los precios de la configuración.';

revoke execute on function core.giorgio_registrar(text, text, text, text, text, integer, integer, integer, integer, text[], smallint, integer, text) from public, anon;
grant execute on function core.giorgio_registrar(text, text, text, text, text, integer, integer, integer, integer, text[], smallint, integer, text) to authenticated;

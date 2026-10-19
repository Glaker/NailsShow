-- ---------------------------------------------------------------------------
-- Propósito : Base de Giorgio, el asistente de ayuda de la app (fase 1):
--             configuración (interruptor, tope global diario, límites por
--             rol, precios del modelo), registro de cada consulta y las dos
--             funciones que usa la Edge Function `giorgio`: una que dice si
--             la persona puede preguntar y otra que registra la consulta.
-- Reglas    : D-57 (uso previsto: herramienta auxiliar, sin registros GMP ni
--             decisiones), D-58 (registro en core, con auditoría, sin
--             retención), D-59 (el registro lo escribe solo la función),
--             D-60 (tope global diario, apagado al 80 %). CLAUDE.md §3
--             invariantes 2, 3 y 6; §5 (sin service_role). RN-50.
-- Fecha     : 2026-10-15
-- ---------------------------------------------------------------------------
--
-- QUÉ NO ES ESTO.
-- Giorgio no escribe datos de negocio, no firma y no decide nada de calidad.
-- Lo único que escribe es su propio registro de consultas, acá. Las
-- herramientas que lee las lee con el token del usuario: RLS decide.
--
-- POR QUÉ EN CORE Y SIN RETENCIÓN (D-58).
-- Toda tabla de core lleva el trigger genérico de auditoría (invariante 6),
-- que prohíbe el DELETE. Purgar a los 12 meses exigiría sacarla de ese
-- alcance; se decidió no hacerlo. El registro se guarda para siempre.

-- ===========================================================================
-- 1. Configuración: una sola fila
-- ===========================================================================

-- Forma de los dos campos jsonb: límites enteros positivos por rol, y por cada
-- modelo los cuatro precios. Un valor mal cargado haría fallar el cálculo de
-- todos; mejor que lo rechace el CHECK al guardarlo.
create or replace function core.giorgio_config_valida(p_limites jsonb, p_precios jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_limites) = 'object'
     and jsonb_typeof(p_precios) = 'object'
     and not exists (
           select 1 from jsonb_each(p_limites) l
            where jsonb_typeof(l.value) <> 'number'
               or (l.value #>> '{}')::numeric <> trunc((l.value #>> '{}')::numeric)
               or (l.value #>> '{}')::numeric <= 0)
     and not exists (
           select 1
             from jsonb_each(p_precios) p
             cross join unnest(array['entrada', 'salida', 'cache_lectura', 'cache_escritura']) k
            where jsonb_typeof(p.value -> k) is distinct from 'number'
               or (p.value ->> k)::numeric < 0);
$$;

create table core.giorgio_config (
  id                    uuid primary key default gen_random_uuid(),
  -- Garantiza una sola fila: no hay dos configuraciones vigentes.
  unica                 boolean not null default true unique check (unica),
  -- Interruptor general. Apagado, la app sigue andando sin Giorgio.
  activo                boolean not null default true,
  -- Tope global de gasto por día (hora de Argentina), en dólares (D-60).
  tope_diario_usd       numeric(10, 2) not null default 5.00 check (tope_diario_usd > 0),
  -- Fracción del tope a la que Giorgio se apaga solo hasta el día siguiente.
  corte_proporcion      numeric(3, 2) not null default 0.80
                          check (corte_proporcion > 0 and corte_proporcion <= 1),
  -- Preguntas por día de cada usuario. Con varios roles rige el mayor.
  limite_diario_defecto integer not null default 150 check (limite_diario_defecto > 0),
  limites_por_rol       jsonb not null default '{"OPERARIO": 50}',
  -- Dólares por millón de tokens, por modelo. Sirve para estimar el costo de
  -- cada consulta; la factura real es la de la consola de Anthropic.
  precios               jsonb not null default '{
      "claude-haiku-5-5":  {"entrada": 0.10, "salida": 0.50, "cache_lectura": 0.01, "cache_escritura": 0.125},
      "claude-sonnet-5-5": {"entrada": 2.00, "salida": 10.00, "cache_lectura": 0.20, "cache_escritura": 2.50}
    }',
  cambiado_por          uuid references core.usuarios(id) default core.usuario_actual(),
  cambiado_en           timestamptz not null default now(),
  check (core.giorgio_config_valida(limites_por_rol, precios))
);

comment on table core.giorgio_config is
  'Configuración de Giorgio (una fila): interruptor, tope global diario, límites por rol y precios por modelo. '
  'La historia de cada cambio queda en core.auditoria.';

-- Quién y cuándo los pone la base: en un UPDATE no rige el DEFAULT.
create or replace function core.fn_giorgio_config_sello()
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

create trigger trg_giorgio_config_sello
  before update on core.giorgio_config
  for each row execute function core.fn_giorgio_config_sello();

alter table core.giorgio_config enable row level security;
alter table core.giorgio_config force  row level security;

-- UPDATE por columnas: id y unica no se tocan (partirían la historia).
grant select on core.giorgio_config to authenticated;
grant update (activo, tope_diario_usd, corte_proporcion, limite_diario_defecto, limites_por_rol, precios)
  on core.giorgio_config to authenticated;

create policy giorgio_config_select_administrador_sistema on core.giorgio_config
  for select to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy giorgio_config_select_administrador_sistema on core.giorgio_config is
  'D-60, RN-50: la configuración la ve y la cambia el Administrador del sistema. Los demás la consultan por core.giorgio_estado().';

create policy giorgio_config_update_administrador_sistema on core.giorgio_config
  for update to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy giorgio_config_update_administrador_sistema on core.giorgio_config is
  'D-60, RN-50: solo el Administrador del sistema; quién y cuándo los fija el trigger. Sin INSERT ni DELETE: hay una sola fila.';

select core.adjuntar_auditoria('core.giorgio_config');

-- Después del trigger de auditoría, para que la creación quede asentada.
insert into core.giorgio_config default values;

-- ===========================================================================
-- 2. Registro de consultas
-- ===========================================================================

create table core.giorgio_mensajes (
  id                     uuid primary key default gen_random_uuid(),
  preguntado_por         uuid not null references core.usuarios(id),
  rol                    core.rol_enum,
  ruta                   text check (char_length(ruta) <= 300),
  pregunta               text not null check (char_length(pregunta) between 1 and 4000),
  respuesta              text check (char_length(respuesta) <= 20000),
  -- Toda respuesta guardada acá la generó una IA. No es un registro oficial.
  generado_por_ia        boolean not null default true check (generado_por_ia),
  modelo                 text check (char_length(modelo) <= 100),
  tokens_entrada         integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida          integer not null default 0 check (tokens_salida >= 0),
  tokens_cache_lectura   integer not null default 0 check (tokens_cache_lectura >= 0),
  tokens_cache_escritura integer not null default 0 check (tokens_cache_escritura >= 0),
  -- Estimado con core.giorgio_config.precios (el más caro si el modelo no figura).
  costo_usd              numeric(12, 6),
  herramientas           text[] not null default '{}',
  iteraciones            smallint check (iteraciones between 0 and 10),
  latencia_ms            integer check (latencia_ms >= 0),
  error                  text check (char_length(error) <= 2000),
  creado_en              timestamptz not null default now()
);

comment on table core.giorgio_mensajes is
  'Registro de consultas a Giorgio (D-58). Append-only: sin UPDATE ni DELETE. Lo escribe solo '
  'core.giorgio_registrar(), que llama la Edge Function. Respuestas generadas por IA: no son registros GMP.';

create index giorgio_mensajes_usuario_dia_idx on core.giorgio_mensajes (preguntado_por, creado_en);
create index giorgio_mensajes_creado_idx on core.giorgio_mensajes (creado_en);

alter table core.giorgio_mensajes enable row level security;
alter table core.giorgio_mensajes force  row level security;

grant select on core.giorgio_mensajes to authenticated;

create policy giorgio_mensajes_select_authenticated on core.giorgio_mensajes
  for select to authenticated
  using (preguntado_por = core.usuario_actual() or core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy giorgio_mensajes_select_authenticated on core.giorgio_mensajes is
  'D-58, RN-50: cada usuario ve sus consultas; el Administrador del sistema ve todas.';

-- Único INSERT posible: el de core.giorgio_registrar(), SECURITY DEFINER, que
-- corre como dueño de la tabla. Hoy `postgres` tiene BYPASSRLS y no la
-- necesitaría (giorgio_estado lee sin política por lo mismo, como las
-- funciones de comercial; ver docs/ESTADO.md); queda explícita, con el mismo
-- patrón que auditoria_insert_trigger, por si ese atributo cambia.
create policy giorgio_mensajes_insert_postgres on core.giorgio_mensajes
  for insert to postgres
  with check (true);
comment on policy giorgio_mensajes_insert_postgres on core.giorgio_mensajes is
  'D-59, RN-50: habilita la escritura desde core.giorgio_registrar(). Ningún rol de la aplicación tiene INSERT.';

select core.adjuntar_auditoria('core.giorgio_mensajes');

-- ===========================================================================
-- 3. ¿Puede preguntar?
-- ===========================================================================

-- Hoy, en hora de Argentina: los límites se reinician a la medianoche local.
create or replace function core.giorgio_hoy()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- SECURITY DEFINER: suma el gasto de todos los usuarios y lee la
-- configuración, que el usuario común no ve. Devuelve solo lo que la persona
-- necesita saber de sí misma.
-- ponytail: consultar y registrar son dos pasos; pedidos simultáneos pueden
-- pasar el límite por una o dos preguntas. El corte al 80 % lo absorbe; si
-- hiciera falta exactitud, reservar la fila al empezar.
create or replace function core.giorgio_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario  uuid := core.usuario_actual();
  v_roles    core.rol_enum[] := core.roles();
  v_cfg      core.giorgio_config;
  v_limite   integer;
  v_hechas   integer;
  v_gasto    numeric;
  v_motivo   text;
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
     and creado_en >= (core.giorgio_hoy()::timestamp at time zone 'America/Argentina/Buenos_Aires');

  select coalesce(sum(costo_usd), 0) into v_gasto
    from core.giorgio_mensajes
   where creado_en >= (core.giorgio_hoy()::timestamp at time zone 'America/Argentina/Buenos_Aires');

  v_motivo := case
    when not v_cfg.activo then 'APAGADO'
    when v_gasto >= v_cfg.tope_diario_usd * v_cfg.corte_proporcion then 'TOPE_GLOBAL'
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
  'Si el usuario puede preguntarle a Giorgio ahora (D-60): interruptor, tope global diario con corte al 80 % '
  'y límite diario por usuario. Devuelve también sus roles, para que la función arme la lista de pantallas.';

-- ===========================================================================
-- 4. Registrar la consulta
-- ===========================================================================

-- SECURITY DEFINER: es la única puerta de escritura del registro. El usuario
-- y el rol salen del JWT, no de los parámetros; el costo, de la configuración.
-- Límite conocido (D-59): la función corre con el token del usuario, así que
-- un usuario podría llamarla directo y cargar filas a su nombre. No le da
-- acceso al modelo, pero suma gasto inventado al tope global y podría apagar
-- Giorgio hasta la medianoche. Para acotarlo, los tokens se recortan a lo que
-- una consulta real puede gastar (4 llamadas de hasta 1024 tokens de salida)
-- y cada fila cuenta en su límite diario y queda a su nombre. Cerrarlo del
-- todo pide un rol de base dedicado (CLAUDE.md §5).
create or replace function core.giorgio_registrar(
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
  v_precio  jsonb;
  v_id      uuid;
  v_entrada integer := least(greatest(coalesce(p_tokens_entrada, 0), 0), 100000);
  v_salida  integer := least(greatest(coalesce(p_tokens_salida, 0), 0), 4096);
  v_lectura integer := least(greatest(coalesce(p_tokens_cache_lectura, 0), 0), 100000);
  v_escrit  integer := least(greatest(coalesce(p_tokens_cache_escritura, 0), 0), 100000);
begin
  if v_usuario is null then
    raise exception 'Sin sesión de usuario.' using errcode = 'insufficient_privilege';
  end if;

  -- Un modelo sin precio cargado se cobra como el más caro de la tabla: si
  -- quedara en null, sum() lo ignoraría y el tope global no cortaría nunca.
  select coalesce(
           c.precios -> p_modelo,
           (select p.value from jsonb_each(c.precios) p
             order by (p.value ->> 'salida')::numeric desc limit 1))
    into v_precio
    from core.giorgio_config c
   limit 1;

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
    -- ponytail: precio único por modelo; Haiku 5.5 cobra el doble con prompts
    -- de más de 100K tokens, que Giorgio no usa. Si eso cambia, agregar tramo.
    (  v_entrada * (v_precio ->> 'entrada')::numeric
     + v_salida  * (v_precio ->> 'salida')::numeric
     + v_lectura * (v_precio ->> 'cache_lectura')::numeric
     + v_escrit  * (v_precio ->> 'cache_escritura')::numeric
    ) / 1000000,
    coalesce(p_herramientas[1:10], '{}'), least(greatest(p_iteraciones, 0), 10)::smallint,
    greatest(p_latencia_ms, 0), left(p_error, 2000)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function core.giorgio_registrar(text, text, text, text, integer, integer, integer, integer, text[], smallint, integer, text) is
  'Registra una consulta a Giorgio (D-59). Usuario y rol salen del JWT; el costo se estima con los precios de la configuración.';

revoke execute on function core.giorgio_estado() from public, anon;
revoke execute on function core.giorgio_registrar(text, text, text, text, integer, integer, integer, integer, text[], smallint, integer, text) from public, anon;
grant execute on function core.giorgio_hoy() to authenticated;
grant execute on function core.giorgio_estado() to authenticated;
grant execute on function core.giorgio_registrar(text, text, text, text, integer, integer, integer, integer, text[], smallint, integer, text) to authenticated;

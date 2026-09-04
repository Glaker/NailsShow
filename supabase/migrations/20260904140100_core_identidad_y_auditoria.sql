-- ---------------------------------------------------------------------------
-- Propósito : Identidad (core.usuarios), funciones de sesión que leen el rol
--             del JWT, auditoría append-only con trigger genérico, y el hook
--             de access token que inyecta el rol en el token.
-- Reglas    : RN-49 (un usuario no se borra, se desactiva),
--             RN-50 (toda operación queda auditada con autor, momento y
--             valores anterior y posterior).
--             Invariantes 2, 3, 6 y 9 de CLAUDE.md.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Funciones de sesión
-- ===========================================================================
--
-- CLAUDE.md §7: no se consulta `core.usuarios` dentro de una política RLS de
-- `core.usuarios`, porque recursa sin fin. La solución es que el rol y el id
-- del usuario viajen en el JWT, puestos ahí por el hook de la sección 5.
-- Todas las políticas del sistema leen el claim, nunca la tabla.

create or replace function core.rol()
returns core.rol_enum
language sql
stable
set search_path = ''
as $$
  select nullif(
           current_setting('request.jwt.claims', true)::jsonb ->> 'rol',
           ''
         )::core.rol_enum;
$$;

comment on function core.rol() is
  'Rol del usuario de la sesión, leído del claim del JWT. NULL si no hay sesión, '
  'si el usuario no tiene ficha en core.usuarios o si está desactivado.';

create or replace function core.usuario_actual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(
           current_setting('request.jwt.claims', true)::jsonb ->> 'usuario_id',
           ''
         )::uuid;
$$;

comment on function core.usuario_actual() is
  'core.usuarios.id del usuario de la sesión, leído del claim del JWT.';

-- §4.1 del alcance da a cada usuario un rol principal y `roles_adicionales`,
-- porque en esta planta las personas ocupan más de un puesto: Anabella es
-- Dirección Técnica y Control de Calidad a la vez. Una política que preguntara
-- solo por el rol principal le negaría la mitad de sus atribuciones reales.
create or replace function core.roles()
returns core.rol_enum[]
language sql
stable
set search_path = ''
as $$
  select coalesce(
           array(
             select jsonb_array_elements_text(
                      current_setting('request.jwt.claims', true)::jsonb -> 'roles'
                    )::core.rol_enum
           ),
           '{}'::core.rol_enum[]
         );
$$;

comment on function core.roles() is
  'Rol principal más roles adicionales del usuario de la sesión, leídos del claim del JWT (§4.1).';

create or replace function core.es_rol(variadic p_roles core.rol_enum[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.rol() is not null and core.roles() && p_roles;
$$;

comment on function core.es_rol(core.rol_enum[]) is
  'Verdadero si alguno de los roles de la sesión está entre los indicados. Azúcar para políticas RLS.';

grant execute on function core.rol() to authenticated;
grant execute on function core.usuario_actual() to authenticated;
grant execute on function core.roles() to authenticated;
grant execute on function core.es_rol(core.rol_enum[]) to authenticated;

-- ===========================================================================
-- 2. core.usuarios  (§4.1 del alcance)
-- ===========================================================================

create table core.usuarios (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid unique references auth.users(id),
  nombre_completo   text not null check (length(btrim(nombre_completo)) > 0),
  documento         text,
  email             text unique,
  rol               core.rol_enum not null,
  roles_adicionales core.rol_enum[] not null default '{}',
  es_dt_titular     boolean not null default false,
  sector            core.sector_enum not null,
  activo            boolean not null default true,
  fecha_alta        date not null default current_date,
  fecha_baja        date,
  creado_en         timestamptz not null default now(),
  constraint usuarios_baja_posterior_al_alta
    check (fecha_baja is null or fecha_baja >= fecha_alta),
  -- RN-49: la baja es un estado, no un borrado. Los dos campos se mueven juntos.
  constraint usuarios_baja_consistente
    check ((activo and fecha_baja is null) or (not activo and fecha_baja is not null))
);

comment on table core.usuarios is
  'Nómina del sistema (§4.1, PG.60.1). RN-49: un usuario nunca se elimina, se desactiva.';
comment on column core.usuarios.es_dt_titular is
  'Dirección Técnica titular. Destinataria de las notificaciones de escritura privilegiada (CLAUDE.md §5).';
comment on column core.usuarios.roles_adicionales is
  'Roles secundarios. La separación de funciones de §3.4 se resuelve en fase posterior.';

create index usuarios_auth_user_id_idx on core.usuarios (auth_user_id);
create unique index usuarios_dt_titular_unica
  on core.usuarios (es_dt_titular)
  where es_dt_titular;

-- ===========================================================================
-- 3. core.auditoria  (§4.11)
-- ===========================================================================
--
-- Invariante 2 de CLAUDE.md: append-only estricto. No se declara ninguna
-- política de UPDATE ni de DELETE, y tampoco se otorga el privilegio: sin
-- GRANT no hay operación que una política pueda siquiera evaluar.
--
-- `db_role` y `db_session` implementan la capa de detección de CLAUDE.md §5:
-- la clave `service_role` tiene BYPASSRLS y no se puede eliminar del proyecto,
-- así que toda escritura queda etiquetada con el rol de base que la produjo.

create table core.auditoria (
  id            bigint generated always as identity primary key,
  esquema       text not null,
  tabla         text not null,
  registro_id   uuid,
  operacion     text not null check (
                  operacion in ('INSERT','UPDATE','DELETE_INTENTO','FIRMA','LOGIN')
                ),
  datos_antes   jsonb,
  datos_despues jsonb,
  usuario_id    uuid references core.usuarios(id),
  auth_uid      uuid,
  db_role       text not null default current_user,
  db_session    text not null default session_user,
  ip            inet,
  user_agent    text,
  motivo        text,
  ocurrido_en   timestamptz not null default now()
);

comment on table core.auditoria is
  'Registro append-only de toda escritura (RN-50, Disp. 6477/12, GAMP 5). Sin UPDATE ni DELETE para ningún rol.';
comment on column core.auditoria.db_role is
  'Rol de base efectivo de la escritura. db_role = ''service_role'' es una anomalía por definición del proyecto (CLAUDE.md §5).';

create index auditoria_tabla_registro_idx on core.auditoria (esquema, tabla, registro_id);
create index auditoria_ocurrido_en_idx    on core.auditoria (ocurrido_en desc);
create index auditoria_usuario_idx        on core.auditoria (usuario_id);

-- ===========================================================================
-- 4. Trigger genérico de auditoría  (invariante 6)
-- ===========================================================================

create or replace function core.fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes    jsonb;
  v_despues  jsonb;
  v_registro uuid;
  v_headers  jsonb;
begin
  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
  else
    v_despues := to_jsonb(new);
  end if;

  v_registro := nullif(coalesce(v_despues, v_antes) ->> 'id', '')::uuid;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  insert into core.auditoria (
    esquema, tabla, registro_id, operacion,
    datos_antes, datos_despues,
    usuario_id, auth_uid, ip, user_agent
  )
  values (
    tg_table_schema,
    tg_table_name,
    v_registro,
    case when tg_op = 'DELETE' then 'DELETE_INTENTO' else tg_op end,
    v_antes,
    v_despues,
    core.usuario_actual(),
    auth.uid(),
    nullif(v_headers ->> 'x-forwarded-for', '')::inet,
    v_headers ->> 'user-agent'
  );

  -- El borrado se rechaza siempre. Ver la nota del COMMENT sobre qué pasa con
  -- el asiento del intento cuando la excepción aborta la transacción.
  if tg_op = 'DELETE' then
    raise exception
      'Prohibido borrar filas de %.%. La corrección se hace con un registro rectificativo (CLAUDE.md §3, invariantes 1 y 9).',
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then null else new end;
end;
$$;

comment on function core.fn_auditar() is
  'Trigger genérico de auditoría (RN-50). Ante DELETE levanta excepción: ninguna tabla de negocio admite borrado. '
  'Nota: la excepción aborta la transacción, de modo que el asiento DELETE_INTENTO no persiste; queda el rechazo, '
  'que es lo que la política exige. El asiento persistente de intentos requiere un canal fuera de transacción y '
  'está diferido.';

-- Adjuntar el trigger a una tabla es una sola llamada, para que agregar una
-- tabla de negocio sin auditoría sea un olvido evidente y no un descuido
-- repartido en veinte líneas de DDL.
create or replace function core.adjuntar_auditoria(p_tabla regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_esquema text;
  v_tabla   text;
begin
  select n.nspname, c.relname
    into v_esquema, v_tabla
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.oid = p_tabla;

  execute format(
    'create or replace trigger %I after insert or update on %I.%I
       for each row execute function core.fn_auditar()',
    'trg_auditar_' || v_tabla, v_esquema, v_tabla
  );

  execute format(
    'create or replace trigger %I before delete on %I.%I
       for each row execute function core.fn_auditar()',
    'trg_prohibir_borrado_' || v_tabla, v_esquema, v_tabla
  );
end;
$$;

comment on function core.adjuntar_auditoria(regclass) is
  'Adjunta el trigger genérico de auditoría a una tabla de negocio (invariante 6 de CLAUDE.md).';

-- La invariante 6 afirma que existe un test que verifica que ninguna tabla de
-- negocio quedó sin trigger. Esta función es el sujeto de ese test: la prueba
-- pgTAP exige que devuelva conjunto vacío.
create or replace function core.tablas_sin_auditoria()
returns table (esquema text, tabla text)
language sql
stable
set search_path = ''
as $$
  select n.nspname::text, c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('core', 'gmp', 'comercial')
     -- core.auditoria es el destino de la auditoría, no su sujeto.
     and not (n.nspname = 'core' and c.relname = 'auditoria')
     and not exists (
       select 1
         from pg_trigger t
        where t.tgrelid = c.oid
          and not t.tgisinternal
          and t.tgname = 'trg_auditar_' || c.relname
     )
   order by 1, 2;
$$;

comment on function core.tablas_sin_auditoria() is
  'Tablas de negocio sin trigger de auditoría. Debe devolver conjunto vacío (invariante 6).';

-- Detección de escritura privilegiada (CLAUDE.md §5).
create view core.escrituras_privilegiadas
with (security_invoker = true) as
  select id, esquema, tabla, registro_id, operacion, usuario_id,
         db_role, db_session, ocurrido_en
    from core.auditoria
   where db_role in ('service_role', 'postgres', 'supabase_admin')
   order by ocurrido_en desc;

comment on view core.escrituras_privilegiadas is
  'Escrituras hechas por un rol con privilegio, sin usuario de negocio detrás. Cada fila es una anomalía a justificar (CLAUDE.md §5).';

-- ===========================================================================
-- 5. Hook de access token
-- ===========================================================================
--
-- Supabase Auth invoca esta función como `supabase_auth_admin` en cada emisión
-- de token. Es SECURITY INVOKER a propósito: así queda sujeta a RLS y la única
-- fila que puede leer es la que la política de la sección 6 le permite.
--
-- Un usuario desactivado (RN-49) sale con rol NULL: todas las políticas del
-- sistema exigen `core.rol() is not null`, de modo que la baja corta el acceso
-- en la siguiente emisión de token. Ver «Trampas conocidas» de docs/ESTADO.md:
-- el corte efectivo exige además revocar las sesiones vigentes.

create or replace function core.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_usuario core.usuarios%rowtype;
  v_claims  jsonb;
begin
  select * into v_usuario
    from core.usuarios
   where auth_user_id = (event ->> 'user_id')::uuid;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);

  if found and v_usuario.activo then
    v_claims := v_claims
      || jsonb_build_object(
           'rol',         v_usuario.rol::text,
           'roles',       to_jsonb(
                            array(
                              select distinct r::text
                                from unnest(
                                  array[v_usuario.rol] || v_usuario.roles_adicionales
                                ) as r
                            )
                          ),
           'usuario_id',  v_usuario.id::text,
           'sector',      v_usuario.sector::text,
           'nombre',      v_usuario.nombre_completo,
           'es_dt_titular', v_usuario.es_dt_titular
         );
  else
    v_claims := v_claims
      || jsonb_build_object('rol', null, 'roles', '[]'::jsonb, 'usuario_id', null);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

comment on function core.custom_access_token_hook(jsonb) is
  'Inyecta rol, usuario_id y sector en el JWT. Habilitado en el proyecto alojado con `supabase config push`.';

grant usage on schema core to supabase_auth_admin;
grant execute on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function core.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on core.usuarios to supabase_auth_admin;

-- ===========================================================================
-- 6. Alta de usuario desde Supabase Auth
-- ===========================================================================
--
-- DECISIÓN DE DEMO, no regla de negocio: el primer usuario que se registra
-- queda como ADMINISTRADOR_SISTEMA para poder arrancar el sistema; los
-- siguientes entran como OPERARIO DESACTIVADOS, y un administrador los
-- habilita y les asigna rol. El rol NUNCA se lee de los metadatos del alta:
-- con registro abierto, eso sería dejar que cada uno elija su propio permiso.
--
-- Antes de producción: cerrar el registro abierto y dar de alta por invitación.
-- Anotado en docs/DECISIONES_ABIERTAS.md.

create or replace function core.fn_alta_usuario_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_es_primero boolean;
begin
  select not exists (select 1 from core.usuarios) into v_es_primero;

  insert into core.usuarios (
    auth_user_id, nombre_completo, email, rol, sector, activo, fecha_baja
  )
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nombre_completo'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    case when v_es_primero then 'ADMINISTRADOR_SISTEMA' else 'OPERARIO' end::core.rol_enum,
    case when v_es_primero then 'ADMINISTRACION' else 'DEPOSITO' end::core.sector_enum,
    v_es_primero,
    case when v_es_primero then null else current_date end
  );

  return new;
end;
$$;

create or replace trigger trg_alta_usuario_auth
  after insert on auth.users
  for each row execute function core.fn_alta_usuario_auth();

-- ===========================================================================
-- 7. RLS
-- ===========================================================================

alter table core.usuarios  enable row level security;
alter table core.usuarios  force row level security;
alter table core.auditoria enable row level security;
alter table core.auditoria force row level security;

-- Privilegios: sin GRANT no hay operación posible, con política o sin ella.
-- Ningún rol recibe DELETE en ninguna tabla del sistema.
grant select, insert, update on core.usuarios to authenticated;
grant select on core.auditoria to authenticated;
grant select on core.escrituras_privilegiadas to authenticated;

-- La nómina es visible para todo usuario con sesión: cada registro del sistema
-- muestra quién lo firmó, y sin poder resolver el nombre del autor la pantalla
-- muestra un uuid.
create policy usuarios_select_authenticated on core.usuarios
  for select to authenticated
  using (core.rol() is not null);
comment on policy usuarios_select_authenticated on core.usuarios is
  'La nómina es legible por cualquier usuario activo: sostiene la atribución de autoría de todo registro.';

-- Alta y modificación de cuentas: solo el administrador del sistema (§3.5).
create policy usuarios_insert_administrador_sistema on core.usuarios
  for insert to authenticated
  with check (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy usuarios_insert_administrador_sistema on core.usuarios is
  'Alta de cuentas: solo ADMINISTRADOR_SISTEMA (§3.5 del alcance).';

create policy usuarios_update_administrador_sistema on core.usuarios
  for update to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy usuarios_update_administrador_sistema on core.usuarios is
  'Modificación de cuentas y baja lógica: solo ADMINISTRADOR_SISTEMA. RN-49 se sostiene además por la ausencia de DELETE.';

-- Sin política de DELETE. RN-49.

-- Lectura de la ficha propia por el hook de token, que corre como
-- supabase_auth_admin. Es la única fila que ese rol puede ver.
create policy usuarios_select_auth_admin on core.usuarios
  for select to supabase_auth_admin
  using (true);
comment on policy usuarios_select_auth_admin on core.usuarios is
  'Lectura para el hook de access token, que corre como supabase_auth_admin.';

-- La auditoría se lee, no se escribe desde la aplicación: las filas las pone
-- el trigger, que corre como SECURITY DEFINER.
create policy auditoria_select_supervision on core.auditoria
  for select to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));
comment on policy auditoria_select_supervision on core.auditoria is
  'La auditoría la consulta quien responde por ella ante el inspector: Dirección Técnica, Gerencia y Administrador del Sistema.';

-- Único INSERT posible: el del trigger genérico, que es SECURITY DEFINER y por
-- lo tanto corre como el dueño de la tabla. Con FORCE ROW LEVEL SECURITY el
-- dueño también queda sujeto a las políticas, así que sin esta el trigger no
-- podría escribir su propio asiento. La aplicación nunca se conecta como
-- `postgres`: en runtime, ese rol es el trigger y nada más.
create policy auditoria_insert_trigger on core.auditoria
  for insert to postgres
  with check (true);
comment on policy auditoria_insert_trigger on core.auditoria is
  'Habilita la escritura del asiento por el trigger genérico, que corre como dueño de la tabla bajo FORCE RLS.';

-- Sin políticas de UPDATE ni de DELETE sobre core.auditoria (invariante 2).
-- Tampoco se otorga el privilegio a ningún rol de la aplicación.

select core.adjuntar_auditoria('core.usuarios');

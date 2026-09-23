-- ---------------------------------------------------------------------------
-- Andamio mínimo que imita lo que Supabase provee y que las migraciones dan
-- por sentado. Solo se usa en el clúster descartable de verificación; nunca se
-- aplica al proyecto alojado.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

create schema auth;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'
);

-- Misma forma que el auth.uid() de Supabase: tolera el claim vacío, que es lo
-- que deja un set_config(..., true) al terminar su transacción.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

grant usage on schema auth to authenticated, anon, supabase_auth_admin;

-- Simula la sesión que arma PostgREST: fija los claims que inyecta el hook de
-- access token. Con `set role authenticated` después de esto, la conexión se
-- comporta como la de un usuario real de la aplicación, RLS incluida.
-- `record` y no `core.usuarios%rowtype`: este archivo se aplica antes que las
-- migraciones, así que el esquema `core` todavía no existe y el %rowtype se
-- resuelve al crear la función.
create or replace function public.sesion(p_usuario uuid) returns void
language plpgsql as $$
declare u record;
begin
  select * into u from core.usuarios where id = p_usuario;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'rol',        u.rol::text,
    'roles',      to_jsonb(array[u.rol::text]),
    'usuario_id', u.id::text,
    'role',       'authenticated'
  )::text, false);
end; $$;

-- Aserción. No se usa `case when <cond> then 1 else 1/0 end` porque el
-- planificador pliega la rama no tomada y la división por cero explota igual.
create or replace function public.verdad(p boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p is not true then raise exception 'ASERCION FALLIDA: %', p_msg; end if;
end; $$;

grant usage, create on schema public to authenticated;
grant execute on function public.sesion(uuid), public.verdad(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Propósito : Que core.rol(), core.usuario_actual() y core.roles() toleren el
--             claim `request.jwt.claims` vacío, no solo ausente.
-- Reglas    : RN-50 (el trigger de auditoría llama a core.usuario_actual() en
--             cada escritura: si esa función falla, falla toda escritura).
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- EL DEFECTO, ENCONTRADO AL APLICAR.
-- `supabase db push` corre todas las migraciones pendientes en UNA sesión.
-- 20260922200000 fija el claim con set_config(..., true), acotado a su
-- transacción. Al terminar, Postgres no borra la variable: la deja definida y
-- VACÍA (''). La migración siguiente escribe, el trigger de auditoría llama a
-- core.usuario_actual(), y `''::jsonb` falla con «invalid input syntax for
-- type json». Así se cortó el push del 2026-09-23 en 20260922210000, que se
-- revirtió entera.
--
-- core.fn_auditar ya estaba protegida (nullif(..., '') desde 20260904160000).
-- Estas tres no. Con PostgREST nunca pasa —cada pedido trae su claim— pero
-- cualquier sesión que haya usado set_config local queda envenenada para el
-- resto de su vida.
--
-- Mismas definiciones de 20260904140100, con nullif(..., '') antes del cast.
-- Nada más cambia.

create or replace function core.rol()
returns core.rol_enum
language sql
stable
set search_path = ''
as $$
  select nullif(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'rol',
           ''
         )::core.rol_enum;
$$;

create or replace function core.usuario_actual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'usuario_id',
           ''
         )::uuid;
$$;

create or replace function core.roles()
returns core.rol_enum[]
language sql
stable
set search_path = ''
as $$
  select coalesce(
           array(
             select jsonb_array_elements_text(
                      nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'roles'
                    )::core.rol_enum
           ),
           '{}'::core.rol_enum[]
         );
$$;

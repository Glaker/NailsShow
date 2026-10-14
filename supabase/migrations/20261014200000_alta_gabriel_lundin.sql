-- ---------------------------------------------------------------------------
-- Propósito : Habilitar la cuenta de Gabriel Lundin con rol FINANZAS, creada
--             el 2026-10-14 por el registro de Supabase Auth. Queda en el
--             repositorio para que la asignación de permisos tenga historial,
--             como 20261001120000.
-- Reglas    : §3.3 (matriz de permisos), D-38 (rol FINANZAS: lee todo lo
--             económico y fija los costos de referencia). RN-49 / invariante
--             9: el usuario no se borra, se desactiva; acá se activa.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- Sector: core.sector_enum no tiene FINANZAS; va en ADMINISTRACION, el área
-- económica. El rol es lo que define los permisos.
--
-- Por email y sin RAISE: en una base reconstruida desde cero la cuenta no
-- existe y la migración no hace nada, igual que la de Diego.

update core.usuarios
   set rol        = 'FINANZAS',
       sector     = 'ADMINISTRACION',
       activo     = true,
       fecha_baja = null
 where email = 'gabrielilundin@gmail.com';

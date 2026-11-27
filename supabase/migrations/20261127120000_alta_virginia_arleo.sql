-- ---------------------------------------------------------------------------
-- Propósito : Habilitar la cuenta de Virginia Arleo con rol GERENCIA, creada
--             el 2026-11-27 por el registro de Supabase Auth. Queda en el
--             repositorio para que la asignación de permisos tenga historial,
--             como 20261014200000.
-- Reglas    : §3.1 y §3.3 del alcance (Gerencia General: Jorge Bakas,
--             Virginia Arleo; matriz de permisos). RN-49 / invariante 9: el
--             usuario no se borra, se desactiva; acá se activa.
-- Fecha     : 2026-11-27
-- ---------------------------------------------------------------------------
--
-- Por email y sin RAISE: en una base reconstruida desde cero la cuenta no
-- existe y la migración no hace nada, igual que las altas anteriores.

update core.usuarios
   set rol             = 'GERENCIA',
       sector          = 'GERENCIA',
       nombre_completo = 'Virginia Arleo',
       activo          = true,
       fecha_baja      = null
 where email = 'arleosnails@hotmail.com';

-- ---------------------------------------------------------------------------
-- Propósito : Habilitar la cuenta de Anabella Gregorini como Dirección Técnica
--             titular. Queda en el repositorio para que la asignación de
--             permisos tenga historial, como 20260922190000 (la suplente).
-- Reglas    : §3.3 (matriz de permisos), §4.1 (nómina). RN-49 / invariante 9:
--             el usuario no se borra, se desactiva; acá se hace lo inverso.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- El alcance la nombra titular de Dirección Técnica (cubre Control de Calidad
-- y Garantía de Calidad). La distinción con la suplente la lleva
-- `es_dt_titular`; el índice único parcial `usuarios_dt_titular_unica`
-- garantiza que haya una sola. Hasta hoy la base no tenía titular marcada
-- (ESTADO.md, 2026-09-24).
--
-- El registro abierto la dio de alta como OPERARIO desactivado en sector
-- DEPOSITO (core.fn_alta_usuario_auth). El alcance de firma de la suplente
-- sigue siendo la decisión abierta D-25; esta migración no la resuelve.
--
-- Por email y sin RAISE: en una base reconstruida desde cero la cuenta no
-- existe y la migración no hace nada, igual que 20261001120000.

update core.usuarios
   set rol             = 'DIRECCION_TECNICA',
       sector          = 'DIRECCION_TECNICA',
       es_dt_titular   = true,
       nombre_completo = 'Anabella Gregorini',
       activo          = true,
       fecha_baja      = null
 where email = 'agregorini2022@gmail.com';

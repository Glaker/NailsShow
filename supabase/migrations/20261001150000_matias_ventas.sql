-- ---------------------------------------------------------------------------
-- Propósito : Pasar la cuenta de Matias Alonso de GERENCIA_PRODUCCION a VENTAS,
--             el rol que se creó para él (20260929140000) y que tiene su propia
--             sección desde el 2026-10-01.
-- Reglas    : §3.3 (matriz de permisos). Pedido del 2026-10-01.
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------
--
-- Por email y sin RAISE, como 20260911190000: en una base reconstruida desde
-- cero la cuenta no existe y esto no hace nada.

update core.usuarios
   set rol = 'VENTAS'
 where email = 'corporativo.nailshow@gmail.com';

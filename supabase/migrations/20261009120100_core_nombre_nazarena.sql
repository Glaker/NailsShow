-- ---------------------------------------------------------------------------
-- Propósito : Nombre completo de la cuenta de Nazarena («Nazarena Bakás»). El
--             cotizador imprime el nombre de quien emite y hoy figura solo
--             «Nazarena».
-- Reglas    : RN-50 (el cambio queda en core.auditoria por el trigger de la
--             tabla). Pedido del 2026-10-09.
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- Por email y sin RAISE, como 20260911190000: en una base reconstruida desde
-- cero la cuenta no existe y esto no hace nada.

update core.usuarios
   set nombre_completo = 'Nazarena Bakás'
 where email = 'naza@nailshow.com';

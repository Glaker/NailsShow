-- ---------------------------------------------------------------------------
-- Propósito : Motivo de bloqueo EJEMPLO, para lotes cargados de prueba o como
--             demostración. El lote no se borra (invariante 1): queda
--             bloqueado con este motivo, no se despacha ni se consume, y sus
--             rótulos salen con la marca «SOLO EJEMPLO — NO VÁLIDO ANMAT».
-- Reglas    : RN-51, RN-52 (gmp.lote_despachable ya excluye cualquier bloqueo
--             vigente), invariante 1. Pedido del codirector técnico,
--             2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- Va solo en este archivo: un valor nuevo de enum no se puede usar en la misma
-- transacción que lo crea. El bloqueo que lo usa está en 20261014150100.

alter type gmp.motivo_bloqueo_enum add value if not exists 'EJEMPLO';

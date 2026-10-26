-- ---------------------------------------------------------------------------
-- Propósito : Los operarios de ejemplo pasan a llamarse «Operario 1
--             (ejemplo)» … «Operario 5 (ejemplo)». Con «Operario de ejemplo
--             1», buscar «operario 1» en «Quiénes la hacen» no los encontraba.
-- Reglas    : D-operarios-ejemplo-1. RN-50: el cambio de nombre queda en
--             core.auditoria con el anterior.
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------

update core.usuarios
   set nombre_completo = 'Operario ' || substring(email from '^operario([0-9]+)@') || ' (ejemplo)'
 where es_ejemplo and email ~ '^operario[0-9]+@ejemplo\.nailshow\.com\.ar$';

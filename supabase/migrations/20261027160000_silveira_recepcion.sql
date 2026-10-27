-- ---------------------------------------------------------------------------
-- Propósito : Stefania Silveira suma RECEPCION como rol adicional a
--             ENCARGADA_STOCK: ve «Stock y recepciones», registra
--             recepciones, carga a stock, completa depósitos y hace el control
--             rápido de materia prima (incluye aprobarla o rechazarla).
-- Reglas    : §3.3 (matriz de permisos), §4.1 del alcance (rol principal y
--             roles_adicionales), D-recepcion-1 (alcance del rol RECEPCION).
--             Pedido del codirector técnico del 2026-10-27.
-- Fecha     : 2026-10-27
-- ---------------------------------------------------------------------------
--
-- Por email y sin RAISE, como 20261022150300: en una base reconstruida desde
-- cero la cuenta no existe y esto no hace nada. Sin duplicar si ya lo tiene.
-- El rol nuevo entra en el JWT la próxima vez que inicie sesión.

update core.usuarios
   set roles_adicionales = roles_adicionales || 'RECEPCION'::core.rol_enum
 where email = 'stefaniasilveira94@gmail.com'
   and not ('RECEPCION' = any (roles_adicionales));

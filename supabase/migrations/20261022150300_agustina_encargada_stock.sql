-- ---------------------------------------------------------------------------
-- Propósito : Agustina Sierra suma ENCARGADA_STOCK como rol adicional a VENTAS
--             (20261022150000): «Pedidos a armar» y lo que hoy hace Silveira.
-- Reglas    : §3.3 (matriz de permisos), §4.1 del alcance (rol principal y
--             roles_adicionales). Resuelve D-ventas-pedidos-1 en lo que toca a
--             Agustina. Pedido del 2026-10-22.
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- Por email y sin RAISE: en una base reconstruida desde cero la cuenta no
-- existe y esto no hace nada. Sin duplicar si ya lo tiene.

update core.usuarios
   set roles_adicionales = roles_adicionales || 'ENCARGADA_STOCK'::core.rol_enum
 where email = 'administracion@nailshow.com.ar'
   and not ('ENCARGADA_STOCK' = any (roles_adicionales));

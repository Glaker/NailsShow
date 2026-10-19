-- ---------------------------------------------------------------------------
-- Propósito : Dos estados nuevos del pedido de venta, antes de que impacte:
--             ESPERANDO_FECHA (Ventas lo cargó y espera que Gerencia de
--             Producción comprometa una fecha) y FECHA_PROPUESTA (la fecha
--             está y Ventas decide si aprueba).
-- Reglas    : Bloque 3.1 del pedido del 2026-10-15; D-ventas-pedidos-4 y -10.
-- Fecha     : 2026-10-19 (escrita el 2026-10-15 como 20261015130000). Va
--             después de 20261019120000 (core_giorgio_tope_mensual), ya
--             registrada en la base real: los números 20261015130000 y
--             20261019120000 los usa la rama giorgio.
-- ---------------------------------------------------------------------------
--
-- Va sola: un valor agregado a un enum no se puede usar en la misma
-- transacción (lo usa 20261019130100). No es reversible: Postgres no quita
-- valores de un enum.

alter type comercial.estado_pedido_enum add value if not exists 'ESPERANDO_FECHA' after 'BORRADOR';
alter type comercial.estado_pedido_enum add value if not exists 'FECHA_PROPUESTA' after 'ESPERANDO_FECHA';

-- ---------------------------------------------------------------------------
-- Propósito : Valores de enumeración que necesita el entorno Tercerizados.
--             Van en un archivo propio porque un valor agregado con
--             ALTER TYPE ... ADD VALUE no se puede usar en la misma
--             transacción que lo crea.
-- Reglas    : RN-54 (el movimiento se tipifica, no se edita), PG.60.18
--             (clasificación del motivo de baja).
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- ENTRADA_PROVISTO_TERCERO. El material que trae un cliente tercerizado no es
-- una compra de Nail Show: no hay factura de proveedor, no tiene costo propio
-- y no es existencia de la empresa. Registrarlo como ENTRADA_COMPRA mezclaría
-- esas entradas con las compras en cualquier reporte de compras o de stock
-- valorizado.
--
-- DISCONTINUADO. Motivo de baja pedido por el codirector técnico
-- (2026-09-24, «quitar stock por roto, discontinuado, etc.»). Rotura ya
-- existía; discontinuado no entraba en ninguno de los motivos anteriores.

alter type comercial.tipo_movimiento_enum add value if not exists 'ENTRADA_PROVISTO_TERCERO';
alter type comercial.motivo_ajuste_enum   add value if not exists 'DISCONTINUADO';

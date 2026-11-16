-- Hada: tarifa de Claude Sonnet 5.5 para el escalado Haiku -> Sonnet.
--
-- Propósito: Hada responde primero con Haiku y, si el pedido es complejo, la
-- Edge Function repite la llamada con Sonnet 5.5 (D-hada-1, mismo patrón que
-- D-61 de Giorgio). hada_cerrar cobra al precio del modelo que se le pasa:
-- sin esta tarifa, el cierre de una interacción escalada no encontraría
-- precio. Dólares por millón de tokens, referencia oficial al 2026-11-03.
-- Reglas: P6 (docs/disenos/P6-hada.md), RN-50 (el costo se registra y topa).
-- Fecha: 2026-11-16.
--
-- No cambia estructura: suma una clave al jsonb `precios` (el CHECK
-- core.giorgio_config_valida la valida). En una migración core.usuario_actual()
-- es nulo y cambiado_por admite nulo.

update comercial.hada_config
   set precios = precios
     || '{"claude-sonnet-5-5": {"entrada": 2.00, "salida": 10.00, "cache_lectura": 0.10, "cache_escritura": 2.50}}'::jsonb;

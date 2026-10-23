-- ---------------------------------------------------------------------------
-- Propósito : Todo cambio manual de stock de insumos lleva un motivo escrito:
--             ajustes, descarte, muestra y transferencia. Hasta ahora la base
--             solo exigía la clasificación (motivo_tipo) de los ajustes y el
--             descarte; el texto lo pedía la pantalla y nada más.
-- Reglas    : RN-54, RN-50. Pedido del codirector técnico del 2026-10-22
--             («al editar stock se pida un motivo y quede asentado»,
--             D-ajustes-4).
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- NOT VALID: rige para lo que se registre desde ahora. Los movimientos viejos
-- no se tocan (invariante 8) y alguno de prueba puede no tener texto.
-- Los que genera el circuito (conteo, etiquetado, corrección de lote,
-- descarte de artículo) ya escriben su motivo.

alter table comercial.movimientos_stock
  add constraint movimientos_stock_manuales_con_motivo check (
    tipo not in ('ENTRADA_AJUSTE', 'SALIDA_AJUSTE', 'SALIDA_DESCARTE', 'SALIDA_MUESTRA',
                 'TRANSFERENCIA_ENTRE_DEPOSITOS')
    or length(btrim(coalesce(motivo, ''))) > 0
  ) not valid;

comment on constraint movimientos_stock_manuales_con_motivo on comercial.movimientos_stock is
  'D-ajustes-4: un ajuste, descarte, muestra o transferencia de stock lleva su motivo escrito.';

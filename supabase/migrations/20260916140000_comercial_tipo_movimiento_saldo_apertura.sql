-- ---------------------------------------------------------------------------
-- Propósito : Agregar ENTRADA_SALDO_APERTURA a comercial.tipo_movimiento_enum.
--             Segundo de los tres pasos de la carga de saldo inicial de
--             apertura (docs/ESPEC_SALDO_INICIAL.md §3.3). Va en su propia
--             migración por la misma razón que …120000: un valor de enum
--             recién agregado no se puede usar en la misma transacción que lo
--             agregó.
-- Reglas    : RN-54 (el movimiento no se edita ni se borra). §3.3 del
--             documento de la carga: el saldo se modela como movimientos, no
--             como un número que se pisa.
-- Fecha     : 2026-09-16
-- ---------------------------------------------------------------------------
--
-- POR QUÉ UN TIPO NUEVO Y NO `ENTRADA_AJUSTE`.
-- La migración …170000 (20260910) ya tiene un tipo para «ajuste», y en
-- principio alcanzaría. No se reutiliza porque un ajuste es la corrección de
-- un saldo que ya se llevaba en el sistema, y una carga de apertura es lo
-- opuesto: el primer movimiento de un artículo que hasta ahora no tenía
-- ningún movimiento. Mezclar los dos bajo el mismo tipo le complica a
-- cualquier reporte futuro la pregunta «¿esto es saldo migrado o una
-- corrección posterior?», que es justamente la que el documento de la carga
-- pide que quede «permanentemente distinguible» (§1).
--
-- El enum documenta que solo trae los once tipos del Anexo A del alcance;
-- este es un duodécimo, agregado para esta migración de datos puntual y no
-- para uso general. Queda dicho acá en vez de editar ese comentario como si
-- siempre hubiera estado.

alter type comercial.tipo_movimiento_enum add value 'ENTRADA_SALDO_APERTURA';

comment on type comercial.tipo_movimiento_enum is
  'Los once tipos de movimiento del Anexo A del alcance, más ENTRADA_SALDO_APERTURA: un duodécimo tipo agregado '
  'para la carga de saldo inicial de apertura (docs/ESPEC_SALDO_INICIAL.md), no parte del Anexo A original.';

-- ---------------------------------------------------------------------------
-- Propósito : Agregar el estado SALDO_APERTURA a gmp.estado_calidad_enum.
--             Primer paso de la carga del saldo inicial de apertura descrita
--             en docs/ESPEC_SALDO_INICIAL.md (§3.1).
-- Reglas    : Ninguna todavía. Este archivo agrega solo el valor del enum y
--             no lo usa: Postgres no permite usar un valor de enum recién
--             agregado dentro de la misma transacción en la que se lo agregó
--             (ALTER TYPE ... ADD VALUE no es reversible dentro de la misma
--             transacción que lo consume). Por eso va solo, en su propia
--             migración, antes de la migración …130000 que sí lo usa en un
--             CHECK y en gmp.color_rotulo().
-- Fecha     : 2026-09-16
-- ---------------------------------------------------------------------------
--
-- QUÉ ES Y QUÉ NO ES SALDO_APERTURA.
-- Es el estado de un lote de insumo migrado desde el inventario histórico de
-- la planilla «05 INVENTARIO NAIL SHOW FABRICA», sin lote de proveedor
-- identificado, sin protocolo de análisis y sin control de calidad propio del
-- sistema. NO es APROBADO (la aprobación es una propiedad de un lote con
-- circuito de calidad real, y este no lo tiene) y NO es CUARENTENA (no está
-- esperando análisis: no hay análisis que hacerle con los datos que hay).
--
-- La migración …130000 lo hace terminal: no hay transición de ni hacia
-- SALDO_APERTURA en gmp.fn_transicion_lote_insumo. Se llega a él únicamente
-- por INSERT desde la carga de apertura, nunca por UPDATE.

alter type gmp.estado_calidad_enum add value 'SALDO_APERTURA';

comment on type gmp.estado_calidad_enum is
  'Estados de I.20.2 (RECIBIDO…RECHAZADO) más SALDO_APERTURA: existencia migrada del inventario histórico, '
  'sin lote identificado ni circuito de calidad. Ver docs/ESPEC_SALDO_INICIAL.md.';

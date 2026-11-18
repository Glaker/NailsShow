-- ---------------------------------------------------------------------------
-- Propósito : Agregar el rol DESPACHO a core.rol_enum: carga las facturas X
--             de los pedidos de venta (lo que de verdad salió descuenta el
--             stock), marca pedidos despachados y cuenta los SKU que quedan
--             en negativo (20261118170100).
-- Reglas    : §3.3 (matriz de permisos), RN-50, RN-54. Decisión del codirector técnico del
--             2026-11-18 (D-factura-x-1). Primera cuenta: Johana Ponce.
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------
--
-- Solo agrega el valor: Postgres no deja usar un valor de enum en la misma
-- transacción que lo crea (ver 20261020140000).

alter type core.rol_enum add value if not exists 'DESPACHO';

comment on type core.rol_enum is
  'Roles de PG.60.1 más ENCARGADA_STOCK, VENTAS, FINANZAS, RECEPCION, PRODUCCION, CLIENTE y DESPACHO (2026-11-18, '
  'facturas X y despacho, D-factura-x-1). CLIENTE no ve nada interno: entra sin rol en el JWT y solo usa las '
  'funciones comercial.cliente_*. Pendientes de incorporar al organigrama (D-06).';

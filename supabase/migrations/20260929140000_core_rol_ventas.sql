-- ---------------------------------------------------------------------------
-- Propósito : Agregar el rol VENTAS a core.rol_enum: quien carga pedidos,
--             atiende clientes, factura, decide a quién va el stock de Calle 5
--             y fija precios y descuentos (Matias), distinto del de Gerencia de
--             Producción (Nazarena). Es un rol comercial, sin alcance sobre
--             registros regulados.
-- Reglas    : §3.3 (matriz de permisos). Ítem 8 de la cola del 2026-09-24; ver
--             D-31 (quién factura) y D-06 (el organigrama vigente no lo tiene).
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- Solo agrega el valor: Postgres no deja usarlo en la misma transacción que lo
-- crea («unsafe use of new value of enum type»). Los permisos van en
-- 20260929140100. Mismo camino que ENCARGADA_STOCK (20260922220000).

alter type core.rol_enum add value if not exists 'VENTAS';

comment on type core.rol_enum is
  'Roles de PG.60.1 más ENCARGADA_STOCK (2026-09-22) y VENTAS (2026-09-29), roles comerciales sin alcance sobre '
  'registros regulados. Pendientes de incorporar al organigrama (D-06).';

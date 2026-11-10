-- ---------------------------------------------------------------------------
-- Propósito : Agregar el rol CLIENTE a core.rol_enum: clientes mayoristas que
--             arman y envían su pedido desde el celular.
-- Reglas    : RN-49 (un usuario no se borra, se desactiva).
-- Fecha     : 2026-11-10
-- ---------------------------------------------------------------------------
--
-- Va sola: Postgres no deja usar un valor nuevo de un enum en la misma
-- transacción que lo agrega. Lo usa 20261110160100.

alter type core.rol_enum add value if not exists 'CLIENTE';

comment on type core.rol_enum is
  'Roles de PG.60.1 más ENCARGADA_STOCK, VENTAS, FINANZAS, RECEPCION, PRODUCCION y CLIENTE (2026-11-10). CLIENTE no '
  've nada interno: entra sin rol en el JWT y solo usa las funciones comercial.cliente_*.';

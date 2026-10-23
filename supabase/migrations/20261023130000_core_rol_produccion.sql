-- ---------------------------------------------------------------------------
-- Propósito : Agregar el rol PRODUCCION a core.rol_enum: las operarias de
--             planta. Solo ven las tareas que les manda Gerencia de
--             Producción y cargan cuánto hicieron (20261023130100).
--             Reemplaza a OPERARIO, que queda sin uso.
-- Reglas    : §3.3 (matriz de permisos). Decisión del codirector técnico del
--             2026-10-23 (D-tareas-1).
-- Fecha     : 2026-10-23
-- ---------------------------------------------------------------------------
--
-- Solo agrega el valor: Postgres no deja usar un valor de enum en la misma
-- transacción que lo crea (ver 20260922220000). Se usa en 20261023130100.

alter type core.rol_enum add value if not exists 'PRODUCCION';

comment on type core.rol_enum is
  'Roles de PG.60.1 más ENCARGADA_STOCK, VENTAS, FINANZAS, RECEPCION y PRODUCCION (2026-10-23, operarias de planta, '
  'reemplaza a OPERARIO; D-tareas-1). Pendientes de incorporar al organigrama (D-06).';

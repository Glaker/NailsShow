-- ---------------------------------------------------------------------------
-- Propósito : Agregar el rol RECEPCION a core.rol_enum: recibe mercadería, la
--             carga a stock, da de alta insumos y hace el control rápido de
--             materia prima (20261020140100).
-- Reglas    : §3.3 (matriz de permisos), §3.4 (separación de funciones).
--             Decisión del codirector técnico del 2026-10-20 (D-recepcion-1).
-- Fecha     : 2026-10-20
-- ---------------------------------------------------------------------------
--
-- Solo agrega el valor: Postgres no deja usar un valor de enum en la misma
-- transacción que lo crea (ver 20260922220000). Se usa en 20261020140100.
--
-- A DIFERENCIA DE ENCARGADA_STOCK, ESTE ROL SÍ TOCA REGISTROS REGULADOS.
-- 20260922220000 avanzó sin el organigrama v03 (D-06) porque su rol no tocaba
-- nada regulado. Este sí: recepción, rótulos y veredicto de materia prima. Se
-- avanza por decisión expresa del codirector técnico, registrada en
-- D-recepcion-1, y queda para que PG.60.1 v03 lo incorpore.

alter type core.rol_enum add value if not exists 'RECEPCION';

comment on type core.rol_enum is
  'Roles de PG.60.1 más ENCARGADA_STOCK, VENTAS, FINANZAS y RECEPCION (2026-10-20, recepción y control rápido de '
  'materia prima por decisión del codirector técnico, D-recepcion-1). Pendientes de incorporar al organigrama (D-06).';

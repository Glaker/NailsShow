-- ---------------------------------------------------------------------------
-- Propósito : Rol FINANZAS para el módulo de costos, rentabilidad y gerencia
--             (Gabriel Lundin). Lee todo lo económico y escribe costos de
--             referencia, costo hora, parámetros y series macro.
-- Reglas    : §3.3 del alcance ampliada por D-38 (docs/DECISIONES_ABIERTAS.md).
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- Va solo en su archivo: un valor nuevo de enum no se puede usar en la misma
-- transacción que lo agrega, y las políticas de 20261009120300 lo nombran.
-- La cuenta se crea por invitación de Supabase Auth, no acá.

alter type core.rol_enum add value if not exists 'FINANZAS';

comment on type core.rol_enum is
  'Roles de PG.60.1 más ENCARGADA_STOCK (2026-09-22), VENTAS (2026-09-29) y FINANZAS (2026-10-09), roles comerciales '
  'sin alcance sobre registros regulados. Pendientes de incorporar al organigrama (D-06).';

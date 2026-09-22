-- ---------------------------------------------------------------------------
-- Propósito : Agregar el rol ENCARGADA_STOCK a core.rol_enum, para el punto de
--             venta de Calle 5. Es un rol comercial: gestiona entradas y
--             salidas de producto terminado en un depósito propio, y no
--             interviene en ningún circuito regulado.
-- Reglas    : §3.3 (matriz de permisos). No toca ninguna regla GMP: el rol no
--             recibe permiso sobre gmp.lotes_insumo, muestreos, veredictos ni
--             core.auditoria.
-- Fecha     : 2026-09-22
-- ---------------------------------------------------------------------------
--
-- POR QUÉ ESTA MIGRACIÓN NO HACE NADA MÁS QUE AGREGAR EL VALOR.
-- Postgres no deja usar un valor de enum recién agregado dentro de la misma
-- transacción que lo agrega, y `supabase db push` corre cada archivo en una
-- transacción. Si esta migración además creara la política RLS que menciona
-- 'ENCARGADA_STOCK', fallaría con «unsafe use of new value of enum type».
-- Por eso el valor se agrega acá y se usa en 20260922230000.
--
-- EL ROL NO ESTÁ EN EL ORGANIGRAMA VIGENTE.
-- PG.60.1 v01 declara 7 personas y ya no coincide con la realidad; D-06 pide
-- emitir v03 antes de producción porque la matriz de permisos deriva del
-- organigrama. Este rol es un caso más de ese desvío, no uno nuevo: queda
-- anotado para que v03 lo incluya. Se avanza igual porque el rol no toca
-- registros regulados — si los tocara, correspondería esperar el organigrama.

alter type core.rol_enum add value if not exists 'ENCARGADA_STOCK';

comment on type core.rol_enum is
  'Roles de PG.60.1 más ENCARGADA_STOCK (2026-09-22), rol comercial del punto de venta de Calle 5, sin alcance sobre registros regulados. Pendiente de incorporar al organigrama (D-06).';

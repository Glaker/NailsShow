-- ---------------------------------------------------------------------------
-- Propósito : Habilitar la cuenta de Johanna Ponce con rol DESPACHO, creada
--             el 2026-11-24 por el registro de Supabase Auth: carga facturas
--             de venta, marca pedidos despachados y cuenta los SKU en
--             negativo. Queda en el repositorio para que la asignación de
--             permisos tenga historial, como 20261014200000.
-- Reglas    : §3.3 (matriz de permisos), D-factura-x-1 (rol DESPACHO).
--             RN-49 / invariante 9: el usuario no se borra, se desactiva; acá
--             se activa. Pedido del codirector técnico del 2026-11-24.
-- Fecha     : 2026-11-24
-- ---------------------------------------------------------------------------
--
-- Por email y sin RAISE: en una base reconstruida desde cero la cuenta no
-- existe y la migración no hace nada.

update core.usuarios
   set rol             = 'DESPACHO',
       sector          = 'RECEPCION_EXPEDICION',
       nombre_completo = 'Johanna Ponce',
       activo          = true,
       fecha_baja      = null
 where email = 'nailshow.info@gmail.com';

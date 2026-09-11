-- ---------------------------------------------------------------------------
-- Propósito : Completar la unidad de medida de las 40 materias primas cargadas
--             el 2026-09-11, que quedaron pendientes de confirmación. La
--             Gerencia confirmó gramos para las 40. Cierra D-16.
-- Reglas    : Ninguna nueva. Levanta la precondición de recepción que impuso
--             la migración 20260911130000 sobre estos 40 ítems.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- Con esto los 40 pasan a ser recepcionables: gmp.fn_validar_lote_insumo ya no
-- los rechaza, y el selector de insumo de la recepción los habilita.
--
-- SE ACOTA A LAS 40 DE ESA CARGA, no a `unidad_medida is null` en general.
-- Escribir el UPDATE contra la condición «las que no tienen unidad» haría que
-- el resultado dependiera del estado de la tabla en el momento de aplicarla:
-- cualquier insumo dado de alta entre la carga y este push se llevaría un
-- 'g' que nadie confirmó. La lista explícita dice exactamente sobre qué filas
-- actúa, que es lo que un control de cambios tiene que poder leer.
--
-- POR QUÉ NO SE RESTAURA EL `NOT NULL`.
-- La migración 20260911130000 anunció una migración de endurecimiento que
-- devolviera el `NOT NULL`. Hoy se podría: las 340 filas quedan con unidad. No
-- se hace, y conviene dejar dicho el cambio de criterio en vez de que se lea
-- como olvido. Dos razones:
--
--   1. El catálogo se carga por tandas desde planillas de la planta, y ya pasó
--      una vez que una tanda llegue sin unidad. Poder decir «todavía no se
--      sabe» es útil de forma permanente, no un permiso de una sola vez.
--   2. El `NOT NULL` nunca fue la protección real. Garantizaba que la columna
--      tuviera algo escrito, no que ese algo fuera cierto: su efecto práctico
--      era empujar a poner un 'kg' de relleno. La protección real es la
--      precondición de recepción, que actúa donde la unidad importa —cuando
--      entra material y hay cantidades que medir— y que queda vigente.

update gmp.insumos_catalogo
   set unidad_medida = 'g'
 where codigo_interno in (
   '080POL', '101ESE', '131AC', '378ACE',
   '135FRA1', '135FRA2', '135FRA3', '135FRA4', '135FRA5', '135FRA6', '135FRA7',
   '142PIG', '143PIG', '144PIG', '145PIG', '146PIG', '147PIG', '148PIG',
   '149PIG', '150PIG', '151PIG', '152PIG', '153PIG', '154PIG', '155PIG',
   '156PIG', '157PIG', '158PIG', '159PIG', '160PIG', '161PIG', '162PIG',
   '163PIG', '164PIG', '165PIG', '247PIG', '252PIG', '328PIG', '329PIG', '330PIG'
 )
   and unidad_medida is null;

-- ---------------------------------------------------------------------------
-- Propósito : Contenido neto por unidad de producto terminado (g o mL). Sin él
--             no se sabe cuánto granel lleva cada frasco.
-- Reglas    : D-39 (costeo del granel), R-10. Dato de rótulo (contenido neto
--             declarado), no económico: por eso va en gmp y no en comercial.
--             Ningún precio entra en gmp.
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- Lo editan los mismos que hoy editan el producto (productos_update_tecnicos:
-- DT, Gerencia de Producción, Administrador del sistema). Nulo = sin cargar:
-- el costo del granel de ese producto queda marcado como faltante.

alter table gmp.productos
  add column contenido_neto   numeric(12,3) check (contenido_neto > 0),
  add column unidad_contenido text check (unidad_contenido in ('g', 'mL')),
  add constraint productos_contenido_con_unidad
    check ((contenido_neto is null) = (unidad_contenido is null));

comment on column gmp.productos.contenido_neto is
  'Contenido neto por unidad, en unidad_contenido. Es el del rótulo; lo usa el costeo del granel (comercial.costo_producto).';
comment on column gmp.productos.unidad_contenido is
  'g o mL. Con mL el granel se pasa a masa con la densidad de la fórmula (gmp.calcular_lote).';

-- ---------------------------------------------------------------------------
-- Propósito : Capacidad del envase en la ficha del insumo (g o mL): cuánto
--             entra en cada frasco, pote o botella. La pide el alta de un
--             material de envase para cálculos posteriores.
-- Reglas    : Sin RN: el alcance no la cubre (pedido del 2026-10-20, uso y
--             congelamiento abiertos en D-unidad-solo-materia-prima-1). Dato
--             técnico de ficha, espejo de gmp.productos.contenido_neto
--             (20261009120200). No es económico: va en gmp.
-- Fecha     : 2026-10-20
-- ---------------------------------------------------------------------------
--
-- Lo editan los mismos que hoy editan la ficha (insumos_catalogo_update_tecnicos:
-- DT, Gerencia de Producción, Administrador del sistema). La tabla ya tiene RLS
-- forzada y el trigger de auditoría: las columnas nuevas quedan cubiertas.
-- Nula = sin cargar: los envases que ya estaban en el catálogo la completan
-- desde la ficha. Solo tiene sentido en MATERIAL_ENVASE.

alter table gmp.insumos_catalogo
  add column capacidad        numeric(12,3) check (capacidad > 0),
  add column unidad_capacidad text check (unidad_capacidad in ('g', 'mL')),
  add constraint insumos_catalogo_capacidad_con_unidad
    check ((capacidad is null) = (unidad_capacidad is null)),
  add constraint insumos_catalogo_capacidad_solo_envase
    check (capacidad is null or tipo = 'MATERIAL_ENVASE');

comment on column gmp.insumos_catalogo.capacidad is
  'Capacidad del envase, en unidad_capacidad. Solo en MATERIAL_ENVASE.';
comment on column gmp.insumos_catalogo.unidad_capacidad is
  'g o mL, las mismas que gmp.productos.unidad_contenido.';

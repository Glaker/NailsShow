-- ---------------------------------------------------------------------------
-- Propósito : El catálogo de insumos y el de proveedores los dan de alta y los
--             editan todos los roles que los ven (todos menos operarios):
--             nombre, tipo, unidad, depósitos, contacto, todo. Lo pidió el
--             codirector técnico el 2026-10-21 (D-catalogo-1), con la
--             fórmula como caso: DT carga una materia prima que no estaba sin
--             salir de la fórmula.
-- Reglas    : §3.3 (se amplía el alta y edición de maestros, decisión del
--             codirector técnico). Sigue en pie lo que no es edición de la
--             ficha: aprobar o rechazar un proveedor es solo de DT
--             (trg_proveedor_aprobacion), el código de un insumo con lotes no
--             cambia (trg_insumo_codigo_inmutable), nada se borra (sin
--             políticas de DELETE) y todo queda en core.auditoria.
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------

alter policy insumos_catalogo_insert_tecnicos on gmp.insumos_catalogo
  with check (core.es_rol(
    'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION',
    'FINANZAS', 'VENTAS', 'ENCARGADA_STOCK', 'RECEPCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy insumos_catalogo_insert_tecnicos on gmp.insumos_catalogo is
  '§3.3 ampliado: da de alta cualquier rol salvo operario (D-catalogo-1).';

alter policy insumos_catalogo_update_tecnicos on gmp.insumos_catalogo
  using (core.es_rol(
    'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION',
    'FINANZAS', 'VENTAS', 'ENCARGADA_STOCK', 'RECEPCION', 'ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol(
    'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION',
    'FINANZAS', 'VENTAS', 'ENCARGADA_STOCK', 'RECEPCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy insumos_catalogo_update_tecnicos on gmp.insumos_catalogo is
  '§3.3 ampliado: edita la ficha cualquier rol salvo operario (D-catalogo-1). El código se congela con lotes.';

alter policy proveedores_insert_alta_habilitada on gmp.proveedores
  with check (core.es_rol(
    'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION',
    'FINANZAS', 'VENTAS', 'ENCARGADA_STOCK', 'RECEPCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy proveedores_insert_alta_habilitada on gmp.proveedores is
  '§3.3 ampliado: da de alta cualquier rol salvo operario (D-catalogo-1). Aprobar es de DT (trg_proveedor_aprobacion).';

alter policy proveedores_update_alta_habilitada on gmp.proveedores
  using (core.es_rol(
    'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION',
    'FINANZAS', 'VENTAS', 'ENCARGADA_STOCK', 'RECEPCION', 'ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol(
    'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION',
    'FINANZAS', 'VENTAS', 'ENCARGADA_STOCK', 'RECEPCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy proveedores_update_alta_habilitada on gmp.proveedores is
  '§3.3 ampliado: edita la ficha cualquier rol salvo operario (D-catalogo-1). Aprobar es de DT (trg_proveedor_aprobacion).';

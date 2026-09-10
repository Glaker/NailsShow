-- Propósito: eliminar los datos transaccionales ficticios cargados durante la
--            verificación funcional del 2026-09-04 (recepción, lotes, muestreos,
--            rótulos y el proveedor de prueba), y devolver los contadores de
--            numeración a cero para que el primer registro real sea 00001/2026.
--
--            No se tocan: core.usuarios (invariante 9, RN-49), gmp.depositos
--            (maestro sembrado por 20260904140200), gmp.insumos_catalogo
--            (MP-0001 es una materia prima real y reutilizable) ni
--            core.auditoria (invariante 2: append-only, sin excepciones).
--
--            Los triggers trg_prohibir_borrado_* se desactivan solo dentro de
--            esta transacción y se reactivan al final. La prohibición de borrado
--            queda exactamente como estaba. Este archivo es el registro de
--            control de cambios de la purga (GAMP 5).
--
-- Reglas de negocio: ninguna se modifica. Se invocan las invariantes 1, 2 y 9
--            de CLAUDE.md §3 para delimitar el alcance.
--
-- Advertencia regulatoria: los asientos que core.auditoria ya tiene sobre estos
--            registros permanecen, por diseño. La purga borra los datos de
--            negocio, no su rastro.
--
-- Fecha: 2026-09-10

alter table gmp.rotulos      disable trigger trg_prohibir_borrado_rotulos;
alter table gmp.muestreos    disable trigger trg_prohibir_borrado_muestreos;
alter table gmp.lotes_insumo disable trigger trg_prohibir_borrado_lotes_insumo;
alter table gmp.recepciones  disable trigger trg_prohibir_borrado_recepciones;
alter table gmp.proveedores  disable trigger trg_prohibir_borrado_proveedores;

-- Orden dictado por las claves foráneas: rótulos y muestreos cuelgan de los
-- lotes, los lotes de la recepción, la recepción del proveedor.

delete from gmp.rotulos
where entidad_id in (select id from gmp.lotes_insumo)
   or entidad_id in (select id from gmp.muestreos);

delete from gmp.muestreos
where entidad_tipo = 'lote_insumo'
  and entidad_id in (select id from gmp.lotes_insumo);

delete from gmp.lotes_insumo
where recepcion_id in (select id from gmp.recepciones);

delete from gmp.recepciones
where proveedor_id in (select id from gmp.proveedores where cuit = '30712345678');

delete from gmp.proveedores
where cuit = '30712345678';

alter table gmp.rotulos      enable trigger trg_prohibir_borrado_rotulos;
alter table gmp.muestreos    enable trigger trg_prohibir_borrado_muestreos;
alter table gmp.lotes_insumo enable trigger trg_prohibir_borrado_lotes_insumo;
alter table gmp.recepciones  enable trigger trg_prohibir_borrado_recepciones;
alter table gmp.proveedores  enable trigger trg_prohibir_borrado_proveedores;

-- Los contadores no se borran (su trigger de borrado sigue activo): se ponen en
-- cero por UPDATE, que sí queda auditado.
update gmp.contadores set ultimo = 0 where anio = 2026;

-- ---------------------------------------------------------------------------
-- Propósito : El código interno de un insumo se puede cambiar aunque tenga
--             lotes o stock, y el artículo de stock (SKU y descripción) lo
--             sigue solo.
-- Reglas    : RN-50 (el valor anterior queda en la auditoría del insumo y del
--             artículo). Pedido del codirector técnico del 2026-10-30
--             (D-codigo-editable-1). Deja sin efecto el congelamiento de
--             20260911200000.
-- Fecha     : 2026-10-30
-- ---------------------------------------------------------------------------
--
-- POR QUÉ SE CONGELABA Y POR QUÉ YA NO HACE FALTA.
-- 20260911200000 congeló el código porque comercial.articulos copia el código
-- como SKU, y cambiarlo dejaba el SKU citando un código que ya no existe. Los
-- lotes, rótulos, recepciones y movimientos no copian nada: apuntan al insumo
-- por id y muestran el código y el nombre vigentes. Así que alcanza con que
-- el artículo siga al insumo.
--
-- DIRECCIÓN DE DEPENDENCIA.
-- La copia la hace una función de comercial, disparada por el cambio en gmp:
-- comercial lee gmp, gmp no sabe de comercial (ninguna clave foránea nueva).
-- Es SECURITY DEFINER porque el catálogo lo edita cualquier rol salvo
-- operario (D-catalogo-1) y el UPDATE de artículos no: sin eso el SKU quedaría
-- viejo sin error (un UPDATE que RLS filtra afecta cero filas).
--
-- LO QUE NO CAMBIA, A PROPÓSITO.
-- Los documentos ya emitidos (remitos, cotizaciones) guardan el código del
-- día en que se emitieron, y así tienen que quedar. El rótulo impreso también
-- dice el código viejo: si el cambio importa en planta, se reimprime.

drop trigger trg_insumo_codigo_inmutable on gmp.insumos_catalogo;

drop function gmp.fn_insumo_codigo_inmutable();

create or replace function comercial.fn_articulo_sigue_insumo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update comercial.articulos
     set sku = new.codigo_interno, descripcion = new.nombre
   where insumo_id = new.id
     and (sku, descripcion) is distinct from (new.codigo_interno, new.nombre);
  return null;
end;
$$;

comment on function comercial.fn_articulo_sigue_insumo() is
  'El artículo de stock toma el código y el nombre vigentes del insumo (D-codigo-editable-1).';

revoke execute on function comercial.fn_articulo_sigue_insumo() from public, anon, authenticated;

create trigger trg_articulo_sigue_insumo
  after update of codigo_interno, nombre on gmp.insumos_catalogo
  for each row
  when ((new.codigo_interno, new.nombre) is distinct from (old.codigo_interno, old.nombre))
  execute function comercial.fn_articulo_sigue_insumo();

-- Los que ya quedaron desparejos (un nombre corregido antes de este cambio).
update comercial.articulos a
   set sku = i.codigo_interno, descripcion = i.nombre
  from gmp.insumos_catalogo i
 where i.id = a.insumo_id
   and (a.sku, a.descripcion) is distinct from (i.codigo_interno, i.nombre);

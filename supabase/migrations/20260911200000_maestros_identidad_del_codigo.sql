-- ---------------------------------------------------------------------------
-- Propósito : Habilitar la edición de las fichas del catálogo de insumos
--             protegiendo lo único que no puede cambiar: el código interno de
--             un insumo que ya tiene existencia registrada.
-- Reglas    : §3.3 (maestros técnicos: DT, GP, SYS, que ya tienen política de
--             UPDATE). RN-50 (el cambio queda en auditoría con valor anterior).
--             Invariante 7: la propagación hacia `comercial` no se hace desde
--             un trigger de `gmp`.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- La edición de la ficha ya estaba permitida por RLS —`insumos_catalogo_update_tecnicos`
-- existe desde la migración de maestros— pero no había pantalla que la usara.
-- Al construirla aparece un campo que no se puede dejar suelto.
--
-- `codigo_interno` NO ES UN ATRIBUTO, ES LA IDENTIDAD DE NEGOCIO.
-- Cuando un insumo entra a stock por primera vez, `comercial.articulo_de_insumo()`
-- crea el artículo copiando ese código como `sku`. La copia es deliberada: el
-- artículo es de `comercial` y no puede depender de `gmp` fila por fila. Pero
-- eso significa que cambiar el código después deja el SKU apuntando a un código
-- que ya no existe, y el kardex, los movimientos y cualquier papel impreso
-- quedan citando un identificador fantasma. Nadie se entera: no falla nada,
-- simplemente dejan de coincidir.
--
-- La salida no es propagar el cambio a `comercial.articulos` desde acá. Un
-- trigger de `gmp` escribiendo en `comercial` invierte la dirección de
-- dependencia de la invariante 7, que es justamente el motivo por el que
-- `articulo_de_insumo()` vive en `comercial` y no como trigger sobre `gmp`.
--
-- La salida es que el código se pueda corregir mientras el insumo sea solo una
-- ficha, y deje de poder corregirse en cuanto tenga existencia o lotes. Un
-- error de tipeo se arregla el día que se carga; si ya hay material recibido
-- contra ese código, el código es el que figura en el papel y cambiarlo es
-- reescribir el pasado.
--
-- El resto de la ficha —nombre, tipo, unidad, los tres booleanos de circuito,
-- depósitos, activo— se edita siempre. Son atributos: describen el material, no
-- lo identifican, y el asiento de auditoría guarda el valor anterior de cada uno.
--
-- `gmp.productos` no lleva un resguardo equivalente todavía porque nada copia su
-- código: no hay lotes de producto ni artículos de stock de producto terminado.
-- **Cuando se cree `gmp.lotes_producto` o el artículo de producto terminado,
-- este mismo trigger hay que espejarlo ahí.** Anotado en docs/ESTADO.md.

create or replace function gmp.fn_insumo_codigo_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lotes    integer;
  v_articulo boolean;
begin
  if new.codigo_interno is not distinct from old.codigo_interno then
    return new;
  end if;

  select count(*) into v_lotes
    from gmp.lotes_insumo where insumo_id = old.id;

  select exists (select 1 from comercial.articulos where insumo_id = old.id)
    into v_articulo;

  if v_lotes > 0 or v_articulo then
    raise exception
      'El código interno de «%» no se puede cambiar: ya tiene % lote(s) recibidos%. '
      'El código es el que figura en los registros y en el SKU de stock; cambiarlo ahora los dejaría citando un código inexistente. '
      'Si el código está mal, corresponde dar de baja este insumo y dar de alta el correcto.',
      old.nombre, v_lotes,
      case when v_articulo then ' y artículo de stock creado' else '' end
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function gmp.fn_insumo_codigo_inmutable() is
  'Deja corregir el código interno mientras el insumo sea solo una ficha, y lo congela en cuanto tiene lotes o artículo de stock. '
  'La propagación a comercial.articulos.sku no se hace desde acá: invertiría la dirección de dependencia de la invariante 7.';

create trigger trg_insumo_codigo_inmutable
  before update on gmp.insumos_catalogo
  for each row execute function gmp.fn_insumo_codigo_inmutable();

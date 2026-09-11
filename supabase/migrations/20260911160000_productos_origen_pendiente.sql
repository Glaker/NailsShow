-- ---------------------------------------------------------------------------
-- Propósito : Permitir que un producto se catalogue con el origen sin definir.
--             La lista de la planta no lo trae y el default 'FABRICADO' lo
--             afirmaría de los 483 por igual, que es falso.
-- Reglas    : Ninguna nueva. §4.7 (`origen` define el recorrido de producción).
--             CLAUDE.md §7: no inventar reglas de negocio.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- `origen` se creó `not null default 'FABRICADO'` pensando en una carga que
-- trajera el dato. La lista que llegó tiene dos columnas, código y nombre, y
-- nada más. Dejar correr el default escribiría «esto se fabrica en planta» en
-- las 483 filas, y alcanza con leer la lista para saber que no es cierto: los
-- «Nail Tips … x100u.» son importados, y los pinceles, fresas y exhibidores no
-- se fabrican ni se fraccionan porque no son producto cosmético.
--
-- El daño no sería cosmético. `origen` decide qué recorrido de producción le
-- corresponde al producto (§4.7): un 'FABRICADO' inventado manda un pincel al
-- circuito de elaboración de granel. Es el mismo criterio que se aplicó a
-- `unidad_medida` en insumos y a `tipo` y `forma_cosmetica` en este mismo
-- catálogo: la columna admite «todavía no se sabe», y esa ignorancia queda a
-- la vista en lugar de disfrazarse de dato.
--
-- No se agrega acá la precondición equivalente a la de la recepción porque el
-- circuito de producción todavía no existe. **Cuando se construya, la orden de
-- producción tiene que rechazar un producto sin `origen`**, igual que
-- gmp.fn_validar_lote_insumo rechaza un insumo sin unidad. Queda anotado en
-- docs/ESTADO.md como parte del alcance de esa fase.

alter table gmp.productos
  alter column origen drop not null,
  alter column origen drop default;

comment on column gmp.productos.origen is
  '§4.7: cómo llega el producto al circuito. NULL = todavía no clasificado, que no es lo mismo que FABRICADO. '
  'Sin origen no puede abrirse una orden de producción: la precondición va con el circuito de producción.';

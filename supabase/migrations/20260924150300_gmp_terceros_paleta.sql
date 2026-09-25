-- ---------------------------------------------------------------------------
-- Propósito : Restringir el color del cuadrito de un cliente tercerizado a la
--             paleta que no se confunde con los rótulos de estado.
-- Reglas    : RN-04 e I.20.2 (amarillo, gris, verde y rojo comunican el estado
--             del material y están reservados; ver src/app/theme.ts).
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- 20260924150100 admitía verde, lima, amarillo, naranja y rojo. En planta el
-- color es lo que comunica si un material está en cuarentena o aprobado, y un
-- cuadrito verde de cliente degrada esa señal. La pantalla ya ofrecía solo la
-- paleta segura; la base, que es la autoridad, pasa a exigirla. Todavía no hay
-- terceros cargados, así que el cambio no toca datos.

alter table gmp.terceros drop constraint terceros_color_check;

alter table gmp.terceros
  add constraint terceros_color_check
  check (color in ('teal', 'cyan', 'blue', 'indigo', 'grape', 'pink'));

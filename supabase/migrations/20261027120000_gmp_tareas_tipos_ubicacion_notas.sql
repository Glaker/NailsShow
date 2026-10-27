-- ---------------------------------------------------------------------------
-- Propósito : Tareas de producción más completas (pedido del 2026-10-27):
--             1) Tipos predeterminados Reprocesar y Limpiar, además de
--                Envasar, Etiquetar, Lotear y Otra: con tipo y producto
--                («Envasar Sanitizante de 100 ML AMOR») las estadísticas
--                agrupan sin depender del texto.
--             2) Dónde están las cosas y dónde dejarlas: lo propone el
--                sistema (depósito y estiba de cada insumo) y Naza lo cambia.
--             3) Notas para las chicas.
-- Reglas    : D-tareas-3 (codirector técnico, 2026-10-27), sobre D-tareas-1.
--             No es registro GMP: organiza el trabajo.
-- Fecha     : 2026-10-27
-- ---------------------------------------------------------------------------

alter table gmp.tareas_produccion drop constraint tareas_produccion_tipo_check;
alter table gmp.tareas_produccion add constraint tareas_produccion_tipo_check
  check (tipo in ('ENVASAR', 'ETIQUETAR', 'REPROCESAR', 'LIMPIAR', 'LOTEAR', 'OTRA'));

alter table gmp.tareas_produccion
  add column donde_buscar text check (donde_buscar is null or length(donde_buscar) <= 2000),
  add column donde_dejar  text check (donde_dejar is null or length(donde_dejar) <= 500),
  add column notas        text check (notas is null or length(notas) <= 2000);

comment on column gmp.tareas_produccion.donde_buscar is
  'Dónde están los insumos o las cosas para la tarea (depósito y estiba). Lo propone el sistema; Naza lo cambia (D-tareas-3).';
comment on column gmp.tareas_produccion.donde_dejar is
  'Dónde dejar lo hecho. Lo propone el sistema; Naza lo cambia (D-tareas-3).';
comment on column gmp.tareas_produccion.notas is
  'Instrucciones de Naza para las chicas (D-tareas-3).';

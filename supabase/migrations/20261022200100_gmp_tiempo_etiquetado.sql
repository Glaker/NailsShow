-- ---------------------------------------------------------------------------
-- Propósito : El tiempo por unidad son dos: envasado y etiquetado, y el que
--             usa el Gantt es la suma. Se cargan en MM:SS, así que la columna
--             de minutos guarda segundos sin redondear (5 decimales).
-- Reglas    : Ninguna RN: planificación. Amplía D-tiempo-envasado-1 por
--             pedido del codirector técnico del 2026-10-22 (D-ajustes-2).
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------

alter table gmp.productos
  alter column minutos_envasado_unidad type numeric(10,5),
  add column minutos_etiquetado_unidad numeric(10,5)
    check (minutos_etiquetado_unidad is null or minutos_etiquetado_unidad > 0);

comment on column gmp.productos.minutos_envasado_unidad is
  'Minutos que le lleva a una persona envasar una unidad (se carga en MM:SS). Vacío = no cargado (D-tiempo-envasado-1).';
comment on column gmp.productos.minutos_etiquetado_unidad is
  'Minutos que le lleva a una persona etiquetar una unidad (MM:SS). El tiempo por unidad es envasado + etiquetado. '
  'Vacío = no cargado (D-ajustes-2).';

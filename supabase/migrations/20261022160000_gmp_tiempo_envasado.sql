-- ---------------------------------------------------------------------------
-- Propósito : Tiempo de envasado de cada producto, para que Gerencia de
--             Producción calcule cuántos días lleva una tanda y el Gantt le
--             recomiende la duración: minutos por unidad y por persona, un
--             margen (10 % por defecto) y cuántas personas trabajan. La
--             jornada (8 a 15 con 30 min de descanso) vive en la aplicación.
-- Reglas    : Ninguna RN: planificación, no registro regulado. Decisión del
--             codirector técnico del 2026-10-21 (D-tiempo-envasado-1).
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- En gmp.productos porque es un dato del producto, como sin_formula: lo
-- editan DT y GP (productos_update_tecnicos) y queda auditado por el trigger
-- genérico de la tabla. Vacío = no se cargó, y el Gantt no recomienda nada.

alter table gmp.productos
  add column minutos_envasado_unidad numeric(8,3)
    check (minutos_envasado_unidad is null or minutos_envasado_unidad > 0),
  add column margen_envasado_pct     numeric(5,2) not null default 10
    check (margen_envasado_pct between 0 and 100),
  add column personas_envasado       integer not null default 1
    check (personas_envasado between 1 and 50);

comment on column gmp.productos.minutos_envasado_unidad is
  'Minutos que le lleva a una persona envasar una unidad. Vacío = no cargado (D-tiempo-envasado-1).';
comment on column gmp.productos.margen_envasado_pct is
  'Margen que se suma al tiempo de envasado, en porcentaje (D-tiempo-envasado-1).';
comment on column gmp.productos.personas_envasado is
  'Cuántas personas envasan el producto, por defecto, para recomendar los días de producción (D-tiempo-envasado-1).';

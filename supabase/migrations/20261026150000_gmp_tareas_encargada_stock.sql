-- ---------------------------------------------------------------------------
-- Propósito : La encargada de stock (Agustina, y con el mismo rol Silveira)
--             también asigna tareas a las operarias, arma el día y modifica
--             cualquier tarea pendiente o en curso, la haya cargado Naza o
--             ella. Para eso ve todas las tareas, no solo las suyas.
-- Reglas    : D-tareas-agustina-1 (pedido del codirector técnico del
--             2026-10-26), sobre D-tareas-1. No es registro GMP: organiza el
--             trabajo. RN-50: cada cambio sigue en core.auditoria.
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------

create or replace function gmp.es_gestor_tareas()
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ENCARGADA_STOCK');
$$;

comment on function gmp.es_gestor_tareas() is
  'Quién manda tareas y arma el día: Gerencia de Producción, DT y la encargada de stock (D-tareas-agustina-1).';

-- Quien gestiona ve todas las tareas; las operarias, las suyas (sin cambios).
alter policy tareas_produccion_select_visibles on gmp.tareas_produccion
  using (gmp.ve_productividad()
         or gmp.es_gestor_tareas()
         or core.usuario_actual() = any (asignadas)
         -- Las que están en curso, para poder sumarse al grupo.
         or (estado = 'EN_CURSO' and gmp.puede_trabajar_tarea(id))
         or exists (select 1 from gmp.tarea_tramos t join gmp.tramo_participantes p on p.tramo_id = t.id
                     where t.tarea_id = tareas_produccion.id and p.usuario_id = core.usuario_actual()));
comment on policy tareas_produccion_select_visibles on gmp.tareas_produccion is
  'Quien gestiona ve todas; las operarias, lo que les mandaron, en lo que trabajaron y lo que está en curso '
  '(D-tareas-1, D-tareas-agustina-1).';

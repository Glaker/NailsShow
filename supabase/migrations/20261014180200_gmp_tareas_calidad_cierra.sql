-- ---------------------------------------------------------------------------
-- Propósito : Quien puede registrar una etapa de planta tiene que poder
--             cerrar su tarea (trg_op_etapa_termina_tarea corre con su
--             sesión): se suma Control de Calidad a las políticas de
--             gmp.tareas_planta. Sin esto, una etapa registrada por Calidad
--             fallaría al cerrar la tarea.
-- Reglas    : §4.7. Complementa 20261014180100.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------

alter policy tareas_planta_insert_planta on gmp.tareas_planta
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA', 'OPERARIO', 'CONTROL_CALIDAD'));
alter policy tareas_planta_update_planta on gmp.tareas_planta
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA', 'OPERARIO', 'CONTROL_CALIDAD'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA', 'OPERARIO', 'CONTROL_CALIDAD'));

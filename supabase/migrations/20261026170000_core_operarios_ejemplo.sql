-- ---------------------------------------------------------------------------
-- Propósito : Operarios de ejemplo para ver cómo funcionan las tareas, sin
--             que cuenten como trabajo: «Operario de ejemplo 1» a 5
--             (operarioN@ejemplo.nailshow.com.ar, creados en Auth el
--             2026-10-26). Quedan con rol PRODUCCION y marcados es_ejemplo;
--             el informe de trabajo de operarias (y el tiempo medido que sale
--             de él) no los cuenta. Naza o DT los dan de baja cuando ya no
--             sirven.
-- Reglas    : D-operarios-ejemplo-1 (codirector técnico, 2026-10-26).
--             Invariante 9 / RN-49: un usuario no se borra, se desactiva; lo
--             que hicieron queda en core.auditoria.
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------

alter table core.usuarios add column es_ejemplo boolean not null default false;
comment on column core.usuarios.es_ejemplo is
  'Cuenta de ejemplo, para practicar (D-operarios-ejemplo-1): no cuenta en los informes de trabajo.';

-- Por email y sin RAISE, como las altas anteriores: en una base reconstruida
-- desde cero las cuentas no existen y esto no hace nada.
update core.usuarios
   set rol        = 'PRODUCCION',
       sector     = 'PRODUCCION',
       activo     = true,
       fecha_baja = null,
       es_ejemplo = true
 where email ~ '^operario[0-9]+@ejemplo\.nailshow\.com\.ar$';

-- Copia de 20260911180000 con es_ejemplo al final.
create or replace view core.v_nomina as
  select
    u.id,
    u.nombre_completo,
    u.rol,
    u.activo,
    u.es_ejemplo
  from core.usuarios u;

-- Naza (o DT) da de baja un operario de ejemplo. Solo de ejemplo: el resto
-- de las bajas sigue siendo del administrador del sistema.
create or replace function core.dar_de_baja_ejemplo(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filas integer;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Los operarios de ejemplo los da de baja Gerencia de Producción o DT.'
      using errcode = 'insufficient_privilege';
  end if;
  update core.usuarios
     set activo = false, fecha_baja = current_date
   where id = p_usuario and es_ejemplo and activo;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'Solo se da de baja así un operario de ejemplo activo.'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function core.dar_de_baja_ejemplo(uuid) is
  'Desactiva un operario de ejemplo (no lo borra: invariante 9). D-operarios-ejemplo-1.';
revoke execute on function core.dar_de_baja_ejemplo(uuid) from public, anon;
grant execute on function core.dar_de_baja_ejemplo(uuid) to authenticated;

-- Copia de 20261023140000 sin los operarios de ejemplo. Mismas columnas.
create or replace view gmp.v_trabajo_operarias with (security_invoker = true) as
with tramos as (
  select t.*,
         case when t.cierre = 'PAUSA' then
           (select t2.id from gmp.tarea_tramos t2
             where t2.tarea_id = t.tarea_id and t2.iniciado_en > t.iniciado_en
               and t2.cierre in ('LISTO_HOY', 'COMPLETA')
             order by t2.iniciado_en limit 1)
         else t.id end as bloque_id
    from gmp.tarea_tramos t
   where t.terminado_en is not null and t.cierre <> 'CANCELADO'
),
parte as (
  select p.id as participacion_id, p.tramo_id, tr.bloque_id, p.usuario_id, p.desde,
         coalesce(p.hasta, tr.terminado_en) as hasta,
         extract(epoch from coalesce(p.hasta, tr.terminado_en) - p.desde) / 60.0 as minutos
    from gmp.tramo_participantes p
    join tramos tr on tr.id = p.tramo_id
),
total as (
  select bloque_id, sum(minutos) as minutos_bloque, count(*) as personas
    from parte where bloque_id is not null group by bloque_id
)
select pa.participacion_id, pa.tramo_id, tr.tarea_id, pa.usuario_id, n.nombre_completo as operaria,
       (pa.desde at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
       pa.desde as inicio, pa.hasta as fin, round(pa.minutos::numeric, 2) as minutos,
       ta.tipo, ta.descripcion, ta.producto_id, pr.codigo_interno, pr.nombre as producto,
       ta.orden_id, o.numero_lote as lote,
       -- Una pausa sin «Listo» todavía: 0 hasta que se cargue.
       round(case when tot.bloque_id is null then 0
                  when tot.minutos_bloque > 0 then coalesce(cierre.cantidad, 0) * pa.minutos / tot.minutos_bloque
                  else coalesce(cierre.cantidad, 0) / tot.personas end, 3) as cantidad,
       tr.cierre,
       (select string_agg(distinct n2.nombre_completo, ', ')
          from gmp.tramo_participantes p2 join core.v_nomina n2 on n2.id = p2.usuario_id
         where p2.tramo_id = pa.tramo_id and p2.usuario_id <> pa.usuario_id) as con_quien,
       j.entrada, j.salida
  from parte pa
  join tramos tr on tr.id = pa.tramo_id
  left join total tot on tot.bloque_id = pa.bloque_id
  left join gmp.tarea_tramos cierre on cierre.id = pa.bloque_id
  join gmp.tareas_produccion ta on ta.id = tr.tarea_id
  left join gmp.productos pr on pr.id = ta.producto_id
  left join gmp.ordenes_produccion o on o.id = ta.orden_id
  left join core.v_nomina n on n.id = pa.usuario_id
  left join gmp.jornadas_operarias j
         on j.usuario_id = pa.usuario_id
        and j.fecha = (pa.desde at time zone 'America/Argentina/Buenos_Aires')::date
 where gmp.ve_productividad()
   -- D-operarios-ejemplo-1: lo de los operarios de ejemplo no es trabajo.
   and not coalesce(n.es_ejemplo, false);

comment on view gmp.v_trabajo_operarias is
  'Informe de producción (D-tareas-1, D-tareas-2): por operaria y tramo, qué hizo, de qué producto y lote, cuánto le '
  'toca (lo cargado en el «Listo», repartido por minutos entre ese tramo y las pausas que lo precedieron), de cuándo '
  'a cuándo y con quién. Solo para GP, DT, Gerencia y Finanzas. Sin los operarios de ejemplo (D-operarios-ejemplo-1).';

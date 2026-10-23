-- ---------------------------------------------------------------------------
-- Propósito : La pausa es para cortar un rato, típicamente para comer
--             (aclaración del codirector técnico del 2026-10-23):
--             1) Pausa (⏸) no pide cantidad y la tarea sigue en curso (en
--                pausa), no pendiente.
--             2) Seguir (▶) retoma con el mismo grupo. Si una sigue
--                trabajando mientras las otras paran, las otras salen del
--                grupo (gmp.cambiar_grupo) y vuelven a sumarse.
--             3) Lo que cargan en el «Listo» cubre también lo hecho antes de
--                la pausa: se reparte por minutos entre todos los tramos del
--                bloque (las pausas y el tramo que cierra).
-- Reglas    : RN-50, invariante 1 (nada se reescribe: cambian la función y la
--             vista). Amplía D-tareas-1 (D-tareas-2).
-- Fecha     : 2026-10-23
-- ---------------------------------------------------------------------------

-- Copia de 20261023130100 con la pausa distinta: sin cantidad y en curso.
create or replace function gmp.cerrar_tramo(p_tramo_id uuid, p_cierre text, p_cantidad numeric default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tramo gmp.tarea_tramos%rowtype;
  v_t     gmp.tareas_produccion%rowtype;
  v_hecho numeric;
  v_cant  numeric := p_cantidad;
begin
  if p_cierre not in ('PAUSA', 'LISTO_HOY', 'COMPLETA', 'CANCELADO') then
    raise exception 'Cierre desconocido: %.', p_cierre using errcode = 'check_violation';
  end if;
  select * into v_tramo from gmp.tarea_tramos where id = p_tramo_id for update;
  if not found or v_tramo.terminado_en is not null then
    raise exception 'Esa tarea no está en curso.' using errcode = 'check_violation';
  end if;
  if not gmp.puede_trabajar_tarea(v_tramo.tarea_id) then
    raise exception 'Las tareas las hace el personal de producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_t from gmp.tareas_produccion where id = v_tramo.tarea_id for update;

  -- D-tareas-2: la pausa no cuenta nada; lo cuenta el «Listo».
  if p_cierre in ('CANCELADO', 'PAUSA') then
    v_cant := null;
  elsif p_cierre = 'COMPLETA' and v_cant is null then
    select coalesce(sum(cantidad), 0) into v_hecho
      from gmp.tarea_tramos where tarea_id = v_t.id and cierre in ('LISTO_HOY', 'COMPLETA');
    v_cant := greatest(coalesce(v_t.cantidad, 0) - v_hecho, 0);
  elsif v_cant is null then
    raise exception 'Decí cuántas hicieron.' using errcode = 'check_violation';
  end if;
  if v_cant < 0 then
    raise exception 'La cantidad no puede ser negativa.' using errcode = 'check_violation';
  end if;

  perform set_config('gmp.tramos_por_funcion', 'si', true);
  update gmp.tramo_participantes set hasta = now() where tramo_id = p_tramo_id and hasta is null;
  update gmp.tarea_tramos
     set terminado_en = now(), terminado_por = core.usuario_actual(), cierre = p_cierre, cantidad = v_cant
   where id = p_tramo_id;
  update gmp.tareas_produccion
     set estado = case p_cierre when 'COMPLETA' then 'LISTA' when 'PAUSA' then 'EN_CURSO' else 'PENDIENTE' end,
         terminada_en = case when p_cierre = 'COMPLETA' then now() end
   where id = v_t.id;
  perform set_config('gmp.tramos_por_funcion', '', true);
end;
$$;

-- Seguir después de la pausa: un tramo nuevo con las que estaban al pausar.
create or replace function gmp.reanudar_tarea(p_tarea_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pausa gmp.tarea_tramos%rowtype;
  v_tramo uuid;
begin
  if not gmp.puede_trabajar_tarea(p_tarea_id) then
    raise exception 'Las tareas las hace el personal de producción.' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from gmp.tareas_produccion where id = p_tarea_id for update;
  select * into v_pausa from gmp.tarea_tramos
   where tarea_id = p_tarea_id order by iniciado_en desc limit 1;
  if not found or v_pausa.cierre is distinct from 'PAUSA' then
    raise exception 'La tarea no está en pausa.' using errcode = 'check_violation';
  end if;

  perform set_config('gmp.tramos_por_funcion', 'si', true);
  insert into gmp.tarea_tramos (tarea_id) values (p_tarea_id) returning id into v_tramo;
  insert into gmp.tramo_participantes (tramo_id, usuario_id)
  select distinct v_tramo, usuario_id from gmp.tramo_participantes
   where tramo_id = v_pausa.id and hasta = v_pausa.terminado_en;
  perform set_config('gmp.tramos_por_funcion', '', true);
  return v_tramo;
end;
$$;

comment on function gmp.reanudar_tarea(uuid) is
  'Seguir después de la pausa: retoma la tarea con el mismo grupo (D-tareas-2).';
revoke execute on function gmp.reanudar_tarea(uuid) from public, anon;
grant execute on function gmp.reanudar_tarea(uuid) to authenticated;

-- Copia de 20261023130100 con el reparto por bloque: las pausas se suman al
-- tramo que las cierra («Listo por hoy» o «Completamos»), y lo cargado ahí se
-- reparte por minutos entre todo el bloque. Mismas columnas.
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
 where gmp.ve_productividad();

comment on view gmp.v_trabajo_operarias is
  'Informe de producción (D-tareas-1, D-tareas-2): por operaria y tramo, qué hizo, de qué producto y lote, cuánto le '
  'toca (lo cargado en el «Listo», repartido por minutos entre ese tramo y las pausas que lo precedieron), de cuándo '
  'a cuándo y con quién. Solo para GP, DT, Gerencia y Finanzas.';

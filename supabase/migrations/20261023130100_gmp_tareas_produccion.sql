-- ---------------------------------------------------------------------------
-- Propósito : Tareas de producción con tiempos y productividad:
--             1) Gerencia de Producción (Naza) arma la cola del día: tareas
--                («Etiquetar 500 unidades de Sanitizante»), con prioridad y
--                las operarias que la hacen, y quién trabaja y en qué horario.
--             2) Las operarias (rol PRODUCCION) inician, paran, cancelan y
--                terminan. Trabajan de a varias: una carga por todas, y el
--                grupo cambia cuando alguien entra o sale.
--             3) La base toma los tiempos (no se tipean ni se les muestran) y
--                reparte lo hecho entre quienes estaban, según el tiempo de
--                cada una. De ahí salen productividad, el informe mensual y el
--                tiempo medido por producto.
-- Reglas    : RN-50 (auditoría), invariante 3. No es registro GMP: organiza
--             el trabajo; lo regulado sigue en op_etapas. Pedido del
--             codirector técnico del 2026-10-23 (D-tareas-1).
-- Fecha     : 2026-10-23
-- ---------------------------------------------------------------------------
--
-- POR QUÉ EL REPARTO ES POR TIEMPO. «Dos envasaron 500: 250 cada una» es el
-- caso en que las dos estuvieron todo el tramo. Si una entró a la mitad, le
-- toca menos: lo hecho se reparte en proporción a los minutos de cada una
-- dentro del tramo. Con todas el tramo completo, es la división en partes
-- iguales que se pidió.

-- ===========================================================================
-- 1. El rol PRODUCCION reemplaza a OPERARIO
-- ===========================================================================

update core.usuarios set rol = 'PRODUCCION' where rol = 'OPERARIO';
update core.usuarios
   set roles_adicionales = array_replace(roles_adicionales, 'OPERARIO'::core.rol_enum, 'PRODUCCION'::core.rol_enum)
 where 'OPERARIO' = any (roles_adicionales);

-- ===========================================================================
-- 2. Quién trabaja cada día y en qué horario
-- ===========================================================================

create table gmp.jornadas_operarias (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  usuario_id uuid not null references core.usuarios(id),
  entrada    time not null default '08:00',
  salida     time not null default '15:00',
  -- Sacarla del día no la da de baja: ese día no trabaja.
  trabaja    boolean not null default true,
  -- Orden de las columnas en el tablero de Naza.
  orden      integer not null default 0,
  unique (fecha, usuario_id),
  check (salida > entrada)
);

comment on table gmp.jornadas_operarias is
  'Quién trabaja cada día y su horario (8 a 15 por defecto). Lo carga Gerencia de Producción (D-tareas-1).';

create index jornadas_operarias_usuario_idx on gmp.jornadas_operarias (usuario_id);

-- ===========================================================================
-- 3. Tareas
-- ===========================================================================

create table gmp.tareas_produccion (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('ETIQUETAR', 'ENVASAR', 'LOTEAR', 'OTRA')),
  descripcion  text not null check (length(btrim(descripcion)) > 0),
  producto_id  uuid references gmp.productos(id),
  orden_id     uuid references gmp.ordenes_produccion(id),
  cantidad     numeric(14,3) check (cantidad is null or cantidad > 0),
  -- Menor primero. Se reordena arrastrando.
  prioridad    numeric not null default 0,
  asignadas    uuid[] not null default '{}',
  estado       text not null default 'PENDIENTE'
                 check (estado in ('PENDIENTE', 'EN_CURSO', 'LISTA', 'CANCELADA')),
  creada_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  creada_en    timestamptz not null default now(),
  terminada_en timestamptz
);

comment on table gmp.tareas_produccion is
  'Tareas que Gerencia de Producción manda a las operarias, en orden de prioridad (D-tareas-1). El estado lo mueven '
  'las funciones de los tramos; Naza la puede cancelar.';

create index tareas_produccion_activas_idx on gmp.tareas_produccion (prioridad) where estado in ('PENDIENTE', 'EN_CURSO');
create index tareas_produccion_orden_idx on gmp.tareas_produccion (orden_id);
create index tareas_produccion_producto_idx on gmp.tareas_produccion (producto_id);
create index tareas_produccion_creada_por_idx on gmp.tareas_produccion (creada_por);
create index tareas_produccion_asignadas_idx on gmp.tareas_produccion using gin (asignadas);

-- Un tramo es un rato de trabajo de un grupo sobre una tarea.
create table gmp.tarea_tramos (
  id           uuid primary key default gen_random_uuid(),
  tarea_id     uuid not null references gmp.tareas_produccion(id),
  iniciado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  iniciado_en  timestamptz not null default now(),
  terminado_por uuid references core.usuarios(id),
  terminado_en timestamptz,
  -- PAUSA: paran un rato. LISTO_HOY: queda pendiente. COMPLETA: se terminó.
  -- CANCELADO: no se cuenta.
  cierre       text check (cierre in ('PAUSA', 'LISTO_HOY', 'COMPLETA', 'CANCELADO')),
  cantidad     numeric(14,3) check (cantidad is null or cantidad >= 0),
  check ((terminado_en is null) = (cierre is null)),
  check (cierre is distinct from 'CANCELADO' or cantidad is null)
);

comment on table gmp.tarea_tramos is
  'Rato de trabajo sobre una tarea: inicio y fin los pone la base, la cantidad la carga una por el grupo (D-tareas-1).';

create unique index tarea_tramos_uno_abierto on gmp.tarea_tramos (tarea_id) where terminado_en is null;
create index tarea_tramos_iniciado_por_idx on gmp.tarea_tramos (iniciado_por);
create index tarea_tramos_terminado_por_idx on gmp.tarea_tramos (terminado_por);
create index tarea_tramos_iniciado_en_idx on gmp.tarea_tramos (iniciado_en);

create table gmp.tramo_participantes (
  id          uuid primary key default gen_random_uuid(),
  tramo_id    uuid not null references gmp.tarea_tramos(id),
  usuario_id  uuid not null references core.usuarios(id),
  desde       timestamptz not null default now(),
  hasta       timestamptz,
  sumada_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  check (hasta is null or hasta >= desde)
);

comment on table gmp.tramo_participantes is
  'Quién estuvo en cada tramo y desde/hasta cuándo: el grupo cambia si alguien entra o sale (D-tareas-1).';

create unique index tramo_participantes_una_vez on gmp.tramo_participantes (tramo_id, usuario_id) where hasta is null;
create index tramo_participantes_usuario_idx on gmp.tramo_participantes (usuario_id);
create index tramo_participantes_sumada_por_idx on gmp.tramo_participantes (sumada_por);

-- ===========================================================================
-- 4. Los tiempos y el estado solo los mueven las funciones
-- ===========================================================================

create or replace function gmp.es_gestor_tareas()
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
$$;

create or replace function gmp.fn_tramos_por_funcion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('gmp.tramos_por_funcion', true), '') <> 'si' then
    raise exception 'Los tiempos de una tarea los registra la base al iniciar, parar o terminar: no se escriben a mano.'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_tramos_por_funcion before insert or update or delete on gmp.tarea_tramos
  for each row execute function gmp.fn_tramos_por_funcion();
create trigger trg_participantes_por_funcion before insert or update or delete on gmp.tramo_participantes
  for each row execute function gmp.fn_tramos_por_funcion();

-- Naza edita la tarea (texto, prioridad, asignadas, cancelar); el estado de
-- trabajo lo mueven las funciones. Una tarea lista o cancelada no se toca.
create or replace function gmp.fn_tarea_produccion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_funcion boolean := coalesce(current_setting('gmp.tramos_por_funcion', true), '') = 'si';
begin
  if tg_op = 'INSERT' then
    new.creada_por := core.usuario_actual();
    new.creada_en := now();
    new.estado := 'PENDIENTE';
    new.terminada_en := null;
  else
    if (new.id, new.creada_por, new.creada_en) is distinct from (old.id, old.creada_por, old.creada_en) then
      raise exception 'Quién creó la tarea y cuándo no cambia.' using errcode = 'restrict_violation';
    end if;
    if old.estado in ('LISTA', 'CANCELADA') and not v_funcion then
      raise exception 'La tarea está %: ya no se modifica.', lower(old.estado) using errcode = 'restrict_violation';
    end if;
    if not v_funcion then
      if (new.estado, new.terminada_en) is distinct from (old.estado, old.terminada_en)
         and not (new.estado = 'CANCELADA' and old.estado = 'PENDIENTE') then
        raise exception 'El estado de la tarea cambia al iniciarla o terminarla; a mano solo se cancela una pendiente.'
          using errcode = 'restrict_violation';
      end if;
      if new.estado = 'CANCELADA' then
        new.terminada_en := now();
      end if;
    end if;
  end if;
  if exists (select 1 from unnest(new.asignadas) a where not exists (select 1 from core.v_nomina n where n.id = a)) then
    raise exception 'Una de las operarias asignadas no existe.' using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger trg_tarea_produccion before insert or update on gmp.tareas_produccion
  for each row execute function gmp.fn_tarea_produccion();

-- ===========================================================================
-- 5. Iniciar, sumarse, salir, cerrar
-- ===========================================================================

create or replace function gmp.puede_trabajar_tarea(p_tarea_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select gmp.es_gestor_tareas() or core.es_rol('PRODUCCION', 'ENCARGADA_STOCK', 'RECEPCION');
$$;

create or replace function gmp.iniciar_tarea(p_tarea_id uuid, p_con uuid[] default '{}')
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_t     gmp.tareas_produccion%rowtype;
  v_yo    uuid := core.usuario_actual();
  v_tramo uuid;
begin
  if not gmp.puede_trabajar_tarea(p_tarea_id) then
    raise exception 'Las tareas las hace el personal de producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_t from gmp.tareas_produccion where id = p_tarea_id for update;
  if not found then
    raise exception 'La tarea no existe o no es tuya.' using errcode = 'check_violation';
  end if;
  if v_t.estado in ('LISTA', 'CANCELADA') then
    raise exception 'La tarea ya está %.', lower(v_t.estado) using errcode = 'check_violation';
  end if;
  if exists (select 1 from gmp.tarea_tramos where tarea_id = p_tarea_id and terminado_en is null) then
    raise exception 'La tarea ya está empezada: sumate al grupo.' using errcode = 'check_violation';
  end if;

  perform set_config('gmp.tramos_por_funcion', 'si', true);
  insert into gmp.tarea_tramos (tarea_id) values (p_tarea_id) returning id into v_tramo;
  insert into gmp.tramo_participantes (tramo_id, usuario_id)
  select v_tramo, u from (select distinct unnest(array[v_yo] || coalesce(p_con, '{}')) u) x;
  update gmp.tareas_produccion set estado = 'EN_CURSO' where id = p_tarea_id;
  perform set_config('gmp.tramos_por_funcion', '', true);
  return v_tramo;
end;
$$;

-- Cualquiera del grupo (o la que llega) suma o saca a alguien, en cualquier momento.
create or replace function gmp.cambiar_grupo(p_tramo_id uuid, p_usuario_id uuid, p_entra boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tramo gmp.tarea_tramos%rowtype;
begin
  select * into v_tramo from gmp.tarea_tramos where id = p_tramo_id for update;
  if not found or v_tramo.terminado_en is not null then
    raise exception 'Esa tarea no está en curso.' using errcode = 'check_violation';
  end if;
  if not gmp.puede_trabajar_tarea(v_tramo.tarea_id) then
    raise exception 'Las tareas las hace el personal de producción.' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('gmp.tramos_por_funcion', 'si', true);
  if p_entra then
    if not exists (select 1 from gmp.tramo_participantes
                    where tramo_id = p_tramo_id and usuario_id = p_usuario_id and hasta is null) then
      insert into gmp.tramo_participantes (tramo_id, usuario_id) values (p_tramo_id, p_usuario_id);
    end if;
  else
    update gmp.tramo_participantes set hasta = now()
     where tramo_id = p_tramo_id and usuario_id = p_usuario_id and hasta is null;
    if not exists (select 1 from gmp.tramo_participantes where tramo_id = p_tramo_id and hasta is null) then
      raise exception 'No puede quedar nadie trabajando: si se van todas, tocá «Parar».' using errcode = 'check_violation';
    end if;
  end if;
  perform set_config('gmp.tramos_por_funcion', '', true);
end;
$$;

-- PAUSA y LISTO_HOY: lo hecho en este tramo (puede ser 0). COMPLETA: si no
-- se dice cuánto, lo que faltaba. CANCELADO: no se cuenta nada.
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

  if p_cierre = 'CANCELADO' then
    v_cant := null;
  elsif p_cierre = 'COMPLETA' and v_cant is null then
    select coalesce(sum(cantidad), 0) into v_hecho
      from gmp.tarea_tramos where tarea_id = v_t.id and cierre in ('PAUSA', 'LISTO_HOY', 'COMPLETA');
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
     set estado = case when p_cierre = 'COMPLETA' then 'LISTA' else 'PENDIENTE' end,
         terminada_en = case when p_cierre = 'COMPLETA' then now() end
   where id = v_t.id;
  perform set_config('gmp.tramos_por_funcion', '', true);
end;
$$;

comment on function gmp.iniciar_tarea(uuid, uuid[]) is
  'Inicia un tramo de trabajo con quien llama y sus compañeras. La hora la pone la base (D-tareas-1).';
comment on function gmp.cambiar_grupo(uuid, uuid, boolean) is
  'Alguien entra o sale del grupo de una tarea en curso. Queda desde/hasta cuándo estuvo (D-tareas-1).';
comment on function gmp.cerrar_tramo(uuid, text, numeric) is
  'Parar (PAUSA), listo por hoy (LISTO_HOY: queda pendiente), completé (COMPLETA: lista) o cancelar (no cuenta). '
  'Una carga la cantidad por todo el grupo (D-tareas-1).';

-- ===========================================================================
-- 6. Productividad e informes (solo para quien gestiona)
-- ===========================================================================
--
-- Una fila por operaria y tramo: cuánto le toca de lo hecho, en proporción a
-- sus minutos en el tramo. Las operarias no ven esto (pedido del 2026-10-23).

create or replace function gmp.ve_productividad()
returns boolean
language sql
stable
set search_path = ''
as $$
  select core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA', 'FINANZAS');
$$;

create view gmp.v_trabajo_operarias with (security_invoker = true) as
with parte as (
  select p.id as participacion_id, p.tramo_id, p.usuario_id, p.desde,
         coalesce(p.hasta, t.terminado_en) as hasta,
         extract(epoch from coalesce(p.hasta, t.terminado_en) - p.desde) / 60.0 as minutos
    from gmp.tramo_participantes p
    join gmp.tarea_tramos t on t.id = p.tramo_id
   where t.terminado_en is not null and t.cierre <> 'CANCELADO'
),
total as (
  select tramo_id, sum(minutos) as minutos_tramo, count(*) as personas from parte group by tramo_id
)
select pa.participacion_id, pa.tramo_id, tr.tarea_id, pa.usuario_id, n.nombre_completo as operaria,
       (pa.desde at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
       pa.desde as inicio, pa.hasta as fin, round(pa.minutos::numeric, 2) as minutos,
       ta.tipo, ta.descripcion, ta.producto_id, pr.codigo_interno, pr.nombre as producto,
       ta.orden_id, o.numero_lote as lote,
       round(case when tot.minutos_tramo > 0 then coalesce(tr.cantidad, 0) * pa.minutos / tot.minutos_tramo
                  else coalesce(tr.cantidad, 0) / tot.personas end, 3) as cantidad,
       tr.cierre,
       (select string_agg(distinct n2.nombre_completo, ', ')
          from gmp.tramo_participantes p2 join core.v_nomina n2 on n2.id = p2.usuario_id
         where p2.tramo_id = pa.tramo_id and p2.usuario_id <> pa.usuario_id) as con_quien,
       j.entrada, j.salida
  from parte pa
  join total tot on tot.tramo_id = pa.tramo_id
  join gmp.tarea_tramos tr on tr.id = pa.tramo_id
  join gmp.tareas_produccion ta on ta.id = tr.tarea_id
  left join gmp.productos pr on pr.id = ta.producto_id
  left join gmp.ordenes_produccion o on o.id = ta.orden_id
  left join core.v_nomina n on n.id = pa.usuario_id
  left join gmp.jornadas_operarias j
         on j.usuario_id = pa.usuario_id
        and j.fecha = (pa.desde at time zone 'America/Argentina/Buenos_Aires')::date
 where gmp.ve_productividad();

comment on view gmp.v_trabajo_operarias is
  'Informe de producción (D-tareas-1): por operaria y tramo, qué hizo, de qué producto y lote, cuánto le toca '
  '(en proporción a sus minutos), de cuándo a cuándo y con quién. Solo para GP, DT, Gerencia y Finanzas.';

-- Minutos de una persona por unidad, por producto y tipo de tarea: el tiempo
-- medido que propone «Calcular producción» (lo que se carga sigue mandando).
create view gmp.v_tiempo_medido_producto with (security_invoker = true) as
select producto_id, tipo,
       sum(minutos) as minutos_persona,
       sum(cantidad) as unidades,
       case when sum(cantidad) > 0 then round(sum(minutos) / sum(cantidad), 5) end as minutos_por_unidad,
       count(distinct tramo_id) as tramos
  from gmp.v_trabajo_operarias
 where producto_id is not null
 group by producto_id, tipo;

comment on view gmp.v_tiempo_medido_producto is
  'Tiempo medido por unidad y por persona, de lo que cargaron las operarias (D-tareas-1). Sugerencia para el '
  'tiempo de envasado y etiquetado del producto, que se sigue editando a mano.';

-- Producido por semana (cierra el viernes), de las órdenes terminadas: el
-- informe anual. Lo rechazado y lo anulado no cuenta.
create view gmp.v_produccion_semanal with (security_invoker = true) as
select o.producto_id,
       (d + ((5 - extract(isodow from d)::int + 7) % 7))::date as viernes,
       sum(coalesce(o.unidades_obtenidas, o.cantidad_obtenida, o.cantidad_teorica)) as cantidad
  from gmp.ordenes_produccion o
  cross join lateral (select (o.terminada_en at time zone 'America/Argentina/Buenos_Aires')::date as d) x
 where o.terminada_en is not null and o.estado in ('TERMINADA', 'LIBERADA')
 group by o.producto_id, 2;

comment on view gmp.v_produccion_semanal is
  'Unidades producidas por producto y semana (cerrada el viernes), de órdenes terminadas o liberadas (D-tareas-1).';

-- ===========================================================================
-- 7. RLS, permisos y auditoría
-- ===========================================================================

alter table gmp.jornadas_operarias  enable row level security;
alter table gmp.jornadas_operarias  force  row level security;
alter table gmp.tareas_produccion   enable row level security;
alter table gmp.tareas_produccion   force  row level security;
alter table gmp.tarea_tramos        enable row level security;
alter table gmp.tarea_tramos        force  row level security;
alter table gmp.tramo_participantes enable row level security;
alter table gmp.tramo_participantes force  row level security;

select core.adjuntar_auditoria('gmp.jornadas_operarias');
select core.adjuntar_auditoria('gmp.tareas_produccion');
select core.adjuntar_auditoria('gmp.tarea_tramos');
select core.adjuntar_auditoria('gmp.tramo_participantes');

grant select, insert, update on gmp.jornadas_operarias, gmp.tareas_produccion to authenticated;
grant select, insert, update on gmp.tarea_tramos, gmp.tramo_participantes to authenticated;
grant select on gmp.v_trabajo_operarias, gmp.v_tiempo_medido_producto, gmp.v_produccion_semanal to authenticated;

create policy jornadas_operarias_select_authenticated on gmp.jornadas_operarias
  for select to authenticated using (core.rol() is not null);
comment on policy jornadas_operarias_select_authenticated on gmp.jornadas_operarias is
  'Quién trabaja hoy lo ve todo el personal (D-tareas-1).';
create policy jornadas_operarias_escribe_gestor on gmp.jornadas_operarias
  for insert to authenticated with check (gmp.es_gestor_tareas());
create policy jornadas_operarias_actualiza_gestor on gmp.jornadas_operarias
  for update to authenticated using (gmp.es_gestor_tareas()) with check (gmp.es_gestor_tareas());
comment on policy jornadas_operarias_escribe_gestor on gmp.jornadas_operarias is
  'Arma el día Gerencia de Producción (o DT) (D-tareas-1).';

-- Las operarias ven sus tareas (asignadas o en las que trabajaron); quien
-- gestiona o lee productividad, todas.
create policy tareas_produccion_select_visibles on gmp.tareas_produccion
  for select to authenticated
  using (gmp.ve_productividad()
         or core.usuario_actual() = any (asignadas)
         -- Las que están en curso, para poder sumarse al grupo.
         or (estado = 'EN_CURSO' and gmp.puede_trabajar_tarea(id))
         or exists (select 1 from gmp.tarea_tramos t join gmp.tramo_participantes p on p.tramo_id = t.id
                     where t.tarea_id = tareas_produccion.id and p.usuario_id = core.usuario_actual()));
comment on policy tareas_produccion_select_visibles on gmp.tareas_produccion is
  'Las operarias ven lo que les mandaron, en lo que trabajaron y lo que está en curso (para sumarse) (D-tareas-1).';
create policy tareas_produccion_escribe_gestor on gmp.tareas_produccion
  for insert to authenticated with check (gmp.es_gestor_tareas());
comment on policy tareas_produccion_escribe_gestor on gmp.tareas_produccion is
  'Las tareas las manda Gerencia de Producción (o DT) (D-tareas-1).';
create policy tareas_produccion_actualiza on gmp.tareas_produccion
  for update to authenticated
  using (gmp.es_gestor_tareas() or gmp.puede_trabajar_tarea(id))
  with check (gmp.es_gestor_tareas() or gmp.puede_trabajar_tarea(id));
comment on policy tareas_produccion_actualiza on gmp.tareas_produccion is
  'Naza edita; las operarias solo mueven el estado, y eso lo acota gmp.fn_tarea_produccion a las funciones.';

create policy tarea_tramos_select_authenticated on gmp.tarea_tramos
  for select to authenticated using (core.rol() is not null);
comment on policy tarea_tramos_select_authenticated on gmp.tarea_tramos is
  'Si una tarea está en curso lo ve el personal; los tiempos se escriben solo por las funciones (D-tareas-1).';
create policy tarea_tramos_escribe_planta on gmp.tarea_tramos
  for insert to authenticated with check (gmp.puede_trabajar_tarea(tarea_id));
create policy tarea_tramos_actualiza_planta on gmp.tarea_tramos
  for update to authenticated using (gmp.puede_trabajar_tarea(tarea_id)) with check (gmp.puede_trabajar_tarea(tarea_id));
comment on policy tarea_tramos_escribe_planta on gmp.tarea_tramos is
  'Producción, stock, recepción y quien gestiona; siempre a través de las funciones (D-tareas-1).';

create policy tramo_participantes_select_authenticated on gmp.tramo_participantes
  for select to authenticated using (core.rol() is not null);
comment on policy tramo_participantes_select_authenticated on gmp.tramo_participantes is
  'Quién está en cada grupo lo ve el personal (D-tareas-1).';
create policy tramo_participantes_escribe_planta on gmp.tramo_participantes
  for insert to authenticated with check (gmp.puede_trabajar_tarea(null));
create policy tramo_participantes_actualiza_planta on gmp.tramo_participantes
  for update to authenticated using (gmp.puede_trabajar_tarea(null)) with check (gmp.puede_trabajar_tarea(null));
comment on policy tramo_participantes_escribe_planta on gmp.tramo_participantes is
  'Producción, stock, recepción y quien gestiona; siempre a través de las funciones (D-tareas-1).';

revoke execute on function gmp.iniciar_tarea(uuid, uuid[]), gmp.cambiar_grupo(uuid, uuid, boolean),
  gmp.cerrar_tramo(uuid, text, numeric) from public, anon;
grant execute on function gmp.iniciar_tarea(uuid, uuid[]), gmp.cambiar_grupo(uuid, uuid, boolean),
  gmp.cerrar_tramo(uuid, text, numeric), gmp.es_gestor_tareas(), gmp.ve_productividad(),
  gmp.puede_trabajar_tarea(uuid) to authenticated;

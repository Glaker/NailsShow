-- ---------------------------------------------------------------------------
-- Propósito : Nuevo producto también para Gerencia de Producción (Naza), con
--             Dirección Técnica aprobando:
--             1) El procedimiento que redacta GP queda a aprobar. Rige la
--                última versión aprobada (la de DT, aprobada al guardarla).
--             2) «No la sé» también para procedimiento y especificación: se
--                deriva a DT, como ya pasaba con la fórmula.
--             3) Copiar la fórmula o la especificación de otro producto como
--                borrador nuevo, editable.
-- Reglas    : PG.60.8, RN-50, invariante 1 (nada se pisa: aprobar es una fila
--             nueva). Pedido del codirector técnico del 2026-10-23
--             (D-nuevo-producto-1).
-- Fecha     : 2026-10-23
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Procedimiento: lo de GP espera aprobación de DT
-- ===========================================================================
--
-- Las versiones ya cargadas quedan como estaban (default false): ya rigen.

alter table gmp.formula_procedimientos
  add column requiere_aprobacion boolean not null default false;

comment on column gmp.formula_procedimientos.requiere_aprobacion is
  'La redactó alguien que no es Dirección Técnica: rige recién cuando DT la aprueba '
  '(gmp.procedimiento_aprobaciones). La pone la base (D-nuevo-producto-1).';

-- Copia de 20260924140000 con la marca: la pone la base, no el que escribe.
create or replace function gmp.fn_procedimiento_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('procedimiento|' || new.formula_id::text, 0));
  select coalesce(max(version), 0) + 1 into new.version
    from gmp.formula_procedimientos where formula_id = new.formula_id;
  new.creado_en := now();
  new.requiere_aprobacion := not core.es_rol('DIRECCION_TECNICA');
  return new;
end;
$$;

create table gmp.procedimiento_aprobaciones (
  procedimiento_id uuid primary key references gmp.formula_procedimientos(id),
  aprobado_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  aprobado_en      timestamptz not null default now()
);

comment on table gmp.procedimiento_aprobaciones is
  'Aprobación de Dirección Técnica de un procedimiento redactado por GP (D-nuevo-producto-1). Append-only.';

create index procedimiento_aprobaciones_aprobado_por_idx on gmp.procedimiento_aprobaciones (aprobado_por);

create or replace function gmp.fn_procedimiento_aprobable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from gmp.formula_procedimientos
                  where id = new.procedimiento_id and requiere_aprobacion) then
    raise exception 'Ese procedimiento no espera aprobación: lo redactó Dirección Técnica y ya rige.'
      using errcode = 'check_violation';
  end if;
  new.aprobado_en := now();
  return new;
end;
$$;

create trigger trg_procedimiento_aprobable
  before insert on gmp.procedimiento_aprobaciones
  for each row execute function gmp.fn_procedimiento_aprobable();

alter table gmp.procedimiento_aprobaciones enable row level security;
alter table gmp.procedimiento_aprobaciones force  row level security;
select core.adjuntar_auditoria('gmp.procedimiento_aprobaciones');
grant select, insert on gmp.procedimiento_aprobaciones to authenticated;

create policy procedimiento_aprobaciones_select_authenticated on gmp.procedimiento_aprobaciones
  for select to authenticated using (core.rol() is not null);
comment on policy procedimiento_aprobaciones_select_authenticated on gmp.procedimiento_aprobaciones is
  'Todo el que lee el procedimiento ve si está aprobado.';
create policy procedimiento_aprobaciones_insert_dt on gmp.procedimiento_aprobaciones
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA') and aprobado_por = core.usuario_actual());
comment on policy procedimiento_aprobaciones_insert_dt on gmp.procedimiento_aprobaciones is
  'Aprueba Dirección Técnica, a su nombre (D-nuevo-producto-1).';

-- La que rige: la última aprobada. Misma forma que la de 20260924140000, con
-- dos columnas al final.
create or replace view gmp.v_procedimiento_vigente
with (security_invoker = true) as
select distinct on (p.formula_id)
  p.formula_id, p.id, p.version, p.texto, p.motivo_cambio, p.creado_en,
  p.redactado_por, n.nombre_completo as redactado_por_nombre,
  a.aprobado_por, a.aprobado_en
from gmp.formula_procedimientos p
left join core.v_nomina n on n.id = p.redactado_por
left join gmp.procedimiento_aprobaciones a on a.procedimiento_id = p.id
where not p.requiere_aprobacion or a.procedimiento_id is not null
order by p.formula_id, p.version desc;

-- Copia de 20261016130000: la orden toma la versión que rige, no la última.
create or replace function gmp.fn_orden_numerar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anio integer := extract(year from new.jornada)::int;
  v_n    integer;
  v_vida integer;
  v_proc integer;
begin
  v_n := gmp.siguiente_numero_orden(v_anio);
  new.numero := format('OP-%s-%s', v_anio, lpad(v_n::text, 4, '0'));

  new.numero_lote := format('#%s %s', new.presentacion, to_char(new.jornada, 'DD/MM/YY'));
  if new.vencimiento is null then
    select coalesce(e.vida_util_meses, p.vida_util_meses) into v_vida
      from gmp.productos p
      left join gmp.especificaciones e on e.id = new.especificacion_id
     where p.id = new.producto_id;
    if v_vida is null then
      raise exception 'El producto no tiene vida útil cargada: indicá el vencimiento.' using errcode = 'check_violation';
    end if;
    new.vencimiento := (new.jornada + make_interval(months => v_vida))::date;
  end if;
  new.vencimiento_texto := format('P%s %s', new.partida, to_char(new.vencimiento, 'MM/YY'));

  -- D-nuevo-producto-1: la versión que rige, sin las que esperan aprobación.
  select version into v_proc from gmp.v_procedimiento_vigente where formula_id = new.formula_id;
  new.procedimiento_version := v_proc;
  if new.especificacion_id is null then
    select especificacion_id into new.especificacion_id from gmp.formulas_fabricacion where id = new.formula_id;
  end if;
  if new.estado <> 'ABIERTA' then
    raise exception 'Una orden nace abierta.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 2. «No la sé» para procedimiento y especificación
-- ===========================================================================

create table gmp.consultas_dt (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references gmp.productos(id),
  seccion        text not null check (seccion in ('PROCEDIMIENTO', 'ESPECIFICACION')),
  consultada_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  consultada_en  timestamptz not null default now(),
  unique (producto_id, seccion)
);

comment on table gmp.consultas_dt is
  '«No la sé»: Gerencia de Producción deriva a Dirección Técnica el procedimiento o la especificación de un producto '
  '(D-nuevo-producto-1). La fórmula sigue en gmp.productos.formula_consultada_en. Append-only: se resuelve cargándolo.';

create index consultas_dt_consultada_por_idx on gmp.consultas_dt (consultada_por);

alter table gmp.consultas_dt enable row level security;
alter table gmp.consultas_dt force  row level security;
select core.adjuntar_auditoria('gmp.consultas_dt');
grant select, insert on gmp.consultas_dt to authenticated;

create policy consultas_dt_select_authenticated on gmp.consultas_dt
  for select to authenticated using (core.rol() is not null);
comment on policy consultas_dt_select_authenticated on gmp.consultas_dt is
  '§3.3: consulta para todos los roles.';
create policy consultas_dt_insert_produccion_dt on gmp.consultas_dt
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and consultada_por = core.usuario_actual());
comment on policy consultas_dt_insert_produccion_dt on gmp.consultas_dt is
  'Deriva Gerencia de Producción (o DT), a su nombre (D-nuevo-producto-1).';

-- Lo que DT tiene que cargar o aprobar, en una sola lista.
create view gmp.v_pendientes_dt with (security_invoker = true) as
select p.id as producto_id, p.codigo_interno, p.nombre, 'FORMULA'::text as seccion,
       'NO_LA_SABE'::text as motivo, p.formula_consultada_en as desde, u.nombre_completo as pedido_por
  from gmp.productos p
  left join core.v_nomina u on u.id = p.formula_consultada_por
 where p.formula_consultada_en is not null and p.activo and not p.sin_formula and not p.solo_reventa
   and not exists (select 1 from gmp.formulas_fabricacion f
                    where f.producto_id = p.id and f.estado <> 'DADO_DE_BAJA')
union all
select p.id, p.codigo_interno, p.nombre, c.seccion, 'NO_LA_SABE', c.consultada_en, u.nombre_completo
  from gmp.consultas_dt c
  join gmp.productos p on p.id = c.producto_id
  left join core.v_nomina u on u.id = c.consultada_por
 where p.activo
   and not (c.seccion = 'PROCEDIMIENTO' and exists (
         select 1 from gmp.formula_procedimientos fp
           join gmp.formulas_fabricacion f on f.id = fp.formula_id
          where f.producto_id = p.id and f.estado <> 'DADO_DE_BAJA'))
   and not (c.seccion = 'ESPECIFICACION' and exists (
         select 1 from gmp.especificaciones e where e.producto_id = p.id and e.estado <> 'DADO_DE_BAJA'))
union all
select p.id, p.codigo_interno, p.nombre, 'FORMULA', 'A_APROBAR', f.creado_en, u.nombre_completo
  from gmp.formulas_fabricacion f
  join gmp.productos p on p.id = f.producto_id
  left join core.v_nomina u on u.id = f.emitida_por
 where f.estado = 'BORRADOR' and p.activo
union all
select p.id, p.codigo_interno, p.nombre, 'PROCEDIMIENTO', 'A_APROBAR', fp.creado_en, u.nombre_completo
  from gmp.formula_procedimientos fp
  join gmp.formulas_fabricacion f on f.id = fp.formula_id
  join gmp.productos p on p.id = f.producto_id
  left join core.v_nomina u on u.id = fp.redactado_por
 where fp.requiere_aprobacion
   and not exists (select 1 from gmp.procedimiento_aprobaciones a where a.procedimiento_id = fp.id)
   -- Una versión que ya quedó atrás de otra que rige no hace falta aprobarla.
   and fp.version > coalesce((select v.version from gmp.v_procedimiento_vigente v where v.formula_id = f.id), 0)
union all
select p.id, p.codigo_interno, p.nombre, 'ESPECIFICACION', 'A_APROBAR', e.creado_en, u.nombre_completo
  from gmp.especificaciones e
  join gmp.productos p on p.id = e.producto_id
  left join core.v_nomina u on u.id = e.emitida_por
 where e.estado = 'BORRADOR' and p.activo;

comment on view gmp.v_pendientes_dt is
  'Lo que Dirección Técnica tiene que cargar («No la sé») o aprobar (borradores de fórmula y especificación, '
  'procedimientos de GP), por producto (D-nuevo-producto-1).';
grant select on gmp.v_pendientes_dt to authenticated;

-- ===========================================================================
-- 3. Copiar de otro producto, como borrador editable
-- ===========================================================================

create or replace function gmp.copiar_formula(p_origen uuid, p_producto_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_o       gmp.formulas_fabricacion%rowtype;
  v_version integer;
  v_id      uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Copiar una fórmula es de Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_o from gmp.formulas_fabricacion where id = p_origen;
  if not found then
    raise exception 'La fórmula que se quiere copiar no existe.' using errcode = 'check_violation';
  end if;
  select coalesce(max(version::integer), 0) + 1 into v_version
    from gmp.formulas_fabricacion
   where producto_id = p_producto_id and variedad is null and version ~ '^[0-9]+$';

  insert into gmp.formulas_fabricacion (producto_id, version, densidad_producto, densidad_temp_c, rendimiento)
  values (p_producto_id, v_version::text, v_o.densidad_producto, v_o.densidad_temp_c, v_o.rendimiento)
  returning id into v_id;

  insert into gmp.formula_componentes
    (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
     etapa, observacion)
  select v_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
         etapa, observacion
    from gmp.formula_componentes
   where formula_id = p_origen and not anulado;
  return v_id;
end;
$$;

comment on function gmp.copiar_formula(uuid, uuid) is
  'D-nuevo-producto-1: la fórmula de otro producto como borrador nuevo de este, con sus componentes. La pasa a '
  'vigente Dirección Técnica, como cualquier borrador.';

create or replace function gmp.copiar_especificacion(p_origen uuid, p_producto_id uuid, p_codigo_poe text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_o  gmp.especificaciones%rowtype;
  v_id uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Copiar una especificación es de Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_o from gmp.especificaciones where id = p_origen;
  if not found then
    raise exception 'La especificación que se quiere copiar no existe.' using errcode = 'check_violation';
  end if;

  insert into gmp.especificaciones
    (codigo_poe, version, producto_id, tipo_producto, denominacion, composicion_inci,
     condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses)
  select btrim(p_codigo_poe), '00', p_producto_id, v_o.tipo_producto, p.nombre, v_o.composicion_inci,
         v_o.condiciones_almacenamiento, v_o.instrucciones_muestreo, v_o.periodo_reanalisis_meses,
         coalesce(p.vida_util_meses, v_o.vida_util_meses)
    from gmp.productos p where p.id = p_producto_id
  returning id into v_id;

  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp)
  select v_id, orden, componente, porcentaje_min, porcentaje_max, es_csp
    from gmp.espec_formula where especificacion_id = p_origen and not quitado;

  insert into gmp.espec_parametros
    (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad,
     metodo_ensayo, condicion_ensayo, referencia_norma, obligatorio)
  select v_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad,
         metodo_ensayo, condicion_ensayo, referencia_norma, obligatorio
    from gmp.espec_parametros where especificacion_id = p_origen and not quitado;
  return v_id;
end;
$$;

comment on function gmp.copiar_especificacion(uuid, uuid, text) is
  'D-nuevo-producto-1: la especificación de otro producto como borrador 00 de este, con otro código y la '
  'denominación del producto. La aprueba Dirección Técnica.';

revoke execute on function gmp.copiar_formula(uuid, uuid), gmp.copiar_especificacion(uuid, uuid, text)
  from public, anon;
grant execute on function gmp.copiar_formula(uuid, uuid), gmp.copiar_especificacion(uuid, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Propósito : Especificaciones de producto (documentos I-E.50.xx): denominación,
--             composición INCI, fórmula cuali-cuantitativa con rangos,
--             requisitos por grupo con su criterio, almacenamiento, muestreo,
--             reanálisis y vida útil. Versionadas: la vigente no se edita, se
--             emite otra versión.
-- Reglas    : §4.6 y §7.1 del alcance, PG.60.8, RN-50. Invariante 1 de
--             CLAUDE.md (lo aprobado no se pisa). Ítem 6 de la cola del
--             2026-09-24: la escriben Gerencia de Producción (opcional para
--             ella) y Dirección Técnica, que la completa y la aprueba.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- SE VINCULA A LA FÓRMULA, NO A UN PRODUCTO DEL CATÁLOGO.
-- El catálogo tiene un producto por presentación (MONOMERO 100ML, 250ML…) y la
-- especificación describe el granel de todas. gmp.formulas_fabricacion ya
-- tenía especificacion_id esperando esta tabla (20260917110000): acá recibe su
-- clave foránea. producto_id queda opcional, para la especificación de un
-- producto importado o de una sola presentación.
--
-- EL MOTOR DE EVALUACIÓN (§7.3) evalúa solo los criterios numéricos; los
-- cualitativos los dictamina el analista. Lo usa el control de calidad del
-- producto terminado en la orden de producción (20260930110000).

create type gmp.grupo_parametro_enum as enum ('FISICOQUIMICO', 'FUNCIONAL', 'ORGANOLEPTICO', 'MICROBIOLOGICO');
create type gmp.tipo_criterio_enum as enum (
  'RANGO', 'MINIMO', 'MAXIMO', 'VALOR_TEXTO', 'CONTRA_PATRON', 'REFERENCIA_EXTERNA', 'BINARIO'
);

create table gmp.especificaciones (
  id                         uuid primary key default gen_random_uuid(),
  codigo_poe                 text not null check (length(btrim(codigo_poe)) > 0),
  version                    text not null check (version ~ '^[0-9]{2}$'),
  variedad                   text,
  producto_id                uuid references gmp.productos(id),
  tipo_producto              text not null default 'TERMINADO'
                               check (tipo_producto in ('SEMIELABORADO', 'GRANEL', 'TERMINADO')),
  denominacion               text not null check (length(btrim(denominacion)) > 0),
  composicion_inci           text,
  condiciones_almacenamiento text,
  instrucciones_muestreo     text,
  -- Nulo = «no corresponde».
  periodo_reanalisis_meses   integer check (periodo_reanalisis_meses is null or periodo_reanalisis_meses > 0),
  vida_util_meses            integer not null check (vida_util_meses > 0),
  estado                     gmp.estado_documento_enum not null default 'BORRADOR',
  vigencia_desde             date,
  motivo_cambio              text,
  emitida_por                uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en                  timestamptz not null default now(),
  aprobada_por               uuid references core.usuarios(id),
  aprobada_en                timestamptz,
  constraint especificaciones_version_unica unique nulls not distinct (codigo_poe, version, variedad),
  constraint especificaciones_vigente_aprobada check (
    estado <> 'VIGENTE' or (aprobada_por is not null and aprobada_en is not null and vigencia_desde is not null)
  ),
  constraint especificaciones_cambio_explicado check (
    version = '00' or length(btrim(coalesce(motivo_cambio, ''))) >= 3
  )
);

comment on table gmp.especificaciones is
  'Especificación de producto (I-E.50.xx, §4.6). Versionada: una VIGENTE no se edita; se emite la versión siguiente.';

create table gmp.espec_formula (
  id                uuid primary key default gen_random_uuid(),
  especificacion_id uuid not null references gmp.especificaciones(id),
  orden             integer not null,
  componente        text not null check (length(btrim(componente)) > 0),
  porcentaje_min    numeric(8,4) check (porcentaje_min is null or porcentaje_min >= 0),
  porcentaje_max    numeric(8,4) check (porcentaje_max is null or porcentaje_max <= 100),
  es_csp            boolean not null default false,
  -- Quitado en borrador: la fila queda (la auditoría no admite DELETE).
  quitado           boolean not null default false,
  unique (especificacion_id, orden),
  check (porcentaje_min is null or porcentaje_max is null or porcentaje_min <= porcentaje_max)
);

create table gmp.espec_parametros (
  id                uuid primary key default gen_random_uuid(),
  especificacion_id uuid not null references gmp.especificaciones(id),
  orden             integer not null,
  nombre            text not null check (length(btrim(nombre)) > 0),
  grupo             gmp.grupo_parametro_enum not null,
  tipo_criterio     gmp.tipo_criterio_enum not null,
  valor_min         numeric(14,6),
  valor_max         numeric(14,6),
  valor_texto       text,
  unidad            text,
  metodo_ensayo     text,
  condicion_ensayo  text,
  referencia_norma  text,
  obligatorio       boolean not null default true,
  quitado           boolean not null default false,
  unique (especificacion_id, orden),
  constraint espec_parametros_criterio check (
    (tipo_criterio = 'RANGO' and valor_min is not null and valor_max is not null and valor_min <= valor_max)
    or (tipo_criterio = 'MINIMO' and valor_min is not null)
    or (tipo_criterio = 'MAXIMO' and valor_max is not null)
    or (tipo_criterio in ('VALOR_TEXTO', 'CONTRA_PATRON') and length(btrim(coalesce(valor_texto, ''))) > 0)
    or (tipo_criterio = 'REFERENCIA_EXTERNA' and length(btrim(coalesce(referencia_norma, ''))) > 0)
    or tipo_criterio = 'BINARIO'
  )
);

comment on table gmp.espec_parametros is
  'Requisitos de la especificación con su criterio (§4.6). RANGO, MINIMO y MAXIMO se evalúan solos; el resto lo '
  'dictamina el analista (§7.3).';

alter table gmp.formulas_fabricacion
  add constraint formulas_fabricacion_especificacion_fk
  foreign key (especificacion_id) references gmp.especificaciones(id);

-- Una especificación vigente (y sus renglones) no cambia. En borrador se
-- corrige; la historia queda en la auditoría.
create or replace function gmp.fn_especificacion_editable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id     uuid;
  v_estado gmp.estado_documento_enum;
begin
  if tg_table_name = 'especificaciones' then
    if tg_op = 'UPDATE' and old.estado <> 'BORRADOR' then
      -- Única salida de una vigente: darla de baja cuando la reemplaza otra.
      if old.estado = 'VIGENTE' and new.estado = 'DADO_DE_BAJA'
         and (to_jsonb(new) - 'estado') = (to_jsonb(old) - 'estado') then
        return new;
      end if;
      raise exception 'La especificación % v% está %: no se edita, se emite la versión siguiente.',
        old.codigo_poe, old.version, lower(old.estado::text) using errcode = 'restrict_violation';
    end if;
    if tg_op = 'UPDATE' and new.estado = 'VIGENTE' and not core.es_rol('DIRECCION_TECNICA') then
      raise exception 'Aprueba la especificación Dirección Técnica.' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'INSERT' and new.estado <> 'BORRADOR' then
      raise exception 'Una especificación nace en borrador.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  v_id := new.especificacion_id;
  select estado into v_estado from gmp.especificaciones where id = v_id;
  if v_estado <> 'BORRADOR' then
    raise exception 'La especificación ya no está en borrador: sus renglones no cambian.' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_especificacion_editable
  before insert or update on gmp.especificaciones
  for each row execute function gmp.fn_especificacion_editable();
create trigger trg_espec_formula_editable
  before insert or update on gmp.espec_formula
  for each row execute function gmp.fn_especificacion_editable();
create trigger trg_espec_parametros_editable
  before insert or update on gmp.espec_parametros
  for each row execute function gmp.fn_especificacion_editable();

-- Aprobar: DT, con fecha de vigencia; la versión anterior vigente del mismo
-- código y variedad pasa a DADO_DE_BAJA.
create or replace function gmp.aprobar_especificacion(p_id uuid, p_vigencia date default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v gmp.especificaciones%rowtype;
begin
  if not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'Aprueba la especificación Dirección Técnica.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from gmp.especificaciones where id = p_id for update;
  if not found or v.estado <> 'BORRADOR' then
    raise exception 'Se aprueba una especificación en borrador.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from gmp.espec_parametros where especificacion_id = p_id and not quitado) then
    raise exception 'Una especificación sin requisitos no se aprueba.' using errcode = 'check_violation';
  end if;
  update gmp.especificaciones set estado = 'DADO_DE_BAJA'
   where codigo_poe = v.codigo_poe and variedad is not distinct from v.variedad and estado = 'VIGENTE';
  update gmp.especificaciones
     set estado = 'VIGENTE', aprobada_por = core.usuario_actual(), aprobada_en = now(),
         vigencia_desde = coalesce(p_vigencia, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
   where id = p_id;
end;
$$;

-- Nueva versión: copia la vigente (o la última) en borrador, con el motivo.
create or replace function gmp.nueva_version_especificacion(p_id uuid, p_motivo text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v     gmp.especificaciones%rowtype;
  v_n   uuid;
  v_ver text;
begin
  select * into v from gmp.especificaciones where id = p_id;
  if not found then
    raise exception 'La especificación no existe.';
  end if;
  if exists (select 1 from gmp.especificaciones where codigo_poe = v.codigo_poe
               and variedad is not distinct from v.variedad and estado = 'BORRADOR') then
    raise exception 'Ya hay una versión en borrador de %.', v.codigo_poe using errcode = 'check_violation';
  end if;
  select lpad((max(version::int) + 1)::text, 2, '0') into v_ver
    from gmp.especificaciones where codigo_poe = v.codigo_poe and variedad is not distinct from v.variedad;
  insert into gmp.especificaciones (codigo_poe, version, variedad, producto_id, tipo_producto, denominacion,
         composicion_inci, condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses,
         vida_util_meses, motivo_cambio)
  values (v.codigo_poe, v_ver, v.variedad, v.producto_id, v.tipo_producto, v.denominacion, v.composicion_inci,
          v.condiciones_almacenamiento, v.instrucciones_muestreo, v.periodo_reanalisis_meses, v.vida_util_meses,
          btrim(p_motivo))
  returning id into v_n;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp)
  select v_n, orden, componente, porcentaje_min, porcentaje_max, es_csp from gmp.espec_formula where especificacion_id = p_id and not quitado;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max,
         valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma, obligatorio)
  select v_n, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo,
         condicion_ensayo, referencia_norma, obligatorio
    from gmp.espec_parametros where especificacion_id = p_id and not quitado;
  return v_n;
end;
$$;

-- Motor de evaluación (§7.3): dictamen automático de un valor numérico.
create or replace function gmp.cumple_parametro(p_parametro_id uuid, p_valor numeric)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p.tipo_criterio
           when 'RANGO'  then p_valor between p.valor_min and p.valor_max
           when 'MINIMO' then p_valor >= p.valor_min
           when 'MAXIMO' then p_valor <= p.valor_max
           else null
         end
    from gmp.espec_parametros p where p.id = p_parametro_id;
$$;

alter table gmp.especificaciones enable row level security;
alter table gmp.especificaciones force  row level security;
alter table gmp.espec_formula    enable row level security;
alter table gmp.espec_formula    force  row level security;
alter table gmp.espec_parametros enable row level security;
alter table gmp.espec_parametros force  row level security;

grant select, insert, update on gmp.especificaciones to authenticated;
grant select, insert, update on gmp.espec_formula, gmp.espec_parametros to authenticated;
grant execute on function gmp.aprobar_especificacion(uuid, date), gmp.nueva_version_especificacion(uuid, text),
                          gmp.cumple_parametro(uuid, numeric) to authenticated;

create policy especificaciones_select_authenticated on gmp.especificaciones
  for select to authenticated using (core.rol() is not null);
create policy especificaciones_escribe_produccion_dt on gmp.especificaciones
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION') and emitida_por = core.usuario_actual());
create policy especificaciones_actualiza_produccion_dt on gmp.especificaciones
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'));
comment on policy especificaciones_escribe_produccion_dt on gmp.especificaciones is
  'Ítem 6: la redactan Gerencia de Producción (opcional para ella) y Dirección Técnica; aprueba solo DT (trigger).';

create policy espec_formula_select_authenticated on gmp.espec_formula
  for select to authenticated using (core.rol() is not null);
create policy espec_formula_escribe_produccion_dt on gmp.espec_formula
  for all to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'));
comment on policy espec_formula_escribe_produccion_dt on gmp.espec_formula is
  'Renglones de fórmula de una especificación en borrador (el trigger impide tocar una vigente).';

create policy espec_parametros_select_authenticated on gmp.espec_parametros
  for select to authenticated using (core.rol() is not null);
create policy espec_parametros_escribe_produccion_dt on gmp.espec_parametros
  for all to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'));
comment on policy espec_parametros_escribe_produccion_dt on gmp.espec_parametros is
  'Requisitos de una especificación en borrador (el trigger impide tocar una vigente).';

select core.adjuntar_auditoria('gmp.especificaciones');
select core.adjuntar_auditoria('gmp.espec_formula');
select core.adjuntar_auditoria('gmp.espec_parametros');

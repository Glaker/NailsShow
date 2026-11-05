-- ---------------------------------------------------------------------------
-- Propósito : Estudios de estabilidad acelerada. La Dirección Técnica abre un
--             estudio (producto, lote, condición, fecha de inicio), carga los
--             parámetros que elige (pH, aspecto, función, etc.) con su
--             especificación y va anotando el resultado inicial y a los 30,
--             60 y 90 días. Al cerrarlo escribe la conclusión; desde ahí el
--             estudio y sus parámetros no se modifican.
-- Reglas    : D-estabilidad-1 (codirector técnico, 2026-11-05: sección de la
--             DT, tabla a 30/60/90 días a 40 °C, parámetros a elección,
--             conclusión, PDF). Invariantes 1 (cerrado no se modifica),
--             3, 6 y 7; sin DELETE (core.verificar_invariantes).
-- Fecha     : 2026-11-05
-- ---------------------------------------------------------------------------

create table gmp.estudios_estabilidad (
  id            uuid primary key default gen_random_uuid(),
  producto      text not null check (btrim(producto) <> ''),
  lote          text,
  condicion     text not null default '40 °C ± 2 °C' check (btrim(condicion) <> ''),
  fecha_inicio  date not null,
  conclusion    text,
  cerrado_por   uuid references core.usuarios(id),
  cerrado_en    timestamptz,
  creado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en     timestamptz not null default now(),
  constraint estudios_estabilidad_cierre check (
    (cerrado_en is null and cerrado_por is null)
    or (cerrado_en is not null and cerrado_por is not null and btrim(coalesce(conclusion, '')) <> ''))
);
comment on table gmp.estudios_estabilidad is
  'Estudio de estabilidad acelerada (D-estabilidad-1). Cerrado (con conclusión) no se modifica (invariante 1).';
create index estudios_estabilidad_creado_por_idx on gmp.estudios_estabilidad (creado_por);
create index estudios_estabilidad_cerrado_por_idx on gmp.estudios_estabilidad (cerrado_por);

create table gmp.estabilidad_parametros (
  id             uuid primary key default gen_random_uuid(),
  estudio_id     uuid not null references gmp.estudios_estabilidad(id),
  orden          integer not null default 0,
  parametro      text not null check (btrim(parametro) <> ''),
  especificacion text,
  inicial        text,
  dia_30         text,
  dia_60         text,
  dia_90         text,
  -- Sin DELETE: una fila que sobra se quita marcándola.
  quitado        boolean not null default false,
  creado_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en      timestamptz not null default now()
);
comment on table gmp.estabilidad_parametros is
  'Parámetros de un estudio de estabilidad y su resultado inicial y a 30, 60 y 90 días (D-estabilidad-1). '
  'Cada cambio queda en core.auditoria con el valor anterior.';
create index estabilidad_parametros_estudio_idx on gmp.estabilidad_parametros (estudio_id, orden);
create index estabilidad_parametros_creado_por_idx on gmp.estabilidad_parametros (creado_por);

-- Cerrado no se toca (invariante 1). El cierre lo firma quien tiene la sesión,
-- con la hora de la base.
create or replace function gmp.estudio_estabilidad_cierre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.cerrado_en is not null then
    raise exception 'El estudio de estabilidad está cerrado: no se modifica.' using errcode = 'check_violation';
  end if;
  if new.cerrado_en is not null then
    new.cerrado_en  := now();
    new.cerrado_por := core.usuario_actual();
  end if;
  new.creado_por := old.creado_por;
  new.creado_en  := old.creado_en;
  return new;
end;
$$;
create trigger estudios_estabilidad_cierre before update on gmp.estudios_estabilidad
  for each row execute function gmp.estudio_estabilidad_cierre();

create or replace function gmp.estabilidad_parametro_abierto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from gmp.estudios_estabilidad e
              where e.id in (new.estudio_id, case when tg_op = 'UPDATE' then old.estudio_id end)
                and e.cerrado_en is not null) then
    raise exception 'El estudio de estabilidad está cerrado: no se modifica.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    new.estudio_id := old.estudio_id;
    new.creado_por := old.creado_por;
    new.creado_en  := old.creado_en;
  end if;
  return new;
end;
$$;
create trigger estabilidad_parametros_abierto before insert or update on gmp.estabilidad_parametros
  for each row execute function gmp.estabilidad_parametro_abierto();

alter table gmp.estudios_estabilidad enable row level security;
alter table gmp.estudios_estabilidad force  row level security;
alter table gmp.estabilidad_parametros enable row level security;
alter table gmp.estabilidad_parametros force  row level security;
grant select, insert, update on gmp.estudios_estabilidad to authenticated;
grant select, insert, update on gmp.estabilidad_parametros to authenticated;

create policy estudios_estabilidad_select_dt_calidad_gerencia on gmp.estudios_estabilidad
  for select to authenticated using (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA'));
comment on policy estudios_estabilidad_select_dt_calidad_gerencia on gmp.estudios_estabilidad is
  'D-estabilidad-1: lo consultan DT, Control de Calidad y Gerencia.';
create policy estudios_estabilidad_insert_dt on gmp.estudios_estabilidad
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA') and creado_por = core.usuario_actual() and cerrado_en is null);
comment on policy estudios_estabilidad_insert_dt on gmp.estudios_estabilidad is
  'D-estabilidad-1: lo abre la DT, a su nombre.';
create policy estudios_estabilidad_update_dt on gmp.estudios_estabilidad
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA')) with check (core.es_rol('DIRECCION_TECNICA'));
comment on policy estudios_estabilidad_update_dt on gmp.estudios_estabilidad is
  'D-estabilidad-1: lo edita y cierra la DT; cerrado, el trigger lo rechaza (invariante 1).';

create policy estabilidad_parametros_select_dt_calidad_gerencia on gmp.estabilidad_parametros
  for select to authenticated using (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA'));
comment on policy estabilidad_parametros_select_dt_calidad_gerencia on gmp.estabilidad_parametros is
  'D-estabilidad-1: lo consultan DT, Control de Calidad y Gerencia.';
create policy estabilidad_parametros_insert_dt on gmp.estabilidad_parametros
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA') and creado_por = core.usuario_actual());
comment on policy estabilidad_parametros_insert_dt on gmp.estabilidad_parametros is
  'D-estabilidad-1: los parámetros los elige la DT.';
create policy estabilidad_parametros_update_dt on gmp.estabilidad_parametros
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA')) with check (core.es_rol('DIRECCION_TECNICA'));
comment on policy estabilidad_parametros_update_dt on gmp.estabilidad_parametros is
  'D-estabilidad-1: los resultados los carga la DT mientras el estudio esté abierto.';

select core.adjuntar_auditoria('gmp.estudios_estabilidad');
select core.adjuntar_auditoria('gmp.estabilidad_parametros');

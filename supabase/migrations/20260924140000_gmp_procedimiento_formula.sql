-- ---------------------------------------------------------------------------
-- Propósito : Procedimiento de elaboración de cada fórmula, visible al
--             preparar el lote y editable por Gerencia de Producción y
--             Dirección Técnica, con historial completo de versiones.
-- Reglas    : PG.60.8 (fórmula maestra y su procedimiento), RN-50 (auditoría),
--             invariante 1 de CLAUDE.md (lo registrado no se pisa).
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico: el «Procedimiento» de cada SKU, que hoy está
-- en el POE de cada producto, tiene que estar a mano cuando se va a hacer el
-- lote, y lo editan Nazarena (GERENCIA_PRODUCCION), él y Anabella (DIRECCION
-- TECNICA).
--
-- POR QUÉ VERSIONADO Y NO UN CAMPO DE TEXTO.
-- Un procedimiento es instrucción de fabricación: si se edita pisando el
-- anterior, se pierde qué decía cuando se fabricó un lote, que es justamente
-- lo que pregunta una investigación. Cada edición es una fila nueva con su
-- número de versión, su autor y su fecha; se muestra la última y el historial
-- queda. Nada se modifica ni se borra.

create table gmp.formula_procedimientos (
  id             uuid primary key default gen_random_uuid(),
  formula_id     uuid not null references gmp.formulas_fabricacion(id),
  version        integer not null,
  texto          text not null check (length(btrim(texto)) > 0),
  -- Qué cambió y por qué: obligatorio desde la segunda versión.
  motivo_cambio  text,
  redactado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en      timestamptz not null default now(),
  unique (formula_id, version),
  constraint procedimiento_cambio_explicado check (
    version = 1 or length(btrim(coalesce(motivo_cambio, ''))) >= 3
  )
);

comment on table gmp.formula_procedimientos is
  'Procedimiento de elaboración por fórmula (PG.60.8), versionado: cada edición es una fila nueva. La vigente es la de mayor versión.';

-- La versión la pone la base: la siguiente a la última de esa fórmula. El
-- bloqueo de aviso serializa dos ediciones simultáneas de la misma fórmula.
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
  return new;
end;
$$;

create trigger trg_procedimiento_version
  before insert on gmp.formula_procedimientos
  for each row execute function gmp.fn_procedimiento_version();

create or replace function gmp.fn_procedimiento_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Una versión del procedimiento no se modifica: la edición se guarda como versión nueva.'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_procedimiento_inmutable
  before update or delete on gmp.formula_procedimientos
  for each row execute function gmp.fn_procedimiento_inmutable();

-- La versión vigente de cada fórmula, con el nombre de quien la redactó.
create view gmp.v_procedimiento_vigente
with (security_invoker = true) as
select distinct on (p.formula_id)
  p.formula_id, p.id, p.version, p.texto, p.motivo_cambio, p.creado_en,
  p.redactado_por, n.nombre_completo as redactado_por_nombre
from gmp.formula_procedimientos p
left join core.v_nomina n on n.id = p.redactado_por
order by p.formula_id, p.version desc;

alter table gmp.formula_procedimientos enable row level security;
alter table gmp.formula_procedimientos force  row level security;

-- Sin UPDATE ni DELETE para nadie.
grant select, insert on gmp.formula_procedimientos to authenticated;
grant select on gmp.v_procedimiento_vigente to authenticated;

create policy formula_procedimientos_select_authenticated on gmp.formula_procedimientos
  for select to authenticated using (core.rol() is not null);
comment on policy formula_procedimientos_select_authenticated on gmp.formula_procedimientos is
  'Todo el que prepara o supervisa un lote lee el procedimiento.';

create policy formula_procedimientos_insert_produccion_dt on gmp.formula_procedimientos
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'));
comment on policy formula_procedimientos_insert_produccion_dt on gmp.formula_procedimientos is
  'Editan Dirección Técnica (titular y suplente) y Gerencia de Producción, por indicación del codirector técnico (2026-09-24).';

select core.adjuntar_auditoria('gmp.formula_procedimientos');

-- ---------------------------------------------------------------------------
-- Propósito : Eliminar una recepción mal cargada con un botón, sin pedir
--             motivo (pedido del codirector técnico del 2026-10-22,
--             D-recepcion-3). No se borra ni se modifica nada: la
--             eliminación es una fila nueva (quién y cuándo) en
--             gmp.recepciones_eliminadas, y RLS saca la recepción y sus lotes
--             de toda consulta. Solo mientras no se cargó a stock y ningún
--             lote pasó de cuarentena: después ya hay registros que la citan.
-- Reglas    : Invariante 1 (la recepción queda intacta), RN-50 (la
--             eliminación pasa por el trigger de auditoría), invariante 3.
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------

create table gmp.recepciones_eliminadas (
  recepcion_id  uuid primary key references gmp.recepciones(id),
  eliminada_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  eliminada_en  timestamptz not null default now()
);

comment on table gmp.recepciones_eliminadas is
  'Recepciones eliminadas por quien las cargó mal (D-recepcion-3). Append-only: lo eliminado no vuelve. '
  'La recepción y sus lotes quedan intactos; RLS los oculta salvo al administrador del sistema.';

create index recepciones_eliminadas_eliminada_por_idx on gmp.recepciones_eliminadas (eliminada_por);

alter table gmp.recepciones_eliminadas enable row level security;
alter table gmp.recepciones_eliminadas force  row level security;
select core.adjuntar_auditoria('gmp.recepciones_eliminadas');

grant select, insert on gmp.recepciones_eliminadas to authenticated;

create policy recepciones_eliminadas_select_authenticated on gmp.recepciones_eliminadas
  for select to authenticated using (core.rol() is not null);
comment on policy recepciones_eliminadas_select_authenticated on gmp.recepciones_eliminadas is
  '§3.3: consulta para todos los roles (D-recepcion-3).';

create policy recepciones_eliminadas_insert_recepcion on gmp.recepciones_eliminadas
  for insert to authenticated
  with check (core.es_rol('RECEPCION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
              and eliminada_por = core.usuario_actual());
comment on policy recepciones_eliminadas_insert_recepcion on gmp.recepciones_eliminadas is
  'D-recepcion-3: elimina quien registra recepciones (RECEPCION, GP, DT), a su nombre.';

-- Las condiciones van en el trigger: valen igual por la función o por
-- escritura directa.
create or replace function gmp.fn_recepcion_eliminable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rec gmp.recepciones%rowtype;
begin
  select * into v_rec from gmp.recepciones where id = new.recepcion_id for update;
  if not found then
    raise exception 'La recepción no existe.' using errcode = 'no_data_found';
  end if;
  if v_rec.cargado_a_stock then
    raise exception 'La recepción % ya se cargó a stock: no se elimina. Anulá sus movimientos en Stock.', v_rec.numero
      using errcode = 'restrict_violation';
  end if;
  if exists (select 1 from gmp.lotes_insumo
              where recepcion_id = new.recepcion_id
                and estado not in ('RECIBIDO', 'CUARENTENA')) then
    raise exception 'La recepción % tiene lotes ya muestreados o dictaminados: no se elimina.', v_rec.numero
      using errcode = 'restrict_violation';
  end if;
  new.eliminada_por := core.usuario_actual();
  new.eliminada_en  := now();
  return new;
end;
$$;

create trigger trg_recepcion_eliminable
  before insert on gmp.recepciones_eliminadas
  for each row execute function gmp.fn_recepcion_eliminable();

-- Eliminar una recepción: lo que llama la pantalla.
create or replace function gmp.eliminar_recepcion(p_recepcion_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not core.es_rol('RECEPCION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Eliminar una recepción es de quien las registra: Recepción, Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from gmp.recepciones_eliminadas where recepcion_id = p_recepcion_id) then
    raise exception 'La recepción ya se eliminó.' using errcode = 'unique_violation';
  end if;
  insert into gmp.recepciones_eliminadas (recepcion_id) values (p_recepcion_id);
end;
$$;

comment on function gmp.eliminar_recepcion(uuid) is
  'Elimina una recepción mal cargada y sus lotes, sin motivo (D-recepcion-3). Solo antes de cargar a stock y con los lotes en cuarentena.';
revoke execute on function gmp.eliminar_recepcion(uuid) from public, anon;
grant execute on function gmp.eliminar_recepcion(uuid) to authenticated;

-- ===========================================================================
-- Fuera de toda consulta (las vistas son security_invoker)
-- ===========================================================================
--
-- El administrador del sistema las sigue viendo, para la auditoría.

alter policy recepciones_select_authenticated on gmp.recepciones
  using (core.rol() is not null
         and (core.es_rol('ADMINISTRADOR_SISTEMA')
              or not exists (select 1 from gmp.recepciones_eliminadas e where e.recepcion_id = recepciones.id)));
comment on policy recepciones_select_authenticated on gmp.recepciones is
  '§3.3: consulta para todos los roles; las eliminadas solo el administrador del sistema (D-recepcion-3).';

alter policy lotes_insumo_select_authenticated on gmp.lotes_insumo
  using (core.rol() is not null
         and (core.es_rol('ADMINISTRADOR_SISTEMA')
              or not exists (select 1 from gmp.recepciones_eliminadas e
                              where e.recepcion_id = lotes_insumo.recepcion_id)));
comment on policy lotes_insumo_select_authenticated on gmp.lotes_insumo is
  '§3.3: consulta para todos los roles; los de recepciones eliminadas solo el administrador del sistema (D-recepcion-3).';

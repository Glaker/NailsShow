-- ---------------------------------------------------------------------------
-- Propósito : Solicitudes de pago: Gerencia de Producción las ve todas, y
--             cualquiera que vea una solicitud puede dejarle comentarios
--             (Nazarena carga, Diego de Administración le comenta).
-- Reglas    : §2.2 del documento de Administración (solicitudes de pago),
--             RN-50 (auditoría), invariante 2 del CLAUDE.md por analogía (el
--             comentario es append-only: no se edita ni se borra). Pedido del
--             usuario (2026-10-15).
-- Fecha     : 2026-10-15
-- ---------------------------------------------------------------------------

-- 1. Gerencia de Producción ve todas las solicitudes, no sólo las suyas.
--    Solo lectura: aprobar, rechazar y pagar sigue siendo de Administración
--    (comercial.fn_solicitud_pago_transicion), y la política de UPDATE no
--    cambia.
alter policy solicitudes_pago_select_propias on comercial.solicitudes_pago
  using (solicitante = core.usuario_actual()
         or core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'));

comment on policy solicitudes_pago_select_propias on comercial.solicitudes_pago is
  '§2.2: cada uno ve las suyas; Administración, Gerencia y Gerencia de Producción todas (pedido del 2026-10-15).';

-- 2. Comentarios de una solicitud. Una conversación corta y fechada al lado
--    del pedido de pago, en lugar de pisar el concepto o el motivo.
create table comercial.comentarios_solicitud_pago (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references comercial.solicitudes_pago(id),
  texto         text not null check (length(btrim(texto)) between 1 and 2000),
  autor         uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en     timestamptz not null default now()
);

comment on table comercial.comentarios_solicitud_pago is
  'Comentarios sobre una solicitud de pago. Append-only: no se editan ni se borran. Comenta quien ve la solicitud.';

create index comentarios_solicitud_pago_idx
  on comercial.comentarios_solicitud_pago (solicitud_id, creado_en);

alter table comercial.comentarios_solicitud_pago enable row level security;
alter table comercial.comentarios_solicitud_pago force  row level security;

-- Sin UPDATE ni DELETE: append-only.
grant select, insert on comercial.comentarios_solicitud_pago to authenticated;

-- La subconsulta corre con RLS de solicitudes_pago: se ven y se comentan sólo
-- las solicitudes que el usuario puede ver.
create policy comentarios_solicitud_pago_select_quien_ve on comercial.comentarios_solicitud_pago
  for select to authenticated
  using (exists (select 1 from comercial.solicitudes_pago s where s.id = solicitud_id));
comment on policy comentarios_solicitud_pago_select_quien_ve on comercial.comentarios_solicitud_pago is
  'Los comentarios se ven junto con la solicitud: quien ve una, ve los otros (§2.2).';

create policy comentarios_solicitud_pago_insert_quien_ve on comercial.comentarios_solicitud_pago
  for insert to authenticated
  with check (autor = core.usuario_actual()
              and exists (select 1 from comercial.solicitudes_pago s where s.id = solicitud_id));
comment on policy comentarios_solicitud_pago_insert_quien_ve on comercial.comentarios_solicitud_pago is
  'Comenta quien ve la solicitud, a su nombre (§2.2, RN-50).';

-- La hora la pone la base, no el navegador.
create function comercial.fn_comentario_solicitud_sello()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_en := now();
  return new;
end;
$$;

create trigger trg_comentario_solicitud_sello
  before insert on comercial.comentarios_solicitud_pago
  for each row execute function comercial.fn_comentario_solicitud_sello();

select core.adjuntar_auditoria('comercial.comentarios_solicitud_pago');

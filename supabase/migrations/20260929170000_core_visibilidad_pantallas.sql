-- ---------------------------------------------------------------------------
-- Propósito : Qué pantallas ve cada rol, configurable por el Administrador del
--             sistema desde la aplicación (por ejemplo, que Ventas no vea el
--             stock de materia prima), y lectura completa para ese rol de lo
--             que hoy solo leen Administración y Gerencia.
-- Reglas    : §3.5 del alcance (el administrador lee todo y configura; no
--             escribe registros de negocio de otros roles), CLAUDE.md §6 (la
--             interfaz oculta, la autoridad es RLS), RN-50. Pedido de la
--             conducción del proyecto (2026-09-29).
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- ESTO ES VISIBILIDAD, NO PERMISO.
-- Ocultarle una pantalla a un rol la saca de su menú; mostrársela a un rol que
-- la base no autoriza le muestra una pantalla vacía o un error. Lo que un rol
-- puede leer o escribir lo siguen decidiendo las políticas RLS.
--
-- POR QUÉ EL ADMINISTRADOR NO RECIBE TODOS LOS ROLES.
-- Se pidió un usuario que vea todo «como si tuviera todos los roles juntos».
-- Ver todo, sí: esta migración le da lectura de tesorería, pagos y cobros, que
-- no tenía, y la aplicación le muestra todas las pantallas. Escribir como
-- Dirección Técnica, Calidad o Producción, no: una credencial que firma
-- liberaciones y además administra hace que ninguna firma pruebe nada (§3.5).
-- Para operar un circuito se usa la cuenta con ese rol.

create table core.visibilidad_pantallas (
  id            uuid primary key default gen_random_uuid(),
  -- Ruta de la pantalla, o ruta con pestaña (`/stock?vista=insumos`).
  pantalla      text not null check (pantalla ~ '^/'),
  rol           core.rol_enum not null,
  visible       boolean not null,
  motivo        text,
  cambiado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  cambiado_en   timestamptz not null default now(),
  unique (pantalla, rol)
);

comment on table core.visibilidad_pantallas is
  'Excepciones a la visibilidad por defecto de cada pantalla, por rol. Solo menú: la autoridad sobre los datos es RLS. '
  'La historia de cada cambio queda en core.auditoria.';

create or replace function core.fijar_visibilidad(p_pantalla text, p_rol core.rol_enum, p_visible boolean, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into core.visibilidad_pantallas (pantalla, rol, visible, motivo)
  values (p_pantalla, p_rol, p_visible, nullif(btrim(p_motivo), ''))
  on conflict (pantalla, rol) do update
     set visible = excluded.visible, motivo = excluded.motivo,
         cambiado_por = core.usuario_actual(), cambiado_en = now();
end;
$$;

comment on function core.fijar_visibilidad(text, core.rol_enum, boolean, text) is
  'Muestra u oculta una pantalla para un rol. SECURITY INVOKER: rige la política (solo Administrador del sistema).';

alter table core.visibilidad_pantallas enable row level security;
alter table core.visibilidad_pantallas force  row level security;

grant select, insert, update on core.visibilidad_pantallas to authenticated;
grant execute on function core.fijar_visibilidad(text, core.rol_enum, boolean, text) to authenticated;

create policy visibilidad_pantallas_select_authenticated on core.visibilidad_pantallas
  for select to authenticated using (core.rol() is not null);
comment on policy visibilidad_pantallas_select_authenticated on core.visibilidad_pantallas is
  'Cada usuario necesita leerla para armar su menú.';
create policy visibilidad_pantallas_insert_sistema on core.visibilidad_pantallas
  for insert to authenticated
  with check (core.es_rol('ADMINISTRADOR_SISTEMA') and cambiado_por = core.usuario_actual());
create policy visibilidad_pantallas_update_sistema on core.visibilidad_pantallas
  for update to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('ADMINISTRADOR_SISTEMA') and cambiado_por = core.usuario_actual());
comment on policy visibilidad_pantallas_insert_sistema on core.visibilidad_pantallas is
  '§3.5: la configuración es del Administrador del sistema. Sin DELETE: se vuelve al valor por defecto cambiándolo.';

select core.adjuntar_auditoria('core.visibilidad_pantallas');

-- ===========================================================================
-- Lectura completa para el Administrador del sistema (§3.5)
-- ===========================================================================

alter policy cuentas_fondos_select_administracion on comercial.cuentas_fondos
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));
alter policy movimientos_fondos_select_administracion on comercial.movimientos_fondos
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));
alter policy conciliaciones_fondos_select_administracion on comercial.conciliaciones_fondos
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));
alter policy pagos_proveedor_select_administracion on comercial.pagos_proveedor
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));
alter policy imputaciones_pago_select_administracion on comercial.imputaciones_pago
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));
alter policy conciliaciones_proveedor_select_administracion on comercial.conciliaciones_proveedor
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));
alter policy cobros_cliente_select_administracion on comercial.cobros_cliente
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS', 'ADMINISTRADOR_SISTEMA'));
alter policy imputaciones_cobro_select_administracion on comercial.imputaciones_cobro
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS', 'ADMINISTRADOR_SISTEMA'));
alter policy solicitudes_pago_select_propias on comercial.solicitudes_pago
  using (solicitante = core.usuario_actual() or core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'));

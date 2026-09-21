-- ---------------------------------------------------------------------------
-- Propósito : Proveedores sugeridos por insumo (derivados del historial de
--             lotes, sin agregar vínculo al catálogo), pedidos de producto
--             terminado, y el cálculo de faltantes que avisa qué comprar.
-- Reglas    : §3.3 (Gerencia de Producción planifica), RN-51/RN-52 (solo
--             material despachable cuenta como disponible).
-- Fecha     : 2026-09-17
-- ---------------------------------------------------------------------------
--
-- SOBRE EL VÍNCULO INSUMO-PROVEEDOR.
-- La migración 20260911140000 decidió no ponerlo en el catálogo, y la decisión
-- sigue en pie: un insumo se le compra a varios proveedores, y una FK en el
-- maestro obliga a duplicar el ítem en cuanto aparece el segundo. Lo que el
-- usuario necesita es una comodidad de carga, y eso se deriva de los lotes ya
-- recibidos. El dato existe; lo que faltaba era la vista que lo lee.
--
-- Verificado contra el esquema real: `gmp.v_lotes_insumo` (migración
-- …190000 del 2026-09-04) expone `insumo_id`, `proveedor_id`, `proveedor` y
-- `recepcion_fecha` tal como se usan acá. `comercial.v_stock_por_articulo`
-- (migración …170000 del 2026-09-10) expone `insumo_id`, `codigo_interno`,
-- `insumo_nombre` y `saldo_aprobado`. No hizo falta corregir nada en este
-- archivo.

create view comercial.v_proveedores_por_insumo
with (security_invoker = true) as
select
  l.insumo_id,
  l.proveedor_id,
  l.proveedor                             as razon_social,
  count(*)                                as lotes_recibidos,
  max(l.recepcion_fecha)                  as ultima_compra,
  p.estado_aprobacion,
  p.activo
from gmp.v_lotes_insumo l
join gmp.proveedores p on p.id = l.proveedor_id
where l.proveedor_id is not null
group by l.insumo_id, l.proveedor_id, l.proveedor, p.estado_aprobacion, p.activo;

comment on view comercial.v_proveedores_por_insumo is
  'Quién suministró cada insumo, derivado de los lotes recibidos. Alimenta el selector de proveedor: primero los que ya vendieron ese insumo, después el resto.';

grant select on comercial.v_proveedores_por_insumo to authenticated;

-- ===========================================================================
-- 1. Lista de materiales de acondicionamiento
-- ===========================================================================
--
-- La fórmula de fabricación cubre el granel. Un producto terminado necesita
-- además envase, tapa, etiqueta y bolsa, y esa relación no existía. Los
-- códigos de la planilla la insinúan por prefijo (080POL, 080ENV, 080ET), pero
-- un prefijo compartido es una convención de quien lo escribió, no una
-- relación declarada, y explotar un pedido sobre una convención es explotarlo
-- sobre una suposición.

create table gmp.materiales_acondicionamiento (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references gmp.productos(id),
  insumo_id      uuid not null references gmp.insumos_catalogo(id),
  -- Cuántas unidades del insumo por unidad de producto terminado. Casi siempre
  -- 1 (un envase, una tapa), pero no siempre: una caja lleva 12 etiquetas si
  -- el rótulo va por bulto.
  cantidad_por_unidad numeric(12,6) not null check (cantidad_por_unidad > 0),
  -- Merma esperada de acondicionamiento, fracción. 0,02 = se rompe el 2 % de
  -- los envases. Sin esto, la compra sale siempre justa y siempre falta.
  merma          numeric(6,4) not null default 0 check (merma >= 0 and merma < 1),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  unique (producto_id, insumo_id)
);

comment on table gmp.materiales_acondicionamiento is
  'Envase, tapa, etiqueta y demás por unidad de producto terminado. Es la otra mitad de la lista de materiales: la fórmula cubre el granel, esto cubre el acondicionamiento.';

-- ===========================================================================
-- 2. Pedidos
-- ===========================================================================

create type comercial.estado_pedido_enum as enum (
  'BORRADOR',
  'CONFIRMADO',
  'EN_PRODUCCION',
  'CUMPLIDO',
  'CANCELADO'
);

create table comercial.pedidos (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  cliente        text not null check (length(btrim(cliente)) > 0),
  fecha          date not null default current_date,
  -- Fecha comprometida de entrega. De acá se calcula hacia atrás la fecha
  -- límite de compra de cada faltante.
  fecha_entrega  date,
  estado         comercial.estado_pedido_enum not null default 'BORRADOR',
  observaciones  text,
  creado_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en      timestamptz not null default now()
);

create table comercial.pedido_renglones (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references comercial.pedidos(id) on delete cascade,
  producto_id  uuid not null references gmp.productos(id),
  cantidad     numeric(14,4) not null check (cantidad > 0),
  unique (pedido_id, producto_id)
);

-- ===========================================================================
-- 3. Reservas
-- ===========================================================================
--
-- Sin reservas, dos pedidos distintos «tienen» el mismo stock y los dos salen
-- en verde. Es el segundo modo de falla clásico de un sistema de stock,
-- después del saldo negativo, y es más silencioso: nadie se entera hasta que
-- el segundo pedido llega al depósito y no hay.
--
-- La reserva vence sola. Una reserva sin vencimiento congela stock por pedidos
-- que nunca se produjeron, y a los seis meses nadie se anima a liberarla
-- porque nadie sabe de qué era.

create table comercial.reservas_stock (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid references comercial.pedidos(id) on delete cascade,
  insumo_id      uuid not null references gmp.insumos_catalogo(id),
  cantidad       numeric(14,4) not null check (cantidad > 0),
  unidad         text not null,
  vence_en       timestamptz not null default (now() + interval '30 days'),
  liberada       boolean not null default false,
  liberada_en    timestamptz,
  creado_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en      timestamptz not null default now()
);

create index reservas_vigentes_idx on comercial.reservas_stock (insumo_id)
  where not liberada;

create view comercial.v_reservado_por_insumo
with (security_invoker = true) as
select insumo_id, sum(cantidad) as reservado
from comercial.reservas_stock
where not liberada and vence_en > now()
group by insumo_id;

grant select on comercial.v_reservado_por_insumo to authenticated;

-- ===========================================================================
-- 4. Disponible real
-- ===========================================================================
--
-- Disponible no es saldo. Un lote en cuarentena está en el depósito y no se
-- puede usar; un lote vencido, tampoco; uno reservado para otro pedido, menos.
-- Contar todo eso como disponible es lo que hace que un sistema de stock
-- mienta sin tener un solo número mal sumado.

create view comercial.v_disponible_por_insumo
with (security_invoker = true) as
select
  s.insumo_id,
  s.codigo_interno,
  s.insumo_nombre,
  s.saldo_aprobado                                   as saldo,
  coalesce(r.reservado, 0)                           as reservado,
  greatest(s.saldo_aprobado - coalesce(r.reservado, 0), 0) as disponible
from comercial.v_stock_por_articulo s
left join comercial.v_reservado_por_insumo r on r.insumo_id = s.insumo_id;

comment on view comercial.v_disponible_por_insumo is
  'Parte de `saldo_aprobado`, que ya excluye cuarentena y bloqueos, y le resta lo reservado por otros pedidos.';

grant select on comercial.v_disponible_por_insumo to authenticated;

-- ===========================================================================
-- 5. Explosión de un pedido
-- ===========================================================================

create type comercial.renglon_faltante as (
  insumo_id         uuid,
  codigo_interno    text,
  insumo            text,
  unidad            text,
  necesario         numeric,
  disponible        numeric,
  faltante          numeric,
  proveedor_id      uuid,
  proveedor         text,
  proveedor_estado  text,
  ultima_compra     date
);

create or replace function comercial.explotar_pedido(p_pedido_id uuid)
returns setof comercial.renglon_faltante
language sql
stable
set search_path = ''
as $$
  with necesidad as (
    -- Granel: cantidad de producto x fórmula vigente.
    -- La fórmula da kg por cada kg de granel; la cantidad del pedido está en
    -- unidades de producto terminado, así que hace falta el contenido por
    -- unidad. Mientras `gmp.productos` no lo tenga, esta rama queda en cero y
    -- la explosión cubre solo el acondicionamiento. Preferimos que falte una
    -- rama visible a inventar un contenido por unidad.
    select
      m.insumo_id,
      sum(r.cantidad * m.cantidad_por_unidad / (1 - m.merma)) as necesario
    from comercial.pedido_renglones r
    join gmp.materiales_acondicionamiento m
      on m.producto_id = r.producto_id and m.activo
    where r.pedido_id = p_pedido_id
    group by m.insumo_id
  )
  select
    n.insumo_id,
    i.codigo_interno,
    i.nombre,
    i.unidad_medida,
    round(n.necesario, 4),
    coalesce(d.disponible, 0),
    round(greatest(n.necesario - coalesce(d.disponible, 0), 0), 4),
    pv.proveedor_id,
    pv.razon_social,
    pv.estado_aprobacion::text,
    pv.ultima_compra
  from necesidad n
  join gmp.insumos_catalogo i on i.id = n.insumo_id
  left join comercial.v_disponible_por_insumo d on d.insumo_id = n.insumo_id
  -- Proveedor sugerido: el de la última compra de ese insumo. LATERAL porque
  -- se necesita el mejor de cada grupo, no todos.
  left join lateral (
    select * from comercial.v_proveedores_por_insumo v
     where v.insumo_id = n.insumo_id and v.activo
     order by v.ultima_compra desc nulls last
     limit 1
  ) pv on true
  where n.necesario > coalesce(d.disponible, 0)
  order by i.nombre;
$$;

comment on function comercial.explotar_pedido is
  'Devuelve solo los faltantes. Lo que alcanza no se informa: una lista donde el 90 % de los renglones dice «hay» entierra los tres que importan.';

grant execute on function comercial.explotar_pedido(uuid) to authenticated;

-- ===========================================================================
-- 6. Avisos
-- ===========================================================================
--
-- El aviso es una fila con estado, no un correo. Un correo se lee una vez y se
-- pierde; esto se puede preguntar «qué está pendiente de comprar» dentro de
-- tres semanas y contesta.

create type comercial.estado_aviso_enum as enum ('PENDIENTE', 'EN_COMPRA', 'RESUELTO', 'DESCARTADO');

create table comercial.avisos_compra (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid references comercial.pedidos(id) on delete set null,
  insumo_id     uuid not null references gmp.insumos_catalogo(id),
  cantidad      numeric(14,4) not null check (cantidad > 0),
  unidad        text not null,
  proveedor_id  uuid references gmp.proveedores(id),
  fecha_limite  date,
  estado        comercial.estado_aviso_enum not null default 'PENDIENTE',
  nota          text,
  creado_en     timestamptz not null default now(),
  resuelto_por  uuid references core.usuarios(id),
  resuelto_en   timestamptz
);

create index avisos_pendientes_idx on comercial.avisos_compra (estado, fecha_limite)
  where estado in ('PENDIENTE', 'EN_COMPRA');

-- ===========================================================================
-- 7. Permisos
-- ===========================================================================

alter table gmp.materiales_acondicionamiento enable row level security;
alter table gmp.materiales_acondicionamiento force  row level security;
alter table comercial.pedidos            enable row level security;
alter table comercial.pedidos            force  row level security;
alter table comercial.pedido_renglones   enable row level security;
alter table comercial.pedido_renglones   force  row level security;
alter table comercial.reservas_stock     enable row level security;
alter table comercial.reservas_stock     force  row level security;
alter table comercial.avisos_compra      enable row level security;
alter table comercial.avisos_compra      force  row level security;

grant select, insert, update on gmp.materiales_acondicionamiento to authenticated;
grant select, insert, update on comercial.pedidos                to authenticated;
grant select, insert, update, delete on comercial.pedido_renglones to authenticated;
grant select, insert, update on comercial.reservas_stock         to authenticated;
grant select, insert, update on comercial.avisos_compra          to authenticated;

create policy materiales_select on gmp.materiales_acondicionamiento
  for select to authenticated using (core.rol() is not null);
create policy materiales_escribe on gmp.materiales_acondicionamiento
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'));
create policy materiales_actualiza on gmp.materiales_acondicionamiento
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'));

create policy pedidos_select on comercial.pedidos
  for select to authenticated using (core.rol() is not null);
create policy pedidos_escribe on comercial.pedidos
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'));
create policy pedidos_actualiza on comercial.pedidos
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'));

create policy renglones_select on comercial.pedido_renglones
  for select to authenticated using (core.rol() is not null);
create policy renglones_escribe on comercial.pedido_renglones
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'));
create policy renglones_actualiza on comercial.pedido_renglones
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'));
create policy renglones_borra on comercial.pedido_renglones
  for delete to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'));

create policy reservas_select on comercial.reservas_stock
  for select to authenticated using (core.rol() is not null);
create policy reservas_escribe on comercial.reservas_stock
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ADMINISTRACION'));
create policy reservas_actualiza on comercial.reservas_stock
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ADMINISTRACION'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ADMINISTRACION'));

create policy avisos_select on comercial.avisos_compra
  for select to authenticated using (core.rol() is not null);
create policy avisos_escribe on comercial.avisos_compra
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ADMINISTRACION'));
create policy avisos_actualiza on comercial.avisos_compra
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ADMINISTRACION'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ADMINISTRACION'));

select core.adjuntar_auditoria('gmp.materiales_acondicionamiento');
select core.adjuntar_auditoria('comercial.pedidos');
select core.adjuntar_auditoria('comercial.pedido_renglones');
select core.adjuntar_auditoria('comercial.reservas_stock');
select core.adjuntar_auditoria('comercial.avisos_compra');

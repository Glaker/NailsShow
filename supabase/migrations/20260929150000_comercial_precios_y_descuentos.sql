-- ---------------------------------------------------------------------------
-- Propósito : Precio de lista por producto, descuentos por cliente (general o
--             por producto) y precio sugerido en los renglones del pedido.
--             Ventas cambia precios en forma definitiva desde una pantalla:
--             cada cambio es una versión nueva, la anterior queda.
-- Reglas    : RN-59 (el precio aplicado es el vigente al emitir: el renglón
--             guarda su precio y la factura sale de ahí), §4.12.1 del alcance
--             (precios versionados, no sobrescritos), RN-50. Ítem 7 de la cola
--             del 2026-09-24 (hoja «UTILIDAD» de la planilla de inventario).
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- EL PRECIO DE LISTA LLEVA IVA INCLUIDO: es el de la columna «PRECIO LISTA»
-- de la planilla, el que paga un consumidor final. El renglón del pedido guarda
-- el NETO (20260924130000), así que el sugerido es lista / (1 + IVA) con el
-- descuento del cliente aplicado.
--
-- DESCUENTO DEL MAYORISTA. La planilla calcula el mayorista con factura como
-- lista − 35 % y sin IVA: acá es un descuento general del 35 % para ese
-- cliente. La columna «Mayorista S/Fac» no se carga: una venta sin factura no
-- se construye en este sistema (ítem 16 de la cola).
--
-- DESCUENTOS. El del producto, si el cliente tiene uno, gana sobre el general.
-- Se quita cargando 0 %: la historia queda.

create table comercial.precios_producto (
  id            uuid primary key default gen_random_uuid(),
  orden         bigint generated always as identity,
  producto_id   uuid not null references gmp.productos(id),
  precio_lista  numeric(14,2) not null check (precio_lista > 0),
  alicuota_iva  numeric(5,2) not null default 21 check (alicuota_iva in (0, 10.5, 21, 27)),
  origen        text,
  motivo        text,
  cargado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en    timestamptz not null default now()
);

comment on table comercial.precios_producto is
  'Precio de lista por producto (IVA incluido, consumidor final). Append-only: el vigente es el último; cambiar un '
  'precio es cargar uno nuevo (§4.12.1).';

create index precios_producto_vigente_idx on comercial.precios_producto (producto_id, orden desc);

create view comercial.v_precios_vigentes
with (security_invoker = true) as
select distinct on (p.producto_id)
       p.producto_id, pr.codigo_interno, pr.nombre as producto, p.precio_lista, p.alicuota_iva,
       round(p.precio_lista / (1 + p.alicuota_iva / 100), 2) as precio_neto,
       p.cargado_en as vigente_desde, p.cargado_por, p.origen, p.motivo
  from comercial.precios_producto p
  join gmp.productos pr on pr.id = p.producto_id
 order by p.producto_id, p.orden desc;

create table comercial.descuentos_cliente (
  id           uuid primary key default gen_random_uuid(),
  orden        bigint generated always as identity,
  cliente_id   uuid not null references comercial.clientes(id),
  -- Nulo = descuento general del cliente.
  producto_id  uuid references gmp.productos(id),
  porcentaje   numeric(5,2) not null check (porcentaje between 0 and 100),
  motivo       text,
  cargado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en   timestamptz not null default now()
);

comment on table comercial.descuentos_cliente is
  'Descuento por cliente, general (producto nulo) o por producto. Append-only: rige el último de cada par; 0 % lo quita.';

create index descuentos_cliente_vigente_idx on comercial.descuentos_cliente (cliente_id, producto_id, orden desc);

create view comercial.v_descuentos_vigentes
with (security_invoker = true) as
select * from (
  select distinct on (d.cliente_id, d.producto_id)
         d.cliente_id, c.razon_social as cliente, d.producto_id, pr.codigo_interno, pr.nombre as producto,
         d.porcentaje, d.motivo, d.cargado_en as vigente_desde, d.cargado_por
    from comercial.descuentos_cliente d
    join comercial.clientes c on c.id = d.cliente_id
    left join gmp.productos pr on pr.id = d.producto_id
   order by d.cliente_id, d.producto_id, d.orden desc
) v
where v.porcentaje > 0;

-- Precio sugerido para un cliente: neto de lista con su descuento.
create or replace function comercial.precio_para(p_producto_id uuid, p_cliente_id uuid)
returns table (precio_lista numeric, alicuota_iva numeric, descuento numeric, precio_neto numeric)
language sql
stable
set search_path = ''
as $$
  with lista as (
    select precio_lista, alicuota_iva from comercial.v_precios_vigentes where producto_id = p_producto_id
  ),
  descuento as (
    select coalesce(
      (select porcentaje from comercial.v_descuentos_vigentes
        where cliente_id = p_cliente_id and producto_id = p_producto_id),
      (select porcentaje from comercial.v_descuentos_vigentes
        where cliente_id = p_cliente_id and producto_id is null),
      0) as porcentaje
  )
  select l.precio_lista, l.alicuota_iva, d.porcentaje,
         round(l.precio_lista / (1 + l.alicuota_iva / 100) * (1 - d.porcentaje / 100), 2)
    from lista l, descuento d;
$$;

comment on function comercial.precio_para(uuid, uuid) is
  'Precio neto sugerido de un producto para un cliente: lista vigente sin IVA, menos el descuento del producto o, si '
  'no hay, el general del cliente.';

-- El renglón nuevo sin precio toma el sugerido. Un precio escrito a mano se
-- respeta: es la excepción que Ventas decide en el momento.
create or replace function comercial.fn_renglon_precio_sugerido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_precio  record;
begin
  if new.precio_unitario is not null then
    return new;
  end if;
  select cliente_id into v_cliente from comercial.pedidos where id = new.pedido_id;
  select * into v_precio from comercial.precio_para(new.producto_id, v_cliente);
  if v_precio.precio_neto is not null then
    new.precio_unitario := v_precio.precio_neto;
    new.alicuota_iva := v_precio.alicuota_iva;
  end if;
  return new;
end;
$$;

create trigger trg_renglon_precio_sugerido
  before insert on comercial.pedido_renglones
  for each row execute function comercial.fn_renglon_precio_sugerido();

-- En borrador, volver a poner el precio sugerido en todos los renglones (por
-- ejemplo después de elegir el cliente). Pisa los precios escritos a mano.
create or replace function comercial.aplicar_precios_pedido(p_pedido_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_n      integer;
begin
  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado <> 'BORRADOR' then
    raise exception 'Los precios se cambian con el pedido en borrador.' using errcode = 'check_violation';
  end if;
  update comercial.pedido_renglones r
     set (precio_unitario, alicuota_iva) =
         (select p.precio_neto, p.alicuota_iva from comercial.precio_para(r.producto_id, v_pedido.cliente_id) p)
   where r.pedido_id = p_pedido_id and not r.anulado
     and exists (select 1 from comercial.precio_para(r.producto_id, v_pedido.cliente_id) p
                  where p.precio_neto is not null);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

alter table comercial.precios_producto   enable row level security;
alter table comercial.precios_producto   force  row level security;
alter table comercial.descuentos_cliente enable row level security;
alter table comercial.descuentos_cliente force  row level security;

grant select, insert on comercial.precios_producto, comercial.descuentos_cliente to authenticated;
grant select on comercial.v_precios_vigentes, comercial.v_descuentos_vigentes to authenticated;
grant execute on function comercial.precio_para(uuid, uuid), comercial.aplicar_precios_pedido(uuid) to authenticated;

create policy precios_producto_select_authenticated on comercial.precios_producto
  for select to authenticated using (core.rol() is not null);
comment on policy precios_producto_select_authenticated on comercial.precios_producto is
  'El precio de lista lo consulta toda la empresa.';
create policy precios_producto_insert_ventas on comercial.precios_producto
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') and cargado_por = core.usuario_actual());
comment on policy precios_producto_insert_ventas on comercial.precios_producto is
  'Ítem 7: Ventas (Matias) cambia precios en forma definitiva. Append-only.';

create policy descuentos_cliente_select_authenticated on comercial.descuentos_cliente
  for select to authenticated using (core.rol() is not null);
comment on policy descuentos_cliente_select_authenticated on comercial.descuentos_cliente is
  'Consulta para todos los roles: quien carga un pedido ve el precio que corresponde.';
create policy descuentos_cliente_insert_ventas on comercial.descuentos_cliente
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') and cargado_por = core.usuario_actual());
comment on policy descuentos_cliente_insert_ventas on comercial.descuentos_cliente is
  'Ítem 7: Ventas pone el descuento por cliente, general o por producto. Append-only.';

select core.adjuntar_auditoria('comercial.precios_producto');
select core.adjuntar_auditoria('comercial.descuentos_cliente');

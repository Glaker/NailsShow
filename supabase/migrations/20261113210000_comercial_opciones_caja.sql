-- ---------------------------------------------------------------------------
-- Propósito : Opciones por caja en el pedido del portal de clientes: el cliente
--             pide cajas de aromas (un aroma, dos mezclados, una de cada una
--             o surtido) y Ventas asigna el surtido contra lo libre del
--             depósito. El pedido sigue teniendo un renglón vigente por SKU.
-- Reglas    : P3 (docs/disenos/P3-opciones-caja.md), RN-50 (auditoría),
--             RN-51 y RN-52 (lo retenido no cuenta: lo aplica
--             v_disponible_pt), RN-54 (sin editar movimientos: solo se
--             reservan), D-opciones-caja-1 (surtido sin aroma libre: no se
--             asigna), D-opciones-caja-2 (descuento por defecto de la caja
--             en lo que elige el cliente), D-opciones-caja-3 (el surtido
--             reserva con el pedido todavía en BORRADOR), D-caja-mixta-1,
--             D-descuento-caja-1, D-pedidos-por-deposito-1,
--             D-portal-clientes-1. El cliente nunca ve stock (regla 8).
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- DISEÑO EN BREVE.
--   cajas_aromas   los 8 grupos de aromas: tres SKU explícitos por grupo.
--   pedido_cajas   lo que pide el pedido: caja, opción y cantidad de cajas.
--   Un trigger vuelca cada caja en los renglones por SKU (cantidad,
--   cantidad_caja y cantidad_opcion); recalcular_venta pone el precio.
--   El surtido sin asignar no tiene renglón. asignar_surtido guarda el
--   reparto y reserva contra v_disponible_pt del depósito del pedido.
--   El cliente no lee tablas: cliente_pedidos y cliente_cajas lo resuelven y
--   no devuelven la asignación ni nada que dependa de lo libre.

-- ===========================================================================
-- 1. Cajas de aromas y opciones
-- ===========================================================================

create type comercial.opcion_caja_enum as enum
  ('SURTIDO', 'AMOR', 'PAZ', 'AIRE', 'AMOR_PAZ', 'AMOR_AIRE', 'PAZ_AIRE', 'UNA_DE_CADA');

create table comercial.cajas_aromas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null unique check (length(btrim(nombre)) > 0),
  producto_amor_id uuid not null references gmp.productos(id),
  producto_paz_id  uuid not null references gmp.productos(id),
  producto_aire_id uuid not null references gmp.productos(id),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  constraint cajas_aromas_tres_distintos check (
    producto_amor_id <> producto_paz_id and producto_amor_id <> producto_aire_id
    and producto_paz_id <> producto_aire_id)
);
create index cajas_aromas_amor_idx on comercial.cajas_aromas (producto_amor_id);
create index cajas_aromas_paz_idx  on comercial.cajas_aromas (producto_paz_id);
create index cajas_aromas_aire_idx on comercial.cajas_aromas (producto_aire_id);

comment on table comercial.cajas_aromas is
  'Los grupos de aromas que se venden en caja: familia y presentación, con un SKU por aroma. Ningún SKU representa '
  'a la familia (P3).';

create table comercial.pedido_cajas (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references comercial.pedidos(id),
  caja_id        uuid not null references comercial.cajas_aromas(id),
  opcion         comercial.opcion_caja_enum not null,
  cajas          integer not null check (cajas > 0),
  -- Foto de v_descuentos_caja al cargar la caja (la fija un trigger).
  unidades_caja  integer not null check (unidades_caja > 0),
  asignado_amor  integer check (asignado_amor >= 0),
  asignado_paz   integer check (asignado_paz >= 0),
  asignado_aire  integer check (asignado_aire >= 0),
  asignado_por   uuid references core.usuarios(id),
  asignado_en    timestamptz,
  anulado        boolean not null default false,
  anulado_por    uuid references core.usuarios(id),
  anulado_en     timestamptz,
  creado_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en      timestamptz not null default now(),
  constraint pedido_cajas_una_de_cada_de_a_tres check (opcion <> 'UNA_DE_CADA' or cajas % 3 = 0),
  constraint pedido_cajas_mixta_unidades_pares check (
    opcion not in ('AMOR_PAZ', 'AMOR_AIRE', 'PAZ_AIRE') or unidades_caja % 2 = 0),
  constraint pedido_cajas_asignado_solo_surtido check (
    num_nulls(asignado_amor, asignado_paz, asignado_aire) = 3
    or (opcion = 'SURTIDO' and num_nonnulls(asignado_amor, asignado_paz, asignado_aire) = 3
        and asignado_amor + asignado_paz + asignado_aire = cajas)),
  constraint pedido_cajas_asignacion_firmada check (
    (num_nulls(asignado_amor, asignado_paz, asignado_aire) = 3) = (asignado_en is null)),
  constraint pedido_cajas_anulacion check (anulado or anulado_en is null)
);
create unique index pedido_cajas_vigente_idx
  on comercial.pedido_cajas (pedido_id, caja_id, opcion) where not anulado;
create index pedido_cajas_pedido_idx on comercial.pedido_cajas (pedido_id);
create index pedido_cajas_caja_idx on comercial.pedido_cajas (caja_id);
create index pedido_cajas_asignado_por_idx on comercial.pedido_cajas (asignado_por);
create index pedido_cajas_anulado_por_idx on comercial.pedido_cajas (anulado_por);
create index pedido_cajas_creado_por_idx on comercial.pedido_cajas (creado_por);

comment on table comercial.pedido_cajas is
  'Cajas de aromas pedidas, con su opción. Se editan solo con el pedido en BORRADOR; un trigger las vuelca en los '
  'renglones por SKU. El surtido guarda su reparto por aroma, que el cliente no ve (P3).';

-- Qué surtido originó una reserva: al cambiar o anular su reparto se liberan solo esas.
alter table comercial.reservas_pt
  add column pedido_caja_id uuid references comercial.pedido_cajas(id);
create index reservas_pt_pedido_caja_idx on comercial.reservas_pt (pedido_caja_id) where pedido_caja_id is not null;
comment on column comercial.reservas_pt.pedido_caja_id is
  'Reserva hecha al asignar un surtido (pedido_cajas, P3). Se libera al reasignar o anular.';

alter table comercial.pedido_renglones
  add column cantidad_opcion numeric(14,4) not null default 0 check (cantidad_opcion >= 0),
  add constraint renglones_cantidad_opcion_tope
    check (cantidad_opcion <= coalesce(cantidad_caja, cantidad)),
  -- Un renglón con unidades de una caja vigente no se anula a mano: se edita la caja (el trigger lo anula al llegar a 0).
  add constraint renglones_anulado_sin_opcion
    check (not anulado or cantidad_opcion = 0);
comment on column comercial.pedido_renglones.cantidad_opcion is
  'Unidades del renglón que vienen de una caja con opción (pedido_cajas); el cliente ve solo cantidad − cantidad_opcion '
  'como sueltas. Va dentro de cantidad_caja (P3).';

alter table comercial.cajas_aromas enable row level security;
alter table comercial.cajas_aromas force  row level security;
alter table comercial.pedido_cajas enable row level security;
alter table comercial.pedido_cajas force  row level security;
grant select, insert, update on comercial.cajas_aromas to authenticated;
grant select, insert, update on comercial.pedido_cajas to authenticated;

create policy cajas_aromas_select_authenticated on comercial.cajas_aromas
  for select to authenticated using (core.rol() is not null);
comment on policy cajas_aromas_select_authenticated on comercial.cajas_aromas is
  '§3.3: consulta para todos los roles internos. El cliente las recibe por cliente_cajas(). RN-50: lectura sin cambios.';
create policy cajas_aromas_insert_ventas on comercial.cajas_aromas
  for insert to authenticated with check (core.es_rol('VENTAS', 'ADMINISTRACION'));
comment on policy cajas_aromas_insert_ventas on comercial.cajas_aromas is
  'Ventas y Administración dan de alta grupos de aromas (P3). RN-50: el alta queda auditada.';
create policy cajas_aromas_update_ventas on comercial.cajas_aromas
  for update to authenticated
  using (core.es_rol('VENTAS', 'ADMINISTRACION')) with check (core.es_rol('VENTAS', 'ADMINISTRACION'));
comment on policy cajas_aromas_update_ventas on comercial.cajas_aromas is
  'Ventas y Administración activan o desactivan un grupo; los SKU no cambian (P3, RN-50).';

create policy pedido_cajas_select_authenticated on comercial.pedido_cajas
  for select to authenticated using (core.rol() is not null);
comment on policy pedido_cajas_select_authenticated on comercial.pedido_cajas is
  '§3.3: consulta para todos los roles internos; el cliente no tiene rol y no ve filas (P3, regla 8, RN-50).';
create policy pedido_cajas_insert_ventas on comercial.pedido_cajas
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION') and creado_por = core.usuario_actual());
comment on policy pedido_cajas_insert_ventas on comercial.pedido_cajas is
  'Ventas y Administración cargan cajas al pedido, a su nombre (P3, RN-50). El cliente lo hace por cliente_enviar_pedido.';
create policy pedido_cajas_update_ventas on comercial.pedido_cajas
  for update to authenticated
  using (core.es_rol('VENTAS', 'ADMINISTRACION')) with check (core.es_rol('VENTAS', 'ADMINISTRACION'));
comment on policy pedido_cajas_update_ventas on comercial.pedido_cajas is
  'Ventas y Administración cambian cantidades, asignan el surtido (por asignar_surtido, RN-51) o anulan (P3, RN-50). Sin DELETE.';

-- Los SKU de un grupo no cambian (fn_cajas_materializa los usa para volcar y revertir): solo activo y nombre.
create function comercial.fn_cajas_aromas_congela()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.producto_amor_id is distinct from old.producto_amor_id or new.producto_paz_id is distinct from old.producto_paz_id
     or new.producto_aire_id is distinct from old.producto_aire_id then
    raise exception 'Los productos de un grupo de aromas no se cambian: se desactiva y se crea otro.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger trg_cajas_aromas_congela
  before update on comercial.cajas_aromas
  for each row execute function comercial.fn_cajas_aromas_congela();
revoke execute on function comercial.fn_cajas_aromas_congela() from public, anon, authenticated;

select core.adjuntar_auditoria('comercial.cajas_aromas');
select core.adjuntar_auditoria('comercial.pedido_cajas');

-- Los 8 grupos de 20261102130000 («las 8 de aromas»), por código: amor, paz, aire.
-- El aceite 378-380 no tiene caja cargada: no se arma.
do $$
declare
  v_faltan text;
begin
  create temp table carga_cajas_aromas on commit drop as
  select t.nombre, a.id as amor, p.id as paz, e.id as aire
    from (values
      ('Crema humectante 240 ml',        '370',    '372',    '371'),
      ('Crema humectante 100 ml',        '373',    '375',    '374'),
      ('Crema exfoliante 240 ml',        '364',    '366',    '365'),
      ('Crema exfoliante 100 ml',        '367',    '369',    '368'),
      ('Aceite de cutícula 8 ml',        '381',    '383',    '382'),
      ('Sanitizante 200 ml con gatillo', '391',    '395',    '393'),
      ('Sanitizante 125 ml',             '392',    '396',    '394'),
      ('Sanitizante 1 L',                'NS-397', 'NS-399', 'NS-398')
    ) as t (nombre, ca, cp, ce)
    left join gmp.productos a on a.codigo_interno = t.ca
    left join gmp.productos p on p.codigo_interno = t.cp
    left join gmp.productos e on e.codigo_interno = t.ce;
  select string_agg(nombre, ', ') into v_faltan
    from carga_cajas_aromas where amor is null or paz is null or aire is null;
  if v_faltan is not null then
    raise exception 'Faltan productos en el catálogo para las cajas: %', v_faltan;
  end if;
  insert into comercial.cajas_aromas (nombre, producto_amor_id, producto_paz_id, producto_aire_id)
  select nombre, amor, paz, aire from carga_cajas_aromas;
end;
$$;

-- ===========================================================================
-- 2. Lo que cada opción aporta a cada SKU
-- ===========================================================================

create function comercial.caja_aporte(
  p_caja comercial.cajas_aromas, p_opcion comercial.opcion_caja_enum, p_cajas integer, p_unidades integer,
  p_amor integer, p_paz integer, p_aire integer)
returns table (producto_id uuid, cantidad numeric)
language sql
immutable
set search_path = ''
as $$
  select x.producto_id, x.cantidad
    from (values
      (p_caja.producto_amor_id,
       case p_opcion when 'AMOR' then p_cajas::numeric * p_unidades
                     when 'AMOR_PAZ' then p_cajas::numeric * p_unidades / 2
                     when 'AMOR_AIRE' then p_cajas::numeric * p_unidades / 2
                     when 'UNA_DE_CADA' then p_cajas::numeric / 3 * p_unidades
                     when 'SURTIDO' then coalesce(p_amor, 0)::numeric * p_unidades else 0 end),
      (p_caja.producto_paz_id,
       case p_opcion when 'PAZ' then p_cajas::numeric * p_unidades
                     when 'AMOR_PAZ' then p_cajas::numeric * p_unidades / 2
                     when 'PAZ_AIRE' then p_cajas::numeric * p_unidades / 2
                     when 'UNA_DE_CADA' then p_cajas::numeric / 3 * p_unidades
                     when 'SURTIDO' then coalesce(p_paz, 0)::numeric * p_unidades else 0 end),
      (p_caja.producto_aire_id,
       case p_opcion when 'AIRE' then p_cajas::numeric * p_unidades
                     when 'AMOR_AIRE' then p_cajas::numeric * p_unidades / 2
                     when 'PAZ_AIRE' then p_cajas::numeric * p_unidades / 2
                     when 'UNA_DE_CADA' then p_cajas::numeric / 3 * p_unidades
                     when 'SURTIDO' then coalesce(p_aire, 0)::numeric * p_unidades else 0 end)
    ) as x (producto_id, cantidad);
$$;
comment on function comercial.caja_aporte(comercial.cajas_aromas, comercial.opcion_caja_enum, integer, integer, integer, integer, integer) is
  'Unidades que una caja con opción aporta a cada uno de sus tres SKU (P3). Surtido: lo asignado, 0 sin asignar.';
revoke execute on function comercial.caja_aporte(comercial.cajas_aromas, comercial.opcion_caja_enum, integer, integer, integer, integer, integer)
  from public, anon;
grant execute on function comercial.caja_aporte(comercial.cajas_aromas, comercial.opcion_caja_enum, integer, integer, integer, integer, integer)
  to authenticated;

-- ===========================================================================
-- 3. Triggers de pedido_cajas
-- ===========================================================================

-- BEFORE: unidades_caja es una foto de la caja vigente; lo demás, guardas.
create function comercial.fn_cajas_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caja comercial.cajas_aromas%rowtype;
  v_n    integer;
  v_cant integer;
  v_est  comercial.estado_pedido_enum;
begin
  select estado into v_est from comercial.pedidos where id = new.pedido_id;
  if v_est is distinct from 'BORRADOR' then
    raise exception 'Las cajas se cambian con el pedido en borrador (está %). Devolvelo a borrador primero.', v_est
      using errcode = 'check_violation';
  end if;
  -- El reparto del surtido solo lo escribe asignar_surtido (reserva, respeta el tope y firma): lo sella acá.
  -- Dejarlo sin reparto (todo NULL) vale desde cualquier lado; asignar_surtido ya libera lo reservado.
  if num_nulls(new.asignado_amor, new.asignado_paz, new.asignado_aire) < 3
     and (tg_op = 'INSERT'
          or (new.asignado_amor, new.asignado_paz, new.asignado_aire, new.asignado_por, new.asignado_en)
             is distinct from (old.asignado_amor, old.asignado_paz, old.asignado_aire, old.asignado_por, old.asignado_en)) then
    if coalesce(current_setting('comercial.asignando', true), '') <> '1' then
      raise exception 'El surtido se reparte con «Asignar surtido», no editando la caja.'
        using errcode = 'insufficient_privilege';
    end if;
    new.asignado_por := core.usuario_actual();
    new.asignado_en  := now();
  elsif num_nulls(new.asignado_amor, new.asignado_paz, new.asignado_aire) = 3 then
    new.asignado_por := null;
  end if;
  if tg_op = 'UPDATE' then
    if new.pedido_id is distinct from old.pedido_id or new.caja_id is distinct from old.caja_id
       or new.unidades_caja is distinct from old.unidades_caja then
      raise exception 'Una caja del pedido no cambia de pedido, de grupo ni de unidades: se anula y se carga de nuevo.'
        using errcode = 'check_violation';
    end if;
    if old.anulado and not new.anulado then
      raise exception 'Esa caja ya se quitó del pedido: si hace falta, cargala de nuevo.'
        using errcode = 'restrict_violation';
    end if;
    if new.anulado and not old.anulado then
      new.anulado_en  := now();
      new.anulado_por := core.usuario_actual();
    end if;
    return new;
  end if;
  select * into v_caja from comercial.cajas_aromas where id = new.caja_id and activo;
  if not found then
    raise exception 'Ese grupo de aromas no se vende en caja.' using errcode = 'check_violation';
  end if;
  select count(*), count(distinct unidades_caja), min(unidades_caja) into v_cant, v_n, new.unidades_caja
    from comercial.v_descuentos_caja
   where producto_id in (v_caja.producto_amor_id, v_caja.producto_paz_id, v_caja.producto_aire_id);
  if v_cant <> 3 or v_n <> 1 then
    raise exception 'Los tres aromas de % no tienen las mismas unidades por caja cargadas.', v_caja.nombre
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger trg_cajas_antes
  before insert or update on comercial.pedido_cajas
  for each row execute function comercial.fn_cajas_antes();

-- AFTER: vuelca la diferencia en los renglones por SKU (P3). Pedido en BORRADOR.
create function comercial.fn_cajas_materializa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_caja   comercial.cajas_aromas%rowtype;
  v_d      record;
  v_r      comercial.pedido_renglones%rowtype;
  v_cc     numeric;
  v_pct    numeric;
begin
  select * into v_pedido from comercial.pedidos where id = new.pedido_id for no key update;
  if not v_pedido.es_venta or v_pedido.estado <> 'BORRADOR' or v_pedido.eliminado_en is not null then
    raise exception 'Las cajas se cambian con el pedido en borrador (está %). Devolvelo a borrador primero.', v_pedido.estado
      using errcode = 'check_violation';
  end if;
  select * into v_caja from comercial.cajas_aromas where id = new.caja_id;

  -- Cambió o se quitó el reparto del surtido: se libera lo que había reservado.
  if tg_op = 'UPDATE' and old.asignado_en is not null
     and (new.anulado or new.asignado_en is distinct from old.asignado_en) then
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Cambió el surtido de %s del pedido %s.', v_caja.nombre, v_pedido.numero)
     where pedido_caja_id = old.id and not liberada;
  end if;

  for v_d in
    select producto_id, coalesce(n.cantidad, 0) - coalesce(o.cantidad, 0) as delta
      from (select a.producto_id, a.cantidad
              from comercial.caja_aporte(v_caja, new.opcion, new.cajas, new.unidades_caja,
                                         new.asignado_amor, new.asignado_paz, new.asignado_aire) a
             where not new.anulado) n
      full join (select a.producto_id, a.cantidad
                   from comercial.caja_aporte(v_caja, old.opcion, old.cajas, old.unidades_caja,
                                              old.asignado_amor, old.asignado_paz, old.asignado_aire) a
                  where tg_op = 'UPDATE' and not old.anulado) o using (producto_id)
  loop
    continue when v_d.delta = 0;
    select porcentaje into v_pct from comercial.v_descuentos_caja where producto_id = v_d.producto_id;
    select * into v_r from comercial.pedido_renglones
     where pedido_id = new.pedido_id and producto_id = v_d.producto_id and not anulado for update;
    if not found then
      if v_d.delta < 0 then
        raise exception 'El renglón de esa caja se anuló desde Ventas; editá la caja desde la central.' using errcode = 'check_violation';
      end if;
      insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, cantidad_caja, cantidad_opcion,
                                              descuento_caja_pct)
      values (new.pedido_id, v_d.producto_id, v_d.delta, v_d.delta, v_d.delta, v_pct);
    else
      -- cantidad_caja NULL con porcentaje = todo el renglón en caja: se hace explícito antes de sumar.
      -- Si Ventas le quitó el descuento a un renglón con unidades de caja, el piso es lo que vino de la caja.
      v_cc := greatest(
        coalesce(v_r.cantidad_caja, case when v_r.descuento_caja_pct is not null then v_r.cantidad else 0 end),
        v_r.cantidad_opcion);
      if v_r.cantidad + v_d.delta <= 0 then
        update comercial.pedido_renglones
           set anulado = true, cantidad_opcion = 0, cantidad_caja = 0 where id = v_r.id;
      else
        update comercial.pedido_renglones
           set cantidad = v_r.cantidad + v_d.delta,
               cantidad_caja = v_cc + v_d.delta,
               cantidad_opcion = v_r.cantidad_opcion + v_d.delta,
               descuento_caja_pct = coalesce(v_r.descuento_caja_pct, v_pct)
         where id = v_r.id;
      end if;
    end if;
  end loop;

  -- Los triggers de precio de los renglones no corren anidados: se recalcula acá.
  perform comercial.recalcular_venta(new.pedido_id);
  return null;
end;
$$;
create trigger trg_cajas_materializa
  after insert or update on comercial.pedido_cajas
  for each row execute function comercial.fn_cajas_materializa();
revoke execute on function comercial.fn_cajas_antes() from public, anon, authenticated;
revoke execute on function comercial.fn_cajas_materializa() from public, anon, authenticated;

-- ===========================================================================
-- 4. Asignación del surtido (Ventas, SECURITY INVOKER)
-- ===========================================================================

-- Unidades de un SKU que se pueden destinar al surtido: lo libre del depósito
-- del pedido más lo reservado para el propio pedido, menos lo que el pedido ya
-- pide de ese SKU. Lo asignado antes va en las dos puntas y no cuenta dos veces.
create function comercial.surtido_libre_unidades(p_pedido_id uuid, p_producto_id uuid)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
begin
  -- La llaman las dos funciones de abajo como INVOKER, así que no se le puede quitar el EXECUTE a authenticated:
  -- se cierra con el rol, para que el cliente no arme una consulta de lo libre.
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Asignar un surtido es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  return greatest(
           coalesce((select d.disponible from comercial.v_disponible_pt d
                      where d.deposito_id = comercial.deposito_de_venta(p_pedido_id)
                        and d.producto_id = p_producto_id), 0)
         + coalesce((select sum(x.cantidad - x.consumido) from comercial.reservas_pt x
                      where x.pedido_id = p_pedido_id and x.producto_id = p_producto_id
                        and x.deposito_id = comercial.deposito_de_venta(p_pedido_id) and not x.liberada), 0)
         - coalesce((select sum(r.cantidad) from comercial.pedido_renglones r
                      where r.pedido_id = p_pedido_id and r.producto_id = p_producto_id and not r.anulado), 0),
         0);
end;
$$;
comment on function comercial.surtido_libre_unidades(uuid, uuid) is
  'Unidades de un SKU libres para armar un surtido en el depósito del pedido (P3). Interna de la asignación.';

create function comercial.surtido_disponible(p_pedido_caja_id uuid)
returns table (amor integer, paz integer, aire integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pc comercial.pedido_cajas%rowtype;
  v_cj comercial.cajas_aromas%rowtype;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Asignar un surtido es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pc from comercial.pedido_cajas where id = p_pedido_caja_id and not anulado;
  if not found or v_pc.opcion <> 'SURTIDO' then
    raise exception 'No es un surtido vigente.' using errcode = 'check_violation';
  end if;
  select * into v_cj from comercial.cajas_aromas where id = v_pc.caja_id;
  return query
  select floor(comercial.surtido_libre_unidades(v_pc.pedido_id, v_cj.producto_amor_id) / v_pc.unidades_caja)::integer,
         floor(comercial.surtido_libre_unidades(v_pc.pedido_id, v_cj.producto_paz_id)  / v_pc.unidades_caja)::integer,
         floor(comercial.surtido_libre_unidades(v_pc.pedido_id, v_cj.producto_aire_id) / v_pc.unidades_caja)::integer;
end;
$$;
comment on function comercial.surtido_disponible(uuid) is
  'Cajas que se pueden armar de cada aroma para un surtido (Ventas y Administración). Depósito del pedido (P3).';

create function comercial.asignar_surtido(p_pedido_caja_id uuid, p_amor integer, p_paz integer, p_aire integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pc     comercial.pedido_cajas%rowtype;
  v_cj     comercial.cajas_aromas%rowtype;
  v_pedido comercial.pedidos%rowtype;
  v_dep    uuid;
  v_max    integer[];
  v_pide   integer[] := array[p_amor, p_paz, p_aire];
  v_prod   uuid[];
  v_nom    text[] := array['Amor', 'Paz', 'Aire'];
  i        integer;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Asignar un surtido es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pc from comercial.pedido_cajas where id = p_pedido_caja_id and not anulado;
  if not found or v_pc.opcion <> 'SURTIDO' then
    raise exception 'No es un surtido vigente.' using errcode = 'check_violation';
  end if;
  select * into v_pedido from comercial.pedidos where id = v_pc.pedido_id for update;
  if v_pedido.estado <> 'BORRADOR' or v_pedido.eliminado_en is not null then
    raise exception 'El surtido se asigna con el pedido % en borrador (está %).', v_pedido.numero, v_pedido.estado
      using errcode = 'check_violation';
  end if;
  if p_amor is null or p_paz is null or p_aire is null or p_amor < 0 or p_paz < 0 or p_aire < 0 then
    raise exception 'Cada aroma lleva una cantidad de cajas de 0 o más.' using errcode = 'check_violation';
  end if;
  if p_amor + p_paz + p_aire <> v_pc.cajas then
    raise exception 'El surtido son % cajas y se repartieron %.', v_pc.cajas, p_amor + p_paz + p_aire
      using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('comercial.enviar_venta'));
  -- Se relee con el lock tomado: otra asignación concurrente pudo cambiar el reparto desde la primera lectura.
  select * into v_pc from comercial.pedido_cajas where id = p_pedido_caja_id and not anulado for update;
  if not found then
    raise exception 'No es un surtido vigente.' using errcode = 'check_violation';
  end if;

  select * into v_cj from comercial.cajas_aromas where id = v_pc.caja_id;
  v_dep := comercial.deposito_de_venta(v_pc.pedido_id);
  v_prod := array[v_cj.producto_amor_id, v_cj.producto_paz_id, v_cj.producto_aire_id];

  -- 1. Se anula la asignación anterior: fn_cajas_materializa baja los renglones y
  --    libera lo reservado.
  if v_pc.asignado_en is not null then
    update comercial.pedido_cajas
       set asignado_amor = null, asignado_paz = null, asignado_aire = null,
           asignado_por = null, asignado_en = null
     where id = v_pc.id;
  end if;

  -- 2 y 3. Máximo por aroma, en cajas.
  v_max := array[]::integer[];
  for i in 1..3 loop
    v_max := v_max || floor(comercial.surtido_libre_unidades(v_pc.pedido_id, v_prod[i]) / v_pc.unidades_caja)::integer;
    if v_pide[i] > v_max[i] then
      raise exception 'De % se pueden armar % cajas como mucho y se pidieron %.', v_nom[i], v_max[i], v_pide[i]
        using errcode = 'check_violation';
    end if;
  end loop;

  -- 4. Se guarda el reparto (el CHECK exige que sume las cajas; el trigger lo sella con el autor).
  perform set_config('comercial.asignando', '1', true);
  update comercial.pedido_cajas
     set asignado_amor = p_amor, asignado_paz = p_paz, asignado_aire = p_aire,
         asignado_por = core.usuario_actual(), asignado_en = now()
   where id = v_pc.id;
  perform set_config('comercial.asignando', '', true);

  -- 5. Se reserva lo asignado en el depósito del pedido (D-opciones-caja-3).
  for i in 1..3 loop
    if v_pide[i] > 0 then
      insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cliente_id, cantidad, observacion,
                                         pedido_caja_id)
      values (v_prod[i], v_dep, v_pc.pedido_id, v_pedido.cliente_id, v_pide[i]::numeric * v_pc.unidades_caja,
              format('Surtido de %s para el pedido %s', v_cj.nombre, v_pedido.numero), v_pc.id);
    end if;
  end loop;
end;
$$;
comment on function comercial.asignar_surtido(uuid, integer, integer, integer) is
  'Ventas reparte las cajas de un surtido entre los tres aromas y las reserva en el depósito del pedido (P3, '
  'D-opciones-caja-1 a 3). INVOKER: la RLS de Ventas queda como segunda barrera.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'comercial.surtido_libre_unidades(uuid, uuid)', 'comercial.surtido_disponible(uuid)',
    'comercial.asignar_surtido(uuid, integer, integer, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ===========================================================================
-- 5. Portal del cliente
-- ===========================================================================

-- Grupos que el cliente puede pedir: los tres SKU en la lista con el mismo
-- precio, las mismas unidades por caja y el mismo porcentaje. No lee nada de
-- stock. mixta = false con unidades por caja impares.
create function comercial.cliente_cajas()
returns table (caja_id uuid, nombre text, unidades_caja integer, porcentaje numeric, precio_promo numeric,
               mixta boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not comercial.cliente_ve_lista() then
    perform comercial.cliente_exigir();
  end if;
  return query
  select c.id, c.nombre, min(d.unidades_caja)::integer, min(d.porcentaje), min(l.precio_promo),
         min(d.unidades_caja) % 2 = 0
    from comercial.cajas_aromas c
    join comercial.v_lista_mayorista l
      on l.producto_id in (c.producto_amor_id, c.producto_paz_id, c.producto_aire_id)
     and not l.es_regalo and l.precio_promo > 0
    join comercial.v_descuentos_caja d on d.producto_id = l.producto_id
   where c.activo
   group by c.id, c.nombre
  having count(*) = 3 and count(distinct l.precio_promo) = 1
     and count(distinct d.unidades_caja) = 1 and count(distinct d.porcentaje) = 1
   order by c.nombre;
end;
$$;
comment on function comercial.cliente_cajas() is
  'Portal de clientes (P3): los grupos de aromas que se pueden pedir en caja, con unidades, porcentaje y precio. '
  'No consulta ninguna relación de stock (regla 8).';
revoke execute on function comercial.cliente_cajas() from public, anon;
grant execute on function comercial.cliente_cajas() to authenticated;

-- Copia de 20261112120000: agrega las cajas y descuenta de los renglones lo que
-- vino de una caja. No devuelve la asignación ni su estado.
drop function comercial.cliente_pedidos();

create function comercial.cliente_pedidos()
returns table (id uuid, numero text, estado text, estado_cliente text, enviado_en timestamptz,
               fecha_entrega date, editable boolean, cancelado boolean, observaciones text,
               renglones jsonb, cajas jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.numero, p.estado::text,
         case
           when p.eliminado_en is not null or p.estado = 'CANCELADO' then 'CANCELADO'
           when p.estado = 'CUMPLIDO' or p.entregado_en is not null then 'FINALIZADO'
           when p.estado in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then 'PENDIENTE'
           when exists (select 1 from comercial.pedidos s
                         where s.para_pedido_id = p.id and s.para_stock and s.eliminado_en is null
                           and s.estado not in ('CUMPLIDO', 'CANCELADO')) then 'EN_PRODUCCION'
           else 'EN_CAMINO'
         end,
         coalesce(p.enviado_por_cliente_en, p.creado_en), p.fecha_entrega,
         p.estado = 'BORRADOR' and p.eliminado_en is null and p.enviado_por_cliente_en is not null,
         p.eliminado_en is not null or p.estado = 'CANCELADO',
         p.observaciones,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'producto_id', r.producto_id, 'cantidad', r.cantidad - r.cantidad_opcion,
                     'producto', pr.nombre, 'codigo', pr.codigo_interno) order by pr.codigo_interno)
                     from comercial.pedido_renglones r
                     join gmp.productos pr on pr.id = r.producto_id
                    where r.pedido_id = p.id and not r.anulado and r.cantidad - r.cantidad_opcion > 0), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'caja_id', c.caja_id, 'nombre', ca.nombre, 'opcion', c.opcion::text, 'cajas', c.cajas)
                     order by ca.nombre, c.opcion)
                     from comercial.pedido_cajas c
                     join comercial.cajas_aromas ca on ca.id = c.caja_id
                    where c.pedido_id = p.id and not c.anulado), '[]'::jsonb)
    from comercial.pedidos p
   where p.cliente_id = comercial.cliente_exigir() and p.es_venta
   order by p.creado_en desc
   limit 60;
$$;
revoke execute on function comercial.cliente_pedidos() from public, anon;
grant execute on function comercial.cliente_pedidos() to authenticated;

-- Copia de 20261110160100 con p_cajas: [{caja_id, opcion, cajas}]. Las cajas se
-- sincronizan antes que las sueltas (el trigger de pedido_cajas ajusta los
-- renglones). p_cajas NULL = no tocar las cajas del pedido (un frente viejo que manda 3 argumentos);
-- '[]' = sacarlas todas. Sus mensajes no mencionan stock.
drop function comercial.cliente_enviar_pedido(uuid, jsonb, text);

create function comercial.cliente_enviar_pedido(p_id uuid, p_renglones jsonb, p_observaciones text default null,
                                                p_cajas jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := comercial.cliente_exigir();
  v_pedido  comercial.pedidos%rowtype;
  v_id      uuid;
  v_numero  text;
  v_mal     text;
  v_toca_cajas boolean := p_cajas is not null;
begin
  perform set_config('comercial.portal_cliente', '1', true);
  p_renglones := coalesce(p_renglones, '[]'::jsonb);
  p_cajas := coalesce(p_cajas, '[]'::jsonb);
  if jsonb_typeof(p_renglones) is distinct from 'array' or jsonb_typeof(p_cajas) is distinct from 'array'
     or jsonb_array_length(p_renglones) + jsonb_array_length(p_cajas) = 0 then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  create temp table if not exists cliente_renglones (producto_id uuid, cantidad numeric) on commit drop;
  truncate cliente_renglones;
  insert into cliente_renglones
  select (x ->> 'producto_id')::uuid, (x ->> 'cantidad')::numeric
    from jsonb_array_elements(p_renglones) x;

  if exists (select 1 from cliente_renglones
              where producto_id is null or cantidad is null or cantidad <= 0
                 or cantidad <> trunc(cantidad) or cantidad > 100000) then
    raise exception 'Cada producto lleva una cantidad entera entre 1 y 100000.' using errcode = 'check_violation';
  end if;
  if exists (select producto_id from cliente_renglones group by 1 having count(*) > 1) then
    raise exception 'Hay un producto repetido en el pedido.' using errcode = 'check_violation';
  end if;
  select string_agg(coalesce(pr.codigo_interno, t.producto_id::text), ', ') into v_mal
    from cliente_renglones t
    left join gmp.productos pr on pr.id = t.producto_id
   where not exists (select 1 from comercial.v_lista_mayorista l
                      where l.producto_id = t.producto_id and not l.es_regalo and l.precio_promo > 0);
  if v_mal is not null then
    raise exception 'Estos productos ya no están en la lista: %. Sacalos y volvé a enviar.', v_mal
      using errcode = 'check_violation';
  end if;

  create temp table if not exists cliente_cajas_in (caja_id uuid, opcion text, cajas numeric) on commit drop;
  truncate cliente_cajas_in;
  insert into cliente_cajas_in
  select (x ->> 'caja_id')::uuid, x ->> 'opcion', (x ->> 'cajas')::numeric
    from jsonb_array_elements(p_cajas) x;
  if exists (select 1 from cliente_cajas_in
              where caja_id is null or cajas is null or cajas <= 0 or cajas <> trunc(cajas) or cajas > 10000
                 or opcion is null or opcion not in (select e.enumlabel::text from pg_catalog.pg_enum e
                                                      where e.enumtypid = 'comercial.opcion_caja_enum'::regtype)) then
    raise exception 'Cada caja lleva una opción y una cantidad entera entre 1 y 10000.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cliente_cajas_in group by caja_id, opcion having count(*) > 1) then
    raise exception 'Hay una caja repetida en el pedido.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cliente_cajas_in t
              where not exists (select 1 from comercial.cliente_cajas() c where c.caja_id = t.caja_id)) then
    raise exception 'Hay cajas que ya no están en la lista. Sacalas y volvé a enviar.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cliente_cajas_in where opcion = 'UNA_DE_CADA' and cajas % 3 <> 0) then
    raise exception '«Una de cada aroma» se pide de a 3 cajas.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cliente_cajas_in t join comercial.cliente_cajas() c on c.caja_id = t.caja_id
              where t.opcion in ('AMOR_PAZ', 'AMOR_AIRE', 'PAZ_AIRE') and not c.mixta) then
    raise exception 'Esa caja no se vende mezclando aromas.' using errcode = 'check_violation';
  end if;

  if p_id is null then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_venta'));
    select format('V-%s', lpad((coalesce(max(substring(numero from '^V-(\d+)$')::int), 0) + 1)::text, 4, '0'))
      into v_numero from comercial.pedidos where numero ~ '^V-\d+$';
    insert into comercial.pedidos (numero, cliente, cliente_id, es_venta, observaciones, enviado_por_cliente_en)
    select v_numero, c.razon_social, c.id, true, nullif(btrim(coalesce(p_observaciones, '')), ''), now()
      from comercial.clientes c where c.id = v_cliente
    returning id into v_id;
    insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
    select v_id, producto_id, cantidad from cliente_renglones;
    insert into comercial.pedido_cajas (pedido_id, caja_id, opcion, cajas)
    select v_id, caja_id, opcion::comercial.opcion_caja_enum, cajas::integer from cliente_cajas_in;
    return v_id;
  end if;

  select * into v_pedido from comercial.pedidos where id = p_id for update;
  if not found or v_pedido.cliente_id is distinct from v_cliente or not v_pedido.es_venta
     or v_pedido.enviado_por_cliente_en is null then
    raise exception 'Ese pedido no es tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if v_pedido.estado <> 'BORRADOR' or v_pedido.eliminado_en is not null then
    raise exception 'Ventas ya está preparando el pedido %: pediles el cambio por WhatsApp.', v_pedido.numero
      using errcode = 'check_violation';
  end if;

  -- Cajas: se quitan las que no vienen, se cambian las distintas (un surtido
  -- asignado vuelve a pendiente sin aviso) y se agregan las nuevas.
  update comercial.pedido_cajas c set anulado = true
   where v_toca_cajas and c.pedido_id = p_id and not c.anulado
     and not exists (select 1 from cliente_cajas_in t
                      where t.caja_id = c.caja_id and t.opcion = c.opcion::text);
  update comercial.pedido_cajas c
     set cajas = t.cajas::integer,
         asignado_amor = null, asignado_paz = null, asignado_aire = null,
         asignado_por = null, asignado_en = null
    from cliente_cajas_in t
   where c.pedido_id = p_id and not c.anulado and t.caja_id = c.caja_id and t.opcion = c.opcion::text
     and c.cajas <> t.cajas;
  insert into comercial.pedido_cajas (pedido_id, caja_id, opcion, cajas)
  select p_id, t.caja_id, t.opcion::comercial.opcion_caja_enum, t.cajas::integer
    from cliente_cajas_in t
   where not exists (select 1 from comercial.pedido_cajas c
                      where c.pedido_id = p_id and not c.anulado and c.caja_id = t.caja_id and c.opcion::text = t.opcion);

  -- Sueltas: la cantidad del renglón es lo que pidió suelto más lo que vino de cajas.
  update comercial.pedido_renglones r set anulado = true
   where r.pedido_id = p_id and not r.anulado and r.cantidad_opcion = 0
     and not exists (select 1 from cliente_renglones t where t.producto_id = r.producto_id);
  with n as (
    select r.id, coalesce(t.cantidad, 0) + r.cantidad_opcion as nueva
      from comercial.pedido_renglones r
      left join cliente_renglones t on t.producto_id = r.producto_id
     where r.pedido_id = p_id and not r.anulado)
  update comercial.pedido_renglones r
     set cantidad = n.nueva,
         cantidad_caja = case when r.cantidad_caja is null then null else least(r.cantidad_caja, n.nueva) end
    from n
   where r.id = n.id and n.nueva > 0 and r.cantidad <> n.nueva;
  insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
  select p_id, t.producto_id, t.cantidad
    from cliente_renglones t
   where not exists (select 1 from comercial.pedido_renglones r
                      where r.pedido_id = p_id and not r.anulado and r.producto_id = t.producto_id);
  update comercial.pedidos
     set observaciones = nullif(btrim(coalesce(p_observaciones, '')), ''), enviado_por_cliente_en = now()
   where id = p_id;
  return p_id;
end;
$$;
comment on function comercial.cliente_enviar_pedido(uuid, jsonb, text, jsonb) is
  'Portal de clientes (D-portal-clientes-1, P3): envía un pedido de venta nuevo o corrige uno enviado que sigue en '
  'BORRADOR. p_renglones: [{producto_id, cantidad}] sueltas; p_cajas: [{caja_id, opcion, cajas}].';
revoke execute on function comercial.cliente_enviar_pedido(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function comercial.cliente_enviar_pedido(uuid, jsonb, text, jsonb) to authenticated;

-- ===========================================================================
-- 6. Estados: un surtido sin asignar no sale de BORRADOR
-- ===========================================================================

-- Copia de 20261019130100 con un control más (NUEVO).
create or replace function comercial.fn_pedido_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('CUMPLIDO', 'CANCELADO') then
    -- Pago, forma de pago y observación se marcan después de cerrar.
    if (to_jsonb(new) - 'estado_pago' - 'forma_pago' - 'observaciones')
       = (to_jsonb(old) - 'estado_pago' - 'forma_pago' - 'observaciones') then
      return new;
    end if;
    -- Un pedido cancelado todavía se puede marcar borrado (20260924170000).
    if old.estado = 'CANCELADO' and old.eliminado_en is null and new.eliminado_en is not null
       and (to_jsonb(new) - 'eliminado_en' - 'eliminado_por' - 'motivo_eliminacion')
         = (to_jsonb(old) - 'eliminado_en' - 'eliminado_por' - 'motivo_eliminacion') then
      return new;
    end if;
    -- Un pedido terminado todavía se puede marcar entregado (20260925100000).
    if old.entregado_en is null and new.entregado_en is not null
       and (to_jsonb(new) - 'entregado_en' - 'entregado_por')
         = (to_jsonb(old) - 'entregado_en' - 'entregado_por') then
      return new;
    end if;
    if old.cliente_id is null and new.cliente_id is not null
       and (to_jsonb(new) - 'cliente_id') = (to_jsonb(old) - 'cliente_id') then
      return new;
    end if;
    raise exception 'El pedido % está cerrado (%) y no se modifica.', old.numero, old.estado
      using errcode = 'restrict_violation';
  end if;

  -- NUEVO: un pedido no cambia de venta a producción ni al revés, en ningún
  -- estado. Si se pudiera en borrador, dos PATCH (es_venta=false y después
  -- CONFIRMADO) salteaban la fecha de GP y la foto (revisión del 2026-10-19).
  -- Ningún circuito lo cambia: la central de Ventas lo crea ya de venta.
  if new.es_venta is distinct from old.es_venta then
    raise exception 'El pedido % no cambia de venta a producción ni al revés: se carga de nuevo.', old.numero
      using errcode = 'check_violation';
  end if;

  if new.estado is distinct from old.estado then
    if not (
         (old.estado = 'BORRADOR'        and new.estado in ('CONFIRMADO', 'ESPERANDO_FECHA', 'CANCELADO'))
      or (old.estado = 'ESPERANDO_FECHA' and new.estado in ('FECHA_PROPUESTA', 'BORRADOR', 'CANCELADO'))
      or (old.estado = 'FECHA_PROPUESTA' and new.estado in ('CONFIRMADO', 'ESPERANDO_FECHA', 'BORRADOR', 'CANCELADO'))
      or (old.estado = 'CONFIRMADO'      and new.estado in ('BORRADOR', 'EN_PRODUCCION', 'CUMPLIDO', 'CANCELADO'))
      or (old.estado = 'EN_PRODUCCION'   and new.estado in ('CUMPLIDO', 'CANCELADO'))
    ) then
      raise exception 'Un pedido no pasa de % a %.', old.estado, new.estado
        using errcode = 'check_violation';
    end if;

    -- NUEVO (P3): un surtido sin asignar no sale de BORRADOR, salvo para cancelar.
    if old.estado = 'BORRADOR' and new.estado <> 'CANCELADO'
       and exists (select 1 from comercial.pedido_cajas
                    where pedido_id = new.id and opcion = 'SURTIDO' and not anulado and asignado_en is null) then
      raise exception 'El pedido % tiene un surtido sin repartir entre los aromas.', old.numero
        using errcode = 'check_violation';
    end if;

    if new.estado = 'CONFIRMADO'
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id and not anulado) then
      raise exception 'No se envía a producción un pedido sin productos.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: se pide fecha para un pedido con productos.
    if new.estado = 'ESPERANDO_FECHA'
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id and not anulado) then
      raise exception 'No se pide fecha para un pedido sin productos.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: la fecha la espera solo un pedido de venta.
    if new.estado = 'ESPERANDO_FECHA' and not new.es_venta then
      raise exception 'Solo un pedido de venta espera fecha de Gerencia de Producción.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: a FECHA_PROPUESTA se llega guardando la propuesta.
    if new.estado = 'FECHA_PROPUESTA'
       and not exists (select 1 from comercial.propuestas_fecha
                        where pedido_id = new.id and propuesta_en = now()) then
      raise exception 'La fecha la propone Gerencia de Producción.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: un pedido de venta se aprueba con fecha propuesta y foto.
    if new.estado = 'CONFIRMADO' and (old.es_venta or new.es_venta)
       and (old.estado <> 'FECHA_PROPUESTA'
            or not exists (select 1 from comercial.fotos_pedido
                            where pedido_id = new.id and aprobada_en = now())) then
      raise exception 'El pedido % se aprueba con la fecha que propuso Gerencia de Producción.', old.numero
        using errcode = 'check_violation';
    end if;

    -- Entregado desde stock: no se produjo, no hay consumo (20260925100000).
    if new.estado = 'CUMPLIDO' and new.entregado_en is null
       and not exists (select 1 from comercial.pedido_consumos where pedido_id = new.id) then
      raise exception 'Un pedido se termina con «Terminado», que registra lo consumido y baja el stock.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

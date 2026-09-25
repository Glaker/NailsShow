-- ---------------------------------------------------------------------------
-- Propósito : Producción para terceros, lado comercial: pedidos de un
--             tercero, de qué stock sale cada insumo (Nail Show o el del
--             tercero), disponible y faltantes por titular, reservas para un
--             cliente, ingreso del material del tercero a stock, y
--             «Terminado» consumiendo del titular elegido.
-- Reglas    : RN-51/RN-52 vía gmp.lote_consumible() (sin cambios), RN-54 (el
--             movimiento y el consumo no se editan), RN-50 (auditoría), §3.3
--             (Gerencia de Producción registra la producción), invariante 7
--             (comercial → gmp: acá se referencia gmp.terceros, nunca al
--             revés). Especificación del codirector técnico del 2026-09-24
--             (docs/ESTADO.md, ítem 2 de la cola).
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- EL TITULAR ES UN DATO DEL LOTE.
-- Nada de «stock del tercero» como tabla aparte: el saldo sigue siendo la
-- suma de movimientos por lote, y de quién es sale de gmp.lotes_insumo.
-- tercero_id (nulo = Nail Show). Así el kardex, los bloqueos, el control de
-- calidad y el vencimiento funcionan igual para los dos sin duplicar nada.
--
-- DE DÓNDE SALE CADA INSUMO.
-- Un pedido de Nail Show consume solo stock de Nail Show. Un pedido de un
-- tercero consume, insumo por insumo, del stock que Nazarena elige al pasarlo
-- a «En producción» (respuesta del codirector técnico, 2026-09-24). Lo que
-- elige queda escrito en comercial.pedido_origen_insumos y no se edita; si al
-- terminar sale de otro lado, «Terminado» lo registra como corrección.
--
-- RESERVAS PARA UN CLIENTE.
-- Una reserva aparta stock de un titular para un beneficiario (Nail Show o un
-- tercero). Para los pedidos de ese beneficiario lo reservado está
-- disponible; para los demás, no. Al terminar un pedido del beneficiario, lo
-- consumido descuenta de su reserva.

-- ===========================================================================
-- 1. Clientes y pedidos de un tercero
-- ===========================================================================

alter table comercial.clientes
  add column tercero_id uuid unique references gmp.terceros(id);

comment on column comercial.clientes.tercero_id is
  'Datos fiscales del cliente tercerizado, para facturarle. El pedido del tercero toma este cliente por defecto.';

alter table comercial.pedidos
  add column tercero_id uuid references gmp.terceros(id);

comment on column comercial.pedidos.tercero_id is
  'Pedido de un cliente tercerizado. Nulo = pedido de Nail Show. Se fija en borrador.';

create index pedidos_tercero_idx on comercial.pedidos (tercero_id) where tercero_id is not null;

-- ===========================================================================
-- 2. De qué stock sale cada insumo
-- ===========================================================================

create table comercial.pedido_origen_insumos (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references comercial.pedidos(id),
  insumo_id    uuid not null references gmp.insumos_catalogo(id),
  -- Titular del stock del que se consume. Nulo = Nail Show.
  tercero_id   uuid references gmp.terceros(id),
  elegido_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  elegido_en   timestamptz not null default now(),
  unique (pedido_id, insumo_id)
);

comment on table comercial.pedido_origen_insumos is
  'Elección, al pasar un pedido de tercero a producción, de si cada insumo sale del stock de Nail Show o del '
  'tercero. No se edita: si al terminar se usó otro, lo registra «Terminado».';

create or replace function comercial.fn_origen_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La elección de origen de un insumo no se modifica. Si al terminar salió de otro stock, se indica en «Terminado».'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_origen_inmutable
  before update or delete on comercial.pedido_origen_insumos
  for each row execute function comercial.fn_origen_inmutable();

alter table comercial.pedido_origen_insumos enable row level security;
alter table comercial.pedido_origen_insumos force  row level security;

grant select, insert on comercial.pedido_origen_insumos to authenticated;

create policy pedido_origen_insumos_select_authenticated on comercial.pedido_origen_insumos
  for select to authenticated using (core.rol() is not null);
comment on policy pedido_origen_insumos_select_authenticated on comercial.pedido_origen_insumos is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy pedido_origen_insumos_insert_produccion on comercial.pedido_origen_insumos
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
comment on policy pedido_origen_insumos_insert_produccion on comercial.pedido_origen_insumos is
  '§3.3: decidir con qué se produce es de Gerencia de Producción; DT como supervisión.';

select core.adjuntar_auditoria('comercial.pedido_origen_insumos');

-- Titular del stock realmente consumido, al lado de lo consumido.
alter table comercial.pedido_consumos
  add column tercero_id uuid references gmp.terceros(id);

comment on column comercial.pedido_consumos.tercero_id is
  'De qué stock salió el consumo. Nulo = Nail Show.';

-- ===========================================================================
-- 3. Reservas por titular y beneficiario
-- ===========================================================================

alter table comercial.reservas_stock
  add column tercero_id      uuid references gmp.terceros(id),
  add column para_tercero_id uuid references gmp.terceros(id),
  add column motivo          text,
  add column consumido       numeric(14,4) not null default 0 check (consumido >= 0),
  add column liberada_por    uuid references core.usuarios(id);

alter table comercial.reservas_stock
  add constraint reservas_consumo_no_excede check (consumido <= cantidad);

comment on column comercial.reservas_stock.tercero_id is
  'Titular del stock reservado. Nulo = Nail Show.';
comment on column comercial.reservas_stock.para_tercero_id is
  'Para quién se reserva. Nulo = Nail Show. Los pedidos de ese beneficiario pueden usar lo reservado.';
comment on column comercial.reservas_stock.consumido is
  'Parte de la reserva ya usada por pedidos del beneficiario. Lo escribe «Terminado», no el usuario.';

create or replace function comercial.fn_validar_reserva()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_insumo  gmp.insumos_catalogo%rowtype;
  v_pedido  comercial.pedidos%rowtype;
  v_libre   numeric;
begin
  if tg_op = 'UPDATE' then
    -- Lo único que cambia de una reserva es cuánto se usó y si se liberó.
    if (new.pedido_id, new.insumo_id, new.cantidad, new.unidad, new.vence_en, new.tercero_id,
        new.para_tercero_id, new.motivo, new.creado_por, new.creado_en)
       is distinct from
       (old.pedido_id, old.insumo_id, old.cantidad, old.unidad, old.vence_en, old.tercero_id,
        old.para_tercero_id, old.motivo, old.creado_por, old.creado_en) then
      raise exception 'Una reserva no se edita: se libera y se hace otra.' using errcode = 'restrict_violation';
    end if;
    if old.liberada and not new.liberada then
      raise exception 'Una reserva liberada no se vuelve a activar: se hace otra.' using errcode = 'restrict_violation';
    end if;
    if new.consumido < old.consumido then
      raise exception 'Lo consumido de una reserva no disminuye.' using errcode = 'restrict_violation';
    end if;
    if new.consumido >= new.cantidad then
      new.liberada := true;
    end if;
    if new.liberada and not old.liberada then
      new.liberada_en  := now();
      new.liberada_por := core.usuario_actual();
    end if;
    return new;
  end if;

  select * into v_insumo from gmp.insumos_catalogo where id = new.insumo_id;
  if not found then
    raise exception 'El insumo no existe.';
  end if;
  if v_insumo.unidad_medida is null then
    raise exception '«%» no tiene unidad de medida confirmada.', v_insumo.nombre using errcode = 'check_violation';
  end if;
  new.unidad       := v_insumo.unidad_medida;
  new.consumido    := 0;
  new.liberada     := false;
  new.liberada_en  := null;
  new.liberada_por := null;

  if new.pedido_id is not null then
    select * into v_pedido from comercial.pedidos where id = new.pedido_id;
    new.para_tercero_id := v_pedido.tercero_id;
  end if;

  if v_insumo.tercero_id is not null and new.tercero_id is distinct from v_insumo.tercero_id then
    raise exception '«%» es propio de un cliente tercerizado: solo se reserva de su stock.', v_insumo.nombre
      using errcode = 'check_violation';
  end if;
  -- El material del tercero es del tercero: no se aparta para otro.
  if new.tercero_id is not null and new.para_tercero_id is distinct from new.tercero_id then
    raise exception 'El stock de un cliente tercerizado solo se reserva para ese mismo cliente.'
      using errcode = 'check_violation';
  end if;

  -- No se reserva lo que no hay. Serializa con otras reservas del mismo
  -- insumo y titular para que dos no se repartan el mismo saldo.
  perform pg_advisory_xact_lock(hashtextextended('reserva|' || new.insumo_id::text || '|' || coalesce(new.tercero_id::text, 'NS'), 0));

  select coalesce(s.saldo, 0) - coalesce((
           select sum(r.cantidad - r.consumido)
             from comercial.reservas_stock r
            where r.insumo_id = new.insumo_id
              and r.tercero_id is not distinct from new.tercero_id
              and not r.liberada and r.vence_en > now()
         ), 0)
    into v_libre
    from (select 1) x
    left join comercial.v_saldo_consumible s
      on s.insumo_id = new.insumo_id and s.tercero_id is not distinct from new.tercero_id;

  if new.cantidad > coalesce(v_libre, 0) then
    raise exception 'Se quieren reservar % % de «%» y libres hay %. Solo se reserva stock aprobado que no esté reservado.',
      new.cantidad, new.unidad, v_insumo.nombre, round(greatest(coalesce(v_libre, 0), 0), 4)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 4. Saldo, reservas y disponible por titular
-- ===========================================================================

-- Saldo consumible por insumo y titular: lo que gmp.lote_consumible() acepta.
create view comercial.v_saldo_consumible
with (security_invoker = true) as
select a.insumo_id,
       l.tercero_id,
       sum(s.saldo)                                          as saldo,
       coalesce(sum(s.saldo) filter (where l.estado = 'SALDO_APERTURA'), 0) as saldo_apertura
  from comercial.v_saldos_stock s
  join comercial.articulos a on a.id = s.articulo_id
  join gmp.lotes_insumo l    on l.id = s.lote_insumo_id
 where s.saldo > 0
   and gmp.lote_consumible(s.lote_insumo_id)
 group by a.insumo_id, l.tercero_id;

comment on view comercial.v_saldo_consumible is
  'Saldo utilizable en producción por insumo y titular (tercero_id nulo = Nail Show).';

grant select on comercial.v_saldo_consumible to authenticated;

-- Ahora que existe la vista, el trigger de reservas puede engancharse.
create trigger trg_validar_reserva
  before insert or update on comercial.reservas_stock
  for each row execute function comercial.fn_validar_reserva();

create view comercial.v_reservas_vigentes
with (security_invoker = true) as
select r.id,
       r.insumo_id,
       i.codigo_interno,
       i.nombre                        as insumo_nombre,
       r.unidad,
       r.tercero_id,
       t.nombre                        as tercero_nombre,
       r.para_tercero_id,
       p.nombre                        as para_nombre,
       r.pedido_id,
       r.cantidad,
       r.consumido,
       r.cantidad - r.consumido        as pendiente,
       r.motivo,
       r.vence_en,
       r.creado_por,
       r.creado_en
  from comercial.reservas_stock r
  join gmp.insumos_catalogo i on i.id = r.insumo_id
  left join gmp.terceros t    on t.id = r.tercero_id
  left join gmp.terceros p    on p.id = r.para_tercero_id
 where not r.liberada and r.vence_en > now();

comment on view comercial.v_reservas_vigentes is
  'Reservas activas con lo que les queda por usar. `tercero_id` es el titular del stock; `para_tercero_id`, el beneficiario.';

grant select on comercial.v_reservas_vigentes to authenticated;

-- Lo reservado de Nail Show, que es lo que las vistas de antes restaban.
-- Misma forma que antes; ahora mira solo el stock propio y descuenta lo usado.
create or replace view comercial.v_reservado_por_insumo
with (security_invoker = true) as
select insumo_id, sum(cantidad - consumido) as reservado
from comercial.reservas_stock
where not liberada and vence_en > now() and tercero_id is null
group by insumo_id;

-- Disponible de Nail Show. Mismas columnas que en 20260923130000; el cambio es
-- que ya no cuenta lotes de terceros.
create or replace view comercial.v_disponible_por_insumo
with (security_invoker = true) as
with totales as (
  select insumo_id, saldo, saldo_apertura
    from comercial.v_saldo_consumible
   where tercero_id is null
)
select
  i.id                                                        as insumo_id,
  i.codigo_interno,
  i.nombre                                                    as insumo_nombre,
  coalesce(t.saldo, 0)                                        as saldo,
  coalesce(r.reservado, 0)                                    as reservado,
  greatest(coalesce(t.saldo, 0) - coalesce(r.reservado, 0), 0) as disponible,
  coalesce(t.saldo_apertura, 0)                               as saldo_apertura
from gmp.insumos_catalogo i
left join totales t                          on t.insumo_id = i.id
left join comercial.v_reservado_por_insumo r on r.insumo_id = i.id
where t.insumo_id is not null or r.insumo_id is not null;

comment on view comercial.v_disponible_por_insumo is
  'Disponible de Nail Show para producción: saldo de lotes propios que gmp.lote_consumible() acepta, menos lo '
  'reservado. El de cada tercero está en comercial.v_stock_tercero.';

-- Existencia por lote: se agrega de quién es, al final (create or replace
-- view solo admite columnas nuevas al final).
create or replace view comercial.v_existencias with (security_invoker = true) as
  select
    s.articulo_id,
    a.sku,
    a.stock_minimo,
    i.id                            as insumo_id,
    i.codigo_interno,
    i.nombre                        as insumo_nombre,
    i.tipo                          as insumo_tipo,
    i.es_inflamable,
    s.lote_insumo_id,
    l.numero_registro_interno,
    l.lote_proveedor,
    l.estado,
    gmp.color_rotulo(l.estado)      as color_rotulo,
    l.plazo_validez,
    s.deposito_id,
    d.numero                        as deposito_numero,
    d.nombre                        as deposito_nombre,
    d.es_exterior                   as deposito_es_exterior,
    s.unidad,
    s.saldo,
    s.movimientos,
    s.ultimo_movimiento,
    gmp.impedimento_despacho(s.lote_insumo_id) as impedimento_despacho,
    (l.plazo_validez is not null
       and l.plazo_validez <= current_date + 90) as vence_en_90_dias,
    l.tercero_id,
    t.nombre                        as tercero_nombre
  from comercial.v_saldos_stock s
  join comercial.articulos    a on a.id = s.articulo_id
  join gmp.insumos_catalogo   i on i.id = a.insumo_id
  join gmp.lotes_insumo       l on l.id = s.lote_insumo_id
  join gmp.depositos          d on d.id = s.deposito_id
  left join gmp.terceros      t on t.id = l.tercero_id;

-- Existencia consolidada de Nail Show. Mismas columnas; los lotes de terceros
-- no suman: la reposición de Nail Show no se decide con material ajeno.
create or replace view comercial.v_stock_por_articulo with (security_invoker = true) as
  select
    a.id                            as articulo_id,
    a.sku,
    a.stock_minimo,
    a.activo,
    i.id                            as insumo_id,
    i.codigo_interno,
    i.nombre                        as insumo_nombre,
    i.tipo                          as insumo_tipo,
    i.unidad_medida,
    i.es_inflamable,
    coalesce(sum(s.saldo), 0)                                     as saldo_total,
    coalesce(sum(s.saldo) filter (where l.estado = 'APROBADO'), 0) as saldo_aprobado,
    coalesce(sum(s.saldo) filter (
      where l.estado = 'APROBADO' and gmp.lote_despachable(l.id)
    ), 0)                                                         as saldo_despachable,
    count(distinct s.lote_insumo_id) filter (where s.saldo > 0)    as lotes_con_saldo,
    count(distinct s.deposito_id)    filter (where s.saldo > 0)    as depositos,
    min(l.plazo_validez) filter (where s.saldo > 0)                as vence_primero,
    max(s.ultimo_movimiento)                                       as ultimo_movimiento,
    a.stock_minimo is not null
      and coalesce(sum(s.saldo), 0) < a.stock_minimo               as bajo_minimo
  from comercial.articulos a
  join gmp.insumos_catalogo i on i.id = a.insumo_id
  left join (
    comercial.v_saldos_stock s
    join gmp.lotes_insumo l on l.id = s.lote_insumo_id and l.tercero_id is null
  ) on s.articulo_id = a.id
  where i.tercero_id is null
  group by a.id, a.sku, a.stock_minimo, a.activo,
           i.id, i.codigo_interno, i.nombre, i.tipo, i.unidad_medida, i.es_inflamable;

-- Stock de cada tercero, por insumo: lo que hay, lo que está en control de
-- calidad, lo usable y lo reservado.
create view comercial.v_stock_tercero
with (security_invoker = true) as
with saldos as (
  select l.tercero_id,
         a.insumo_id,
         sum(s.saldo)                                                        as saldo_total,
         sum(s.saldo) filter (where gmp.lote_consumible(s.lote_insumo_id))   as saldo_consumible,
         count(distinct s.lote_insumo_id) filter (where s.saldo > 0)          as lotes,
         min(l.plazo_validez) filter (where s.saldo > 0)                      as vence_primero
    from comercial.v_saldos_stock s
    join comercial.articulos a on a.id = s.articulo_id
    join gmp.lotes_insumo l    on l.id = s.lote_insumo_id
   where l.tercero_id is not null
   group by l.tercero_id, a.insumo_id
),
reservado as (
  select tercero_id, insumo_id, sum(cantidad - consumido) as reservado
    from comercial.reservas_stock
   where not liberada and vence_en > now() and tercero_id is not null
   group by tercero_id, insumo_id
)
select s.tercero_id,
       s.insumo_id,
       i.codigo_interno,
       i.nombre                                    as insumo_nombre,
       i.tipo                                      as insumo_tipo,
       i.unidad_medida,
       i.tercero_id is not null                    as propio,
       s.saldo_total,
       coalesce(s.saldo_consumible, 0)             as saldo_consumible,
       s.saldo_total - coalesce(s.saldo_consumible, 0) as saldo_no_disponible,
       coalesce(r.reservado, 0)                    as reservado,
       greatest(coalesce(s.saldo_consumible, 0) - coalesce(r.reservado, 0), 0) as disponible,
       s.lotes,
       s.vence_primero
  from saldos s
  join gmp.insumos_catalogo i on i.id = s.insumo_id
  left join reservado r on r.tercero_id = s.tercero_id and r.insumo_id = s.insumo_id;

comment on view comercial.v_stock_tercero is
  'Stock de cada cliente tercerizado por insumo. `saldo_no_disponible` es lo que todavía no aprobó calidad, está '
  'vencido o bloqueado.';

grant select on comercial.v_stock_tercero to authenticated;

-- ===========================================================================
-- 5. Titular por defecto de un insumo en un pedido
-- ===========================================================================
--
-- Pedido de Nail Show: siempre Nail Show. Pedido de tercero: lo elegido al
-- pasar a producción; si todavía no se eligió, el tercero cuando el insumo es
-- propio suyo o tiene stock de él, y Nail Show en otro caso.

create or replace function comercial.origen_insumo(p_pedido_id uuid, p_insumo_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
           when p.tercero_id is null then null
           when o.id is not null then o.tercero_id
           when i.tercero_id is not null then i.tercero_id
           when exists (
             select 1 from comercial.v_saldo_consumible s
              where s.insumo_id = p_insumo_id and s.tercero_id = p.tercero_id and s.saldo > 0
           ) then p.tercero_id
           else null
         end
    from comercial.pedidos p
    left join comercial.pedido_origen_insumos o on o.pedido_id = p.id and o.insumo_id = p_insumo_id
    left join gmp.insumos_catalogo i on i.id = p_insumo_id
   where p.id = p_pedido_id;
$$;

comment on function comercial.origen_insumo(uuid, uuid) is
  'Titular del stock del que un pedido consume un insumo (nulo = Nail Show).';

grant execute on function comercial.origen_insumo(uuid, uuid) to authenticated;

-- Disponible para un beneficiario: saldo del titular menos lo reservado para
-- OTROS. Lo reservado para él mismo le sirve.
create or replace function comercial.disponible_para(p_insumo_id uuid, p_titular uuid, p_para uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select greatest(
           coalesce((select saldo from comercial.v_saldo_consumible
                      where insumo_id = p_insumo_id and tercero_id is not distinct from p_titular), 0)
         - coalesce((select sum(cantidad - consumido) from comercial.reservas_stock
                      where insumo_id = p_insumo_id
                        and tercero_id is not distinct from p_titular
                        and para_tercero_id is distinct from p_para
                        and not liberada and vence_en > now()), 0),
         0);
$$;

grant execute on function comercial.disponible_para(uuid, uuid, uuid) to authenticated;

-- ===========================================================================
-- 6. Insumos de un pedido, con de dónde pueden salir
-- ===========================================================================
--
-- Es lo que la pantalla muestra al pasar a producción: por insumo, cuánto
-- hace falta, cuánto hay usable en cada stock y qué está elegido o sugerido.

create or replace function comercial.insumos_pedido(p_pedido_id uuid)
returns table (
  insumo_id            uuid,
  codigo_interno       text,
  insumo               text,
  unidad               text,
  necesario            numeric,
  propio_tercero       boolean,
  disponible_nailshow  numeric,
  disponible_tercero   numeric,
  origen               text,
  elegido              boolean
)
language sql
stable
set search_path = ''
as $$
  select n.insumo_id,
         i.codigo_interno,
         i.nombre,
         i.unidad_medida,
         n.necesario,
         i.tercero_id is not null,
         case when i.tercero_id is null
              then comercial.disponible_para(n.insumo_id, null, p.tercero_id) else 0 end,
         case when p.tercero_id is null then 0
              else comercial.disponible_para(n.insumo_id, p.tercero_id, p.tercero_id) end,
         case when comercial.origen_insumo(p.id, n.insumo_id) is null then 'NAILSHOW' else 'TERCERO' end,
         exists (select 1 from comercial.pedido_origen_insumos o
                  where o.pedido_id = p.id and o.insumo_id = n.insumo_id)
    from comercial.pedidos p
    cross join lateral comercial.necesidad_pedido(p.id) n
    join gmp.insumos_catalogo i on i.id = n.insumo_id
   where p.id = p_pedido_id
   order by i.nombre;
$$;

comment on function comercial.insumos_pedido(uuid) is
  'Insumos de un pedido con lo disponible en el stock de Nail Show y en el del tercero, y el origen elegido o sugerido.';

grant execute on function comercial.insumos_pedido(uuid) to authenticated;

-- ===========================================================================
-- 7. Reglas del pedido de tercero
-- ===========================================================================

create or replace function comercial.fn_pedido_tercero()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tercero_id is not null
     and (tg_op = 'INSERT' or new.tercero_id is distinct from old.tercero_id)
     and not exists (select 1 from gmp.terceros where id = new.tercero_id and activo) then
    raise exception 'El cliente tercerizado no existe o está desactivado.' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.tercero_id is distinct from old.tercero_id then
    if old.estado <> 'BORRADOR' then
      raise exception 'Para quién es el pedido se cambia en borrador (está %).', old.estado
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from comercial.pedido_renglones r
        join gmp.productos pr on pr.id = r.producto_id
       where r.pedido_id = new.id and pr.tercero_id is not null
         and pr.tercero_id is distinct from new.tercero_id
    ) then
      raise exception 'El pedido tiene productos de otro cliente tercerizado: sacalos antes de cambiar el cliente.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.estado = 'EN_PRODUCCION' and old.estado <> 'EN_PRODUCCION' and new.tercero_id is not null
     and exists (
       select 1 from comercial.necesidad_pedido(new.id) n
        where not exists (select 1 from comercial.pedido_origen_insumos o
                           where o.pedido_id = new.id and o.insumo_id = n.insumo_id)
     ) then
    raise exception 'Un pedido tercerizado pasa a producción eligiendo de qué stock sale cada insumo («Pasar a producción»).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_pedido_tercero
  before insert or update on comercial.pedidos
  for each row execute function comercial.fn_pedido_tercero();

-- Un producto de un tercero solo se pide para ese tercero.
create or replace function comercial.fn_renglon_titular()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_producto uuid;
  v_pedido   uuid;
begin
  select tercero_id into v_producto from gmp.productos where id = new.producto_id;
  select tercero_id into v_pedido   from comercial.pedidos  where id = new.pedido_id;
  if v_producto is not null and v_producto is distinct from v_pedido then
    raise exception 'Ese producto es de un cliente tercerizado: solo va en pedidos de ese cliente.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_renglon_titular
  before insert or update on comercial.pedido_renglones
  for each row execute function comercial.fn_renglon_titular();

-- La elección de origen se registra con el pedido enviado, antes de producir.
create or replace function comercial.fn_origen_pedido_confirmado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_propio uuid;
begin
  select * into v_pedido from comercial.pedidos where id = new.pedido_id;
  if v_pedido.estado <> 'CONFIRMADO' then
    raise exception 'El origen de los insumos se elige al pasar a producción un pedido enviado (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;
  if v_pedido.tercero_id is null and new.tercero_id is not null then
    raise exception 'Un pedido de Nail Show consume stock de Nail Show.' using errcode = 'check_violation';
  end if;
  if new.tercero_id is not null and new.tercero_id is distinct from v_pedido.tercero_id then
    raise exception 'No se consume material de un cliente tercerizado para otro.' using errcode = 'check_violation';
  end if;
  select tercero_id into v_propio from gmp.insumos_catalogo where id = new.insumo_id;
  if v_propio is not null and new.tercero_id is distinct from v_propio then
    raise exception 'Ese insumo es propio del cliente tercerizado: sale de su stock.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_origen_pedido_confirmado
  before insert on comercial.pedido_origen_insumos
  for each row execute function comercial.fn_origen_pedido_confirmado();

-- ===========================================================================
-- 8. Pasar a producción
-- ===========================================================================
--
-- p_origenes: [{ "insumo_id": uuid, "origen": "NAILSHOW" | "TERCERO" }]
-- Los insumos que no vengan toman el origen sugerido (comercial.origen_insumo).
-- En un pedido de Nail Show no hay nada que elegir y el arreglo se ignora.

create or replace function comercial.pasar_a_produccion(p_pedido_id uuid, p_origenes jsonb default '[]'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido  comercial.pedidos%rowtype;
  r         record;
  v_titular uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Pasar un pedido a producción es de Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado <> 'CONFIRMADO' then
    raise exception 'Pasa a producción un pedido enviado (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;

  if v_pedido.tercero_id is not null then
    for r in
      select n.insumo_id,
             (select e ->> 'origen'
                from jsonb_array_elements(coalesce(p_origenes, '[]'::jsonb)) e
               where (e ->> 'insumo_id')::uuid = n.insumo_id
               limit 1) as origen
        from comercial.necesidad_pedido(p_pedido_id) n
    loop
      v_titular := case r.origen
                     when 'NAILSHOW' then null
                     when 'TERCERO'  then v_pedido.tercero_id
                     else comercial.origen_insumo(p_pedido_id, r.insumo_id)
                   end;
      insert into comercial.pedido_origen_insumos (pedido_id, insumo_id, tercero_id)
      values (p_pedido_id, r.insumo_id, v_titular)
      on conflict (pedido_id, insumo_id) do nothing;
    end loop;
  end if;

  update comercial.pedidos set estado = 'EN_PRODUCCION' where id = p_pedido_id;
end;
$$;

comment on function comercial.pasar_a_produccion(uuid, jsonb) is
  'Pasa un pedido enviado a producción. En pedidos de tercero registra de qué stock sale cada insumo.';

grant execute on function comercial.pasar_a_produccion(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 9. Explosión y faltantes por titular
-- ===========================================================================

create or replace function comercial.explotar_pedido(p_pedido_id uuid)
returns setof comercial.renglon_faltante
language sql
stable
set search_path = ''
as $$
  with base as (
    select n.insumo_id, n.necesario,
           comercial.disponible_para(n.insumo_id, comercial.origen_insumo(p.id, n.insumo_id), p.tercero_id) as disponible
      from comercial.pedidos p
      cross join lateral comercial.necesidad_pedido(p.id) n
     where p.id = p_pedido_id
  )
  select
    b.insumo_id,
    i.codigo_interno,
    i.nombre,
    i.unidad_medida,
    b.necesario,
    b.disponible,
    round(greatest(b.necesario - b.disponible, 0), 4),
    pv.proveedor_id,
    pv.razon_social,
    pv.estado_aprobacion::text,
    pv.ultima_compra
  from base b
  join gmp.insumos_catalogo i on i.id = b.insumo_id
  left join lateral (
    select * from comercial.v_proveedores_por_insumo v
     where v.insumo_id = b.insumo_id and v.activo
     order by v.ultima_compra desc nulls last
     limit 1
  ) pv on true
  where b.necesario > b.disponible
  order by i.nombre;
$$;

comment on function comercial.explotar_pedido(uuid) is
  'Qué le falta a un pedido, comparando cada insumo contra el stock del que sale (Nail Show o el del tercero), '
  'contando como disponible lo reservado para el mismo cliente.';

-- Faltantes sumados de los pedidos en curso que consumen de un titular.
-- Por beneficiario, lo comprometido es el mayor entre lo que piden sus
-- pedidos y lo que tiene reservado: una reserva no usada sigue apartando
-- stock, y una reserva usada por su pedido no se cuenta dos veces.
create or replace function comercial.faltantes_por_titular(p_tercero_id uuid)
returns table (
  insumo_id        uuid,
  codigo_interno   text,
  insumo           text,
  unidad           text,
  necesario        numeric,
  disponible       numeric,
  saldo_apertura   numeric,
  faltante         numeric,
  proveedor_id     uuid,
  proveedor        text,
  proveedor_estado text,
  pedidos          jsonb
)
language sql
stable
set search_path = ''
as $$
  with por_pedido as (
    select p.id, p.numero, p.cliente, p.fecha_entrega, p.tercero_id as para, n.insumo_id, n.necesario
      from comercial.pedidos p
      cross join lateral comercial.necesidad_pedido(p.id) n
     where p.estado in ('CONFIRMADO', 'EN_PRODUCCION')
       and comercial.origen_insumo(p.id, n.insumo_id) is not distinct from p_tercero_id
  ),
  demanda as (
    select insumo_id, para, sum(necesario) as necesario
      from por_pedido group by insumo_id, para
  ),
  reservas as (
    select insumo_id, para_tercero_id as para, sum(cantidad - consumido) as reservado
      from comercial.reservas_stock
     where not liberada and vence_en > now() and tercero_id is not distinct from p_tercero_id
     group by insumo_id, para_tercero_id
  ),
  -- Reserva que queda apartada por encima de lo que piden los pedidos de su
  -- beneficiario: eso no está disponible para nadie más.
  apartado as (
    select r.insumo_id, sum(greatest(r.reservado - coalesce(d.necesario, 0), 0)) as apartado
      from reservas r
      left join demanda d on d.insumo_id = r.insumo_id and d.para is not distinct from r.para
     group by r.insumo_id
  ),
  total as (
    select
      insumo_id,
      sum(necesario) as necesario,
      jsonb_agg(
        jsonb_build_object(
          'pedido_id', id, 'numero', numero, 'cliente', cliente,
          'fecha_entrega', fecha_entrega, 'necesario', necesario, 'tercero_id', para
        )
        order by fecha_entrega nulls last, numero
      ) as pedidos
    from por_pedido
    group by insumo_id
  ),
  calculo as (
    select t.insumo_id, t.necesario, t.pedidos,
           greatest(coalesce(s.saldo, 0) - coalesce(a.apartado, 0), 0) as disponible,
           coalesce(s.saldo_apertura, 0) as saldo_apertura
      from total t
      left join comercial.v_saldo_consumible s
        on s.insumo_id = t.insumo_id and s.tercero_id is not distinct from p_tercero_id
      left join apartado a on a.insumo_id = t.insumo_id
  )
  select
    c.insumo_id,
    i.codigo_interno,
    i.nombre,
    i.unidad_medida,
    c.necesario,
    c.disponible,
    c.saldo_apertura,
    round(c.necesario - c.disponible, 4),
    pv.proveedor_id,
    pv.razon_social,
    pv.estado_aprobacion::text,
    c.pedidos
  from calculo c
  join gmp.insumos_catalogo i on i.id = c.insumo_id
  left join lateral (
    select * from comercial.v_proveedores_por_insumo v
     where v.insumo_id = c.insumo_id and v.activo and p_tercero_id is null
     order by v.ultima_compra desc nulls last
     limit 1
  ) pv on true
  where c.necesario > c.disponible
  order by i.nombre;
$$;

comment on function comercial.faltantes_por_titular(uuid) is
  'Faltantes de todos los pedidos en curso que consumen del stock de un titular (nulo = Nail Show), sumando la '
  'necesidad antes de comparar y descontando lo reservado que ningún pedido de su beneficiario usa.';

grant execute on function comercial.faltantes_por_titular(uuid) to authenticated;

-- Mismo contrato que antes: lo que Nail Show tiene que comprar.
create or replace function comercial.faltantes_en_curso()
returns table (
  insumo_id        uuid,
  codigo_interno   text,
  insumo           text,
  unidad           text,
  necesario        numeric,
  disponible       numeric,
  saldo_apertura   numeric,
  faltante         numeric,
  proveedor_id     uuid,
  proveedor        text,
  proveedor_estado text,
  pedidos          jsonb
)
language sql
stable
set search_path = ''
as $$
  select * from comercial.faltantes_por_titular(null);
$$;

comment on function comercial.faltantes_en_curso() is
  'Faltantes del stock de Nail Show sumando todos los pedidos en curso que consumen de él (incluidos los insumos '
  'de pedidos tercerizados que salen de Nail Show). `pedidos` detalla cuánto aporta cada uno.';

-- ===========================================================================
-- 10. Validación del movimiento: titular del lote
-- ===========================================================================
--
-- Copia textual de la versión de 20260923130000, más tres controles marcados
-- NUEVO: la entrada por compra es de lotes propios, la entrada provista por
-- tercero es de lotes de tercero y viene de su recepción, y el consumo de
-- producción cae sobre un lote del titular que declara el consumo.

create or replace function comercial.fn_validar_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_articulo    comercial.articulos%rowtype;
  v_lote        gmp.lotes_insumo%rowtype;
  v_deposito    gmp.depositos%rowtype;
  v_impedimento text;
  v_saldo       numeric(16,4);
  v_anulado     comercial.movimientos_stock%rowtype;
  v_consumo     comercial.pedido_consumos%rowtype;
  v_ya_bajado   numeric(16,4);
begin
  -- ---- Tipos que todavía no tienen circuito -------------------------------
  if new.tipo = 'ENTRADA_PRODUCCION' then
    raise exception
      'El tipo % exige lote de producto terminado, que todavía no existe (D-04).', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo in ('SALIDA_VENTA', 'ENTRADA_DEVOLUCION') then
    raise exception
      'El tipo % exige clientes y pedidos, que son de la fase comercial y todavía no existen.', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo = 'SALIDA_RETIRO_MERCADO' then
    raise exception
      'El tipo SALIDA_RETIRO_MERCADO lo produce el módulo de retiro de mercado (PG.60.4), que todavía no existe. '
      'Para detener material hoy corresponde registrar un bloqueo en gmp.bloqueos_lote.'
      using errcode = 'feature_not_supported';
  end if;

  -- ---- Coherencia de las tres referencias ---------------------------------
  select * into v_articulo from comercial.articulos where id = new.articulo_id;
  if not found then
    raise exception 'El artículo % no existe.', new.articulo_id;
  end if;
  if not v_articulo.activo then
    raise exception 'El artículo % está desactivado y no admite movimientos.', v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id;
  if not found then
    raise exception 'El lote % no existe.', new.lote_insumo_id;
  end if;

  if v_lote.insumo_id <> v_articulo.insumo_id then
    raise exception
      'El lote % no pertenece al artículo % : es de otro insumo.',
      v_lote.numero_registro_interno, v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_deposito from gmp.depositos where id = new.deposito_id;
  if not found then
    raise exception 'El depósito % no existe.', new.deposito_id;
  end if;
  if not v_deposito.activo then
    raise exception 'El depósito % está desactivado.', v_deposito.numero
      using errcode = 'check_violation';
  end if;

  new.unidad := v_lote.unidad;
  new.ocurrido_en := now();

  -- ---- Titular del lote (NUEVO en 20260924150200) -------------------------
  if new.tipo = 'ENTRADA_COMPRA' and v_lote.tercero_id is not null then
    raise exception 'El lote % es material de un cliente tercerizado: no entra como compra de Nail Show.',
      v_lote.numero_registro_interno
      using errcode = 'check_violation';
  end if;
  if new.tipo = 'ENTRADA_PROVISTO_TERCERO' then
    if v_lote.tercero_id is null then
      raise exception 'El lote % es de Nail Show: no entra como material provisto por un tercero.',
        v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    if new.documento_tipo is distinct from 'RECEPCION' or new.documento_id is distinct from v_lote.recepcion_id then
      raise exception 'El material de un tercero entra a stock con su recepción (comercial.ingresar_stock_tercero).'
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- RN-51 y RN-52 ------------------------------------------------------
  if new.tipo = 'SALIDA_MUESTRA' then
    v_impedimento := gmp.impedimento_despacho(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede disponer de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Consumo de producción ----------------------------------------------
  if new.tipo = 'SALIDA_CONSUMO_PRODUCCION' then
    if new.documento_tipo is distinct from 'PEDIDO_CONSUMO' or new.documento_id is null then
      raise exception
        'El consumo de producción se registra terminando el pedido (comercial.terminar_pedido), no como movimiento suelto.'
        using errcode = 'check_violation';
    end if;

    select * into v_consumo from comercial.pedido_consumos where id = new.documento_id;
    if not found or v_consumo.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un consumo registrado de este insumo.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO en 20260924150200: se consume del stock que el consumo declara.
    if v_lote.tercero_id is distinct from v_consumo.tercero_id then
      raise exception 'El lote % no es del stock del que se declaró el consumo.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;

    select coalesce(-sum(cantidad), 0) into v_ya_bajado
      from comercial.movimientos_stock
     where documento_id = v_consumo.id
       and tipo = 'SALIDA_CONSUMO_PRODUCCION';

    if v_ya_bajado - new.cantidad > v_consumo.cantidad_real then
      raise exception
        'El consumo registrado es de % % y los movimientos ya suman %: no se puede bajar más.',
        v_consumo.cantidad_real, v_consumo.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;

    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Anulación (RN-54) --------------------------------------------------
  if new.anula_a_movimiento_id is not null then
    select * into v_anulado
      from comercial.movimientos_stock
     where id = new.anula_a_movimiento_id;

    if not found then
      raise exception 'El movimiento que se pretende anular no existe.';
    end if;
    if v_anulado.anula_a_movimiento_id is not null then
      raise exception
        'No se anula una anulación. Si la corrección estuvo mal, corresponde un movimiento de ajuste con su motivo.'
        using errcode = 'check_violation';
    end if;
    if (new.articulo_id, new.lote_insumo_id, new.deposito_id)
       is distinct from
       (v_anulado.articulo_id, v_anulado.lote_insumo_id, v_anulado.deposito_id) then
      raise exception
        'El movimiento inverso tiene que caer sobre la misma posición (artículo, lote y depósito) que el que anula.'
        using errcode = 'check_violation';
    end if;
    if new.cantidad <> -v_anulado.cantidad then
      raise exception
        'El movimiento inverso tiene que ser exactamente el opuesto del original (% esperado, % recibido).',
        -v_anulado.cantidad, new.cantidad
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- El saldo no queda negativo -----------------------------------------
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.articulo_id::text || '|' || new.lote_insumo_id::text || '|' || new.deposito_id::text,
      0
    )
  );

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_stock
   where articulo_id    = new.articulo_id
     and lote_insumo_id = new.lote_insumo_id
     and deposito_id    = new.deposito_id;

  if v_saldo + new.cantidad < 0 then
    raise exception
      'El movimiento dejaría el saldo en % (hay % y se quieren mover %) para el lote % en el depósito %. '
      'Si la existencia física no coincide con la registrada, corresponde un ajuste por diferencia de inventario.',
      v_saldo + new.cantidad, v_saldo, new.cantidad,
      v_lote.numero_registro_interno, v_deposito.numero
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 11. Ingreso del material del tercero a stock
-- ===========================================================================

create or replace function comercial.ingresar_stock_tercero(
  p_tercero_id              uuid,
  p_items                   jsonb,
  p_remito                  text    default null,
  p_observaciones           text    default null,
  p_contenedores_limpiados  boolean default true
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_recepcion uuid;
  v_numero    text;
  v_lote      gmp.lotes_insumo%rowtype;
begin
  v_recepcion := gmp.ingresar_insumo_tercero(p_tercero_id, p_items, p_remito, p_observaciones, p_contenedores_limpiados);
  select numero into v_numero from gmp.recepciones where id = v_recepcion;

  for v_lote in
    select * from gmp.lotes_insumo where recepcion_id = v_recepcion order by numero_registro_interno
  loop
    insert into comercial.movimientos_stock (
      articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id
    )
    values (
      comercial.articulo_de_insumo(v_lote.insumo_id), v_lote.id, v_lote.deposito_actual_id,
      'ENTRADA_PROVISTO_TERCERO', v_lote.cantidad_unidades,
      format('Ingreso de material del cliente, recepción %s', v_numero),
      'RECEPCION', v_recepcion
    );
  end loop;

  update gmp.recepciones set cargado_a_stock = true where id = v_recepcion;
  return v_recepcion;
end;
$$;

comment on function comercial.ingresar_stock_tercero(uuid, jsonb, text, text, boolean) is
  'Ingreso del material de un tercero en una transacción: recepción, lotes en CUARENTENA con rótulo y entrada '
  'a stock (ENTRADA_PROVISTO_TERCERO). Queda para control de calidad como cualquier lote.';

grant execute on function comercial.ingresar_stock_tercero(uuid, jsonb, text, text, boolean) to authenticated;

-- ===========================================================================
-- 12. Terminar un pedido, consumiendo del titular que corresponde
-- ===========================================================================
--
-- Igual que en 20260923130000, más:
--   - Cada insumo se consume del titular elegido al pasar a producción, o del
--     sugerido si no se eligió. p_consumos admite "origen": "NAILSHOW" |
--     "TERCERO" para corregirlo al terminar («al final usamos alcohol nuestro»).
--   - Lo consumido descuenta de las reservas del beneficiario.

create or replace function comercial.terminar_pedido(p_pedido_id uuid, p_consumos jsonb default '[]'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido    comercial.pedidos%rowtype;
  r           record;
  v_consumo   uuid;
  v_articulo  uuid;
  v_restante  numeric(16,4);
  v_toma      numeric(16,4);
  v_titular   uuid;
  v_propio    uuid;
  v_nombre_titular text;
  pos         record;
  res         record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Terminar un pedido es de Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Solo se termina un pedido enviado o en producción (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  for r in
    with teorico as (
      select n.insumo_id, n.necesario from comercial.necesidad_pedido(p_pedido_id) n
    ),
    informado as (
      select (e ->> 'insumo_id')::uuid        as insumo_id,
             (e ->> 'cantidad')::numeric      as cantidad,
             nullif(btrim(e ->> 'motivo'), '') as motivo,
             nullif(e ->> 'origen', '')        as origen
        from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    )
    select
      coalesce(t.insumo_id, i.insumo_id)       as insumo_id,
      coalesce(t.necesario, 0)                 as teorica,
      coalesce(i.cantidad, t.necesario)        as usada,
      i.motivo,
      i.origen,
      c.nombre,
      c.unidad_medida,
      c.tercero_id                             as propio
    from teorico t
    full join informado i on i.insumo_id = t.insumo_id
    join gmp.insumos_catalogo c on c.id = coalesce(t.insumo_id, i.insumo_id)
    order by c.nombre
  loop
    if r.usada is null or r.usada < 0 then
      raise exception 'La cantidad usada de % no es válida.', r.nombre using errcode = 'check_violation';
    end if;
    if r.usada <> r.teorica and r.motivo is null then
      raise exception 'Usaste % % de % y la receta dice %: escribí el motivo de la diferencia.',
        r.usada, coalesce(r.unidad_medida, ''), r.nombre, r.teorica
        using errcode = 'check_violation';
    end if;
    if r.unidad_medida is null then
      raise exception 'El insumo % no tiene unidad de medida confirmada en el catálogo.', r.nombre
        using errcode = 'check_violation';
    end if;

    v_titular := case r.origen
                   when 'NAILSHOW' then null
                   when 'TERCERO'  then v_pedido.tercero_id
                   else comercial.origen_insumo(p_pedido_id, r.insumo_id)
                 end;
    if v_titular is not null and v_titular is distinct from v_pedido.tercero_id then
      raise exception 'No se consume material de un cliente tercerizado para otro (%).', r.nombre
        using errcode = 'check_violation';
    end if;
    if r.propio is not null and v_titular is distinct from r.propio then
      raise exception '«%» es propio del cliente tercerizado: sale de su stock.', r.nombre
        using errcode = 'check_violation';
    end if;
    v_nombre_titular := coalesce((select nombre from gmp.terceros where id = v_titular), 'Nail Show');

    insert into comercial.pedido_consumos
      (pedido_id, insumo_id, unidad, cantidad_teorica, cantidad_real, motivo_diferencia, tercero_id)
    values
      (p_pedido_id, r.insumo_id, r.unidad_medida, r.teorica, r.usada, r.motivo, v_titular)
    returning id into v_consumo;

    continue when r.usada = 0;

    v_articulo := comercial.articulo_de_insumo(r.insumo_id);
    v_restante := r.usada;

    for pos in
      select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
        from comercial.v_saldos_stock s
        join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo
         and s.saldo > 0
         and l.tercero_id is not distinct from v_titular
         and gmp.lote_consumible(s.lote_insumo_id)
       order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
    loop
      if pos.unidad is distinct from r.unidad_medida then
        raise exception
          'El lote de % está en % y la receta en %: no se puede descontar sin convertir.',
          r.nombre, pos.unidad, r.unidad_medida
          using errcode = 'check_violation';
      end if;

      v_toma := least(v_restante, pos.saldo);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
         format('Pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO_CONSUMO', v_consumo);
      v_restante := v_restante - v_toma;
      exit when v_restante <= 0;
    end loop;

    if v_restante > 0 then
      raise exception
        'No alcanza el stock de % de % (%): faltan % %. No se descontó nada del pedido. '
        'Si el material está en planta, falta registrarlo: recepción o ajuste de inventario.',
        v_nombre_titular, r.nombre, (select codigo_interno from gmp.insumos_catalogo where id = r.insumo_id),
        v_restante, r.unidad_medida
        using errcode = 'check_violation';
    end if;

    -- Lo usado descuenta de las reservas del mismo titular para este cliente,
    -- de la que vence primero a la última.
    v_restante := r.usada;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_stock
       where insumo_id = r.insumo_id
         and tercero_id is not distinct from v_titular
         and para_tercero_id is not distinct from v_pedido.tercero_id
         and (pedido_id is null or pedido_id = p_pedido_id)
         and not liberada and vence_en > now()
       order by (pedido_id is null), vence_en, creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_stock set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;
  end loop;

  -- Una reserva atada a este pedido no sobrevive al pedido.
  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;
end;
$$;

comment on function comercial.terminar_pedido(uuid, jsonb) is
  'Termina un pedido: registra el consumo real de cada insumo con el stock del que salió (Nail Show o el del '
  'tercero), baja lote por lote —vence primero, después el más antiguo—, descuenta de las reservas del cliente y '
  'pasa el pedido a CUMPLIDO. Todo o nada.';

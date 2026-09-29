-- ---------------------------------------------------------------------------
-- Propósito : Circuito de Calle 5 para los pedidos de Nail Show: reservar
--             stock para un cliente, despachar un pedido entero (completo o
--             con faltantes), saber cuánto falta producir para cubrir los
--             pedidos abiertos, y elegir al terminar la producción si va a
--             Calle 5 o queda en fábrica como stock de seguridad.
-- Reglas    : §4.12 (stock como libro de movimientos), RN-54 (un movimiento no
--             se edita), RN-50 (auditoría). Ítems 19 a 22 de la cola
--             (2026-09-29), que absorben los ítems 14 y 15. Supuestos de D-35.
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- EL SISTEMA NO REPARTE.
-- Con 100 unidades y 1000 pedidas entre seis clientes, quién recibe qué lo
-- deciden Silveira (ENCARGADA_STOCK) y Mati. La base solo impide lo que no se
-- puede: sacar lo que no hay, sacar lo reservado para otro, o despachar más de
-- lo pedido. Las herramientas para decidir son la reserva y el despacho.
--
-- CÓMO SE CUENTA, POR PRODUCTO.
--   pendiente       lo pedido menos lo ya despachado, en pedidos abiertos de
--                   clientes de Nail Show.
--   reservado       reservas vigentes: cantidad − consumido, no liberadas.
--   libre en C5     saldo de Calle 5 − reservado.
--   comprometido    lo producido para un pedido que sigue en fábrica.
--   en producción   pedidos para stock con destino Calle 5, más lo pendiente
--                   de pedidos de clientes que Producción ya tiene en curso.
--   falta producir  pendiente − saldo C5 − comprometido − en producción.
-- Se suma la demanda de todos los pedidos antes de comparar con el stock, como
-- con los insumos: sumar faltantes por pedido da un número falso.
--
-- ENTRADA DE PRODUCCIÓN.
-- Antes, lo producido entraba a PTF por la cantidad pedida y el trigger no
-- dejaba registrar más. Ahora «Terminado» dice cuánto se produjo y adónde va
-- (ítem 15: si sobra, adónde va el sobrante; si falta, queda pendiente de
-- despacho y vuelve a aparecer en «falta producir»). Para que nadie cargue
-- producción por fuera, la entrada solo se acepta dentro de «Terminado» de ese
-- mismo pedido (marca de transacción que pone la función).

-- ===========================================================================
-- 1. Destino sugerido del pedido
-- ===========================================================================

alter table comercial.pedidos
  add column destino_deposito_id uuid references gmp.depositos(id);

comment on column comercial.pedidos.destino_deposito_id is
  'Adónde se sugiere mandar lo producido (p. ej. Calle 5 para lo que falta ahí). Nulo = fábrica (PTF). '
  'El destino real lo elige Producción en «Terminado» y queda en el libro de movimientos.';

-- ===========================================================================
-- 2. Despachos: la cabecera de cada salida de un pedido
-- ===========================================================================

create table comercial.despachos_pt (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references comercial.pedidos(id),
  deposito_id    uuid not null references gmp.depositos(id),
  -- Lo marca quien despacha: salió todo lo pendiente o quedaron faltantes.
  con_faltantes  boolean not null,
  observacion    text,
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now()
);

comment on table comercial.despachos_pt is
  'Cada salida de un pedido de un depósito de producto terminado, completa o con faltantes. Los renglones son los '
  'movimientos SALIDA_VENTA que apuntan a él. Append-only.';

alter table comercial.movimientos_pt
  add column despacho_id uuid references comercial.despachos_pt(id);

create index movimientos_pt_documento_idx
  on comercial.movimientos_pt (documento_id, producto_id) where documento_tipo = 'PEDIDO';

alter table comercial.despachos_pt enable row level security;
alter table comercial.despachos_pt force  row level security;
grant select, insert on comercial.despachos_pt to authenticated;

create policy despachos_pt_select_authenticated on comercial.despachos_pt
  for select to authenticated using (core.rol() is not null);
comment on policy despachos_pt_select_authenticated on comercial.despachos_pt is
  '§3.3: consulta habilitada para todos los roles.';
create policy despachos_pt_insert_stock on comercial.despachos_pt
  for insert to authenticated
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION'));
comment on policy despachos_pt_insert_stock on comercial.despachos_pt is
  'Despacha quien gestiona el depósito (misma lista que movimientos_pt_insert_stock).';

select core.adjuntar_auditoria('comercial.despachos_pt');

-- ===========================================================================
-- 3. Reservas de producto terminado
-- ===========================================================================

create table comercial.reservas_pt (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid not null references gmp.productos(id),
  deposito_id      uuid not null references gmp.depositos(id),
  -- Para un cliente (cualquiera de sus pedidos) o para un pedido puntual.
  cliente_id       uuid references comercial.clientes(id),
  pedido_id        uuid references comercial.pedidos(id),
  cantidad         numeric(14,4) not null check (cantidad > 0),
  consumido        numeric(14,4) not null default 0 check (consumido >= 0),
  observacion      text,
  liberada         boolean not null default false,
  liberada_en      timestamptz,
  liberada_por     uuid references core.usuarios(id),
  motivo_liberacion text,
  creado_por       uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en        timestamptz not null default now(),
  constraint reservas_pt_destinatario check (num_nonnulls(cliente_id, pedido_id) >= 1),
  constraint reservas_pt_consumido_tope check (consumido <= cantidad),
  constraint reservas_pt_liberacion check (
    (not liberada and liberada_en is null and liberada_por is null)
    or (liberada and liberada_en is not null and liberada_por is not null
        and length(btrim(coalesce(motivo_liberacion, ''))) > 0)
  )
);

comment on table comercial.reservas_pt is
  'Stock de producto terminado apartado para un cliente o un pedido (ítem 22). Para los demás, lo libre es saldo − '
  'reservado. Se consume al despachar y se libera con motivo; no se borra.';

create index reservas_pt_vigentes_idx
  on comercial.reservas_pt (deposito_id, producto_id) where not liberada;

create or replace function comercial.fn_reserva_pt_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.pedido_id is not null then
      select * into v_pedido from comercial.pedidos where id = new.pedido_id;
      if v_pedido.tercero_id is not null or v_pedido.para_stock or v_pedido.eliminado_en is not null
         or v_pedido.entregado_en is not null or v_pedido.estado not in ('BORRADOR', 'CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO') then
        raise exception 'Se reserva para un pedido abierto de un cliente de Nail Show (el % no lo es).', v_pedido.numero
          using errcode = 'check_violation';
      end if;
      if new.cliente_id is null then
        new.cliente_id := v_pedido.cliente_id;
      elsif new.cliente_id is distinct from v_pedido.cliente_id then
        raise exception 'El pedido % es de otro cliente.', v_pedido.numero using errcode = 'check_violation';
      end if;
    end if;
    if new.consumido <> 0 or new.liberada then
      raise exception 'Una reserva nace vigente y sin consumir.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE: solo avanza lo consumido o se libera, una vez.
  if old.liberada then
    raise exception 'La reserva ya está liberada.' using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - array['consumido','liberada','liberada_en','liberada_por','motivo_liberacion'])
     is distinct from (to_jsonb(old) - array['consumido','liberada','liberada_en','liberada_por','motivo_liberacion']) then
    raise exception 'Una reserva no se edita: se libera y se hace otra.' using errcode = 'restrict_violation';
  end if;
  if new.consumido < old.consumido then
    raise exception 'Lo consumido de una reserva no vuelve atrás.' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_reserva_pt_validar
  before insert or update on comercial.reservas_pt
  for each row execute function comercial.fn_reserva_pt_validar();

-- Lo reservado no puede superar lo que hay, y lo que sale no puede tocar lo
-- reservado para otro. Se mira al final de la transacción: un despacho
-- consume su reserva y saca la mercadería en el mismo paso.
create or replace function comercial.reservado_pt(p_deposito_id uuid, p_producto_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(cantidad - consumido), 0)
    from comercial.reservas_pt
   where deposito_id = p_deposito_id and producto_id = p_producto_id and not liberada;
$$;

grant execute on function comercial.reservado_pt(uuid, uuid) to authenticated;

create or replace function comercial.fn_reservas_pt_alcanzan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo     numeric;
  v_reservado numeric;
begin
  -- Solo las salidas que dependen de una decisión: venta y transferencia. Un
  -- ajuste o un descarte registran lo que pasó y no se bloquean; si dejan la
  -- reserva sin respaldo, la pantalla lo muestra.
  if tg_table_name = 'movimientos_pt'
     and not (new.cantidad < 0 and new.tipo in ('SALIDA_VENTA', 'TRANSFERENCIA_ENTRE_DEPOSITOS')) then
    return null;
  end if;
  if tg_table_name = 'reservas_pt' and new.liberada then
    return null;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt where deposito_id = new.deposito_id and producto_id = new.producto_id;
  v_reservado := comercial.reservado_pt(new.deposito_id, new.producto_id);

  if v_reservado > v_saldo then
    raise exception
      'Hay % unidades y % están reservadas: %.', v_saldo, v_reservado,
      case when tg_table_name = 'reservas_pt' then 'no se puede reservar más de lo que hay libre'
           else 'lo que sale no puede tocar lo reservado para otro cliente' end
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger trg_reservas_pt_alcanzan
  after insert or update on comercial.reservas_pt
  deferrable initially deferred
  for each row execute function comercial.fn_reservas_pt_alcanzan();

create constraint trigger trg_movimiento_pt_respeta_reservas
  after insert on comercial.movimientos_pt
  deferrable initially deferred
  for each row execute function comercial.fn_reservas_pt_alcanzan();

create or replace function comercial.liberar_reserva_pt(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = btrim(p_motivo)
   where id = p_id;
  if not found then
    raise exception 'La reserva no existe o tu rol no puede liberarla.';
  end if;
end;
$$;

grant execute on function comercial.liberar_reserva_pt(uuid, text) to authenticated;

alter table comercial.reservas_pt enable row level security;
alter table comercial.reservas_pt force  row level security;
grant select, insert, update on comercial.reservas_pt to authenticated;

create policy reservas_pt_select_authenticated on comercial.reservas_pt
  for select to authenticated using (core.rol() is not null);
comment on policy reservas_pt_select_authenticated on comercial.reservas_pt is
  '§3.3: consulta habilitada para todos los roles.';
create policy reservas_pt_insert_stock on comercial.reservas_pt
  for insert to authenticated
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'DIRECCION_TECNICA')
              and creado_por = core.usuario_actual());
comment on policy reservas_pt_insert_stock on comercial.reservas_pt is
  'Reservan Silveira (ENCARGADA_STOCK) y Mati (ítem 22), y Gerencia. DT solo por «Terminado», que reserva para el '
  'pedido lo producido para él que manda a Calle 5.';
create policy reservas_pt_update_stock on comercial.reservas_pt
  for update to authenticated
  using (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION'))
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION'));
comment on policy reservas_pt_update_stock on comercial.reservas_pt is
  'Consumir al despachar y liberar (trigger: nada más cambia).';

select core.adjuntar_auditoria('comercial.reservas_pt');

-- ===========================================================================
-- 4. Movimientos que apuntan a un pedido
-- ===========================================================================

create or replace function comercial.fn_movimiento_pt_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido      comercial.pedidos%rowtype;
  v_pedido_cant numeric;
  v_ya          numeric;
begin
  if new.documento_tipo is distinct from 'PEDIDO' then
    if new.tipo = 'ENTRADA_PRODUCCION' then
      raise exception 'La entrada de producción viene de un pedido terminado.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select * into v_pedido from comercial.pedidos where id = new.documento_id;
  if not found then
    raise exception 'El movimiento apunta a un pedido que no existe.';
  end if;

  select coalesce(sum(cantidad), 0) into v_pedido_cant
    from comercial.pedido_renglones
   where pedido_id = v_pedido.id and producto_id = new.producto_id and not anulado;
  if v_pedido_cant = 0 then
    raise exception 'El pedido % no lleva ese producto.', v_pedido.numero using errcode = 'check_violation';
  end if;

  -- 20260929110000: se registra lo producido, más o menos que lo pedido, pero
  -- solo desde «Terminado» de este pedido.
  if new.tipo = 'ENTRADA_PRODUCCION' then
    if coalesce(current_setting('comercial.terminando_pedido', true), '') <> v_pedido.id::text then
      raise exception 'La entrada de producción la registra «Terminado» del pedido %.', v_pedido.numero
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select coalesce(sum(abs(cantidad)), 0) into v_ya
    from comercial.movimientos_pt
   where documento_tipo = 'PEDIDO' and documento_id = v_pedido.id
     and producto_id = new.producto_id and tipo = new.tipo;

  if v_ya + abs(new.cantidad) > v_pedido_cant then
    raise exception 'El pedido % tiene % unidades de ese producto: no se registran más.', v_pedido.numero, v_pedido_cant
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 5. Qué falta despachar, por pedido y producto
-- ===========================================================================

create view comercial.v_pendientes_despacho
with (security_invoker = true) as
with ped as (
  select r.pedido_id, r.producto_id, sum(r.cantidad) as cantidad
    from comercial.pedido_renglones r
   where not r.anulado
   group by r.pedido_id, r.producto_id
),
mov as (
  select m.documento_id as pedido_id, m.producto_id,
         coalesce(sum(-m.cantidad) filter (where m.tipo = 'SALIDA_VENTA'), 0)                        as despachado,
         coalesce(sum(m.cantidad)  filter (where m.tipo = 'ENTRADA_PRODUCCION' and d.numero = 'PTF'), 0) as producido_ptf,
         coalesce(sum(-m.cantidad) filter (where m.tipo = 'SALIDA_VENTA' and d.numero = 'PTF'), 0)      as salido_ptf
    from comercial.movimientos_pt m
    join gmp.depositos d on d.id = m.deposito_id
   where m.documento_tipo = 'PEDIDO'
   group by m.documento_id, m.producto_id
),
res as (
  select pedido_id, producto_id, sum(cantidad - consumido) as reservado
    from comercial.reservas_pt
   where not liberada and pedido_id is not null
   group by pedido_id, producto_id
)
select
  p.id                                                     as pedido_id,
  p.numero,
  p.cliente,
  p.cliente_id,
  p.fecha_entrega,
  p.estado,
  ped.producto_id,
  pr.codigo_interno,
  pr.nombre                                                as producto,
  ped.cantidad,
  coalesce(mv.despachado, 0)                               as despachado,
  greatest(ped.cantidad - coalesce(mv.despachado, 0), 0)   as pendiente,
  -- Producido para este pedido que sigue en fábrica.
  greatest(least(coalesce(mv.producido_ptf, 0) - coalesce(mv.salido_ptf, 0),
                 ped.cantidad - coalesce(mv.despachado, 0)), 0) as en_fabrica_para_pedido,
  coalesce(rs.reservado, 0)                                as reservado_para_pedido
from comercial.pedidos p
join ped            on ped.pedido_id = p.id
join gmp.productos pr on pr.id = ped.producto_id
left join mov mv    on mv.pedido_id = p.id and mv.producto_id = ped.producto_id
left join res rs    on rs.pedido_id = p.id and rs.producto_id = ped.producto_id
where p.tercero_id is null
  and not p.para_stock
  and p.eliminado_en is null
  and p.entregado_en is null
  and p.estado in ('CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO');

comment on view comercial.v_pendientes_despacho is
  'Por pedido abierto de un cliente de Nail Show y producto: lo pedido, lo despachado, lo pendiente, lo producido '
  'para él que sigue en fábrica y lo reservado para él.';

grant select on comercial.v_pendientes_despacho to authenticated;

-- ===========================================================================
-- 6. Calle 5 por producto: qué hay, qué está reservado, qué falta producir
-- ===========================================================================

create view comercial.v_calle5
with (security_invoker = true) as
with saldo as (
  select m.producto_id,
         coalesce(sum(m.cantidad) filter (where d.numero = 'C5'), 0)  as en_calle5,
         coalesce(sum(m.cantidad) filter (where d.numero = 'PTF'), 0) as en_fabrica
    from comercial.movimientos_pt m
    join gmp.depositos d on d.id = m.deposito_id
   group by m.producto_id
),
reservado as (
  select r.producto_id, sum(r.cantidad - r.consumido) as reservado
    from comercial.reservas_pt r
    join gmp.depositos d on d.id = r.deposito_id and d.numero = 'C5'
   where not r.liberada
   group by r.producto_id
),
demanda as (
  select producto_id,
         sum(pendiente)                                           as pendiente,
         sum(en_fabrica_para_pedido)                              as comprometido_fabrica,
         sum(pendiente) filter (where estado = 'EN_PRODUCCION')   as en_produccion_clientes,
         count(distinct pedido_id)                                as pedidos
    from comercial.v_pendientes_despacho
   where pendiente > 0
   group by producto_id
),
para_c5 as (
  select r.producto_id, sum(r.cantidad) as en_produccion
    from comercial.pedidos p
    join comercial.pedido_renglones r on r.pedido_id = p.id and not r.anulado
    join gmp.depositos d on d.id = p.destino_deposito_id and d.numero = 'C5'
   where p.para_stock and p.eliminado_en is null and p.estado in ('CONFIRMADO', 'EN_PRODUCCION')
   group by r.producto_id
),
productos as (
  select producto_id from saldo where en_calle5 <> 0
  union select producto_id from reservado
  union select producto_id from demanda
  union select producto_id from para_c5
)
select
  x.producto_id,
  pr.codigo_interno,
  pr.nombre                                                   as producto,
  coalesce(s.en_calle5, 0)                                    as en_calle5,
  coalesce(rv.reservado, 0)                                   as reservado,
  coalesce(s.en_calle5, 0) - coalesce(rv.reservado, 0)        as libre,
  coalesce(s.en_fabrica, 0)                                   as en_fabrica,
  coalesce(dm.pendiente, 0)                                   as pendiente,
  coalesce(dm.pedidos, 0)                                     as pedidos,
  coalesce(dm.comprometido_fabrica, 0)                        as comprometido_fabrica,
  coalesce(pc.en_produccion, 0) + coalesce(dm.en_produccion_clientes, 0) as en_produccion,
  greatest(coalesce(dm.pendiente, 0) - coalesce(s.en_calle5, 0) - coalesce(dm.comprometido_fabrica, 0)
           - coalesce(pc.en_produccion, 0) - coalesce(dm.en_produccion_clientes, 0), 0) as falta_producir
from productos x
join gmp.productos pr   on pr.id = x.producto_id
left join saldo s       on s.producto_id = x.producto_id
left join reservado rv  on rv.producto_id = x.producto_id
left join demanda dm    on dm.producto_id = x.producto_id
left join para_c5 pc    on pc.producto_id = x.producto_id;

comment on view comercial.v_calle5 is
  'Por producto: stock de Calle 5, reservado y libre, demanda pendiente de los pedidos abiertos de Nail Show y lo que '
  'falta producir (sumando todos los pedidos antes de comparar). No asigna: quién recibe qué lo decide una persona.';

grant select on comercial.v_calle5 to authenticated;

-- ===========================================================================
-- 7. Despachar un pedido
-- ===========================================================================

create or replace function comercial.despachar_pedido(
  p_pedido_id     uuid,
  p_renglones     jsonb,
  p_deposito      text default 'C5',
  p_con_faltantes boolean default false,
  p_observacion   text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pedido    comercial.pedidos%rowtype;
  v_dep       uuid;
  v_despacho  uuid;
  r           record;
  res         record;
  v_pend      numeric;
  v_restante  numeric;
  v_toma      numeric;
  v_n         integer := 0;
  v_queda     numeric;
begin
  if not core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION') then
    raise exception 'Tu rol no despacha pedidos.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.eliminado_en is not null then
    raise exception 'El pedido % está borrado.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.para_stock then
    raise exception 'Un pedido para stock no se despacha: su producción queda en el depósito.' using errcode = 'check_violation';
  end if;
  if v_pedido.tercero_id is not null then
    raise exception 'Los pedidos tercerizados no pasan por el depósito de Nail Show.' using errcode = 'check_violation';
  end if;
  if v_pedido.entregado_en is not null then
    raise exception 'El pedido % ya se entregó completo.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO') then
    raise exception 'Se despacha un pedido enviado (este está %).', v_pedido.estado using errcode = 'check_violation';
  end if;

  select id into v_dep from gmp.depositos where numero = p_deposito and numero in ('C5', 'PTF') and activo;
  if v_dep is null then
    raise exception 'Se despacha desde Calle 5 (C5) o desde la fábrica (PTF).' using errcode = 'check_violation';
  end if;

  insert into comercial.despachos_pt (pedido_id, deposito_id, con_faltantes, observacion)
  values (p_pedido_id, v_dep, coalesce(p_con_faltantes, false), nullif(btrim(p_observacion), ''))
  returning id into v_despacho;

  for r in
    select (e ->> 'producto_id')::uuid as producto_id, sum((e ->> 'cantidad')::numeric) as cantidad
      from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) e
     group by 1
  loop
    if r.cantidad is null or r.cantidad < 0 then
      raise exception 'Una cantidad a despachar no es válida.' using errcode = 'check_violation';
    end if;
    continue when r.cantidad = 0;

    select pendiente into v_pend from comercial.v_pendientes_despacho
     where pedido_id = p_pedido_id and producto_id = r.producto_id;
    if v_pend is null then
      raise exception 'El pedido % no lleva ese producto.', v_pedido.numero using errcode = 'check_violation';
    end if;
    if r.cantidad > v_pend then
      raise exception 'De % quedan % por despachar en el pedido %: no salen %.',
        (select nombre from gmp.productos where id = r.producto_id), v_pend, v_pedido.numero, r.cantidad
        using errcode = 'check_violation';
    end if;

    -- Primero lo reservado para este pedido, después lo del cliente.
    v_restante := r.cantidad;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_pt
       where deposito_id = v_dep and producto_id = r.producto_id and not liberada
         and (pedido_id = p_pedido_id
              or (pedido_id is null and cliente_id is not null and cliente_id = v_pedido.cliente_id))
       order by (pedido_id is null), creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_pt set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;

    insert into comercial.movimientos_pt
      (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id)
    values
      (r.producto_id, v_dep, 'SALIDA_VENTA', -r.cantidad,
       format('Despacho del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id, v_despacho);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'Elegí qué sale y cuánto.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(pendiente), 0) into v_queda
    from comercial.v_pendientes_despacho where pedido_id = p_pedido_id;

  if v_queda > 0 and not coalesce(p_con_faltantes, false) then
    raise exception 'Quedan % unidades sin despachar: marcá el despacho «con faltantes» o completá las cantidades.', v_queda
      using errcode = 'check_violation';
  end if;

  if v_queda = 0 then
    update comercial.despachos_pt set con_faltantes = false where id = v_despacho and con_faltantes;
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Pedido %s entregado completo.', v_pedido.numero)
     where pedido_id = p_pedido_id and not liberada;
    update comercial.pedidos
       set entregado_en = now(), entregado_por = core.usuario_actual(), estado = 'CUMPLIDO'
     where id = p_pedido_id;
  end if;

  return v_despacho;
end;
$$;

comment on function comercial.despachar_pedido(uuid, jsonb, text, boolean, text) is
  'Despacha un pedido de Nail Show entero desde Calle 5 o fábrica: p_renglones [{producto_id, cantidad}]. Completo '
  '(sin faltantes) exige que no quede nada pendiente; con faltantes, lo que no salió queda pendiente en el pedido. '
  'Consume primero las reservas del pedido y después las del cliente. Cuando no queda nada, el pedido se entrega.';

grant execute on function comercial.despachar_pedido(uuid, jsonb, text, boolean, text) to authenticated;

-- «Entregar» (20260925100000) sigue: es despachar todo lo pendiente desde la
-- fábrica, sin faltantes.
create or replace function comercial.entregar_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_renglones jsonb;
  r           record;
  v_saldo     numeric;
begin
  for r in
    select v.producto_id, v.producto, v.pendiente
      from comercial.v_pendientes_despacho v
     where v.pedido_id = p_pedido_id and v.pendiente > 0
  loop
    select coalesce(sum(cantidad), 0) into v_saldo
      from comercial.movimientos_pt m join gmp.depositos d on d.id = m.deposito_id
     where d.numero = 'PTF' and m.producto_id = r.producto_id;
    if v_saldo < r.pendiente then
      raise exception 'No alcanza el stock en fábrica de %: hay % y el pedido lleva %.', r.producto, v_saldo, r.pendiente
        using errcode = 'check_violation';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', pendiente)), '[]'::jsonb)
    into v_renglones
    from comercial.v_pendientes_despacho where pedido_id = p_pedido_id and pendiente > 0;

  perform comercial.despachar_pedido(p_pedido_id, v_renglones, 'PTF', false, null);
end;
$$;

-- ===========================================================================
-- 8. Transferir producto terminado entre fábrica y Calle 5
-- ===========================================================================

create or replace function comercial.transferir_pt(
  p_producto_id uuid,
  p_cantidad    numeric,
  p_origen      text,
  p_destino     text,
  p_motivo      text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_origen  uuid;
  v_destino uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a transferir tiene que ser positiva.' using errcode = 'check_violation';
  end if;
  select id into v_origen  from gmp.depositos where numero = p_origen  and numero in ('C5', 'PTF') and activo;
  select id into v_destino from gmp.depositos where numero = p_destino and numero in ('C5', 'PTF') and activo;
  if v_origen is null or v_destino is null or v_origen = v_destino then
    raise exception 'Se transfiere entre la fábrica (PTF) y Calle 5 (C5).' using errcode = 'check_violation';
  end if;

  insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
  values (p_producto_id, v_origen,  'TRANSFERENCIA_ENTRE_DEPOSITOS', -p_cantidad,
          coalesce(nullif(btrim(p_motivo), ''), format('Envío a %s', p_destino)), 'TRANSFERENCIA_PT'),
         (p_producto_id, v_destino, 'TRANSFERENCIA_ENTRE_DEPOSITOS',  p_cantidad,
          coalesce(nullif(btrim(p_motivo), ''), format('Llegada desde %s', p_origen)), 'TRANSFERENCIA_PT');
end;
$$;

comment on function comercial.transferir_pt(uuid, numeric, text, text, text) is
  'Mueve producto terminado entre fábrica y Calle 5 (p. ej. stock de seguridad a Calle 5). SECURITY INVOKER: rige '
  'la política de movimientos_pt. No toca lo reservado en el origen.';

grant execute on function comercial.transferir_pt(uuid, numeric, text, text, text) to authenticated;

-- ===========================================================================
-- 9. «Terminado» con cantidad producida y destino
-- ===========================================================================
--
-- Copia de la versión vigente (20260925100000) con el bloque final NUEVO:
-- p_produccion [{producto_id, cantidad, deposito: 'PTF' | 'C5'}] dice cuánto
-- se produjo y adónde va (se puede repartir). Sin p_produccion, como antes: lo
-- pedido, al destino sugerido del pedido o a la fábrica. Lo producido para un
-- cliente que va a Calle 5 queda reservado para su pedido.

drop function comercial.terminar_pedido(uuid, jsonb);

CREATE FUNCTION comercial.terminar_pedido(
  p_pedido_id  uuid,
  p_consumos   jsonb DEFAULT '[]'::jsonb,
  p_produccion jsonb DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  e           record;
  v_dep       uuid;
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
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
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

  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;

  -- NUEVO en 20260929110000: cuánto se produjo y adónde va.
  if v_pedido.tercero_id is null then
    perform set_config('comercial.terminando_pedido', p_pedido_id::text, true);

    if p_produccion is null or jsonb_array_length(p_produccion) = 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      select rr.producto_id,
             coalesce(v_pedido.destino_deposito_id, (select id from gmp.depositos where numero = 'PTF')),
             'ENTRADA_PRODUCCION',
             sum(rr.cantidad),
             format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente),
             'PEDIDO',
             p_pedido_id
        from comercial.pedido_renglones rr
       where rr.pedido_id = p_pedido_id and not rr.anulado
       group by rr.producto_id;
    else
      for e in
        select (x ->> 'producto_id')::uuid                    as producto_id,
               (x ->> 'cantidad')::numeric                    as cantidad,
               coalesce(nullif(x ->> 'deposito', ''), 'PTF')  as deposito
          from jsonb_array_elements(p_produccion) x
      loop
        if e.cantidad is null or e.cantidad < 0 then
          raise exception 'La cantidad producida no es válida.' using errcode = 'check_violation';
        end if;
        continue when e.cantidad = 0;
        select id into v_dep from gmp.depositos where numero = e.deposito and numero in ('PTF', 'C5') and activo;
        if v_dep is null then
          raise exception 'Lo producido va a la fábrica (PTF) o a Calle 5 (C5).' using errcode = 'check_violation';
        end if;
        insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
        values (e.producto_id, v_dep, 'ENTRADA_PRODUCCION', e.cantidad,
                format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id);
      end loop;
    end if;

    -- Lo producido para un cliente que va a Calle 5 queda reservado para su
    -- pedido, hasta lo pedido: si no, se lo puede llevar otro.
    if not v_pedido.para_stock then
      insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
      select m.producto_id, m.deposito_id, p_pedido_id,
             least(sum(m.cantidad), (select sum(rr.cantidad) from comercial.pedido_renglones rr
                                      where rr.pedido_id = p_pedido_id and rr.producto_id = m.producto_id and not rr.anulado)),
             format('Producido para el pedido %s', v_pedido.numero)
        from comercial.movimientos_pt m
        join gmp.depositos d on d.id = m.deposito_id and d.numero = 'C5'
       where m.documento_tipo = 'PEDIDO' and m.documento_id = p_pedido_id and m.tipo = 'ENTRADA_PRODUCCION'
       group by m.producto_id, m.deposito_id;
    end if;

    perform set_config('comercial.terminando_pedido', '', true);
  end if;
end;
$function$;

grant execute on function comercial.terminar_pedido(uuid, jsonb, jsonb) to authenticated;

-- ===========================================================================
-- 10. Stock de seguridad: lo comprometido es lo producido para un cliente que
--     sigue en fábrica (antes: todo pedido terminado y no entregado)
-- ===========================================================================

create or replace view comercial.v_stock_seguridad
with (security_invoker = true) as
with meta as (
  select distinct on (sku_id) sku_id, ss_meta, creado_en, creado_por
    from comercial.metas_stock_seguridad
   order by sku_id, orden desc
),
saldo as (
  select m.producto_id,
         sum(m.cantidad) filter (where d.numero = 'PTF') as en_fabrica,
         sum(m.cantidad) filter (where d.numero = 'C5')  as en_calle5
    from comercial.movimientos_pt m
    join gmp.depositos d on d.id = m.deposito_id
   group by m.producto_id
),
comprometido as (
  select producto_id, sum(en_fabrica_para_pedido) as comprometido
    from comercial.v_pendientes_despacho
   group by producto_id
),
pedidos as (
  select r.producto_id,
         sum(r.cantidad) filter (where p.para_stock and p.estado in ('CONFIRMADO', 'EN_PRODUCCION'))
           as en_produccion,
         sum(r.cantidad) filter (where not p.para_stock and p.estado in ('CONFIRMADO', 'EN_PRODUCCION'))
           as pedidos_clientes
    from comercial.pedido_renglones r
    join comercial.pedidos p on p.id = r.pedido_id
   where not r.anulado and p.eliminado_en is null and p.tercero_id is null
   group by r.producto_id
),
base as (
  select s.*,
         pr.nombre                                    as producto_nombre,
         coalesce(mt.ss_meta, s.ss_planilla)          as ss_meta,
         mt.ss_meta is not null                       as meta_propia,
         mt.creado_en                                 as meta_desde,
         ceil(s.demanda_lead_time)                    as demanda_lt,
         coalesce(sa.en_fabrica, 0)                   as en_fabrica,
         coalesce(sa.en_calle5, 0)                    as en_calle5,
         coalesce(co.comprometido, 0)                 as comprometido,
         coalesce(pe.en_produccion, 0)                as en_produccion,
         coalesce(pe.pedidos_clientes, 0)             as pedidos_clientes
    from comercial.stock_seguridad_sku s
    left join gmp.productos pr  on pr.id = s.producto_id
    left join meta mt           on mt.sku_id = s.id
    left join saldo sa          on sa.producto_id = s.producto_id
    left join comprometido co   on co.producto_id = s.producto_id
    left join pedidos pe        on pe.producto_id = s.producto_id
)
select
  b.id                                   as sku_id,
  b.sku_cod,
  b.producto_id,
  b.producto_nombre,
  b.descripcion,
  b.estado_demanda,
  b.origen,
  b.clase_demanda,
  b.aplica_stock,
  case when b.incluye_produccion then 'PRODUCIR' else 'COMPRAR' end as accion,
  b.mu_mensual,
  b.lead_time_dh,
  b.demanda_lt,
  b.ss_planilla,
  b.rop_planilla,
  b.ss_meta,
  b.meta_propia,
  b.meta_desde,
  (b.demanda_lt + b.ss_meta)::numeric    as rop_meta,
  b.en_fabrica,
  b.en_calle5,
  b.comprometido,
  b.en_produccion,
  b.pedidos_clientes,
  b.en_fabrica - b.comprometido          as disponible,
  b.en_fabrica - b.comprometido + b.en_produccion as posicion,
  case when b.aplica_stock
       then greatest(b.demanda_lt - (b.en_fabrica - b.comprometido + b.en_produccion), 0) else 0 end
                                          as falta_disponible,
  case when b.aplica_stock
       then greatest(b.ss_meta - greatest((b.en_fabrica - b.comprometido + b.en_produccion) - b.demanda_lt, 0), 0)
       else 0 end                         as falta_ss,
  b.aplica_stock and (b.en_fabrica - b.comprometido + b.en_produccion) <= (b.demanda_lt + b.ss_meta)
                                          as bajo_punto_de_pedido
from base b;

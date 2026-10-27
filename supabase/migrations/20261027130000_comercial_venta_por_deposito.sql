-- ---------------------------------------------------------------------------
-- Propósito : El pedido de venta sale de un depósito elegido: Fábrica (PTF),
--             Berna (BER) o Calle 5 (C5). Por defecto Fábrica para los
--             clientes de la lista (BELLA CENTRAL y sus locales, CESAR CUEVA
--             (TAURO), YESSICA FRANCHESCA CONTRERAS DUQUE, en cualquier
--             variante de escritura) y Berna para el resto; Ventas lo cambia.
--             Gerencia de Producción, al proponer fecha, ve lo que hay en ese
--             depósito y lo reserva ahí mismo; pone fecha solo para lo que hay
--             que producir. Si reserva todo, el pedido queda aprobado con fecha
--             de hoy. Al aprobar, lo reservado cuenta como tomado y lo que falta
--             va a Producción. Se despacha también desde Berna. Descartar un
--             pedido libera también sus reservas de producto terminado.
-- Reglas    : D-pedidos-por-deposito-1 (codirector técnico, 2026-10-27), sobre
--             D-ventas-pedidos-4, -10 y -17. RN-51 (solo se reserva y se vende
--             lo liberado: lo retenido no cuenta como disponible), RN-52 (por
--             gmp.impedimento_despacho_orden), RN-50 (auditoría), invariante 8
--             (el stock se mueve con movimientos, no se edita).
-- Fecha     : 2026-10-27
-- ---------------------------------------------------------------------------
--
-- Pedidos viejos: deposito_origen_id nulo se lee como Calle 5, que es como
-- funcionaban. Los que todavía no se aprobaron toman el depósito por defecto.

-- ===========================================================================
-- 1. Depósito de origen del pedido de venta
-- ===========================================================================

-- Minúsculas, sin tildes, signos ni espacios dobles: «CESAR CUEVA ( TAURO )»
-- y «Cesar Cueva (Tauro)» son lo mismo.
create or replace function comercial.normalizar_nombre(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'),
                          '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

-- Los clientes que se despachan desde la fábrica (pedido del 2026-10-27).
create or replace function comercial.sale_de_fabrica(p_cliente text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select comercial.normalizar_nombre(p_cliente) in (
    'bella central', 'bella central deposito', 'bella central local mitre',
    'cesar cueva tauro', 'yessica franchesca contreras duque');
$$;

comment on function comercial.sale_de_fabrica(text) is
  'D-pedidos-por-deposito-1: el pedido de estos clientes sale por defecto de la fábrica (PTF); el resto, de Berna.';

alter table comercial.pedidos
  add column deposito_origen_id uuid references gmp.depositos(id);
create index pedidos_deposito_origen_idx on comercial.pedidos (deposito_origen_id);
comment on column comercial.pedidos.deposito_origen_id is
  'Pedido de venta: de qué depósito sale (Fábrica, Berna o Calle 5). Nulo en pedidos anteriores = Calle 5 (D-pedidos-por-deposito-1).';

-- El depósito de un pedido de venta, con el de siempre para los viejos.
create or replace function comercial.deposito_de_venta(p_pedido_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(p.deposito_origen_id, (select id from gmp.depositos where numero = 'C5'))
    from comercial.pedidos p where p.id = p_pedido_id;
$$;

create or replace function comercial.fn_pedido_origen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.es_venta then
    if new.deposito_origen_id is not null then
      raise exception 'Solo un pedido de venta tiene depósito de salida.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' and new.deposito_origen_id is null then
    new.deposito_origen_id := (select id from gmp.depositos
                                where numero = case when comercial.sale_de_fabrica(new.cliente)
                                                    then 'PTF' else 'BER' end);
  end if;
  if new.deposito_origen_id is not null and not exists (
       select 1 from gmp.depositos where id = new.deposito_origen_id and numero in ('C5', 'PTF', 'BER')) then
    raise exception 'Un pedido de venta sale de la fábrica, de Berna o de Calle 5.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.deposito_origen_id is distinct from old.deposito_origen_id then
    if old.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
      raise exception 'El pedido % ya se aprobó: no cambia de depósito.', old.numero using errcode = 'check_violation';
    end if;
    if exists (select 1 from comercial.reservas_pt where pedido_id = new.id and not liberada) then
      raise exception 'El pedido % tiene stock reservado: liberalo antes de cambiar el depósito.', old.numero
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_pedido_origen
  before insert or update of deposito_origen_id on comercial.pedidos
  for each row execute function comercial.fn_pedido_origen();
revoke execute on function comercial.fn_pedido_origen() from public, anon, authenticated;

create index if not exists reservas_pt_pedido_idx on comercial.reservas_pt (pedido_id);

-- Los que todavía no se aprobaron toman el de por defecto; el resto queda en
-- Calle 5 (nulo), como funcionaban.
update comercial.pedidos
   set deposito_origen_id = (select id from gmp.depositos
                              where numero = case when comercial.sale_de_fabrica(cliente) then 'PTF' else 'BER' end)
 where es_venta and estado in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') and eliminado_en is null;

-- ===========================================================================
-- 2. Lo disponible por depósito
-- ===========================================================================

-- Copia de 20261001130000: «tomado sin reservar» de los pedidos de venta que
-- salen de Calle 5. Los de otros depósitos no toman de Calle 5.
create or replace view comercial.v_calle5_tomado_ventas
with (security_invoker = true) as
select pd.pedido_id, pd.producto_id,
       greatest(least(coalesce(r.de_calle5, 0), pd.pendiente) - pd.reservado_para_pedido, 0) as tomado
  from comercial.v_pendientes_despacho pd
  join comercial.pedidos p on p.id = pd.pedido_id and p.es_venta
  join (select pedido_id, producto_id, sum(de_calle5) as de_calle5
          from comercial.pedido_renglones where not anulado group by pedido_id, producto_id) r
    on r.pedido_id = pd.pedido_id and r.producto_id = pd.producto_id
 where p.deposito_origen_id is null
    or p.deposito_origen_id = (select id from gmp.depositos where numero = 'C5');

-- Por depósito y producto: lo que hay que puede salir, lo reservado y lo libre.
-- RN-51/RN-52: lo de un lote retenido (sin liberar, vencido o bloqueado) no
-- cuenta: no se reserva lo que no se puede despachar (asignar_lotes_pt lo
-- rechazaría). Sin lote (orden nula) sale, como en R-09. En Calle 5 descuenta
-- además lo que otros pedidos tomaron sin reservar.
create view comercial.v_disponible_pt
with (security_invoker = true) as
with por_lote as (
  select m.deposito_id, m.producto_id, m.orden_id, sum(m.cantidad) as saldo
    from comercial.movimientos_pt m group by 1, 2, 3
),
saldo as (
  select deposito_id, producto_id, sum(saldo) as en_deposito
    from por_lote
   where orden_id is null or gmp.impedimento_despacho_orden(orden_id) is null
   group by 1, 2
),
reservado as (
  select r.deposito_id, r.producto_id, sum(r.cantidad - r.consumido) as reservado
    from comercial.reservas_pt r where not r.liberada group by 1, 2
),
tomado as (
  select (select id from gmp.depositos where numero = 'C5') as deposito_id, producto_id,
         sum(tomado) as tomado
    from comercial.v_calle5_tomado_ventas group by producto_id
)
select s.deposito_id, d.numero as deposito_numero, d.nombre as deposito, s.producto_id,
       s.en_deposito,
       coalesce(rv.reservado, 0) as reservado,
       coalesce(t.tomado, 0) as tomado_sin_reservar,
       greatest(s.en_deposito - coalesce(rv.reservado, 0) - coalesce(t.tomado, 0), 0) as disponible
  from saldo s
  join gmp.depositos d on d.id = s.deposito_id
  left join reservado rv on rv.deposito_id = s.deposito_id and rv.producto_id = s.producto_id
  left join tomado t on t.deposito_id = s.deposito_id and t.producto_id = s.producto_id;

comment on view comercial.v_disponible_pt is
  'Producto terminado por depósito: lo que hay, lo reservado y lo libre para un pedido nuevo (D-pedidos-por-deposito-1).';
grant select on comercial.v_disponible_pt to authenticated;

-- ===========================================================================
-- 3. Aprobar: lo reservado cuenta como tomado; lo que falta, a Producción
-- ===========================================================================

-- ¿Tiene reservado, en su depósito, todo lo que pide?
create or replace function comercial.venta_toda_reservada(p_pedido_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from comercial.pedido_renglones r
     where r.pedido_id = p_pedido_id and not r.anulado
     group by r.producto_id
    having sum(r.cantidad) > coalesce((select sum(x.cantidad - x.consumido) from comercial.reservas_pt x
                                        where x.pedido_id = p_pedido_id and x.producto_id = r.producto_id
                                          and x.deposito_id = comercial.deposito_de_venta(p_pedido_id)
                                          and not x.liberada), 0))
  and exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado);
$$;

-- Copia de 20261019140000 (enviar_venta) con el depósito del pedido en lugar
-- de Calle 5. De cada producto toma primero lo que ya tiene reservado y
-- después lo libre. SECURITY DEFINER para que Gerencia de Producción, al
-- reservar todo, escriba la foto y el S-xxxx; el rol lo controla adentro.
create or replace function comercial.aprobar_venta_interna(p_pedido_id uuid, p_de_deposito jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido  comercial.pedidos%rowtype;
  v_prop    comercial.propuestas_fecha%rowtype;
  v_dep     uuid;
  r         record;
  v_disp    numeric;
  v_pide    numeric;
  v_toma    numeric;
  v_falta   numeric := 0;
  v_s       uuid;
  v_primero uuid;
  v_numero  text;
  v_numeros text[] := '{}';
  v_usado   jsonb := '{}';
begin
  -- Aprueba Ventas; Gerencia de Producción, solo un pedido que reservó entero
  -- (reservar_producto_venta).
  if not (core.es_rol('VENTAS', 'ADMINISTRACION')
          or (core.es_rol('GERENCIA_PRODUCCION')
              and comercial.venta_toda_reservada(p_pedido_id))) then
    raise exception 'Aprobar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta then
    raise exception 'No es un pedido de venta.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado <> 'FECHA_PROPUESTA' then
    raise exception 'El pedido % no tiene fecha propuesta: se pide a Gerencia de Producción y se aprueba con la que comprometa (está %).',
      v_pedido.numero, v_pedido.estado using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;
  select * into v_prop from comercial.propuestas_fecha
   where pedido_id = p_pedido_id order by orden desc limit 1;
  v_dep := comercial.deposito_de_venta(p_pedido_id);

  perform pg_advisory_xact_lock(hashtext('comercial.enviar_venta'));

  for r in
    select rr.id, rr.producto_id, rr.cantidad, pr.codigo_interno
      from comercial.pedido_renglones rr
      join gmp.productos pr on pr.id = rr.producto_id
     where rr.pedido_id = p_pedido_id and not rr.anulado
     order by rr.id
  loop
    -- Lo reservado para este pedido más lo libre, menos lo que ya tomó un
    -- renglón anterior del mismo producto.
    select coalesce(sum(cantidad - consumido), 0) into v_disp
      from comercial.reservas_pt
     where pedido_id = p_pedido_id and producto_id = r.producto_id and deposito_id = v_dep and not liberada;
    v_disp := v_disp + coalesce((select disponible from comercial.v_disponible_pt
                                  where deposito_id = v_dep and producto_id = r.producto_id), 0)
            - coalesce((v_usado ->> r.producto_id::text)::numeric, 0);
    v_disp := greatest(v_disp, 0);
    v_pide := (select sum((x ->> 'cantidad')::numeric)
                 from jsonb_array_elements(coalesce(p_de_deposito, '[]'::jsonb)) x
                where (x ->> 'producto_id')::uuid = r.producto_id);
    if v_pide is not null and v_pide < 0 then
      raise exception 'La cantidad del depósito de % no puede ser negativa.', r.codigo_interno
        using errcode = 'check_violation';
    end if;
    if v_pide is not null and v_pide > least(r.cantidad, v_disp) then
      raise exception 'De % se piden % del depósito y hay % disponibles para este pedido (pedido: %).',
        r.codigo_interno, trim_scale(v_pide), trim_scale(v_disp), trim_scale(r.cantidad)
        using errcode = 'check_violation';
    end if;
    v_toma := coalesce(v_pide, least(r.cantidad, v_disp));
    v_usado := v_usado || jsonb_build_object(r.producto_id::text,
                 coalesce((v_usado ->> r.producto_id::text)::numeric, 0) + v_toma);
    update comercial.pedido_renglones
       set de_calle5 = v_toma, a_producir = r.cantidad - v_toma
     where id = r.id;
    v_falta := v_falta + (r.cantidad - v_toma);
  end loop;

  insert into comercial.fotos_pedido (pedido_id) values (p_pedido_id);

  update comercial.pedidos
     set estado = 'CONFIRMADO', fecha_entrega = v_prop.fecha_pedido,
         gestionado_por = coalesce(gestionado_por, core.usuario_actual())
   where id = p_pedido_id;

  if v_falta > 0 then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_pedido_stock'));
    for r in
      select rr.producto_id, sum(rr.a_producir) as a_producir
        from comercial.pedido_renglones rr
        join gmp.productos pr on pr.id = rr.producto_id
       where rr.pedido_id = p_pedido_id and not rr.anulado and rr.a_producir > 0
       group by rr.producto_id, pr.codigo_interno
       order by pr.codigo_interno
    loop
      select format('S-%s', lpad((coalesce(max(substring(numero from '^S-(\d+)$')::int), 0) + 1)::text, 4, '0'))
        into v_numero from comercial.pedidos where numero ~ '^S-\d+$';
      insert into comercial.pedidos (numero, cliente, fecha_entrega, observaciones, para_stock, para_pedido_id)
      values (v_numero, '', v_prop.fecha_pedido,
              format('Lo que falta del pedido de venta %s. Al terminar queda reservado para él.', v_pedido.numero),
              true, p_pedido_id)
      returning id into v_s;
      insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
      values (v_s, r.producto_id, r.a_producir);
      update comercial.pedidos set estado = 'CONFIRMADO' where id = v_s;
      v_primero := coalesce(v_primero, v_s);
      v_numeros := v_numeros || v_numero;
    end loop;
  end if;

  perform comercial.reservar_venta(p_pedido_id);

  return jsonb_build_object('a_producir', v_falta, 'pedido_stock_id', v_primero,
                            'pedido_stock', nullif(array_to_string(v_numeros, ', '), ''),
                            'pedidos_stock', to_jsonb(v_numeros));
end;
$$;

comment on function comercial.aprobar_venta_interna(uuid, jsonb) is
  'Aprueba un pedido de venta con fecha propuesta (D-pedidos-por-deposito-1): foto, lo reservado y lo libre del depósito '
  'del pedido como tomado, un S-xxxx por producto que falta, y reserva. Ventas, o GP si el pedido está todo reservado.';
revoke execute on function comercial.aprobar_venta_interna(uuid, jsonb) from public, anon;
grant execute on function comercial.aprobar_venta_interna(uuid, jsonb) to authenticated;

-- Misma firma que la vigente: Ventas aprueba.
create or replace function comercial.enviar_venta(p_pedido_id uuid, p_de_calle5 jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Aprobar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  return comercial.aprobar_venta_interna(p_pedido_id, p_de_calle5);
end;
$$;

comment on function comercial.enviar_venta(uuid, jsonb) is
  'Ventas aprueba un pedido de venta con la fecha que propuso Gerencia de Producción (D-ventas-pedidos-17, '
  'D-pedidos-por-deposito-1). p_de_calle5: cuánto sale del depósito del pedido, por producto (nombre histórico).';

-- Copia de 20261001130000: reserva lo que el pedido toma de su depósito y
-- todavía no tiene reservado, hasta lo que hay libre ahí.
create or replace function comercial.reservar_venta(p_pedido_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_dep    uuid;
  v_n      integer;
begin
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta then
    raise exception 'No es un pedido de venta.' using errcode = 'check_violation';
  end if;
  v_dep := comercial.deposito_de_venta(p_pedido_id);
  insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
  select t.producto_id, v_dep, p_pedido_id, t.falta,
         format('Reservado para el pedido %s', v_pedido.numero)
    from (
      select r.producto_id,
             least(sum(r.de_calle5) - coalesce((select sum(x.cantidad - x.consumido) from comercial.reservas_pt x
                                                 where x.pedido_id = p_pedido_id and x.producto_id = r.producto_id
                                                   and x.deposito_id = v_dep and not x.liberada), 0),
                   coalesce((select (s.en_deposito - s.reservado) from comercial.v_disponible_pt s
                              where s.deposito_id = v_dep and s.producto_id = r.producto_id), 0)) as falta
        from comercial.pedido_renglones r
       where r.pedido_id = p_pedido_id and not r.anulado
       group by r.producto_id
    ) t
   where t.falta > 0;
  get diagnostics v_n = row_count;
  update comercial.pedidos set reservar_calle5 = true where id = p_pedido_id and not reservar_calle5;
  return v_n;
end;
$$;

comment on function comercial.reservar_venta(uuid) is
  'Reserva en el depósito del pedido de venta lo que toma de ahí y todavía no tiene reservado (D-pedidos-por-deposito-1).';

-- ===========================================================================
-- 4. Gerencia de Producción reserva al proponer fecha
-- ===========================================================================

-- Copia de 20260929110000: se reserva también para un pedido de venta que
-- espera fecha o la tiene propuesta (todavía no aprobado).
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
         or v_pedido.entregado_en is not null
         or v_pedido.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA', 'CONFIRMADO',
                                    'EN_PRODUCCION', 'CUMPLIDO') then
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

create or replace function comercial.reservar_producto_venta(p_pedido_id uuid, p_producto_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_dep    uuid;
  v_pide   numeric;
  v_ya     numeric;
  v_libre  numeric;
  v_toma   numeric;
  v_todo   boolean;
  v_aprob  jsonb;
begin
  -- Solo GP: la propuesta de fecha que deja al reservar todo es suya
  -- (propuestas_fecha_insert_gerencia_produccion).
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Reservar al proponer fecha es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.estado <> 'ESPERANDO_FECHA' then
    raise exception 'Se reserva un pedido de venta que espera fecha.' using errcode = 'check_violation';
  end if;
  v_dep := comercial.deposito_de_venta(p_pedido_id);
  perform pg_advisory_xact_lock(hashtext('comercial.enviar_venta'));

  select coalesce(sum(cantidad), 0) into v_pide from comercial.pedido_renglones
   where pedido_id = p_pedido_id and producto_id = p_producto_id and not anulado;
  if v_pide = 0 then
    raise exception 'El pedido % no lleva ese producto.', v_pedido.numero using errcode = 'check_violation';
  end if;
  select coalesce(sum(cantidad - consumido), 0) into v_ya from comercial.reservas_pt
   where pedido_id = p_pedido_id and producto_id = p_producto_id and deposito_id = v_dep and not liberada;
  select coalesce(disponible, 0) into v_libre from comercial.v_disponible_pt
   where deposito_id = v_dep and producto_id = p_producto_id;
  if v_pide - v_ya <= 0 then
    raise exception 'Ese producto ya está todo reservado para el pedido %.', v_pedido.numero
      using errcode = 'check_violation';
  end if;
  v_toma := least(v_pide - v_ya, coalesce(v_libre, 0));
  if v_toma <= 0 then
    raise exception 'No hay stock libre de ese producto en %.', (select nombre from gmp.depositos where id = v_dep)
      using errcode = 'check_violation';
  end if;
  insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
  values (p_producto_id, v_dep, p_pedido_id, v_toma,
          format('Reservado por Gerencia de Producción para el pedido %s', v_pedido.numero));

  -- Todo reservado: no hay nada que producir ni fecha que proponer. Sale hoy
  -- y queda aprobado (pedido del 2026-10-27).
  v_todo := comercial.venta_toda_reservada(p_pedido_id);
  if v_todo then
    insert into comercial.propuestas_fecha (pedido_id, fecha_pedido, nota)
    values (p_pedido_id, current_date, 'Todo en stock: reservado por Gerencia de Producción.');
    v_aprob := comercial.aprobar_venta_interna(p_pedido_id, null);
  end if;

  return jsonb_build_object('reservado', v_toma, 'aprobado', v_todo);
end;
$$;

comment on function comercial.reservar_producto_venta(uuid, uuid) is
  'Gerencia de Producción reserva, en el depósito del pedido, lo que hay de un producto (D-pedidos-por-deposito-1). Si con '
  'eso el pedido queda todo reservado, se aprueba con fecha de hoy.';
revoke execute on function comercial.reservar_producto_venta(uuid, uuid) from public, anon;
grant execute on function comercial.reservar_producto_venta(uuid, uuid) to authenticated;

-- ===========================================================================
-- 5. Lo producido para una venta: a fábrica (o a Calle 5) y reservado
-- ===========================================================================

-- Copia de 20261019140000 con el depósito: un pedido que sale de Calle 5
-- produce para Calle 5; el resto, para la fábrica.
create or replace function comercial.fn_pedido_destino()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_venta comercial.pedidos%rowtype;
begin
  if tg_op = 'UPDATE' and new.para_pedido_id is not distinct from old.para_pedido_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'El destino de una producción lo elige Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.para_pedido_id is null then
    if tg_op = 'UPDATE' then
      new.cliente := 'Para stock';
    end if;
    return new;
  end if;

  if not new.para_stock or new.es_venta then
    raise exception 'Solo un pedido de producción va para un pedido de venta.'
      using errcode = 'check_violation';
  end if;
  select * into v_venta from comercial.pedidos where id = new.para_pedido_id;
  if not found or not v_venta.es_venta or v_venta.eliminado_en is not null
     or v_venta.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'La producción va para un pedido de venta aprobado y sin entregar.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and exists (
       select 1 from comercial.pedido_renglones s
        where s.pedido_id = new.id and not s.anulado
          and not exists (select 1 from comercial.pedido_renglones v
                           where v.pedido_id = v_venta.id and not v.anulado
                             and v.producto_id = s.producto_id)) then
    raise exception 'El pedido % no lleva lo que produce %.', v_venta.numero, new.numero
      using errcode = 'check_violation';
  end if;

  -- D-pedidos-por-deposito-1: Calle 5 si la venta sale de ahí; si no, la fábrica.
  new.destino_deposito_id := (select id from gmp.depositos
                               where numero = case when (select numero from gmp.depositos
                                                          where id = comercial.deposito_de_venta(v_venta.id)) = 'C5'
                                                   then 'C5' else 'PTF' end);
  new.cliente := format('Para %s — %s', v_venta.numero, v_venta.cliente);
  if tg_op = 'UPDATE' then
    new.fecha_entrega := v_venta.fecha_entrega;
  end if;
  return new;
end;
$$;

-- Copia de 20261001130000: reserva lo producido para la venta en su depósito o
-- en el destino de su producción (fábrica o Calle 5), no solo en Calle 5.
create or replace function comercial.fn_produccion_para_venta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_venta  uuid;
  v_numero text;
  v_falta  numeric;
begin
  if new.tipo <> 'ENTRADA_PRODUCCION' or new.documento_tipo <> 'PEDIDO' or new.cantidad <= 0 then
    return null;
  end if;
  select p.para_pedido_id into v_venta from comercial.pedidos p
   where p.id = new.documento_id and p.para_stock and p.para_pedido_id is not null;
  if v_venta is null then
    return null;
  end if;
  -- Solo en el depósito del que sale la venta o en el destino de su
  -- producción: si entra a otro (por ejemplo, «Terminado» a fábrica de una
  -- venta de Calle 5), no se reserva ahí.
  if new.deposito_id is distinct from comercial.deposito_de_venta(v_venta)
     and new.deposito_id is distinct from (select destino_deposito_id from comercial.pedidos
                                            where id = new.documento_id) then
    return null;
  end if;
  select numero into v_numero from comercial.pedidos where id = v_venta;
  select greatest(pd.pendiente - pd.reservado_para_pedido, 0) into v_falta
    from comercial.v_pendientes_despacho pd
   where pd.pedido_id = v_venta and pd.producto_id = new.producto_id;
  if coalesce(v_falta, 0) > 0 then
    insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
    values (new.producto_id, new.deposito_id, v_venta, least(new.cantidad, v_falta),
            format('Producido para el pedido de venta %s', v_numero));
  end if;
  return null;
end;
$$;

-- ===========================================================================
-- 6. Despacho también desde Berna; descartar libera lo reservado
-- ===========================================================================

-- Copia de 20260929140100 con BER entre los depósitos de despacho.
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
  if not core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS') then
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

  select id into v_dep from gmp.depositos where numero = p_deposito and numero in ('C5', 'PTF', 'BER') and activo;
  if v_dep is null then
    raise exception 'Se despacha desde Calle 5 (C5), la fábrica (PTF) o Berna (BER).' using errcode = 'check_violation';
  end if;

  select coalesce(sum(v.pendiente), 0) - coalesce(sum(least(v.pendiente, greatest(s.cantidad, 0))), 0)
    into v_queda
    from comercial.v_pendientes_despacho v
    left join (select (e ->> 'producto_id')::uuid as producto_id, sum((e ->> 'cantidad')::numeric) as cantidad
                 from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) e group by 1) s
      on s.producto_id = v.producto_id
   where v.pedido_id = p_pedido_id;

  insert into comercial.despachos_pt (pedido_id, deposito_id, con_faltantes, observacion)
  values (p_pedido_id, v_dep, v_queda > 0, nullif(btrim(p_observacion), ''))
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

    v_restante := r.cantidad;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_pt
       where deposito_id = v_dep and producto_id = r.producto_id and not liberada and cantidad > consumido
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

-- DT puede descartar pedidos (eliminar_pedido): que pueda liberar sus reservas.
alter policy reservas_pt_update_stock on comercial.reservas_pt
  using (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS',
                     'DIRECCION_TECNICA'))
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS',
                          'DIRECCION_TECNICA'));
comment on policy reservas_pt_update_stock on comercial.reservas_pt is
  'Avanza lo consumido o libera: stock, GP, Gerencia, Administración, Ventas y DT (descartar un pedido, '
  'D-pedidos-por-deposito-1).';

-- Si Ventas cambia productos o cantidades de un pedido que espera fecha y lo
-- reservado de un producto supera lo pedido, se libera lo de ese producto y
-- Gerencia de Producción lo vuelve a reservar.
create or replace function comercial.fn_renglon_recorta_reserva()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_prod   uuid := coalesce(new.producto_id, old.producto_id);
begin
  select * into v_pedido from comercial.pedidos where id = coalesce(new.pedido_id, old.pedido_id);
  if not v_pedido.es_venta or v_pedido.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
    return null;
  end if;
  if coalesce((select sum(x.cantidad - x.consumido) from comercial.reservas_pt x
                where x.pedido_id = v_pedido.id and x.producto_id = v_prod and not x.liberada), 0)
     > coalesce((select sum(r.cantidad) from comercial.pedido_renglones r
                  where r.pedido_id = v_pedido.id and r.producto_id = v_prod and not r.anulado), 0) then
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Cambió lo pedido en %s: se vuelve a reservar.', v_pedido.numero)
     where pedido_id = v_pedido.id and producto_id = v_prod and not liberada;
  end if;
  return null;
end;
$$;
revoke execute on function comercial.fn_renglon_recorta_reserva() from public, anon, authenticated;

create trigger trg_renglon_recorta_reserva
  after update of cantidad, anulado on comercial.pedido_renglones
  for each row execute function comercial.fn_renglon_recorta_reserva();

-- Copia de 20260929140100 que libera también lo reservado de producto
-- terminado. «Descartar pedido» en pantalla (pedido del 2026-10-27).
create or replace function comercial.eliminar_pedido(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'VENTAS') then
    raise exception 'Tu rol no puede borrar pedidos.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.eliminado_en is not null then
    raise exception 'El pedido % ya estaba borrado.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.estado = 'CUMPLIDO' then
    raise exception 'El pedido % está terminado: su consumo ya bajó el stock y no se borra.', v_pedido.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.facturas
              where pedido_id = p_pedido_id and estado in ('AUTORIZADA', 'PENDIENTE')) then
    raise exception 'El pedido % tiene una factura emitida o en curso: se anula con nota de crédito, no se borra.', v_pedido.numero
      using errcode = 'check_violation';
  end if;

  update comercial.reservas_stock set liberada = true
   where pedido_id = p_pedido_id and not liberada;
  -- D-pedidos-por-deposito-1: también lo reservado de producto terminado.
  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = format('Pedido %s descartado.', v_pedido.numero)
   where pedido_id = p_pedido_id and not liberada;
  update comercial.avisos_compra set estado = 'DESCARTADO'
   where pedido_id = p_pedido_id and estado = 'PENDIENTE';

  if v_pedido.estado = 'CANCELADO' then
    update comercial.pedidos
       set eliminado_en = now(), eliminado_por = core.usuario_actual(),
           motivo_eliminacion = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = p_pedido_id;
  else
    update comercial.pedidos
       set estado = 'CANCELADO',
           eliminado_en = now(), eliminado_por = core.usuario_actual(),
           motivo_eliminacion = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = p_pedido_id;
  end if;
end;
$$;

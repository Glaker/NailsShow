-- ---------------------------------------------------------------------------
-- Propósito : (1) Ventas marca un pedido aprobado como «Despachado»: lo que
--             tenía reservado sale del stock en forma definitiva (despacho con
--             movimiento SALIDA_VENTA y remito, por despachar_pedido) y el
--             pedido queda entregado. «Finalizar» sigue para lo que salió por
--             fuera del sistema y no mueve stock.
--             (2) Ventas cambia la cantidad reservada de un producto en un
--             pedido. Una reserva no se edita (fn_reserva_pt_validar): se
--             libera con motivo y se hace otra por la cantidad nueva.
-- Reglas    : RN-51/RN-52 (el despacho sigue pasando por despachar_pedido y
--             sus controles), RN-54 (el movimiento no se edita). Pedido del
--             codirector técnico del 2026-11-18.
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Despachado: sale lo reservado y el pedido se cierra
-- ===========================================================================

create function comercial.despachar_pedido_reservado(p_pedido_id uuid, p_observacion text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_pedido   comercial.pedidos%rowtype;
  v_dep      record;
  v_renglones jsonb;
  v_n        integer := 0;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Marcar un pedido despachado es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null then
    raise exception 'No es un pedido de venta vigente.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Se despacha un pedido aprobado (el % está %).', v_pedido.numero, v_pedido.estado
      using errcode = 'check_violation';
  end if;

  -- Un despacho por depósito con reserva: cada producto sale por lo reservado,
  -- sin pasar lo que falta despachar.
  for v_dep in
    select distinct d.id, d.numero
      from comercial.reservas_pt r
      join gmp.depositos d on d.id = r.deposito_id
     where r.pedido_id = p_pedido_id and not r.liberada and r.cantidad > r.consumido
  loop
    select jsonb_agg(jsonb_build_object('producto_id', x.producto_id,
                                        'cantidad', least(x.reservado, v.pendiente)))
      into v_renglones
      from (select producto_id, sum(cantidad - consumido) as reservado
              from comercial.reservas_pt
             where pedido_id = p_pedido_id and deposito_id = v_dep.id and not liberada
             group by producto_id) x
      join comercial.v_pendientes_despacho v
        on v.pedido_id = p_pedido_id and v.producto_id = x.producto_id
     where least(x.reservado, v.pendiente) > 0;
    continue when v_renglones is null;
    perform comercial.despachar_pedido(p_pedido_id, v_renglones, v_dep.numero, true,
                                       coalesce(nullif(btrim(p_observacion), ''), 'Despachado por Ventas'));
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'El pedido % no tiene nada reservado para despachar. Si salió por fuera del sistema, finalizalo.',
      v_pedido.numero using errcode = 'check_violation';
  end if;

  -- Lo que no estaba reservado no sale del stock: el pedido se cierra igual.
  if (select entregado_en from comercial.pedidos where id = p_pedido_id) is null then
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Pedido %s despachado por Ventas.', v_pedido.numero)
     where pedido_id = p_pedido_id and not liberada;
    update comercial.pedidos
       set estado = 'CUMPLIDO', entregado_en = now(), entregado_por = core.usuario_actual()
     where id = p_pedido_id;
  end if;
  return v_n;
end;
$$;

comment on function comercial.despachar_pedido_reservado(uuid, text) is
  'Ventas marca despachado un pedido aprobado (2026-11-18): despacha lo reservado de cada depósito con '
  'despachar_pedido (descuenta stock) y deja el pedido CUMPLIDO con entregado_en.';
revoke execute on function comercial.despachar_pedido_reservado(uuid, text) from public, anon;
grant execute on function comercial.despachar_pedido_reservado(uuid, text) to authenticated;

-- ===========================================================================
-- 2. Cambiar la cantidad reservada: se libera y se reserva de nuevo
-- ===========================================================================

create function comercial.cambiar_reserva_pedido(
  p_pedido_id   uuid,
  p_producto_id uuid,
  p_deposito_id uuid,
  p_cantidad    numeric
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_pedida numeric;
  v_caja   uuid;
  v_antes  numeric;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Cambiar lo reservado de un pedido es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad reservada no es válida.' using errcode = 'check_violation';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null or v_pedido.entregado_en is not null then
    raise exception 'Se cambia lo reservado de un pedido de venta abierto.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(cantidad), 0) into v_pedida
    from comercial.pedido_renglones
   where pedido_id = p_pedido_id and producto_id = p_producto_id and not anulado;
  if p_cantidad > v_pedida then
    raise exception 'El pedido % lleva % de ese producto: no se reservan %.', v_pedido.numero, v_pedida, p_cantidad
      using errcode = 'check_violation';
  end if;

  -- El surtido que la originó, para que reasignar la caja la siga liberando.
  select max(pedido_caja_id::text)::uuid, trim_scale(coalesce(sum(cantidad - consumido), 0))
    into v_caja, v_antes
    from comercial.reservas_pt
   where pedido_id = p_pedido_id and producto_id = p_producto_id and deposito_id = p_deposito_id
     and not liberada;
  if v_antes = p_cantidad then
    return;
  end if;

  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = format('Ventas cambió lo reservado de %s a %s.', v_antes, p_cantidad)
   where pedido_id = p_pedido_id and producto_id = p_producto_id and deposito_id = p_deposito_id
     and not liberada;

  -- La nueva pasa por fn_reservas_pt_alcanzan: no se reserva más de lo libre.
  if p_cantidad > 0 then
    insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion, pedido_caja_id)
    values (p_producto_id, p_deposito_id, p_pedido_id, p_cantidad,
            format('Cambio de cantidad por Ventas (antes %s).', v_antes), v_caja);
  end if;
end;
$$;

comment on function comercial.cambiar_reserva_pedido(uuid, uuid, uuid, numeric) is
  'Ventas cambia lo reservado de un producto del pedido en un depósito (2026-11-18): libera las reservas vigentes '
  'con motivo y crea una nueva por la cantidad (0 = solo liberar). Tope: lo que lleva el pedido.';
revoke execute on function comercial.cambiar_reserva_pedido(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function comercial.cambiar_reserva_pedido(uuid, uuid, uuid, numeric) to authenticated;

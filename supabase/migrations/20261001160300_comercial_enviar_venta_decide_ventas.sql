-- ---------------------------------------------------------------------------
-- Propósito : Que el sistema no elija a qué cliente le toca el stock de Calle
--             5 (pedido del 2026-10-01: «hay 100 monómeros y 1000 pedidos en
--             6 clientes; deciden Silveira y Mati»). Al enviar un pedido de
--             venta, Ventas dice por producto cuánto se arma de Calle 5; el
--             resto va a Producción. Lo que dice se reserva para ese pedido.
-- Reglas    : RN-63 por analogía (no se toma más de lo disponible), RN-50.
--             Reemplaza la comercial.enviar_venta(uuid) de 20261001160100.
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------
--
-- p_de_calle5: [{producto_id, cantidad}]. Sin un producto en la lista, o con
-- p_de_calle5 nulo, se sugiere lo disponible (hasta lo pedido): es la sugerencia
-- que la pantalla muestra y Ventas puede bajar a cero. Nunca más que lo pedido
-- ni que lo disponible. Reasignar después (sacarle a un pedido para dárselo a
-- otro) es liberar la reserva con motivo (comercial.liberar_reserva_pt) y
-- reservar para el otro: lo hacen la encargada de Calle 5 o Ventas.

drop function comercial.enviar_venta(uuid);

create function comercial.enviar_venta(p_pedido_id uuid, p_de_calle5 jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  r        record;
  v_disp   numeric;
  v_pide   numeric;
  v_toma   numeric;
  v_falta  numeric := 0;
  v_s      uuid;
  v_numero text;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') then
    raise exception 'Enviar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta then
    raise exception 'No es un pedido de venta.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado <> 'BORRADOR' then
    raise exception 'El pedido % ya se envió.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('comercial.enviar_venta'));

  for r in
    select rr.id, rr.producto_id, rr.cantidad, pr.codigo_interno
      from comercial.pedido_renglones rr
      join gmp.productos pr on pr.id = rr.producto_id
     where rr.pedido_id = p_pedido_id and not rr.anulado
  loop
    select coalesce(disponible, 0) into v_disp
      from comercial.v_disponible_calle5 where producto_id = r.producto_id;
    v_disp := coalesce(v_disp, 0);
    v_pide := (select sum((x ->> 'cantidad')::numeric)
                 from jsonb_array_elements(coalesce(p_de_calle5, '[]'::jsonb)) x
                where (x ->> 'producto_id')::uuid = r.producto_id);
    if v_pide is not null and v_pide < 0 then
      raise exception 'La cantidad de Calle 5 de % no puede ser negativa.', r.codigo_interno
        using errcode = 'check_violation';
    end if;
    if v_pide is not null and v_pide > least(r.cantidad, v_disp) then
      raise exception 'De % se piden % de Calle 5 y hay % disponibles para este pedido (pedido: %).',
        r.codigo_interno, trim_scale(v_pide), trim_scale(v_disp), trim_scale(r.cantidad)
        using errcode = 'check_violation';
    end if;
    v_toma := coalesce(v_pide, least(r.cantidad, v_disp));
    update comercial.pedido_renglones
       set de_calle5 = v_toma, a_producir = r.cantidad - v_toma
     where id = r.id;
    v_falta := v_falta + (r.cantidad - v_toma);
  end loop;

  update comercial.pedidos
     set estado = 'CONFIRMADO', gestionado_por = coalesce(gestionado_por, core.usuario_actual())
   where id = p_pedido_id;

  if v_falta > 0 then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_pedido_stock'));
    select format('S-%s', lpad((coalesce(max(substring(numero from '^S-(\d+)$')::int), 0) + 1)::text, 4, '0'))
      into v_numero from comercial.pedidos where numero ~ '^S-\d+$';
    insert into comercial.pedidos (numero, cliente, fecha_entrega, observaciones, para_stock,
                                   destino_deposito_id, para_pedido_id)
    values (v_numero, format('Para %s — %s', v_pedido.numero, v_pedido.cliente), v_pedido.fecha_entrega,
            format('Lo que falta del pedido de venta %s. Al terminar en Calle 5 queda reservado para él.', v_pedido.numero),
            true, (select id from gmp.depositos where numero = 'C5'), p_pedido_id)
    returning id into v_s;
    insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
    select v_s, producto_id, a_producir from comercial.pedido_renglones
     where pedido_id = p_pedido_id and not anulado and a_producir > 0;
    update comercial.pedidos set estado = 'CONFIRMADO' where id = v_s;
  end if;

  -- Lo que Ventas decidió armar de Calle 5 queda reservado para este pedido.
  perform comercial.reservar_venta(p_pedido_id);

  return jsonb_build_object('a_producir', v_falta, 'pedido_stock_id', v_s, 'pedido_stock', v_numero);
end;
$$;

comment on function comercial.enviar_venta(uuid, jsonb) is
  'Envía un pedido de venta: Ventas dice por producto cuánto se arma de Calle 5 (sugerido: lo disponible); eso se '
  'reserva para el pedido y lo que falta va a Producción en un S-xxxx. El sistema no reparte entre clientes.';

grant execute on function comercial.enviar_venta(uuid, jsonb) to authenticated;

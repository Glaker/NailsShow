-- ---------------------------------------------------------------------------
-- Propósito : «Despachado» puede, si se pide, bajar también el stock
--             reservado como antes de D-factura-x-2 («ajuste de stock», por
--             las dudas). Sin pedirlo, solo cierra el pedido. Si después llega
--             la factura X, corrige contra lo que ya salió: no descuenta dos
--             veces (reconciliación de comercial.cargar_factura_x).
-- Reglas    : RN-54, RN-51 (la baja pasa por despachar_pedido y sus
--             controles). D-factura-x-3 (pedido del codirector técnico del
--             2026-11-24).
-- Fecha     : 2026-11-24
-- ---------------------------------------------------------------------------

-- Cambia la firma (parámetro nuevo con default): se reemplaza la de dos.
drop function comercial.despachar_pedido_reservado(uuid, text);

create function comercial.despachar_pedido_reservado(
  p_pedido_id   uuid,
  p_observacion text default null,
  p_bajar_stock boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido    comercial.pedidos%rowtype;
  v_dep       record;
  v_renglones jsonb;
  v_n         integer := 0;
  v_menos     text;
  v_obs       text;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION', 'DESPACHO') then
    raise exception 'Marcar un pedido despachado es de Ventas o Despacho.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null then
    raise exception 'No es un pedido de venta vigente.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Se despacha un pedido aprobado (el % está %).', v_pedido.numero, v_pedido.estado
      using errcode = 'check_violation';
  end if;

  -- Lo que sale con menos: pendiente de despachar mayor que lo reservado.
  select string_agg(format('%s sale %s de %s', pr.codigo_interno,
                           trim_scale(coalesce(x.reservado, 0)), trim_scale(v.pendiente)),
                    ', ' order by pr.codigo_interno)
    into v_menos
    from comercial.v_pendientes_despacho v
    join gmp.productos pr on pr.id = v.producto_id
    left join (select producto_id, sum(cantidad - consumido) as reservado
                 from comercial.reservas_pt
                where pedido_id = p_pedido_id and not liberada
                group by producto_id) x on x.producto_id = v.producto_id
   where v.pedido_id = p_pedido_id and v.pendiente > coalesce(x.reservado, 0);
  v_obs := concat_ws(' · ',
                     coalesce(nullif(btrim(p_observacion), ''),
                              case when core.es_rol('VENTAS', 'ADMINISTRACION') then 'Despachado por Ventas'
                                   else 'Despachado por Despacho' end),
                     'Sale con menos: ' || v_menos,
                     case when p_bajar_stock then 'Con baja de stock (ajuste)'
                          else 'El stock baja con la factura X' end);

  if p_bajar_stock then
    -- Como antes de D-factura-x-2: un despacho por depósito con reserva, cada
    -- producto sale por lo reservado (despachar_pedido descuenta el stock).
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
      perform comercial.despachar_pedido(p_pedido_id, v_renglones, v_dep.numero, true, v_obs);
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then
      raise exception 'El pedido % no tiene nada reservado para bajar del stock.', v_pedido.numero
        using errcode = 'check_violation';
    end if;
  else
    insert into comercial.despachos_pt (pedido_id, deposito_id, con_faltantes, observacion)
    values (p_pedido_id, comercial.deposito_de_venta(p_pedido_id), v_menos is not null, v_obs);
  end if;

  -- Lo que quedó reservado se libera y el pedido se cierra.
  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = format('Pedido %s despachado.', v_pedido.numero)
   where pedido_id = p_pedido_id and not liberada;
  if (select entregado_en from comercial.pedidos where id = p_pedido_id) is null then
    update comercial.pedidos
       set estado = 'CUMPLIDO', entregado_en = now(), entregado_por = core.usuario_actual()
     where id = p_pedido_id;
  end if;
  return greatest(v_n, 1);
end;
$$;

comment on function comercial.despachar_pedido_reservado(uuid, text, boolean) is
  'Ventas o Despacho marcan despachado un pedido aprobado (D-factura-x-2/3): cierra el pedido y libera lo reservado. '
  'Con p_bajar_stock, además baja lo reservado como ajuste (despachar_pedido); la factura X después corrige la '
  'diferencia sin descontar dos veces.';
revoke execute on function comercial.despachar_pedido_reservado(uuid, text, boolean) from public, anon;
grant execute on function comercial.despachar_pedido_reservado(uuid, text, boolean) to authenticated;

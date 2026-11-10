-- ---------------------------------------------------------------------------
-- Propósito : Ventas reserva desde el pedido, antes de pedir fecha, en el
--             depósito del que sale. Si con eso el pedido queda todo
--             reservado, no hay nada que producir y Ventas lo aprueba para
--             hoy sin pasar por Gerencia de Producción. Lo que falta sigue
--             yendo a Producción para que comprometa fecha.
-- Reglas    : RN-51, D-pedidos-por-deposito-1, D-venta-deposito-1.
-- Fecha     : 2026-11-10
-- ---------------------------------------------------------------------------
--
-- Mismo camino que comercial.reservar_producto_venta cuando GP reserva todo:
-- una propuesta de fecha de hoy con nota y comercial.aprobar_venta_interna.
-- SECURITY DEFINER porque la propuesta de fecha es de GP por política; el rol
-- se controla adentro y la autoría la sella la base con el usuario del JWT.

create or replace function comercial.aprobar_venta_reservada(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Aprobar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null
     or v_pedido.estado not in ('BORRADOR', 'ESPERANDO_FECHA') then
    raise exception 'Se aprueba así un pedido de venta que todavía no está aprobado.'
      using errcode = 'check_violation';
  end if;
  if not comercial.venta_toda_reservada(p_pedido_id) then
    raise exception 'Al pedido % le falta reservar stock en su depósito: lo que falta se pide a Producción.',
      v_pedido.numero using errcode = 'check_violation';
  end if;

  if v_pedido.estado = 'BORRADOR' then
    update comercial.pedidos set estado = 'ESPERANDO_FECHA' where id = p_pedido_id;
  end if;
  insert into comercial.propuestas_fecha (pedido_id, fecha_pedido, nota)
  values (p_pedido_id, (now() at time zone 'America/Argentina/Buenos_Aires')::date,
          'Todo en stock: reservado por Ventas.');
  return comercial.aprobar_venta_interna(p_pedido_id, null);
end;
$$;

comment on function comercial.aprobar_venta_reservada(uuid) is
  'Ventas aprueba para hoy un pedido de venta que tiene todo reservado en su depósito, sin pedir fecha a Producción '
  '(D-venta-deposito-1).';
revoke execute on function comercial.aprobar_venta_reservada(uuid) from public, anon;
grant execute on function comercial.aprobar_venta_reservada(uuid) to authenticated;

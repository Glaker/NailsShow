-- ---------------------------------------------------------------------------
-- Propósito : (1) El cliente ve su pedido en cuatro estados: Pendiente, En
--             producción, En camino y Finalizado (más Cancelado).
--             (2) Ventas finaliza a mano un pedido aprobado que ya se entregó
--             por fuera del despacho del sistema y seguía apareciendo abierto.
-- Reglas    : D-portal-clientes-1 (provisorio).
-- Fecha     : 2026-11-12
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico del 2026-11-12:
--   Pendiente     = Mati todavía no lo aprobó (BORRADOR, ESPERANDO_FECHA,
--                   FECHA_PROPUESTA).
--   En producción = aprobado y con algún pedido de stock S-xxxx sin terminar.
--   En camino     = aprobado y sin producción pendiente (se terminó o no hacía
--                   falta).
--   Finalizado    = entregado (CUMPLIDO o con entregado_en).
--
-- Finalizar: CONFIRMADO o EN_PRODUCCION → CUMPLIDO con entregado_en, que es
-- el camino que fn_pedido_transicion ya admite para lo entregado sin pasar
-- por «Terminado». Libera lo que quedaba reservado, con motivo. No mueve
-- stock: lo que salió por fuera del sistema se ajusta aparte.

drop function comercial.cliente_pedidos();

create function comercial.cliente_pedidos()
returns table (id uuid, numero text, estado text, estado_cliente text, enviado_en timestamptz,
               fecha_entrega date, editable boolean, cancelado boolean, observaciones text,
               renglones jsonb)
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
                     'producto_id', r.producto_id, 'cantidad', r.cantidad,
                     'producto', pr.nombre, 'codigo', pr.codigo_interno) order by pr.codigo_interno)
                     from comercial.pedido_renglones r
                     join gmp.productos pr on pr.id = r.producto_id
                    where r.pedido_id = p.id and not r.anulado), '[]'::jsonb)
    from comercial.pedidos p
   where p.cliente_id = comercial.cliente_exigir() and p.es_venta
   order by p.creado_en desc
   limit 60;
$$;

revoke execute on function comercial.cliente_pedidos() from public, anon;
grant execute on function comercial.cliente_pedidos() to authenticated;

create function comercial.finalizar_pedido_venta(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Finalizar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null then
    raise exception 'No es un pedido de venta vigente.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Se finaliza un pedido aprobado (el % está %). Uno sin aprobar se descarta.',
      v_pedido.numero, v_pedido.estado using errcode = 'check_violation';
  end if;

  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = format('Pedido %s finalizado por Ventas%s', v_pedido.numero,
                                    coalesce(': ' || nullif(btrim(p_motivo), ''), '.'))
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos
     set estado = 'CUMPLIDO', entregado_en = now(), entregado_por = core.usuario_actual(),
         observaciones = case when nullif(btrim(coalesce(p_motivo, '')), '') is null then observaciones
                              else concat_ws(E'\n', observaciones, 'Finalizado: ' || btrim(p_motivo)) end
   where id = p_pedido_id;
end;
$$;

comment on function comercial.finalizar_pedido_venta(uuid, text) is
  'Ventas marca entregado un pedido de venta aprobado que seguía abierto (2026-11-12): CUMPLIDO con entregado_en y '
  'libera lo reservado. No mueve stock.';
revoke execute on function comercial.finalizar_pedido_venta(uuid, text) from public, anon;
grant execute on function comercial.finalizar_pedido_venta(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Propósito : Lo que Gerencia de Producción termina en una orden entra al
--             stock de fábrica (PTF) con su lote, retenido hasta que la DT lo
--             libera. Hasta hoy entraba solo con «Terminado» del pedido: una
--             orden sin pedido, o con el pedido sin terminar, quedaba liberada
--             y sin stock.
-- Reglas    : RN-51 (sale solo lo liberado: gmp.impedimento_despacho_orden,
--             sin cambios), invariante 7 (comercial → gmp: gmp no sabe del
--             stock; el envoltorio vive en comercial), invariante 8 / RN-54.
--             Pedido del 2026-10-22 (D-stock-pt-orden-1).
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- CÓMO. comercial.terminar_orden llama a gmp.terminar_orden y, en la misma
-- transacción, registra ENTRADA_PRODUCCION de las unidades obtenidas en PTF
-- con orden_id = la orden. Si la orden es de un pedido de Nail Show que lleva
-- ese producto, la entrada va a nombre del pedido (documento PEDIDO), para que
-- v_pendientes_despacho la cuente; si no, a nombre de la orden (documento
-- ORDEN). La liberación no cambia: al liberar, el lote deja de estar retenido.
--
-- UNA SOLA ENTRADA POR ORDEN. Si el pedido se termina después, su entrada de
-- ese lote no se registra (ya entró por la orden): el pedido igual queda
-- terminado y sus consumos registrados. Si el pedido se terminó antes, terminar
-- la orden no vuelve a cargar. Las dos vías toman el mismo lock por orden.
--
-- ponytail: gmp.terminar_orden y el PATCH sobre ordenes_produccion siguen
-- abiertos y terminan sin cargar stock; la pantalla usa esta. Cerrarlos si
-- aparece otra vía.

-- 1. La entrada de producción viene de un pedido o de una orden.
alter table comercial.movimientos_pt drop constraint movimientos_pt_produccion_de_pedido;
alter table comercial.movimientos_pt add constraint movimientos_pt_produccion_documentada
  check (tipo <> 'ENTRADA_PRODUCCION'
         or (documento_tipo in ('PEDIDO', 'ORDEN') and documento_id is not null));

create index movimientos_pt_orden_idx on comercial.movimientos_pt (orden_id, tipo);

-- 2. Copia de la vigente con la entrada por orden habilitada desde
--    comercial.terminar_orden (misma idea que terminando_pedido).
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
    if new.tipo = 'ENTRADA_PRODUCCION'
       and not (new.documento_tipo = 'ORDEN'
                and new.orden_id = new.documento_id
                and coalesce(current_setting('comercial.terminando_orden', true), '') = new.documento_id::text) then
      raise exception 'La entrada de producción viene de un pedido o de una orden terminados.' using errcode = 'check_violation';
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
  -- solo desde «Terminado» de este pedido. 20261022150100: o desde terminar
  -- una orden de este pedido.
  if new.tipo = 'ENTRADA_PRODUCCION' then
    if coalesce(current_setting('comercial.terminando_pedido', true), '') <> v_pedido.id::text
       and not (new.orden_id is not null
                and coalesce(current_setting('comercial.terminando_orden', true), '') = new.orden_id::text) then
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

-- 3. «Terminado» del pedido no vuelve a cargar lo que ya entró por la orden.
--    Corre después de trg_movimiento_pt_lote (que resuelve el lote del
--    pedido) y antes de trg_movimiento_pt_pedido: orden alfabético.
create function comercial.fn_movimiento_pt_orden_ya_entro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'ENTRADA_PRODUCCION' and new.orden_id is not null and new.documento_tipo = 'PEDIDO'
     and coalesce(current_setting('comercial.terminando_pedido', true), '') = new.documento_id::text
     and coalesce(current_setting('comercial.terminando_orden', true), '') = '' then
    perform pg_advisory_xact_lock(hashtextextended('orden|' || new.orden_id::text, 0));
    if exists (select 1 from comercial.movimientos_pt
                where orden_id = new.orden_id and tipo = 'ENTRADA_PRODUCCION') then
      -- ponytail: si un mismo «Terminado» manda el mismo lote a dos depósitos,
      -- la segunda fila también se descarta; no pasa con un lote retenido, que
      -- solo entra a PTF.
      return null;
    end if;
  end if;
  return new;
end;
$$;

comment on function comercial.fn_movimiento_pt_orden_ya_entro() is
  'Una sola entrada de producción por lote (RN-54): si la orden ya cargó lo obtenido, «Terminado» del pedido no '
  'registra de nuevo ese lote. El pedido igual queda terminado.';

create trigger trg_movimiento_pt_lote_orden_ya_entro
  before insert on comercial.movimientos_pt
  for each row execute function comercial.fn_movimiento_pt_orden_ya_entro();

-- 4. Terminar la orden y cargar lo obtenido.
create function comercial.terminar_orden(p_id uuid, p_cantidad numeric, p_unidades integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden  gmp.ordenes_produccion%rowtype;
  v_pedido uuid;
begin
  perform gmp.terminar_orden(p_id, p_cantidad, p_unidades);

  perform pg_advisory_xact_lock(hashtextextended('orden|' || p_id::text, 0));
  select * into v_orden from gmp.ordenes_produccion where id = p_id;
  if coalesce(p_unidades, 0) <= 0
     or exists (select 1 from comercial.movimientos_pt where orden_id = p_id and tipo = 'ENTRADA_PRODUCCION') then
    return;
  end if;

  -- El pedido de Nail Show de esta orden que lleva el producto, si es uno solo.
  select case when count(*) = 1 then (array_agg(p.id))[1] end into v_pedido
    from comercial.pedido_ordenes po
    join comercial.pedidos p on p.id = po.pedido_id
   where po.orden_id = p_id and p.tercero_id is null and p.eliminado_en is null
     and exists (select 1 from comercial.pedido_renglones r
                  where r.pedido_id = p.id and r.producto_id = v_orden.producto_id and not r.anulado);

  perform set_config('comercial.terminando_orden', p_id::text, true);
  insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
  values (v_orden.producto_id, (select id from gmp.depositos where numero = 'PTF'), 'ENTRADA_PRODUCCION', p_unidades,
          format('Producción de la orden %s, lote %s', v_orden.numero, v_orden.numero_lote),
          case when v_pedido is null then 'ORDEN' else 'PEDIDO' end, coalesce(v_pedido, p_id), p_id);
  perform set_config('comercial.terminando_orden', '', true);
end;
$$;

comment on function comercial.terminar_orden(uuid, numeric, integer) is
  'Termina la orden (gmp.terminar_orden) y carga las unidades obtenidas en PTF con su lote, retenidas hasta que la '
  'DT libera (RN-51). A nombre del pedido de la orden si tiene uno. SECURITY INVOKER: rige movimientos_pt_insert_produccion.';

revoke execute on function comercial.terminar_orden(uuid, numeric, integer) from public, anon;
grant  execute on function comercial.terminar_orden(uuid, numeric, integer) to authenticated;

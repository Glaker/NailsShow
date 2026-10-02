-- ---------------------------------------------------------------------------
-- Propósito : En la central de Ventas el pago se marca cuando llega, y casi
--             siempre llega después de la entrega. Un pedido cerrado (CUMPLIDO
--             o CANCELADO) sigue sin modificarse, salvo esas columnas de la
--             planilla: estado del pago, forma de pago y observación.
-- Reglas    : RN-50 (el cambio queda auditado), pedido del 2026-10-01.
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------
--
-- Copia de la vigente (20260925100000) con una rama NUEVA al principio. No
-- toca productos, cantidades ni precios: esos siguen congelados.

create or replace function comercial.fn_pedido_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('CUMPLIDO', 'CANCELADO') then
    -- NUEVO: pago, forma de pago y observación se marcan después de cerrar.
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

  if new.estado is distinct from old.estado then
    if not (
         (old.estado = 'BORRADOR'      and new.estado in ('CONFIRMADO', 'CANCELADO'))
      or (old.estado = 'CONFIRMADO'    and new.estado in ('BORRADOR', 'EN_PRODUCCION', 'CUMPLIDO', 'CANCELADO'))
      or (old.estado = 'EN_PRODUCCION' and new.estado in ('CUMPLIDO', 'CANCELADO'))
    ) then
      raise exception 'Un pedido no pasa de % a %.', old.estado, new.estado
        using errcode = 'check_violation';
    end if;

    if new.estado = 'CONFIRMADO'
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id and not anulado) then
      raise exception 'No se envía a producción un pedido sin productos.'
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

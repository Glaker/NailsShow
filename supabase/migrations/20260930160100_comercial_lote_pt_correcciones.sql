-- ---------------------------------------------------------------------------
-- Propósito : Dos correcciones a 20260930160000, escritas antes de aplicarla
--             y que se aplican juntas:
--             1. Su sección 5 dice que «Terminado» toma la orden del JSON de
--                producción. No se implementó: con dos o más órdenes del
--                mismo producto en un pedido, «Terminado» se rechaza. Queda
--                documentado en la función, que es lo que se consulta.
--             2. Los mensajes de falta de stock mostraban «6.0000 unidades».
-- Reglas    : RN-51, R-09. Control de cambios (CLAUDE.md §6): la migración
--             escrita no se edita, se corrige con otra.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------

comment on function comercial.fn_movimiento_pt_lote() is
  'Lote de cada movimiento de producto terminado (R-09, RN-51). Producción: toma la orden del pedido para ese '
  'producto; sin orden entra sin lote; con dos o más órdenes del mismo producto en el pedido, rechaza (no hay '
  'todavía forma de decir de cuál es lo producido). Salidas: reparte con asignar_lotes_pt. A Calle 5 solo entra '
  'lo liberado o lo sin lote. La sección 5 de 20260930160000 describe otra cosa y no rige.';

create or replace function comercial.asignar_lotes_pt(
  p_producto_id      uuid,
  p_deposito_id      uuid,
  p_cantidad         numeric,
  p_solo_despachable boolean
)
returns table (orden_id uuid, cantidad numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  r        record;
  v_rest   numeric := p_cantidad;
  v_total  numeric := 0;
  v_toma   numeric;
begin
  for r in
    select m.orden_id as lote, sum(m.cantidad) as saldo, o.vencimiento
      from comercial.movimientos_pt m
      left join gmp.ordenes_produccion o on o.id = m.orden_id
     where m.producto_id = p_producto_id and m.deposito_id = p_deposito_id
     group by m.orden_id, o.vencimiento
    having sum(m.cantidad) > 0
     order by (m.orden_id is not null), o.vencimiento, m.orden_id
  loop
    v_total := v_total + r.saldo;
    continue when v_rest <= 0;
    continue when p_solo_despachable and r.lote is not null
                  and gmp.impedimento_despacho_orden(r.lote) is not null;
    v_toma := least(v_rest, r.saldo);
    orden_id := r.lote;
    cantidad := v_toma;
    return next;
    v_rest := v_rest - v_toma;
  end loop;

  if v_rest > 0 then
    if p_solo_despachable and v_total >= p_cantidad then
      raise exception
        'Hay % unidades, pero solo % se pueden vender o mandar a Calle 5: el resto es de lotes que Dirección Técnica todavía no liberó.',
        trim_scale(v_total), trim_scale(p_cantidad - v_rest)
        using errcode = 'check_violation';
    end if;
    raise exception 'No alcanza el stock: hay % unidades y salen %.', trim_scale(v_total), trim_scale(p_cantidad)
      using errcode = 'check_violation';
  end if;
end;
$$;

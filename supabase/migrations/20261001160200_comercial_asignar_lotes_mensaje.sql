-- ---------------------------------------------------------------------------
-- Propósito : Corrige el mensaje de comercial.asignar_lotes_pt (20261001160100)
--             antes de aplicarse: perdió el «Dirección Técnica todavía no
--             liberó» que lee quien despacha y mostraba las cantidades con
--             cuatro decimales. La regla no cambia: gmp.lote_despachable().
-- Reglas    : RN-51, RN-52 (vía gmp, CLAUDE.md §4).
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------

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
    continue when p_solo_despachable and r.lote is not null and not gmp.lote_despachable(r.lote);
    v_toma := least(v_rest, r.saldo);
    orden_id := r.lote;
    cantidad := v_toma;
    return next;
    v_rest := v_rest - v_toma;
  end loop;

  if v_rest > 0 then
    if p_solo_despachable and v_total >= p_cantidad then
      raise exception
        'Hay % unidades, pero solo % se pueden vender o mandar a Calle 5: el resto es de lotes que Dirección Técnica todavía no liberó, que vencieron o que están bloqueados.',
        trim_scale(v_total), trim_scale(p_cantidad - v_rest)
        using errcode = 'check_violation';
    end if;
    raise exception 'No alcanza el stock: hay % unidades y salen %.', trim_scale(v_total), trim_scale(p_cantidad)
      using errcode = 'check_violation';
  end if;
end;
$$;

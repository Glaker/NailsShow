-- ---------------------------------------------------------------------------
-- Propósito : Una entrada de producto terminado nunca se frena por saldo
--             negativo. El control «no se saca lo que no hay» rige para lo
--             que sale; una entrada solo puede achicar un negativo heredado
--             (ventas de Casiopea en Berna descontadas sin stock cargado,
--             p. ej. 252 en −73). Caso del 2026-11-18: Naza no podía mandar
--             72 de 252 de la fábrica a Berna porque Berna quedaba en −1.
-- Reglas    : RN-54 / invariante 8 (no se edita ningún movimiento; solo
--             cambia el control). Copia de 20260930160000 con la condición
--             new.cantidad < 0.
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------

create or replace function comercial.fn_stock_pt_no_negativo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  -- NUEVO: solo lo que sale. Una entrada sobre un saldo negativo lo mejora.
  if new.cantidad >= 0 then
    return null;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt
   where deposito_id = new.deposito_id and producto_id = new.producto_id
     and orden_id is not distinct from new.orden_id;

  if v_saldo < 0 then
    raise exception
      'El movimiento dejaría el stock de este producto en % unidades en el depósito%. No se puede sacar lo que no hay.',
      trim_scale(v_saldo), case when new.orden_id is null then ' (sin lote)' else ' para ese lote' end
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

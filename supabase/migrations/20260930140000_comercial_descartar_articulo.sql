-- ---------------------------------------------------------------------------
-- Propósito : Dar de baja de una vez todo el stock de Nail Show que queda de
--             un insumo que ya no se usa: un descarte por cada lote y
--             depósito con saldo, en una sola transacción.
-- Reglas    : Invariante 8 y RN-54 (el stock sale con un movimiento, nada se
--             borra), PG.60.18 (motivo tipificado del descarte), RN-50.
--             Ítem 1 de la cola del 2026-09-24, conversado el 2026-09-30:
--             «dar de baja» es sacar el stock que quedó.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- Es lo mismo que registrar a mano un «Descarte» con motivo «Discontinuado»
-- en cada posición, sin el riesgo de olvidarse una. Cada movimiento pasa por
-- comercial.fn_validar_movimiento (saldo, lote, depósito, artículo activo) y
-- por el trigger de auditoría; si uno falla, no sale ninguno.
--
-- SECURITY INVOKER a propósito: escribe con la política de INSERT de
-- movimientos_stock del que la llama, sin privilegio propio.
--
-- Solo el stock de Nail Show (tercero_id null). El de un tercerizado se da de
-- baja desde su pantalla. No desactiva el insumo ni toca sus reservas: son
-- otras decisiones.

create function comercial.descartar_articulo(p_articulo_id uuid, p_motivo text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer := 0;
  r   record;
begin
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Indicá por qué se da de baja el stock.'
      using errcode = 'check_violation';
  end if;

  for r in
    select e.lote_insumo_id, e.deposito_id, e.saldo
      from comercial.v_existencias e
     where e.articulo_id = p_articulo_id
       and e.tercero_id is null
       and e.saldo > 0
  loop
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo)
    values
      (p_articulo_id, r.lote_insumo_id, r.deposito_id, 'SALIDA_DESCARTE', -r.saldo,
       btrim(p_motivo), 'DISCONTINUADO');
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'No queda stock de Nail Show de este artículo para dar de baja.'
      using errcode = 'check_violation';
  end if;

  return v_n;
end;
$$;

comment on function comercial.descartar_articulo(uuid, text) is
  'Descarta (SALIDA_DESCARTE, DISCONTINUADO) todo el saldo de Nail Show del artículo, una fila por lote y depósito. Devuelve cuántas posiciones dio de baja.';

revoke execute on function comercial.descartar_articulo(uuid, text) from public, anon;
grant  execute on function comercial.descartar_articulo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Propósito : Corrige comercial.anular_transferencia (20261001170000) antes de
--             aplicarse: bloqueaba las patas con SELECT … FOR UPDATE, que exige
--             privilegio de UPDATE sobre movimientos_fondos, y el libro de
--             fondos no lo tiene para nadie (append-only, RN-54). La
--             exclusión pasa a un lock de transacción por transferencia.
-- Reglas    : RN-54, B1 de docs/AUDITORIA_ADMIN.md.
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------

create or replace function comercial.anular_transferencia(p_grupo uuid, p_motivo text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí por qué se anula.' using errcode = 'check_violation';
  end if;
  -- Una anulación de esta transferencia a la vez (sin UPDATE sobre el libro).
  perform pg_advisory_xact_lock(hashtextextended('transferencia|' || p_grupo::text, 0));
  select count(*) into v_n from comercial.movimientos_fondos
   where transferencia_grupo = p_grupo and anula_a_id is null;
  if v_n <> 2 then
    raise exception 'La transferencia no existe.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.movimientos_fondos x
               join comercial.movimientos_fondos o on o.id = x.anula_a_id
              where o.transferencia_grupo = p_grupo) then
    raise exception 'La transferencia ya está anulada.' using errcode = 'check_violation';
  end if;
  insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto, anula_a_id, transferencia_grupo)
  select m.cuenta_id, m.tipo, -m.importe, format('Anula: %s — %s', m.concepto, btrim(p_motivo)), m.id, p_grupo
    from comercial.movimientos_fondos m
   where m.transferencia_grupo = p_grupo and m.anula_a_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

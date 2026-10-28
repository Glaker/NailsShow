-- ---------------------------------------------------------------------------
-- Propósito : Transferir varios productos terminados de un depósito a otro en
--             una sola operación (p. ej. de la fábrica a Berna), para que el
--             remito salga con todos los renglones. Todo o nada: si a uno no
--             le alcanza el stock, no se mueve ninguno.
-- Reglas    : RN-51 e invariante 8 / RN-54 (las rigen comercial.transferir_pt,
--             que se llama por renglón), D-remito-1. Pedido del 2026-10-28.
-- Fecha     : 2026-10-28
-- ---------------------------------------------------------------------------

create or replace function comercial.transferir_pt_varios(
  p_renglones jsonb,
  p_origen    text,
  p_destino   text,
  p_motivo    text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_r jsonb;
begin
  if jsonb_typeof(p_renglones) is distinct from 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La transferencia necesita al menos un producto.' using errcode = 'check_violation';
  end if;
  if (select count(*) from jsonb_array_elements(p_renglones))
     <> (select count(distinct e ->> 'producto_id') from jsonb_array_elements(p_renglones) e) then
    raise exception 'Un producto va una sola vez en la transferencia: sumá las cantidades.' using errcode = 'check_violation';
  end if;
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    perform comercial.transferir_pt((v_r ->> 'producto_id')::uuid, (v_r ->> 'cantidad')::numeric,
                                    p_origen, p_destino, p_motivo);
  end loop;
end;
$$;
comment on function comercial.transferir_pt_varios(jsonb, text, text, text) is
  'Varias transferencias de producto terminado juntas, todo o nada. SECURITY INVOKER: rige comercial.transferir_pt.';
revoke execute on function comercial.transferir_pt_varios(jsonb, text, text, text) from public, anon;
grant execute on function comercial.transferir_pt_varios(jsonb, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Propósito : Estiba del lote de insumo: dónde está dentro del depósito, en
--             la forma «A-N» (una letra y un número). Se pregunta, optativa,
--             al cargar la recepción a stock.
-- Reglas    : D-rotulos-y-estiba-1 (pedido del codirector técnico del
--             2026-10-26). No es una regla del alcance: es ubicación física,
--             como el depósito, y no va en el rótulo R.20.2.1.
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------
--
-- Como el depósito, es el lugar del lote y no lo constatado al recibirlo:
-- queda fuera de gmp.fn_lote_campos_editables y se puede cambiar si el lote
-- se mueve. El trigger de auditoría genérico de gmp.lotes_insumo ya registra
-- quién la puso y el valor anterior.

alter table gmp.lotes_insumo
  add column estiba text
    constraint lotes_insumo_estiba_formato check (estiba ~ '^[A-Z]-[0-9]+$');

comment on column gmp.lotes_insumo.estiba is
  'Estiba dentro del depósito, «A-N» (D-rotulos-y-estiba-1). Optativa; no va en el rótulo.';

-- Administración carga a stock pero no escribe el lote (lotes_insumo_update_circuito):
-- esta función le deja tocar solo la estiba. Mismos roles que «Cargar a stock».
create or replace function gmp.asignar_estiba_lote(p_lote_id uuid, p_estiba text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filas integer;
begin
  if not core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION',
                     'RECEPCION') then
    raise exception 'Tu rol no puede asignar la estiba de un lote.'
      using errcode = 'insufficient_privilege';
  end if;

  update gmp.lotes_insumo
     set estiba = nullif(upper(btrim(p_estiba)), '')
   where id = p_lote_id;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;
end;
$$;

comment on function gmp.asignar_estiba_lote(uuid, text) is
  'Pone o cambia la estiba «A-N» de un lote; vacía la borra (D-rotulos-y-estiba-1).';

revoke execute on function gmp.asignar_estiba_lote(uuid, text) from public, anon;
grant execute on function gmp.asignar_estiba_lote(uuid, text) to authenticated;

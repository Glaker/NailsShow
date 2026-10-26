-- ---------------------------------------------------------------------------
-- Propósito : Dos depósitos de envases aprobados. «Envases aprobados»
--             (ENV-APR) pasa a llamarse «Depósito de envases 1» y se crea
--             «Depósito de envases 2» (ENV-2). Al cargar a stock un envase
--             que entra aprobado se elige a cuál va; la estiba se pregunta
--             solo en el 1, que es el único con estibas.
-- Reglas    : D-envases-1-y-2-1 (pedido del codirector técnico del
--             2026-10-26), sobre D-recepcion-2 e I.20.2: los dos son de
--             aprobados; la cuarentena de envases sigue siendo el 01.
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------

update gmp.depositos set nombre = 'Depósito de envases 1' where numero = 'ENV-APR';

insert into gmp.depositos (numero, nombre, tipo_contenido, estado_admitido, es_exterior, activo)
values ('ENV-2', 'Depósito de envases 2', 'ENVASE_EMPAQUE', 'APROBADO', false, true)
on conflict (numero) do nothing;

-- gmp.control_recepcion_envase deja el envase aprobado en el depósito de su
-- ficha o en el 1. Esto lo cambia a otro de aprobados de envases mientras la
-- recepción no se cargó a stock: después ya hay existencia y moverlo es una
-- transferencia (RN-54).
create or replace function gmp.elegir_deposito_envase(p_lote_id uuid, p_deposito_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote gmp.lotes_insumo%rowtype;
begin
  if not core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION',
                     'RECEPCION') then
    raise exception 'Tu rol no puede elegir el depósito de un envase.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = p_lote_id for update;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;

  if not exists (select 1 from gmp.insumos_catalogo i
                  where i.id = v_lote.insumo_id and i.tipo = 'MATERIAL_ENVASE') then
    raise exception 'El lote % no es de envase.', v_lote.numero_registro_interno
      using errcode = 'check_violation';
  end if;

  if v_lote.estado <> 'APROBADO' then
    raise exception 'El lote % está %: solo un envase aprobado elige depósito de envases.',
      v_lote.numero_registro_interno, v_lote.estado
      using errcode = 'check_violation';
  end if;

  if coalesce((select r.cargado_a_stock from gmp.recepciones r
                where r.id = v_lote.recepcion_id), false) then
    raise exception 'La recepción del lote % ya se cargó a stock: moverlo es una transferencia.',
      v_lote.numero_registro_interno
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from gmp.depositos
     where id = p_deposito_id and activo
       and tipo_contenido = 'ENVASE_EMPAQUE' and estado_admitido = 'APROBADO'
  ) then
    raise exception 'El depósito elegido no es de envases aprobados o está inactivo.'
      using errcode = 'check_violation';
  end if;

  update gmp.lotes_insumo set deposito_actual_id = p_deposito_id where id = p_lote_id;
end;
$$;

comment on function gmp.elegir_deposito_envase(uuid, uuid) is
  'Manda un envase aprobado, sin cargar a stock, al depósito de envases 1 o 2 (D-envases-1-y-2-1).';

revoke execute on function gmp.elegir_deposito_envase(uuid, uuid) from public, anon;
grant execute on function gmp.elegir_deposito_envase(uuid, uuid) to authenticated;

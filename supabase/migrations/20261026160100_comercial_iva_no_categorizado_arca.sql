-- ---------------------------------------------------------------------------
-- Propósito : «No categorizado» se envía a ARCA con el código 7 y lleva
--             Factura B (clase_factura ya da B a todo lo que no es RI ni
--             Monotributo). El documento repetido ya lo rechaza
--             clientes_documento_idx (20260924130000); el aviso antes de
--             guardar es del formulario.
-- Reglas    : RN-57. D-clientes-iva-1 (codirector técnico, 2026-10-26).
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------

-- Copia de 20260924130000 con NO_CATEGORIZADO.
create or replace function comercial.condicion_iva_arca(p_condicion comercial.condicion_iva_enum)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_condicion
           when 'RESPONSABLE_INSCRIPTO' then 1
           when 'EXENTO'                then 4
           when 'CONSUMIDOR_FINAL'      then 5
           when 'MONOTRIBUTO'           then 6
           when 'NO_CATEGORIZADO'       then 7
           when 'NO_ALCANZADO'          then 15
         end;
$$;

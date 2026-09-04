-- ---------------------------------------------------------------------------
-- Propósito : Dos correcciones sobre la rebanada de recepción.
--             1. Los números correlativos los asigna un trigger, pero las
--                columnas eran NOT NULL sin DEFAULT, así que el generador de
--                tipos las exigía al cliente. Se les da un DEFAULT vacío: el
--                trigger sigue siendo el único que los compone.
--             2. La política RLS habilitaba a los cuatro roles operativos a
--                cualquier transición de estado. §3.3 es más fino: el muestreo
--                y el veredicto son de Control de Calidad y Dirección Técnica.
-- Reglas    : §3.3 (matriz de permisos), §5.1 (máquina de estado del lote).
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

-- 1. Numeración -------------------------------------------------------------
--
-- El DEFAULT nunca sobrevive: `trg_numerar_recepcion` y
-- `trg_numerar_lote_insumo` corren BEFORE INSERT y reemplazan la cadena vacía
-- por el correlativo. Está para que la columna sea opcional en el INSERT, no
-- para producir un valor.

alter table gmp.recepciones  alter column numero set default '';
alter table gmp.lotes_insumo alter column numero_registro_interno set default '';

comment on column gmp.recepciones.numero is
  'Correlativo por año, compuesto por trg_numerar_recepcion. El DEFAULT vacío solo hace opcional la columna en el INSERT.';

-- 2. Rol por transición -----------------------------------------------------
--
-- Una política RLS decide sobre la fila entera y no puede mirar el valor
-- anterior, así que no puede distinguir «poner en cuarentena» de «aprobar».
-- La distinción va en el trigger, que sí ve OLD y NEW.
--
-- §3.3, filas pertinentes:
--   «Registrar recepción física de insumo» → OP, CC, DT, GP
--   «Registrar muestreo»                   → CC, DT
--   «Cargar resultado de CC»               → CC, DT
--   «Decidir aprobado o rechazado»         → CC, DT
--
-- Sobre quién decide el veredicto hay una inconsistencia documental abierta
-- (§10, inconsistencia 12: PG.60.1 dice Control de Calidad, I.50.6 e I.50.7
-- dicen que CC informa y decide Dirección Técnica). Mientras no se resuelva se
-- habilitan los dos, que es lo que ambos documentos tienen en común.

create or replace function gmp.fn_transicion_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transicion text;
  v_roles      core.rol_enum[];
begin
  if new.estado = old.estado then
    return new;
  end if;

  v_transicion := old.estado::text || '>' || new.estado::text;

  v_roles := case v_transicion
    when 'RECIBIDO>CUARENTENA'    then array['OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION']::core.rol_enum[]
    when 'CUARENTENA>MUESTREADO'  then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    when 'MUESTREADO>EN_ANALISIS' then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    when 'EN_ANALISIS>APROBADO'   then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    when 'EN_ANALISIS>RECHAZADO'  then array['CONTROL_CALIDAD','DIRECCION_TECNICA']::core.rol_enum[]
    else null
  end;

  if v_roles is null then
    raise exception
      'Transición de estado no permitida: % → %. La máquina de estado de §5.1 solo admite el avance del circuito; '
      'la corrección de un estado terminal exige no conformidad (PG.60.18), no revertir el estado.',
      old.estado, new.estado
      using errcode = 'check_violation';
  end if;

  if not core.es_rol(variadic v_roles) then
    raise exception
      'Tu rol no puede llevar un lote de % a %. Según §3.3 esa transición es de: %.',
      old.estado, new.estado, array_to_string(v_roles, ', ')
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

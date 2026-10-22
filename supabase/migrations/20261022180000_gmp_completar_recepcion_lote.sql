-- ---------------------------------------------------------------------------
-- Propósito : Completar en un lote recibido lo que quedó sin tildar en la
--             recepción: «contenedores limpiados» (I.20.1) y «protocolo
--             recibido» (RN-01). Solo de no a sí y solo mientras el lote está
--             RECIBIDO, antes de entrar a cuarentena. Lo demás de lo
--             constatado sigue sin editarse.
-- Reglas    : I.20.1, RN-01, RN-50 (el cambio queda en core.auditoria con
--             valor anterior, autor y momento). Decisión del codirector
--             técnico del 2026-10-22 (D-recepcion-4): la recepción 00002 tenía
--             un envase sin la casilla y no había forma de completarla.
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- Copia de la vigente (20260904170000) con las dos columnas fuera de la
-- comparación y su regla aparte.

create or replace function gmp.fn_lote_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Lo único que se mueve en un lote es su lugar en el circuito: el estado y
  -- el depósito donde está. Todo lo demás es lo que se constató al recibirlo.
  if (new.recepcion_id, new.insumo_id, new.numero_registro_interno,
      new.lote_proveedor, new.plazo_validez, new.cantidad_bultos,
      new.cantidad_unidades, new.unidad, new.bultos_peso_similar,
      new.unidades_contadas, new.planchas_etiquetas, new.etiquetas_por_plancha,
      new.peso_pigmento_kg, new.registrado_por, new.creado_en)
     is distinct from
     (old.recepcion_id, old.insumo_id, old.numero_registro_interno,
      old.lote_proveedor, old.plazo_validez, old.cantidad_bultos,
      old.cantidad_unidades, old.unidad, old.bultos_peso_similar,
      old.unidades_contadas, old.planchas_etiquetas, old.etiquetas_por_plancha,
      old.peso_pigmento_kg, old.registrado_por, old.creado_en) then
    raise exception
      'Un lote registrado solo admite el avance de su circuito (estado y depósito). '
      'Lo constatado en la recepción no se edita: corresponde no conformidad según PG.60.18 y registro rectificativo.'
      using errcode = 'restrict_violation';
  end if;

  -- D-recepcion-4: las dos casillas se completan (de no a sí) con el lote
  -- todavía RECIBIDO. Nunca se destildan.
  if (new.contenedores_limpiados, new.protocolo_recibido)
     is distinct from (old.contenedores_limpiados, old.protocolo_recibido) then
    if old.estado <> 'RECIBIDO'
       or (old.contenedores_limpiados and not new.contenedores_limpiados)
       or (coalesce(old.protocolo_recibido, false) and not coalesce(new.protocolo_recibido, false)) then
      raise exception
        'Contenedores limpiados y protocolo recibido solo se completan, de no a sí, mientras el lote está recibido.'
        using errcode = 'restrict_violation';
    end if;
  end if;

  -- `protocolo_archivo_url` queda fuera de la lista a propósito: el protocolo
  -- del fabricante puede llegar escaneado después de la recepción, y adjuntarlo
  -- agrega evidencia, no la altera.
  return new;
end;
$$;

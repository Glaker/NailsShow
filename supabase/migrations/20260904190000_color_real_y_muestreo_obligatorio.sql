-- ---------------------------------------------------------------------------
-- Propósito : Dos correcciones que aparecieron al probar el muestreo.
--             1. `v_lotes_insumo.color_rotulo` derivaba el color del estado del
--                lote, no del rótulo vigente. Con el lote en MUESTREADO la
--                vista decía «SIN_ROTULO» mientras en el tambor seguía puesto,
--                correctamente, el rótulo amarillo de cuarentena.
--             2. La transición CUARENTENA → MUESTREADO se podía forzar llamando
--                al rotulado directamente, sin registrar el muestreo. Ahora la
--                base exige que el muestreo exista.
-- Reglas    : RN-04, RN-07, §5.1 (precondición «muestreo registrado»), I.50.4.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. El color que informa la vista es el del rótulo puesto
-- ===========================================================================
--
-- La distinción importa y no es cosmética. `estado` es dónde está el lote en el
-- circuito; `color_rotulo` es qué cartel tiene encima ahora mismo. Entre el
-- muestreo y el inicio del análisis las dos cosas difieren a propósito: el
-- material avanzó, pero sigue en cuarentena y conserva el amarillo (I.20.2).
-- Una pantalla que muestre el color derivado del estado le diría al operario
-- que busque un cartel que no está.

drop view if exists gmp.v_lotes_insumo;

create view gmp.v_lotes_insumo with (security_invoker = true) as
  select
    l.id,
    l.numero_registro_interno,
    l.lote_proveedor,
    l.estado,
    ro.estado                           as rotulo_estado,
    ro.color                            as color_rotulo,
    l.plazo_validez,
    l.cantidad_bultos,
    l.cantidad_unidades,
    l.unidad,
    l.total_etiquetas,
    l.protocolo_recibido,
    l.contenedores_limpiados,
    l.creado_en,
    i.id                                as insumo_id,
    i.codigo_interno,
    i.nombre                            as insumo_nombre,
    i.tipo                              as insumo_tipo,
    i.es_inflamable,
    i.requiere_protocolo,
    r.id                                as recepcion_id,
    r.numero                            as recepcion_numero,
    r.fecha_hora                        as recepcion_fecha,
    p.id                                as proveedor_id,
    p.razon_social                      as proveedor,
    d.numero                            as deposito_numero,
    d.nombre                            as deposito_nombre,
    ro.id                               as rotulo_vigente_id,
    ro.emitido_en                       as rotulo_emitido_en,
    -- Cuántos muestreos lleva el lote. La pantalla lo usa para no ofrecer
    -- «registrar muestreo» sobre algo ya muestreado.
    (select count(*) from gmp.muestreos m
      where m.entidad_tipo = 'lote_insumo' and m.entidad_id = l.id) as muestreos
  from gmp.lotes_insumo l
  join gmp.insumos_catalogo i on i.id = l.insumo_id
  join gmp.recepciones r      on r.id = l.recepcion_id
  join gmp.proveedores p      on p.id = r.proveedor_id
  left join gmp.depositos d   on d.id = l.deposito_actual_id
  left join gmp.rotulos ro    on ro.entidad_tipo = 'lote_insumo'
                             and ro.entidad_id = l.id
                             and ro.vigente;

comment on view gmp.v_lotes_insumo is
  'Lote de insumo con insumo, proveedor, depósito y rótulo vigente resueltos. '
  '`estado` es dónde está en el circuito; `color_rotulo` es el color del cartel que tiene puesto. Difieren a propósito entre el muestreo y el análisis.';

grant select on gmp.v_lotes_insumo to authenticated;

-- ===========================================================================
-- 2. No se pasa a MUESTREADO sin muestreo registrado
-- ===========================================================================
--
-- §5.1 pone como precondición de CUARENTENA → MUESTREADO que el muestreo esté
-- registrado con las cinco verificaciones de I.50.4 y la etiqueta R.50.4.1
-- emitida. Estaba escrito en el documento y no en la base: bastaba llamar al
-- rotulado con el estado destino para saltearlo.

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

  -- Precondición de §5.1: el muestreo tiene que estar registrado. La función
  -- gmp.registrar_muestreo() inserta el muestreo antes de avanzar el estado,
  -- así que por ese camino esta comprobación pasa; por cualquier otro, no.
  if v_transicion = 'CUARENTENA>MUESTREADO'
     and not exists (
       select 1 from gmp.muestreos m
        where m.entidad_tipo = 'lote_insumo' and m.entidad_id = new.id
     ) then
    raise exception
      'No se puede marcar el lote como muestreado sin registrar el muestreo (I.50.4, §5.1). '
      'Usá el registro de muestreo, que además emite la etiqueta R.50.4.1 que exige RN-07.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

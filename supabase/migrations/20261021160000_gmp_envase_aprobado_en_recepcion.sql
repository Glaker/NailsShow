-- ---------------------------------------------------------------------------
-- Propósito : Envases, empaques y etiquetas se controlan en la recepción y
--             entran a stock directo en el depósito de aprobados. Quien
--             recibe hace el control (muestreo de inspección, R.50.5.1 y
--             veredicto en una transacción) antes de cargar a stock; si lo
--             aprueba, el lote pasa al depósito de aprobados de su tipo y la
--             existencia nace ahí. La materia prima sigue como está
--             (cuarentena, control aparte: D-recepcion-1).
-- Reglas    : I.20.2 (cuarentena: se comprime, no se saltea: el lote pasa por
--             CUARENTENA, MUESTREADO y EN_ANALISIS en la misma transacción),
--             I.50.4 (RN-07, RN-08, RN-10, RN-11), I.50.5. EXCEPCIÓN A §3.4:
--             quien recibe aprueba el envase. Decisión del codirector técnico
--             del 2026-10-21 (D-recepcion-2). Además, RN-10 pasa a la tabla:
--             un muestreo con contenedor, rótulo o certificado mal no se
--             inserta, ni por la función ni por escritura directa.
-- Fecha     : 2026-10-21
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. ¿Es envase, empaque o etiqueta este lote?
-- ===========================================================================

create or replace function gmp.lote_es_envase(p_lote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select i.tipo in ('MATERIAL_ENVASE', 'MATERIAL_EMPAQUE', 'ETIQUETA')
      from gmp.lotes_insumo l join gmp.insumos_catalogo i on i.id = l.insumo_id
     where l.id = p_lote_id
  ), false);
$$;

comment on function gmp.lote_es_envase(uuid) is
  'Verdadero si el lote es de envase, empaque o etiqueta: lo controla quien lo recibe (D-recepcion-2).';
revoke execute on function gmp.lote_es_envase(uuid) from public, anon;
grant execute on function gmp.lote_es_envase(uuid) to authenticated;

-- ===========================================================================
-- 1 bis. RN-10 en la tabla, no solo en gmp.registrar_muestreo
-- ===========================================================================
--
-- Con Recepción y GP habilitados a insertar muestreos, la verificación no
-- puede depender de que pasen por la función. NOT VALID: las filas viejas
-- no se revisan (son registros firmados, no se tocan); las nuevas, sí.

alter table gmp.muestreos
  add constraint muestreos_rn10_verificaciones_previas check (
    contenedor_integro and contenedor_limpio and rotulado_correcto
    and lote_coincide_certificado is not false
  ) not valid;
comment on constraint muestreos_rn10_verificaciones_previas on gmp.muestreos is
  'RN-10: con el contenedor, el rótulo o el certificado mal no se muestrea; corresponde no conformidad.';

-- ===========================================================================
-- 2. Quién puede, sobre qué
-- ===========================================================================
--
-- Recepción: materia prima (D-recepcion-1) y envases (D-recepcion-2).
-- Gerencia de Producción, que también recibe: envases.

alter policy muestreos_insert_control_calidad on gmp.muestreos
  with check (
    core.es_rol('CONTROL_CALIDAD','DIRECCION_TECNICA')
    or (entidad_tipo = 'lote_insumo' and (
          (core.es_rol('RECEPCION')
           and (gmp.lote_es_materia_prima(entidad_id) or gmp.lote_es_envase(entidad_id)))
       or (core.es_rol('GERENCIA_PRODUCCION') and gmp.lote_es_envase(entidad_id))))
  );
comment on policy muestreos_insert_control_calidad on gmp.muestreos is
  'I.50.4: muestrea CC o DT; RECEPCION materia prima y envases; GP envases (D-recepcion-1, D-recepcion-2).';

alter policy registros_analisis_insert_calidad on gmp.registros_analisis
  with check (
    (core.es_rol('CONTROL_CALIDAD','DIRECCION_TECNICA')
     or (core.es_rol('RECEPCION')
         and (gmp.lote_es_materia_prima(lote_insumo_id) or gmp.lote_es_envase(lote_insumo_id)))
     or (core.es_rol('GERENCIA_PRODUCCION') and gmp.lote_es_envase(lote_insumo_id)))
    and controlo_por = core.usuario_actual()
  );
comment on policy registros_analisis_insert_calidad on gmp.registros_analisis is
  'I.50.5: CC o DT a su nombre; RECEPCION materia prima y envases; GP envases (D-recepcion-1, D-recepcion-2).';

-- Copia de 20261020140100 con los envases para RECEPCION y GP.
create or replace function gmp.fn_transicion_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transicion text;
  v_roles      core.rol_enum[];
  v_dictamen   boolean;
begin
  if new.estado = old.estado then
    return new;
  end if;

  v_transicion := old.estado::text || '>' || new.estado::text;

  v_roles := case v_transicion
    when 'RECIBIDO>CUARENTENA'    then array['OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION','RECEPCION']::core.rol_enum[]
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

  if v_transicion <> 'RECIBIDO>CUARENTENA' then
    -- D-recepcion-1: en materia prima, Recepción hace el circuito de calidad.
    if gmp.lote_es_materia_prima(new.id) then
      v_roles := v_roles || 'RECEPCION'::core.rol_enum;
    end if;
    -- D-recepcion-2: en envases, quien recibe (Recepción o GP).
    if gmp.lote_es_envase(new.id) then
      v_roles := v_roles || array['RECEPCION','GERENCIA_PRODUCCION']::core.rol_enum[];
    end if;
  end if;

  if not core.es_rol(variadic v_roles) then
    raise exception
      'Tu rol no puede llevar un lote de % a %. Según §3.3 esa transición es de: %.',
      old.estado, new.estado, array_to_string(v_roles, ', ')
      using errcode = 'insufficient_privilege';
  end if;

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

  -- I.50.5 / I.50.6: aprobar o rechazar exige el registro de análisis con
  -- ese mismo dictamen.
  if v_transicion in ('EN_ANALISIS>APROBADO', 'EN_ANALISIS>RECHAZADO') then
    v_dictamen := gmp.analisis_vigente(new.id, null);
    if v_dictamen is null or v_dictamen <> (new.estado = 'APROBADO') then
      raise exception
        'Para % el lote hace falta su registro de análisis (R.50.5.1 o R.50.6.1) con ese dictamen.',
        case when new.estado = 'APROBADO' then 'aprobar' else 'rechazar' end
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Copia de 20261020140100 con los envases para RECEPCION y GP.
create or replace function gmp.fn_registro_analisis()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo gmp.tipo_insumo_enum;
  v_anio integer;
  v_n    integer;
  v_prev gmp.registros_analisis%rowtype;
begin
  if not (core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA')
          or (core.es_rol('RECEPCION')
              and (gmp.lote_es_materia_prima(new.lote_insumo_id) or gmp.lote_es_envase(new.lote_insumo_id)))
          or (core.es_rol('GERENCIA_PRODUCCION') and gmp.lote_es_envase(new.lote_insumo_id))) then
    raise exception 'El registro de análisis lo hace Control de Calidad o Dirección Técnica (I.50.5); '
                    'Recepción, el de materia prima y envases; Gerencia de Producción, el de envases.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.lote_insumo_id is not null then
    select i.tipo into v_tipo
      from gmp.lotes_insumo l join gmp.insumos_catalogo i on i.id = l.insumo_id
     where l.id = new.lote_insumo_id;
    new.registro := case when v_tipo = 'SEMIELABORADO' then 'R.50.6.1' else 'R.50.5.1' end;
  else
    new.registro := 'R.50.10.1';
  end if;

  if new.rectifica_a is not null then
    select * into v_prev from gmp.registros_analisis where id = new.rectifica_a;
    if v_prev.lote_insumo_id is distinct from new.lote_insumo_id
       or v_prev.orden_id is distinct from new.orden_id then
      raise exception 'La rectificación es del mismo lote que el registro que corrige.' using errcode = 'check_violation';
    end if;
  end if;

  v_anio := extract(year from new.fecha)::int;
  v_n := gmp.siguiente_numero_analisis(new.registro, v_anio);
  new.numero := format('%s/%s', lpad(v_n::text, 3, '0'), v_anio);

  new.controlo_por := core.usuario_actual();
  new.controlo_en := now();
  return new;
end;
$$;

-- ===========================================================================
-- 3. Control de envase en la recepción
-- ===========================================================================
--
-- Lo que se mira de un envase al recibirlo: embalaje íntegro y limpio,
-- identificación correcta, cantidad que coincide con el remito, y aspecto
-- (sin roturas, deformaciones ni defectos de impresión). Aprobar exige
-- aspecto conforme; con el embalaje o la identificación mal no se muestrea
-- (RN-10) y corresponde una no conformidad.
--
-- Muestra: el 5 % sugerido por RN-08, redondeado hacia arriba (o 1 si no se
-- sabe la cantidad), a reutilización (RN-11).
--
-- Si se aprueba y la recepción todavía no se cargó a stock, el lote pasa al
-- depósito de aprobados: el de la ficha o «Envases aprobados». Si ya se
-- cargó no se mueve acá: eso es una transferencia entre depósitos. Se mira
-- gmp.recepciones.cargado_a_stock y no los movimientos: gmp no lee comercial
-- (§3.7).
--
-- Un envase que pide protocolo (requiere_protocolo) no va por acá: la
-- coincidencia con el certificado la verifica Calidad.

create or replace function gmp.control_recepcion_envase(
  p_lote_id       uuid,
  p_contenedor_ok boolean,
  p_rotulo_ok     boolean,
  p_cantidad_ok   boolean,
  p_aspecto_ok    boolean,
  p_aprobado      boolean,
  p_observacion   text default null
)
returns gmp.registros_analisis
language plpgsql
set search_path = ''
as $$
declare
  v_lote      gmp.lotes_insumo%rowtype;
  v_insumo    gmp.insumos_catalogo%rowtype;
  v_obs       text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_si_no     text[] := array['no', 'sí'];
  v_sugerido  numeric;
  v_tomada    numeric;
  v_registro  gmp.registros_analisis%rowtype;
  v_deposito  uuid;
begin
  select * into v_lote from gmp.lotes_insumo where id = p_lote_id;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;
  select * into v_insumo from gmp.insumos_catalogo where id = v_lote.insumo_id;

  if v_insumo.tipo not in ('MATERIAL_ENVASE', 'MATERIAL_EMPAQUE', 'ETIQUETA') then
    raise exception 'El control en la recepción es para envases, empaques y etiquetas. «%» va por su circuito.',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;
  if p_contenedor_ok is null or p_rotulo_ok is null or p_cantidad_ok is null
     or p_aspecto_ok is null or p_aprobado is null then
    raise exception 'Falta contestar alguna verificación del control.' using errcode = 'check_violation';
  end if;
  if v_insumo.requiere_protocolo then
    raise exception '«%» pide protocolo del proveedor: el control lo hace Calidad.', v_insumo.nombre
      using errcode = 'check_violation';
  end if;
  if p_aprobado and not (p_aspecto_ok and p_cantidad_ok) then
    raise exception 'Con el aspecto o la cantidad no conformes no se aprueba: el lote se rechaza.'
      using errcode = 'check_violation';
  end if;

  if v_lote.estado = 'RECIBIDO' then
    perform gmp.emitir_rotulo_lote_insumo(p_lote_id, 'CUARENTENA'::gmp.estado_calidad_enum);
  end if;

  v_sugerido := (gmp.tamano_muestra_sugerido('MATERIAL_ENVASE_EMPAQUE', v_lote.cantidad_unidades, v_lote.unidad)
                  ->> 'cantidad')::numeric;
  v_tomada := greatest(coalesce(ceil(v_sugerido), 1), 1);

  perform gmp.registrar_muestreo(
    p_lote_id                => p_lote_id,
    p_cantidad_tomada        => v_tomada,
    p_unidad                 => v_lote.unidad,
    p_area_muestreo          => 'Recepción',
    p_contenedor_integro     => p_contenedor_ok,
    p_contenedor_limpio      => p_contenedor_ok,
    p_rotulado_correcto      => p_rotulo_ok,
    p_cantidad_contenedores  => v_lote.cantidad_bultos,
    p_destino_sobrante       => 'REUTILIZACION_ENVASE'::gmp.destino_muestra_enum,
    p_justificacion_cantidad => case when v_sugerido is distinct from v_tomada
                                     then 'Inspección visual en recepción: el 5 % redondeado hacia arriba.' end,
    p_signos_no_conformidad  => case when not p_aspecto_ok or not p_cantidad_ok then v_obs end
  );

  perform gmp.emitir_rotulo_lote_insumo(p_lote_id, 'EN_ANALISIS'::gmp.estado_calidad_enum);

  v_registro := gmp.dictaminar_lote_insumo(
    p_lote_id,
    format('%s %s (inspección)', v_tomada, v_lote.unidad),
    format('Control de envase en recepción (D-recepcion-2). Embalaje íntegro y limpio: %s. Identificación '
           'correcta: %s. Cantidad coincide con el remito: %s. Aspecto conforme: %s.',
           v_si_no[p_contenedor_ok::int + 1], v_si_no[p_rotulo_ok::int + 1],
           v_si_no[p_cantidad_ok::int + 1], v_si_no[p_aspecto_ok::int + 1]),
    coalesce(v_obs, case when p_aprobado then 'Cumple.' else 'No cumple.' end),
    p_aprobado
  );

  -- Aprobado y todavía sin cargar a stock: la existencia nace en aprobados.
  if p_aprobado and not coalesce((
    select r.cargado_a_stock from gmp.recepciones r where r.id = v_lote.recepcion_id
  ), false) then
    select coalesce(
             (select d.id from gmp.depositos d
               where d.id = v_insumo.deposito_aprobado_id and d.activo),
             (select d.id from gmp.depositos d where d.numero = 'ENV-APR' and d.activo))
      into v_deposito;
    if v_deposito is null then
      raise exception 'No hay depósito de aprobados activo para «%»: falta «Envases aprobados» (ENV-APR).',
        v_insumo.nombre
        using errcode = 'check_violation';
    end if;
    update gmp.lotes_insumo set deposito_actual_id = v_deposito where id = p_lote_id;
  end if;

  return v_registro;
end;
$$;

comment on function gmp.control_recepcion_envase(uuid, boolean, boolean, boolean, boolean, boolean, text) is
  'Control de envase, empaque o etiqueta en la recepción: muestreo, R.50.5.1 y veredicto en una transacción; si se '
  'aprueba antes de cargar a stock, el lote pasa al depósito de aprobados (D-recepcion-2).';
revoke execute on function gmp.control_recepcion_envase(uuid, boolean, boolean, boolean, boolean, boolean, text)
  from public, anon;
grant execute on function gmp.control_recepcion_envase(uuid, boolean, boolean, boolean, boolean, boolean, text)
  to authenticated;

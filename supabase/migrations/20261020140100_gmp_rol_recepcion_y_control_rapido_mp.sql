-- ---------------------------------------------------------------------------
-- Propósito : 1) Permisos del rol RECEPCION: registrar la recepción, cargarla
--                a stock, dar de alta insumos y completar depósitos.
--             2) Control rápido de materia prima: muestreo, análisis
--                organoléptico y veredicto en una sola transacción, para
--                RECEPCION, Control de Calidad y Dirección Técnica.
-- Reglas    : I.20.1, I.20.2, I.50.4 (RN-07, RN-08, RN-10, RN-11), I.50.5.
--             EXCEPCIÓN A §3.4, no cumplimiento: la misma persona recibe,
--             muestrea y dictamina materia prima. Lo decidió el codirector
--             técnico el 2026-10-20 (D-recepcion-1): para materia prima
--             alcanza el control organoléptico; granel y producto terminado
--             siguen con CC/DT. La base no compara quién recibió con quién
--             dictamina: la excepción es deliberada y queda auditada.
-- Fecha     : 2026-10-20
-- ---------------------------------------------------------------------------
--
-- Nada de lo que ya existía se saltea: el control rápido llama a las mismas
-- funciones que el circuito largo (registrar_muestreo, emitir_rotulo,
-- dictaminar_lote_insumo), así que quedan el muestreo con su etiqueta
-- R.50.4.1, el registro R.50.5.1 numerado y el rótulo verde o rojo, todos a
-- nombre de quien lo hizo. Lo único que cambia es quién puede, y solo sobre
-- materia prima.

-- ===========================================================================
-- 1. ¿Es materia prima este lote?
-- ===========================================================================

create or replace function gmp.lote_es_materia_prima(p_lote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select i.tipo = 'MATERIA_PRIMA'
      from gmp.lotes_insumo l join gmp.insumos_catalogo i on i.id = l.insumo_id
     where l.id = p_lote_id
  ), false);
$$;

comment on function gmp.lote_es_materia_prima(uuid) is
  'Verdadero si el lote es de materia prima. Acota lo que RECEPCION puede hacer en calidad (D-recepcion-1).';

revoke execute on function gmp.lote_es_materia_prima(uuid) from public, anon;
grant execute on function gmp.lote_es_materia_prima(uuid) to authenticated;

-- ===========================================================================
-- 2. Políticas: RECEPCION donde ya estaba quien recibe o carga a stock
-- ===========================================================================

alter policy recepciones_insert_recepcion_fisica on gmp.recepciones
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION','RECEPCION'));
comment on policy recepciones_insert_recepcion_fisica on gmp.recepciones is
  'I.20.1: registra la recepción quien recibe físicamente: OP, CC, DT, GP y RECEPCION (D-recepcion-1).';

-- La carga a stock marca la recepción (comercial.cargar_recepcion_a_stock).
-- RECEPCION solo eso: trg_a_recepcion_solo_carga le cierra el resto.
alter policy recepciones_update_administracion on gmp.recepciones
  using (core.es_rol('ADMINISTRACION','GERENCIA_PRODUCCION','DIRECCION_TECNICA','RECEPCION'))
  with check (core.es_rol('ADMINISTRACION','GERENCIA_PRODUCCION','DIRECCION_TECNICA','RECEPCION'));
comment on policy recepciones_update_administracion on gmp.recepciones is
  '§4.3: la completa Administración (y GP/DT). RECEPCION solo la marca cargada a stock (D-recepcion-1).';

-- RECEPCION crea lotes recién recibidos y nada más: un lote que nace
-- APROBADO saltearía el circuito entero.
alter policy lotes_insumo_insert_recepcion_fisica on gmp.lotes_insumo
  with check (
    (estado <> 'SALDO_APERTURA'
      and core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'))
    or (estado = 'RECIBIDO' and core.es_rol('RECEPCION'))
    or (estado = 'SALDO_APERTURA'
      and core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','ADMINISTRADOR_SISTEMA'))
  );
comment on policy lotes_insumo_insert_recepcion_fisica on gmp.lotes_insumo is
  'I.20.1: OP, CC, DT y GP; RECEPCION solo en estado RECIBIDO (D-recepcion-1). SALDO_APERTURA: DT, ADM y SYS.';

-- Rotular y avanzar el estado escriben el lote. Qué transición puede cada rol
-- lo sigue diciendo gmp.fn_transicion_lote_insumo.
alter policy lotes_insumo_update_circuito on gmp.lotes_insumo
  using (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION','RECEPCION'))
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION','RECEPCION'));
comment on policy lotes_insumo_update_circuito on gmp.lotes_insumo is
  '§5.1: el circuito escribe el lote; las transiciones las acota gmp.fn_transicion_lote_insumo. RECEPCION por D-recepcion-1.';

alter policy rotulos_insert_emision on gmp.rotulos
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION','RECEPCION'));
comment on policy rotulos_insert_emision on gmp.rotulos is
  'I.20.2: emite rótulos el circuito (OP, CC, DT, GP) y RECEPCION (D-recepcion-1).';

alter policy rotulos_update_baja_vigencia on gmp.rotulos
  using (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION','RECEPCION'))
  with check (core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION','RECEPCION'));
comment on policy rotulos_update_baja_vigencia on gmp.rotulos is
  'I.20.2: solo baja de vigencia (trg_rotulo_inmutable). OP, CC, DT, GP y RECEPCION (D-recepcion-1).';

-- Dar de alta, no editar: la ficha existente sigue siendo de DT/GP/SYS.
alter policy insumos_catalogo_insert_tecnicos on gmp.insumos_catalogo
  with check (core.es_rol('DIRECCION_TECNICA','GERENCIA_PRODUCCION','ADMINISTRADOR_SISTEMA','RECEPCION'));
comment on policy insumos_catalogo_insert_tecnicos on gmp.insumos_catalogo is
  '§3.3: maestro técnico. Lo definen DT y GP y lo configura SYS; RECEPCION da de alta, no edita (D-recepcion-1).';

-- RECEPCION solo asienta la entrada de su recepción, nunca salidas ni ajustes.
alter policy movimientos_stock_insert_stock on comercial.movimientos_stock
  with check (
    core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','GERENCIA_PRODUCCION')
    or (core.es_rol('RECEPCION') and tipo = 'ENTRADA_COMPRA' and documento_tipo = 'RECEPCION')
  );
comment on policy movimientos_stock_insert_stock on comercial.movimientos_stock is
  'DT, ADM y GP; RECEPCION solo ENTRADA_COMPRA de una recepción (D-recepcion-1).';

-- comercial.articulo_de_insumo crea el artículo en la primera carga.
alter policy articulos_insert_stock on comercial.articulos
  with check (core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','GERENCIA_PRODUCCION','ADMINISTRADOR_SISTEMA','RECEPCION'));
comment on policy articulos_insert_stock on comercial.articulos is
  'Alta del artículo de stock: DT, ADM, GP, SYS y RECEPCION en la primera carga de un insumo (D-recepcion-1).';

-- Calidad: RECEPCION solo sobre materia prima.
alter policy muestreos_insert_control_calidad on gmp.muestreos
  with check (
    core.es_rol('CONTROL_CALIDAD','DIRECCION_TECNICA')
    or (core.es_rol('RECEPCION') and entidad_tipo = 'lote_insumo'
        and gmp.lote_es_materia_prima(entidad_id))
  );
comment on policy muestreos_insert_control_calidad on gmp.muestreos is
  'I.50.4: muestrea CC o DT; RECEPCION solo materia prima (D-recepcion-1).';

alter policy registros_analisis_insert_calidad on gmp.registros_analisis
  with check (
    (core.es_rol('CONTROL_CALIDAD','DIRECCION_TECNICA')
     or (core.es_rol('RECEPCION') and gmp.lote_es_materia_prima(lote_insumo_id)))
    and controlo_por = core.usuario_actual()
  );
comment on policy registros_analisis_insert_calidad on gmp.registros_analisis is
  'I.50.5: registra CC o DT a su nombre; RECEPCION solo el R.50.5.1 de materia prima (D-recepcion-1).';

-- Recepción toca una recepción ya registrada solo para marcarla cargada a
-- stock. El nombre empieza con «a» para que corra antes que los demás
-- triggers de la tabla y vea solo lo que cambió quien escribe.
create or replace function gmp.fn_recepcion_solo_carga()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if core.es_rol('RECEPCION')
     and not core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
     and (to_jsonb(new) - 'cargado_a_stock' - 'cargado_por' - 'cargado_en')
         is distinct from (to_jsonb(old) - 'cargado_a_stock' - 'cargado_por' - 'cargado_en') then
    raise exception 'Recepción solo marca la recepción como cargada a stock; el resto lo completa Administración.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_a_recepcion_solo_carga
  before update on gmp.recepciones
  for each row execute function gmp.fn_recepcion_solo_carga();

-- ===========================================================================
-- 3. Guardas por código: las mismas listas, con RECEPCION acotada a MP
-- ===========================================================================

-- Copia de 20261014170000 con RECEPCION en RECIBIDO>CUARENTENA y, solo sobre
-- materia prima, en el resto del circuito de calidad.
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

  -- D-recepcion-1: en materia prima, Recepción hace el circuito de calidad.
  if v_transicion <> 'RECIBIDO>CUARENTENA' and gmp.lote_es_materia_prima(new.id) then
    v_roles := v_roles || 'RECEPCION'::core.rol_enum;
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

-- Copia de 20261016130000 con RECEPCION sobre materia prima.
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
          or (core.es_rol('RECEPCION') and gmp.lote_es_materia_prima(new.lote_insumo_id))) then
    raise exception 'El registro de análisis lo hace Control de Calidad o Dirección Técnica (I.50.5); '
                    'Recepción, solo el de materia prima.'
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

-- Copia de 20261020130000 con RECEPCION.
create or replace function gmp.asignar_deposito_lote(p_lote_id uuid, p_deposito_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote  gmp.lotes_insumo%rowtype;
  v_filas integer;
begin
  if not core.es_rol('OPERARIO', 'CONTROL_CALIDAD', 'DIRECCION_TECNICA',
                     'GERENCIA_PRODUCCION', 'ADMINISTRACION', 'RECEPCION') then
    raise exception 'Tu rol no puede asignar depósito a un lote.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = p_lote_id for update;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;

  if v_lote.deposito_actual_id is not null then
    raise exception 'El lote % ya tiene depósito. Esto solo completa uno que falta.',
      v_lote.numero_registro_interno
      using errcode = 'check_violation';
  end if;

  if v_lote.estado not in ('RECIBIDO', 'CUARENTENA') then
    raise exception 'El lote % está %: el depósito se completa solo en material recién recibido.',
      v_lote.numero_registro_interno, v_lote.estado
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from gmp.depositos
     where id = p_deposito_id and activo
       and (estado_admitido = 'CUARENTENA' or tipo_contenido = 'INFLAMABLES')
  ) then
    raise exception 'El depósito elegido no existe, está inactivo o no es de cuarentena.'
      using errcode = 'check_violation';
  end if;

  update gmp.lotes_insumo set deposito_actual_id = p_deposito_id where id = p_lote_id;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'No se pudo asignar el depósito al lote %.', v_lote.numero_registro_interno;
  end if;
end;
$$;

-- ===========================================================================
-- 4. Control rápido de materia prima
-- ===========================================================================
--
-- Lo que la planta mira en una materia prima al recibirla (D-recepcion-1):
-- contenedor en condiciones, rótulo, protocolo, aspecto y olor. Con eso se
-- arma el muestreo (un tubo de ensayo a contramuestra, RN-08/RN-11), el
-- registro R.50.5.1 y el veredicto, en una transacción: si algo falla no
-- queda nada a medias.
--
-- Invocador, no SECURITY DEFINER: cada paso pasa por las mismas políticas y
-- guardas que el circuito largo, y queda a nombre de quien lo hizo.
--
-- Aprobar exige aspecto y olor conformes; con cualquiera en «no» solo se
-- puede rechazar. Si el contenedor, el rótulo o el protocolo no están bien no
-- se muestrea (RN-10): eso no es un rechazo, es una no conformidad (PG.60.18).
--
-- «Contenedor íntegro y limpio» es una sola pregunta en pantalla que nombra
-- las dos verificaciones de RN-10; quien contesta «sí» afirma las dos.
create or replace function gmp.control_rapido_materia_prima(
  p_lote_id              uuid,
  p_contenedor_ok        boolean,
  p_rotulo_ok            boolean,
  p_coincide_protocolo   boolean,
  p_aspecto_ok           boolean,
  p_olor_ok              boolean,
  p_aprobado             boolean,
  p_contenedores         integer,
  p_observacion          text default null
)
returns gmp.registros_analisis
language plpgsql
set search_path = ''
as $$
declare
  v_lote     gmp.lotes_insumo%rowtype;
  v_insumo   gmp.insumos_catalogo%rowtype;
  v_obs      text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_si_no    text[] := array['no', 'sí'];
  v_detalle  text;
begin
  select * into v_lote from gmp.lotes_insumo where id = p_lote_id;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;
  select * into v_insumo from gmp.insumos_catalogo where id = v_lote.insumo_id;

  if v_insumo.tipo <> 'MATERIA_PRIMA' then
    raise exception 'El control rápido es solo para materia prima. «%» lleva el circuito completo de calidad.',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  if p_contenedor_ok is null or p_rotulo_ok is null or p_aspecto_ok is null
     or p_olor_ok is null or p_aprobado is null or p_contenedores is null
     or (v_insumo.requiere_protocolo and p_coincide_protocolo is null) then
    raise exception 'Falta contestar alguna verificación del control.'
      using errcode = 'check_violation';
  end if;

  if p_aprobado and not (p_aspecto_ok and p_olor_ok) then
    raise exception 'Con aspecto u olor no conformes no se aprueba: el lote se rechaza.'
      using errcode = 'check_violation';
  end if;

  -- Recién recibido y sin rotular: primero entra a cuarentena (I.20.2).
  if v_lote.estado = 'RECIBIDO' then
    perform gmp.emitir_rotulo_lote_insumo(p_lote_id, 'CUARENTENA'::gmp.estado_calidad_enum);
  end if;

  perform gmp.registrar_muestreo(
    p_lote_id                   => p_lote_id,
    p_cantidad_tomada           => 1,
    p_unidad                    => 'tubo de ensayo',
    p_area_muestreo             => 'Recepción',
    p_contenedor_integro        => p_contenedor_ok,
    p_contenedor_limpio         => p_contenedor_ok,
    p_rotulado_correcto         => p_rotulo_ok,
    p_cantidad_contenedores     => p_contenedores,
    p_destino_sobrante          => 'CONTRAMUESTRA'::gmp.destino_muestra_enum,
    p_lote_coincide_certificado => case when v_insumo.requiere_protocolo then p_coincide_protocolo end,
    p_signos_no_conformidad     => case when not (p_aspecto_ok and p_olor_ok) then v_obs end
  );

  perform gmp.emitir_rotulo_lote_insumo(p_lote_id, 'EN_ANALISIS'::gmp.estado_calidad_enum);

  v_detalle := format(
    'Control organoléptico en recepción (D-recepcion-1). Aspecto transparente: %s. Olor característico: %s.%s',
    v_si_no[p_aspecto_ok::int + 1], v_si_no[p_olor_ok::int + 1],
    case when v_insumo.requiere_protocolo
         then format(' Coincide con el protocolo: %s.', v_si_no[coalesce(p_coincide_protocolo, false)::int + 1])
         else '' end
  );

  return gmp.dictaminar_lote_insumo(
    p_lote_id,
    'Un tubo de ensayo',
    v_detalle,
    coalesce(v_obs, case when p_aprobado then 'Cumple.' else 'No cumple.' end),
    p_aprobado
  );
end;
$$;

comment on function gmp.control_rapido_materia_prima(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, text) is
  'Muestreo + análisis organoléptico + veredicto de un lote de materia prima en una transacción, por las mismas '
  'funciones que el circuito completo (I.50.4, I.50.5, D-recepcion-1).';

revoke execute on function gmp.control_rapido_materia_prima(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, text)
  from public, anon;
grant execute on function gmp.control_rapido_materia_prima(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, text)
  to authenticated;

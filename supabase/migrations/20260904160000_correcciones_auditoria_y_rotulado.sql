-- ---------------------------------------------------------------------------
-- Propósito : Dos correcciones detectadas al verificar el circuito completo
--             contra la base.
--             1. `core.auditoria.db_role` guardaba «postgres» en toda escritura,
--                porque el trigger es SECURITY DEFINER y `current_user` dentro
--                de él es el dueño de la función. La columna de detección de
--                CLAUDE.md §5 quedaba inservible: todo parecía privilegiado.
--             2. `gmp.emitir_rotulo_lote_insumo` emitía un rótulo también para
--                MUESTREADO, un estado que I.20.2 no rotula. Quedaba un
--                R.20.2.1 con color «SIN_ROTULO» y, peor, el material perdía su
--                rótulo amarillo de cuarentena, que según I.20.2 tiene que
--                seguir puesto hasta que empiece el análisis.
-- Reglas    : RN-04, RN-05, RN-50. CLAUDE.md §5.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

-- 1. Rol de base efectivo ---------------------------------------------------
--
-- El trigger tiene que ser SECURITY DEFINER: es la única forma de que escriba
-- en una tabla append-only donde nadie más tiene INSERT. Pero eso le tapa la
-- vista de quién pidió la escritura.
--
-- El rol pedido está en dos lugares que sobreviven al cambio de contexto:
--   - el claim `role` del JWT, que es lo que PostgREST usa para su SET ROLE, y
--     que en una clave de servicio dice literalmente `service_role`;
--   - el GUC `role`, para conexiones que hicieron SET ROLE sin JWT.
-- Si no hay ninguno de los dos, la escritura vino de una conexión directa y
-- `current_user` es la respuesta correcta.

create or replace function core.fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes    jsonb;
  v_despues  jsonb;
  v_registro uuid;
  v_headers  jsonb;
  v_claims   jsonb;
  v_rol      text;
begin
  if tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
  elsif tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
  else
    v_despues := to_jsonb(new);
  end if;

  v_registro := nullif(coalesce(v_despues, v_antes) ->> 'id', '')::uuid;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;

  v_rol := coalesce(
    v_claims ->> 'role',
    nullif(current_setting('role', true), 'none'),
    current_user
  );

  insert into core.auditoria (
    esquema, tabla, registro_id, operacion,
    datos_antes, datos_despues,
    usuario_id, auth_uid, db_role, ip, user_agent
  )
  values (
    tg_table_schema,
    tg_table_name,
    v_registro,
    case when tg_op = 'DELETE' then 'DELETE_INTENTO' else tg_op end,
    v_antes,
    v_despues,
    core.usuario_actual(),
    auth.uid(),
    v_rol,
    nullif(v_headers ->> 'x-forwarded-for', '')::inet,
    v_headers ->> 'user-agent'
  );

  -- El borrado se rechaza siempre. Ver la nota del COMMENT sobre qué pasa con
  -- el asiento del intento cuando la excepción aborta la transacción.
  if tg_op = 'DELETE' then
    raise exception
      'Prohibido borrar filas de %.%. La corrección se hace con un registro rectificativo (CLAUDE.md §3, invariantes 1 y 9).',
      tg_table_schema, tg_table_name
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then null else new end;
end;
$$;

comment on column core.auditoria.db_role is
  'Rol de base que pidió la escritura, tomado del claim `role` del JWT y no de current_user, '
  'que dentro del trigger SECURITY DEFINER siempre sería el dueño de la función. '
  'Un valor distinto de `authenticated` es una anomalía a justificar (CLAUDE.md §5).';

-- 2. Rotulado solo en los estados que I.20.2 rotula --------------------------
--
-- I.20.2 define cuatro estados de rótulo: cuarentena, en análisis, aprobado y
-- rechazado. RECIBIDO y MUESTREADO son estados internos del circuito (§5.1) y
-- no tienen cartel propio. Durante el muestreo el material sigue en cuarentena
-- y conserva su rótulo amarillo: es lo que un inspector espera ver en el tambor.

create or replace function gmp.emitir_rotulo_lote_insumo(
  p_lote_id uuid,
  p_estado  gmp.estado_calidad_enum
)
returns gmp.rotulos
language plpgsql
set search_path = ''
as $$
declare
  v_lote      gmp.lotes_insumo%rowtype;
  v_insumo    gmp.insumos_catalogo%rowtype;
  v_proveedor gmp.proveedores%rowtype;
  v_rotulo    gmp.rotulos%rowtype;
  v_deposito  uuid;
  v_rotula    boolean;
begin
  select * into v_lote from gmp.lotes_insumo where id = p_lote_id for update;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;

  select * into v_insumo from gmp.insumos_catalogo where id = v_lote.insumo_id;
  select p.* into v_proveedor
    from gmp.proveedores p
    join gmp.recepciones r on r.proveedor_id = p.id
   where r.id = v_lote.recepcion_id;

  v_rotula := gmp.color_rotulo(p_estado) <> 'SIN_ROTULO';

  -- Precondiciones de RECIBIDO → CUARENTENA (§5.1).
  if p_estado = 'CUARENTENA' then
    if not v_lote.contenedores_limpiados then
      raise exception
        'I.20.1: los contenedores deben limpiarse antes de ingresar el material a cuarentena.'
        using errcode = 'check_violation';
    end if;
    if v_insumo.requiere_protocolo and coalesce(v_lote.protocolo_recibido, false) = false then
      raise exception 'RN-01: falta el protocolo de análisis del fabricante.'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_rotula then
    -- El rótulo anterior se da de baja antes de emitir el nuevo: el índice
    -- parcial `rotulos_uno_vigente_por_entidad` no admite dos vigentes.
    update gmp.rotulos
       set vigente = false
     where entidad_tipo = 'lote_insumo'
       and entidad_id = p_lote_id
       and vigente;

    insert into gmp.rotulos (
      tipo_registro, version_formato, entidad_tipo, entidad_id, estado, contenido
    )
    values (
      'R.20.2.1', '01', 'lote_insumo', p_lote_id, p_estado,
      jsonb_build_object(
        'nombre',         v_insumo.nombre,
        'lote_proveedor', v_lote.lote_proveedor,
        'proveedor',      v_proveedor.razon_social,
        'numero_interno', v_lote.numero_registro_interno,
        'codigo_interno', v_insumo.codigo_interno,
        'plazo_validez',  v_lote.plazo_validez,
        'estatus',        p_estado::text
      )
    )
    returning * into v_rotulo;

    update gmp.rotulos
       set reemplazado_por = v_rotulo.id
     where entidad_tipo = 'lote_insumo'
       and entidad_id = p_lote_id
       and not vigente
       and reemplazado_por is null;
  else
    -- Sin rótulo nuevo: se devuelve el vigente, que sigue siendo el correcto.
    select * into v_rotulo
      from gmp.rotulos
     where entidad_tipo = 'lote_insumo'
       and entidad_id = p_lote_id
       and vigente;
  end if;

  -- Destino físico según el estado alcanzado (I.20.1, I.40.16).
  if p_estado = 'CUARENTENA' then
    v_deposito := coalesce(v_lote.deposito_actual_id, v_insumo.deposito_cuarentena_id);
  elsif p_estado = 'APROBADO' then
    v_deposito := coalesce(v_insumo.deposito_aprobado_id, v_lote.deposito_actual_id);
  else
    v_deposito := v_lote.deposito_actual_id;
  end if;

  update gmp.lotes_insumo
     set estado = p_estado,
         deposito_actual_id = v_deposito
   where id = p_lote_id;

  return v_rotulo;
end;
$$;

comment on function gmp.emitir_rotulo_lote_insumo(uuid, gmp.estado_calidad_enum) is
  'Avanza el estado del lote y, si el estado alcanzado lleva rótulo según I.20.2, lo emite en la misma transacción. '
  'MUESTREADO no rotula: el material sigue en cuarentena y conserva su rótulo amarillo.';

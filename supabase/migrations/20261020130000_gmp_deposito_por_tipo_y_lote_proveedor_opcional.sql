-- ---------------------------------------------------------------------------
-- Propósito : 1) Todo lote recibido nace con depósito: el que diga la ficha
--                del insumo o, si no dice, el de cuarentena de su tipo.
--             2) Asignar depósito a un lote que quedó sin él, desde «Cargar a
--                stock», sin dar a Administración permiso de UPDATE sobre lotes.
--             3) El lote del proveedor pasa a ser optativo cuando la
--                recepción tiene remito: el remito sostiene la trazabilidad.
-- Reglas    : RN-48 (inflamable al exterior, se conserva y precede), I.20.2
--             (el material entra a cuarentena). El punto 3 cambia lo que pedía
--             el alcance (lote_proveedor NOT NULL, R.20.2.1): pedido del
--             usuario 2026-10-20, a validar por DT en
--             D-unidad-solo-materia-prima-2.
-- Fecha     : 2026-10-20
-- ---------------------------------------------------------------------------
--
-- Antes, un lote sin depósito explícito solo lo recibía si era inflamable. Un
-- insumo dado de alta sin «depósito de cuarentena» en la ficha dejaba sus
-- lotes sin depósito, y comercial.cargar_recepcion_a_stock los rechazaba con
-- razón: sin destino no hay existencia. El arreglo es que no nazcan así.

-- ===========================================================================
-- 1. Depósito por defecto de un insumo
-- ===========================================================================
--
-- Precedencia: RN-48 primero (el inflamable va al exterior aunque la ficha
-- diga otra cosa: la ficha no puede dejar un solvente adentro), después la
-- ficha, después la cuarentena de su tipo. Los números son los de la semilla
-- de 20260904140200; si alguno se desactiva, devuelve NULL y la carga a stock
-- lo hace notar en vez de inventar un destino.

create or replace function gmp.deposito_por_defecto(p_insumo_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select d.id from gmp.depositos d
      where i.es_inflamable and d.tipo_contenido = 'INFLAMABLES' and d.es_exterior and d.activo
      limit 1),
    i.deposito_cuarentena_id,
    (select d.id from gmp.depositos d
      where d.activo
        and d.numero = case i.tipo
                         when 'MATERIA_PRIMA' then '04'
                         when 'SEMIELABORADO' then 'GRA-CUA'
                         else '01'  -- envase, empaque, etiqueta
                       end)
  )
  from gmp.insumos_catalogo i
  where i.id = p_insumo_id;
$$;

comment on function gmp.deposito_por_defecto(uuid) is
  'Depósito donde entra un lote nuevo del insumo: inflamables al exterior (RN-48), si no el de cuarentena de la '
  'ficha, si no la cuarentena de su tipo (04 materia prima, GRA-CUA semielaborado, 01 envase/empaque/etiqueta).';

revoke execute on function gmp.deposito_por_defecto(uuid) from public, anon;
grant execute on function gmp.deposito_por_defecto(uuid) to authenticated;

-- ===========================================================================
-- 2. gmp.fn_validar_lote_insumo: el lote nace con depósito
-- ===========================================================================
--
-- Copia de la versión de 20260916130000 con dos cambios: el bloque de RN-48
-- pasa a gmp.deposito_por_defecto() (que lo conserva como primera opción), y
-- un lote sin lote del proveedor exige que la recepción tenga remito.

create or replace function gmp.fn_validar_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_insumo gmp.insumos_catalogo%rowtype;
begin
  select * into v_insumo from gmp.insumos_catalogo where id = new.insumo_id;

  if not found then
    raise exception 'El insumo % no existe en el catálogo.', new.insumo_id;
  end if;

  if new.estado = 'SALDO_APERTURA' then
    new.cantidad_bultos := coalesce(new.cantidad_bultos, 1);

    if new.deposito_actual_id is null then
      select id into new.deposito_actual_id from gmp.depositos where numero = 'APE';
    end if;

    return new;
  end if;

  -- La unidad del catálogo está pendiente de confirmación: las cantidades del
  -- lote no serían verificables contra nada.
  if v_insumo.unidad_medida is null then
    raise exception
      '«%» no tiene unidad de medida confirmada en el catálogo. No se puede recepcionar hasta que la planta la defina.',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-01: una materia prima no se recepciona sin protocolo de análisis.
  if v_insumo.requiere_protocolo and coalesce(new.protocolo_recibido, false) = false then
    raise exception
      'RN-01: «%» exige protocolo de análisis del fabricante para ser recepcionado (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-03: los pigmentos se pesan antes de continuar el proceso.
  if v_insumo.requiere_pesada_recepcion and new.peso_pigmento_kg is null then
    raise exception
      'RN-03: «%» se pesa durante la recepción; falta el peso en kg (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- Sin lote del proveedor, la trazabilidad hacia atrás la sostiene el remito
  -- (D-unidad-solo-materia-prima-2). Sin ninguno de los dos no queda nada.
  if new.lote_proveedor is null and not exists (
    select 1 from gmp.recepciones r
     where r.id = new.recepcion_id and r.numero_remito is not null
  ) then
    raise exception
      'Falta el lote del proveedor de «%». Solo se puede omitir si la recepción tiene número de remito.',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-48 y cuarentena por tipo: el lote no nace sin destino.
  if new.deposito_actual_id is null then
    new.deposito_actual_id := gmp.deposito_por_defecto(new.insumo_id);
  end if;

  return new;
end;
$$;

comment on function gmp.fn_validar_lote_insumo() is
  'RN-01, RN-03, RN-48, la precondición de unidad confirmada, el depósito por defecto y lote del proveedor o remito, '
  'salvo para estado SALDO_APERTURA: un lote migrado no pasa por I.20.1 (docs/ESPEC_SALDO_INICIAL.md §2).';

-- ===========================================================================
-- 3. Asignar depósito a un lote que no lo tiene
-- ===========================================================================
--
-- Para los lotes que ya nacieron sin depósito antes de esta migración. Solo
-- completa un hueco: mover un lote de un depósito a otro es otro acto y no
-- pasa por acá. SECURITY DEFINER porque la carga a stock la hace también
-- Administración, que no tiene UPDATE sobre gmp.lotes_insumo y no debe
-- tenerlo; el rol se controla adentro. La auditoría registra la escritura con
-- el usuario de la sesión.

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
                     'GERENCIA_PRODUCCION', 'ADMINISTRACION') then
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

  -- Solo material que todavía no salió de cuarentena: un lote aprobado o
  -- rechazado ya pasó por su segregación y no se «completa», se mueve.
  if v_lote.estado not in ('RECIBIDO', 'CUARENTENA') then
    raise exception 'El lote % está %: el depósito se completa solo en material recién recibido.',
      v_lote.numero_registro_interno, v_lote.estado
      using errcode = 'check_violation';
  end if;

  -- I.20.2: entra a cuarentena. El exterior de inflamables no fija estado.
  if not exists (
    select 1 from gmp.depositos
     where id = p_deposito_id and activo
       and (estado_admitido = 'CUARENTENA' or tipo_contenido = 'INFLAMABLES')
  ) then
    raise exception 'El depósito elegido no existe, está inactivo o no es de cuarentena.'
      using errcode = 'check_violation';
  end if;

  update gmp.lotes_insumo set deposito_actual_id = p_deposito_id where id = p_lote_id;
  -- Bajo FORCE RLS un UPDATE filtrado no falla, toca cero filas: que se note.
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'No se pudo asignar el depósito al lote %.', v_lote.numero_registro_interno;
  end if;
end;
$$;

comment on function gmp.asignar_deposito_lote(uuid, uuid) is
  'Completa el depósito de un lote que no lo tiene (lotes recibidos antes de 20261020130000). No mueve lotes.';

revoke execute on function gmp.asignar_deposito_lote(uuid, uuid) from public, anon;
grant execute on function gmp.asignar_deposito_lote(uuid, uuid) to authenticated;

-- ===========================================================================
-- 4. Lote del proveedor optativo
-- ===========================================================================
--
-- El CHECK de 20260904140300 (length(btrim(lote_proveedor)) > 0) se conserva:
-- un NULL lo pasa y un texto vacío no. Vacío no es «sin lote», es ruido.

alter table gmp.lotes_insumo alter column lote_proveedor drop not null;

comment on column gmp.lotes_insumo.lote_proveedor is
  'Lote del fabricante como figura en el envase. NULL solo si la recepción tiene remito '
  '(gmp.fn_validar_lote_insumo, D-unidad-solo-materia-prima-2).';

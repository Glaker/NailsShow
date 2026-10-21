-- ---------------------------------------------------------------------------
-- Propósito : Volver a aplicar 20261020120000 (capacidad del envase) y
--             20261020130000 (depósito por tipo, lote del proveedor optativo
--             con remito). En la base real esas dos versiones figuran como
--             aplicadas en supabase_migrations.schema_migrations pero sus
--             cambios no están: no existen insumos_catalogo.capacidad ni
--             gmp.deposito_por_defecto, y lote_proveedor sigue NOT NULL
--             (verificado con supabase gen types el 2026-10-21). Una
--             migración registrada no se vuelve a correr ni se edita (GAMP 5),
--             así que la corrección es esta, idempotente.
-- Reglas    : Las de las dos originales: RN-48, I.20.2,
--             D-unidad-solo-materia-prima-1 y -2.
-- Fecha     : 2026-10-21
-- ---------------------------------------------------------------------------
--
-- Idempotente: donde las originales sí corrieron (PGlite, una base nueva) no
-- cambia nada. No toca gmp.asignar_deposito_lote: su versión vigente es la de
-- 20261020140100 (con RECEPCION), que sí está aplicada.

-- ===========================================================================
-- 1. 20261020120000: capacidad del envase
-- ===========================================================================

alter table gmp.insumos_catalogo
  add column if not exists capacidad        numeric(12,3) check (capacidad > 0),
  add column if not exists unidad_capacidad text check (unidad_capacidad in ('g', 'mL'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'insumos_catalogo_capacidad_con_unidad') then
    alter table gmp.insumos_catalogo add constraint insumos_catalogo_capacidad_con_unidad
      check ((capacidad is null) = (unidad_capacidad is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'insumos_catalogo_capacidad_solo_envase') then
    alter table gmp.insumos_catalogo add constraint insumos_catalogo_capacidad_solo_envase
      check (capacidad is null or tipo = 'MATERIAL_ENVASE');
  end if;
end;
$$;

comment on column gmp.insumos_catalogo.capacidad is
  'Capacidad del envase, en unidad_capacidad. Solo en MATERIAL_ENVASE.';
comment on column gmp.insumos_catalogo.unidad_capacidad is
  'g o mL, las mismas que gmp.productos.unidad_contenido.';

-- ===========================================================================
-- 2. 20261020130000: depósito por defecto y lote del proveedor optativo
-- ===========================================================================

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

alter table gmp.lotes_insumo alter column lote_proveedor drop not null;

comment on column gmp.lotes_insumo.lote_proveedor is
  'Lote del fabricante como figura en el envase. NULL solo si la recepción tiene remito '
  '(gmp.fn_validar_lote_insumo, D-unidad-solo-materia-prima-2).';

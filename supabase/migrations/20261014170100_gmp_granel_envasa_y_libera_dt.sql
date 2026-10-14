-- ---------------------------------------------------------------------------
-- Propósito : Corrige 20261014170000 según el pedido del mismo día: Gerencia
--             de Producción envasa sin esperar el análisis del granel; el
--             análisis le queda pendiente a Dirección Técnica, y lo que
--             bloquea es la liberación del producto terminado.
--               1. fn_op_etapa sin la exigencia de granel aprobado para
--                  fraccionar.
--               2. liberar_orden exige el granel aprobado (R.50.10.1) además
--                  del producto terminado.
--               3. v_analisis_pendientes: lo que DT tiene que analizar.
-- Reglas    : I.50.10, I.50.7, §4.7. Pedido del codirector técnico,
--             2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------

-- 1. Etapas: la de 20261014170000 sin el bloqueo del fraccionamiento.
create or replace function gmp.fn_op_etapa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado   gmp.estado_orden_enum;
  v_cc       boolean := new.etapa in ('CC_GRANEL', 'CC_PT');
  v_dictamen boolean;
begin
  select estado into v_estado from gmp.ordenes_produccion where id = new.orden_id;
  if (new.etapa = 'REVISION' and v_estado not in ('ABIERTA', 'TERMINADA'))
     or (new.etapa <> 'REVISION' and v_estado <> 'ABIERTA') then
    raise exception 'La orden está %: esa etapa ya no se registra.', lower(v_estado::text) using errcode = 'check_violation';
  end if;
  if v_cc and not core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') then
    raise exception 'El control de calidad lo registra Control de Calidad o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.etapa = 'REVISION' and not core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD') then
    raise exception 'La revisión del batch record es de Dirección Técnica o Control de Calidad.'
      using errcode = 'insufficient_privilege';
  end if;

  -- I.50.10: el control del granel se registra con su R.50.10.1 y lleva su
  -- dictamen. «No aplica» (granel tercerizado) no lleva.
  if new.etapa = 'CC_GRANEL' and not coalesce((new.datos ->> 'no_aplica')::boolean, false) then
    v_dictamen := gmp.analisis_vigente(null, new.orden_id);
    if v_dictamen is null then
      raise exception 'El control del granel se registra con su registro de análisis R.50.10.1.'
        using errcode = 'check_violation';
    end if;
    if (new.datos ->> 'aprobado')::boolean is distinct from v_dictamen then
      raise exception 'El dictamen del granel tiene que ser el de su registro R.50.10.1.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.controlo_por is not null then
      raise exception 'Una etapa se registra primero y se controla después.' using errcode = 'check_violation';
    end if;
    new.realizo_por := core.usuario_actual();
    new.realizo_en := now();
    return new;
  end if;

  if old.controlo_por is not null then
    raise exception 'La etapa % ya está controlada: no se modifica.', lower(old.etapa::text)
      using errcode = 'restrict_violation';
  end if;
  if new.realizo_por is distinct from old.realizo_por or new.realizo_en is distinct from old.realizo_en
     or new.etapa is distinct from old.etapa or new.orden_id is distinct from old.orden_id then
    raise exception 'Quién realizó la etapa y cuándo no cambian.' using errcode = 'restrict_violation';
  end if;
  if new.controlo_por is not null then
    new.controlo_por := core.usuario_actual();
    new.controlo_en := now();
    if new.datos is distinct from old.datos or new.observaciones is distinct from old.observaciones then
      raise exception 'Al controlar no se cambian los datos: corregí primero y controlá después.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- 2. Liberación: la de 20260930110000 más el granel aprobado.
create or replace function gmp.liberar_orden(p_id uuid, p_aprobado boolean, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_falta text;
begin
  if not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'Libera o rechaza el lote Dirección Técnica.' using errcode = 'insufficient_privilege';
  end if;
  if p_aprobado then
    select string_agg(lower(etapa::text) || ' ' || falta, ', ') into v_falta from gmp.faltantes_liberacion(p_id);
    if v_falta is not null then
      raise exception 'Todavía no se puede liberar: %.', v_falta using errcode = 'check_violation';
    end if;
    if exists (select 1 from gmp.op_etapas where orden_id = p_id and etapa = 'CC_GRANEL'
                and not coalesce((datos ->> 'no_aplica')::boolean, false)
                and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
      raise exception 'El granel no está aprobado en su registro R.50.10.1: el lote no se libera.'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from gmp.op_etapas where orden_id = p_id and etapa = 'CC_PT'
                and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
      raise exception 'El control de calidad del producto terminado no está aprobado.' using errcode = 'check_violation';
    end if;
  end if;
  update gmp.ordenes_produccion
     set estado = case when p_aprobado then 'LIBERADA' else 'RECHAZADA' end::gmp.estado_orden_enum,
         liberada_por = core.usuario_actual(), liberada_en = now(),
         motivo_cierre = nullif(btrim(p_motivo), '')
   where id = p_id;
  if not found then
    raise exception 'La orden no existe.';
  end if;
end;
$$;

-- 3. Pendientes de Dirección Técnica: lotes de insumo o semielaborado en
-- análisis sin dictamen, y graneles ya elaborados sin su R.50.10.1.
create view gmp.v_analisis_pendientes
with (security_invoker = true) as
select 'LOTE'::text as tipo,
       case when i.tipo = 'SEMIELABORADO' then 'R.50.6.1' else 'R.50.5.1' end as registro,
       l.id as lote_insumo_id, null::uuid as orden_id,
       i.nombre as descripcion, l.numero_registro_interno as referencia,
       l.creado_en as desde
  from gmp.lotes_insumo l
  join gmp.insumos_catalogo i on i.id = l.insumo_id
 where l.estado = 'EN_ANALISIS'
union all
select 'GRANEL', 'R.50.10.1', null, o.id, p.nombre, o.numero || ' · lote ' || o.numero_lote, e.realizo_en
  from gmp.ordenes_produccion o
  join gmp.productos p on p.id = o.producto_id
  join gmp.op_etapas e on e.orden_id = o.id and e.etapa = 'ELABORACION'
 where o.estado in ('ABIERTA', 'TERMINADA')
   and not exists (
     select 1 from gmp.op_etapas g
      where g.orden_id = o.id and g.etapa = 'CC_GRANEL'
   );

comment on view gmp.v_analisis_pendientes is
  'Lo que espera análisis de Calidad/DT: lotes EN_ANALISIS (R.50.5.1 o R.50.6.1) y graneles elaborados sin '
  'R.50.10.1. El envasado no espera; la liberación sí.';

grant select on gmp.v_analisis_pendientes to authenticated;

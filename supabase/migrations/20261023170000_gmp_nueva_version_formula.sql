-- ---------------------------------------------------------------------------
-- Propósito : Editar una fórmula vigente = emitir la versión siguiente. Un
--             botón crea el borrador con lo mismo (componentes, densidad,
--             procedimiento) para corregirlo, y al dejarlo vigente la versión
--             anterior pasa sola a DADO_DE_BAJA (no se borra ni se pisa).
-- Reglas    : PG.60.8 (control de cambios de la fórmula maestra), invariante 1,
--             RN-50. Pedido del codirector técnico del 2026-10-23
--             (D-nuevo-producto-3).
-- Fecha     : 2026-10-23
-- ---------------------------------------------------------------------------

create or replace function gmp.nueva_version_formula(p_formula_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_f       gmp.formulas_fabricacion%rowtype;
  v_version integer;
  v_id      uuid;
  v_texto   text;
  v_pv      integer;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Una versión nueva de la fórmula la emite Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_f from gmp.formulas_fabricacion where id = p_formula_id;
  if not found then
    raise exception 'La fórmula no existe.' using errcode = 'check_violation';
  end if;

  -- Si ya hay una en borrador de ese producto y variedad, se sigue esa.
  select id into v_id from gmp.formulas_fabricacion
   where producto_id = v_f.producto_id and variedad is not distinct from v_f.variedad and estado = 'BORRADOR'
   order by creado_en desc limit 1;
  if v_id is not null then
    return v_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('formula|' || v_f.producto_id::text, 0));
  select coalesce(max(version::integer), 0) + 1 into v_version
    from gmp.formulas_fabricacion
   where producto_id = v_f.producto_id and variedad is not distinct from v_f.variedad and version ~ '^[0-9]+$';

  insert into gmp.formulas_fabricacion
    (producto_id, variedad, especificacion_id, codigo_me, version, densidad_producto, densidad_temp_c, rendimiento)
  values
    (v_f.producto_id, v_f.variedad, v_f.especificacion_id, v_f.codigo_me, v_version::text,
     v_f.densidad_producto, v_f.densidad_temp_c, v_f.rendimiento)
  returning id into v_id;

  insert into gmp.formula_componentes
    (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
     etapa, observacion)
  select v_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
         etapa, observacion
    from gmp.formula_componentes
   where formula_id = p_formula_id and not anulado;

  -- El procedimiento que rige, como primera versión del de la fórmula nueva.
  select texto, version into v_texto, v_pv from gmp.v_procedimiento_vigente where formula_id = p_formula_id;
  if v_texto is not null then
    insert into gmp.formula_procedimientos (formula_id, version, texto, motivo_cambio)
    values (v_id, 0, v_texto, format('Viene de la versión %s de la fórmula (procedimiento v%s)', v_f.version, v_pv));
  end if;
  return v_id;
end;
$$;

comment on function gmp.nueva_version_formula(uuid) is
  'Editar una fórmula vigente: crea la versión siguiente en borrador con lo mismo, para corregirla. Si ya hay un '
  'borrador de ese producto y variedad, devuelve ese (D-nuevo-producto-3).';
revoke execute on function gmp.nueva_version_formula(uuid) from public, anon;
grant execute on function gmp.nueva_version_formula(uuid) to authenticated;

-- Copia de 20260921090000 con el reemplazo: al pasar una a VIGENTE, la que
-- regía para ese producto y variedad se da de baja con su fecha de fin.
create or replace function gmp.fn_formula_aprobacion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if new.estado = 'VIGENTE' and old.estado is distinct from 'VIGENTE' then
    if not core.es_rol('DIRECCION_TECNICA') then
      raise exception
        'Solo Dirección Técnica pasa una fórmula a vigente (§3.3).'
        using errcode = 'insufficient_privilege';
    end if;
    new.aprobada_por := core.usuario_actual();
    new.aprobada_en  := now();
    new.vigencia_desde := coalesce(new.vigencia_desde, v_hoy);
    -- D-nuevo-producto-3: la anterior queda dada de baja, no borrada.
    update gmp.formulas_fabricacion
       set estado = 'DADO_DE_BAJA', vigencia_hasta = v_hoy
     where producto_id = new.producto_id and variedad is not distinct from new.variedad
       and estado = 'VIGENTE' and id <> new.id;
  end if;

  return new;
end;
$$;

comment on function gmp.fn_formula_aprobacion is
  'Completa aprobada_por/aprobada_en al pasar una fórmula a VIGENTE y da de baja la que regía para ese producto y '
  'variedad (D-nuevo-producto-3). Quién y cuándo los pone la base (CLAUDE.md §6).';

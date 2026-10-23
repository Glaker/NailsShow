-- ---------------------------------------------------------------------------
-- Propósito : Pegar en una fórmula en borrador los componentes de otra (de
--             otro producto, típicamente vigente) y traer su procedimiento.
--             Pasa que dos productos llevan la misma fórmula: se copia y se
--             ajusta, sin volver a cargarla a mano.
-- Reglas    : PG.60.8. Lo pegado sigue en borrador: la deja vigente DT, y el
--             procedimiento que trae GP espera su aprobación (D-nuevo-producto-1).
--             Pedido del codirector técnico del 2026-10-23 (D-nuevo-producto-2).
-- Fecha     : 2026-10-23
-- ---------------------------------------------------------------------------

create or replace function gmp.copiar_componentes(p_origen uuid, p_destino uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_desde integer;
  v_n     integer;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Copiar una fórmula es de Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_origen = p_destino then
    raise exception 'Elegí otra fórmula: es la misma.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from gmp.formulas_fabricacion where id = p_destino and estado = 'BORRADOR') then
    raise exception 'Solo se pega en una fórmula en borrador.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from gmp.formula_componentes where formula_id = p_destino and es_csp and not anulado)
     and exists (select 1 from gmp.formula_componentes where formula_id = p_origen and es_csp and not anulado) then
    raise exception 'Las dos fórmulas tienen componente csp y solo puede haber uno: quitá el de esta antes de pegar.'
      using errcode = 'check_violation';
  end if;

  -- Se agregan al final, en el orden de la original.
  select coalesce(max(orden), 0) into v_desde from gmp.formula_componentes where formula_id = p_destino;
  insert into gmp.formula_componentes
    (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
     etapa, observacion)
  select p_destino, v_desde + row_number() over (order by orden), insumo_id, nombre_libre, porcentaje_pp,
         es_csp, se_mide_a_volumen, densidad_id, etapa, observacion
    from gmp.formula_componentes
   where formula_id = p_origen and not anulado;
  get diagnostics v_n = row_count;

  -- La densidad medida, si esta no tiene.
  update gmp.formulas_fabricacion d
     set densidad_producto = o.densidad_producto, densidad_temp_c = o.densidad_temp_c
    from gmp.formulas_fabricacion o
   where d.id = p_destino and o.id = p_origen and d.densidad_producto is null and o.densidad_producto is not null;
  return v_n;
end;
$$;

-- El procedimiento que rige en la otra fórmula, como versión nueva de esta.
create or replace function gmp.copiar_procedimiento(p_origen uuid, p_destino uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_texto   text;
  v_version integer;
  v_nombre  text;
  v_id      uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Copiar un procedimiento es de Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select v.texto, v.version, p.nombre into v_texto, v_version, v_nombre
    from gmp.v_procedimiento_vigente v
    join gmp.formulas_fabricacion f on f.id = v.formula_id
    join gmp.productos p on p.id = f.producto_id
   where v.formula_id = p_origen;
  if v_texto is null then
    raise exception 'Esa fórmula no tiene procedimiento vigente para copiar.' using errcode = 'check_violation';
  end if;
  -- La versión la pone la base; el motivo dice de dónde salió.
  insert into gmp.formula_procedimientos (formula_id, version, texto, motivo_cambio)
  values (p_destino, 0, v_texto, format('Copiado del procedimiento de %s (v%s)', v_nombre, v_version))
  returning id into v_id;
  return v_id;
end;
$$;

comment on function gmp.copiar_componentes(uuid, uuid) is
  'Pega en una fórmula en borrador los componentes de otra, al final (D-nuevo-producto-2).';
comment on function gmp.copiar_procedimiento(uuid, uuid) is
  'Trae el procedimiento vigente de otra fórmula como versión nueva; si lo trae GP, espera a DT (D-nuevo-producto-2).';
revoke execute on function gmp.copiar_componentes(uuid, uuid), gmp.copiar_procedimiento(uuid, uuid)
  from public, anon;
grant execute on function gmp.copiar_componentes(uuid, uuid), gmp.copiar_procedimiento(uuid, uuid)
  to authenticated;

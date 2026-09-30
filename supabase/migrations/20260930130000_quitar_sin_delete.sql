-- ---------------------------------------------------------------------------
-- Propósito : «Quitar componente» de una fórmula en borrador y «Quitar
--             material» de la lista de materiales sin borrar filas, y cerrar
--             el DELETE que quedó otorgado a `authenticated` sobre
--             gmp.formula_componentes y comercial.pedido_renglones.
-- Reglas    : Invariantes 1, 8 y 9 (core.verificar_invariantes: ningún rol de
--             la aplicación tiene DELETE), RN-50 (auditoría).
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- POR QUÉ.
-- El trigger de auditoría rechaza todo DELETE en tablas de negocio, así que
-- los dos botones de «quitar» fallaban siempre: el de la fórmula con el error
-- del trigger, el de materiales con «permission denied» (nunca tuvo GRANT).
-- Mismo arreglo que el renglón de pedido (20260924170000): la fila queda,
-- marcada, y deja de contar.
--
-- El GRANT de DELETE sobre las dos tablas no borraba nada (el trigger lo
-- frenaba), pero dejaba en rojo la verificación de invariantes desde el
-- 2026-09-17. Se revoca junto con sus políticas, que quedan sin objeto.

-- ===========================================================================
-- 1. Revocar DELETE
-- ===========================================================================

revoke delete on gmp.formula_componentes    from authenticated;
revoke delete on comercial.pedido_renglones from authenticated;
drop policy componentes_borra_dt on gmp.formula_componentes;
drop policy renglones_borra      on comercial.pedido_renglones;

-- ===========================================================================
-- 2. Material de acondicionamiento: quitar = activo false
-- ===========================================================================
--
-- `activo` ya existía y todo cálculo lo filtra (necesidad_pedido,
-- alta_producto_tercero). Falta que el mismo insumo se pueda volver a agregar.

alter table gmp.materiales_acondicionamiento
  drop constraint materiales_acondicionamiento_producto_id_insumo_id_key;
create unique index materiales_acondicionamiento_vigente_idx
  on gmp.materiales_acondicionamiento (producto_id, insumo_id) where activo;

create or replace function gmp.fn_material_sin_reactivar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not old.activo and new.activo then
    raise exception 'Ese material ya se quitó de la lista: si hace falta, agregalo de nuevo.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_material_sin_reactivar
  before update on gmp.materiales_acondicionamiento
  for each row execute function gmp.fn_material_sin_reactivar();

-- ===========================================================================
-- 3. Componente de fórmula anulado
-- ===========================================================================

alter table gmp.formula_componentes
  add column anulado     boolean not null default false,
  add column anulado_en  timestamptz,
  add column anulado_por uuid references core.usuarios(id);

comment on column gmp.formula_componentes.anulado is
  'Componente quitado de la fórmula en borrador. La fila queda (no se borra) y deja de contar en la suma, la densidad y la calculadora.';

-- El orden de un componente quitado queda libre para el que lo reemplaza.
alter table gmp.formula_componentes
  drop constraint formula_componentes_formula_id_orden_key;
create unique index formula_componentes_vigente_idx
  on gmp.formula_componentes (formula_id, orden) where not anulado;

create or replace function gmp.fn_componente_anulado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.anulado then
    raise exception 'Ese componente ya se quitó de la fórmula: si hace falta, agregalo de nuevo.'
      using errcode = 'restrict_violation';
  end if;
  if new.anulado then
    new.anulado_en  := now();
    new.anulado_por := core.usuario_actual();
  end if;
  return new;
end;
$$;

-- trg_componente_inmutable (alfabéticamente antes) ya impide tocar los
-- componentes de una fórmula vigente, anularlos incluido.
create trigger trg_componente_anulado
  before update on gmp.formula_componentes
  for each row execute function gmp.fn_componente_anulado();

-- ===========================================================================
-- 4. Los cálculos ignoran los componentes anulados
-- ===========================================================================
--
-- Copia de la versión vigente (pg_get_functiondef) con un único cambio cada
-- una: `and not anulado` en cada lectura de gmp.formula_componentes.

CREATE OR REPLACE FUNCTION gmp.fn_formula_coherente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_suma numeric;
  v_csp  integer;
begin
  if new.estado <> 'VIGENTE' then
    return new;
  end if;

  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0),
         count(*) filter (where es_csp)
    into v_suma, v_csp
    from gmp.formula_componentes
   where formula_id = new.id
     and not anulado;

  if v_csp > 1 then
    raise exception 'La fórmula tiene % componentes marcados csp. Solo puede haber uno: el que completa.', v_csp
      using errcode = 'check_violation';
  end if;

  if v_csp = 0 and abs(v_suma - 100) > 0.0001 then
    raise exception 'Los componentes suman % %% y no hay componente csp. Sin csp, la suma tiene que ser exactamente 100 %%.', v_suma
      using errcode = 'check_violation';
  end if;

  if v_csp = 1 and v_suma >= 100 then
    raise exception 'Los componentes declarados suman % %%, así que no queda nada para el csp.', v_suma
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION gmp.densidad_mezcla_formula(p_formula_id uuid, p_temp_c numeric DEFAULT 20)
 RETURNS TABLE(densidad_ideal double precision, densidad_real double precision, volumen_exceso_molar double precision, cambio_volumen_pct double precision, pares_con_datos integer, pares_sin_datos text[], sin_masa_molar text[], sin_densidad text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_declarado numeric;
  v_comp      jsonb;
  v_sin       text[];
begin
  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0)
    into v_declarado
    from gmp.formula_componentes where formula_id = p_formula_id and not anulado;

  select coalesce(jsonb_agg(jsonb_build_object('densidad_id', x.densidad, 'masa', x.pp))
                    filter (where x.densidad is not null), '[]'::jsonb),
         coalesce(array_agg(x.nombre) filter (where x.densidad is null and x.pp > 0), '{}')
    into v_comp, v_sin
    from (
      select coalesce(c.densidad_id, i.densidad_referencia_id) as densidad,
             coalesce(c.porcentaje_pp, 100 - v_declarado) as pp,
             coalesce(i.nombre, c.nombre_libre) as nombre
        from gmp.formula_componentes c
        left join gmp.insumos_catalogo i on i.id = c.insumo_id
       where c.formula_id = p_formula_id
         and not c.anulado
    ) x;

  return query
    select m.densidad_ideal, m.densidad_real, m.volumen_exceso_molar, m.cambio_volumen_pct,
           m.pares_con_datos, m.pares_sin_datos, m.sin_masa_molar, v_sin
      from gmp.densidad_mezcla(v_comp, p_temp_c) m;
end;
$function$;

CREATE OR REPLACE FUNCTION gmp.calcular_lote(p_formula_id uuid, p_volumen_l numeric DEFAULT NULL::numeric, p_masa_kg numeric DEFAULT NULL::numeric, p_temp_c numeric DEFAULT 20)
 RETURNS SETOF gmp.renglon_pesada
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_f        gmp.formulas_fabricacion%rowtype;
  v_masa     numeric;
  v_declarado numeric;
  v_estimada record;
begin
  select * into v_f from gmp.formulas_fabricacion where id = p_formula_id;
  if not found then
    raise exception 'No existe la fórmula %.', p_formula_id;
  end if;

  if (p_volumen_l is null) = (p_masa_kg is null) then
    raise exception 'Indicá el objetivo en volumen o en masa, uno de los dos.'
      using errcode = 'check_violation';
  end if;

  if p_masa_kg is not null then
    v_masa := p_masa_kg;
  elsif v_f.densidad_producto is not null then
    -- densidad en g/mL es numéricamente igual a kg/L, así que no hay factor.
    v_masa := p_volumen_l * v_f.densidad_producto;
  else
    -- NUEVO en 20260924160000: sin densidad medida, la del modelo de mezcla,
    -- siempre que todos los componentes tengan densidad.
    select * into v_estimada from gmp.densidad_mezcla_formula(p_formula_id, p_temp_c);
    if v_estimada.densidad_real is null or cardinality(v_estimada.sin_densidad) > 0 then
      raise exception
        'La fórmula no tiene densidad del producto terminado y no se puede estimar (faltan densidades de: %). '
        'Medirla con el densitómetro (I.50.25) y cargarla, o indicar el objetivo en masa.',
        coalesce(array_to_string(v_estimada.sin_densidad, ', '), 'todos los componentes')
        using errcode = 'check_violation';
    end if;
    v_masa := p_volumen_l * v_estimada.densidad_real::numeric;
  end if;

  -- El rendimiento agranda la carga, no la achica.
  v_masa := v_masa / v_f.rendimiento;

  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0)
    into v_declarado
    from gmp.formula_componentes where formula_id = p_formula_id and not anulado;

  return query
  with base as (
    select
      c.*,
      i.nombre          as insumo_nombre,
      i.codigo_interno  as insumo_codigo,
      coalesce(c.densidad_id, i.densidad_referencia_id) as densidad_efectiva,
      v_masa * coalesce(c.porcentaje_pp, 100 - v_declarado) / 100 as masa
    from gmp.formula_componentes c
    left join gmp.insumos_catalogo i on i.id = c.insumo_id
    where c.formula_id = p_formula_id
      and not c.anulado
  ),
  con_densidad as (
    select b.*,
           case when b.densidad_efectiva is null then null
                else gmp.densidad_a(b.densidad_efectiva, p_temp_c) end as rho
    from base b
  )
  select
    d.orden,
    coalesce(d.insumo_nombre, d.nombre_libre)                  as componente,
    d.insumo_id,
    d.insumo_codigo,
    coalesce(d.porcentaje_pp, 100 - v_declarado)               as porcentaje_pp,
    round(d.masa, 4)                                           as masa_kg,
    d.se_mide_a_volumen,
    d.rho                                                      as densidad_aplicada,
    case when d.rho is null then null else round(d.masa / d.rho, 4) end as volumen_l,
    d.etapa,
    d.observacion
  from con_densidad d
  order by d.orden;
end;
$function$;

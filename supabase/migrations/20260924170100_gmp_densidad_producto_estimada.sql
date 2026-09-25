-- ---------------------------------------------------------------------------
-- Propósito : La densidad del producto sale del modelo de mezcla por defecto
--             y se reemplaza por la medida cuando se mide. Una fórmula vigente
--             admite cargar o corregir esa medida, y nada más. Se corrige la
--             densidad mal cargada de la fórmula 377 v1.
-- Reglas    : PG.60.8 (fórmula maestra), I.50.25 (densidad medida con
--             densitómetro). Resuelve D-33 por decisión del codirector técnico
--             (2026-09-24): «usamos densidad estimada por el modelo de manera
--             estándar pero se puede modificar si medimos la propia».
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Vigente = densidad medida o estimable
-- ===========================================================================
--
-- La restricción de 20260917110000 exigía la medida para pasar a vigente. Pasa
-- a un trigger porque «estimable» depende de los componentes, que están en
-- otra tabla y un CHECK no puede mirar.

alter table gmp.formulas_fabricacion drop constraint formula_vigente_con_densidad;

create or replace function gmp.fn_formula_densidad_vigente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_est record;
begin
  if new.estado <> 'VIGENTE' or new.densidad_producto is not null then
    return new;
  end if;

  select * into v_est from gmp.densidad_mezcla_formula(new.id, coalesce(new.densidad_temp_c, 20));
  if v_est.densidad_real is null or cardinality(v_est.sin_densidad) > 0 then
    raise exception
      'Sin densidad medida, la fórmula necesita densidad en todos sus componentes para estimar la del producto '
      '(faltan: %). Cargá las densidades o la medida del densitómetro (I.50.25).',
      coalesce(array_to_string(v_est.sin_densidad, ', '), 'todos')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_formula_densidad_vigente
  before insert or update on gmp.formulas_fabricacion
  for each row execute function gmp.fn_formula_densidad_vigente();

-- ===========================================================================
-- 2. Una fórmula vigente solo admite cambiar su densidad medida
-- ===========================================================================
--
-- La pantalla ya decía «una fórmula vigente no se puede editar: la corrección
-- se hace emitiendo una versión nueva», pero la base no lo controlaba. Ahora
-- sí, con una excepción deliberada: la densidad medida y su temperatura, que
-- son una medición sobre el producto y no parte de la fórmula. El cambio queda
-- auditado con su valor anterior. Pasar de VIGENTE a otro estado (obsoleta)
-- sigue permitido.

create or replace function gmp.fn_formula_vigente_campos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'VIGENTE' and new.estado = 'VIGENTE'
     and (to_jsonb(new) - 'densidad_producto' - 'densidad_temp_c')
         is distinct from (to_jsonb(old) - 'densidad_producto' - 'densidad_temp_c') then
    raise exception
      'Una fórmula vigente no se edita: la corrección se hace con una versión nueva. '
      'Solo se puede cargar o corregir la densidad medida del producto.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_formula_vigente_campos
  before update on gmp.formulas_fabricacion
  for each row execute function gmp.fn_formula_vigente_campos();

-- ===========================================================================
-- 3. Corrección de la fórmula 377 v1
-- ===========================================================================
--
-- Tenía densidad_producto = 1,00000, que el codirector técnico confirmó mal
-- cargada (2026-09-24): el modelo da 0,8099 g/mL a 20 °C para sus
-- componentes. No hay medición de densitómetro, así que la corrección es
-- dejarla sin medida y que rija la estimada. La auditoría guarda el 1,00000.

update gmp.formulas_fabricacion f
   set densidad_producto = null
  from gmp.productos p
 where p.id = f.producto_id
   and p.codigo_interno = '377'
   and f.version = '1'
   and f.densidad_producto = 1.00000;

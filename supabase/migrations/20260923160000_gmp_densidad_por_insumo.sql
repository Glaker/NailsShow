-- ---------------------------------------------------------------------------
-- Propósito : Que cada materia prima líquida tenga su densidad de referencia
--             por defecto, y que el cálculo de lote informe el volumen de cada
--             componente con la densidad de ese componente a la temperatura de
--             trabajo, no solo de los marcados «a volumen».
-- Reglas    : PG.60.8 (fórmula maestra en %P/P), I.50.25 (densidad), §4.6.
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- EL PROBLEMA (reportado por el codirector técnico).
-- La calculadora convertía a volumen solo los componentes que en la fórmula
-- tenían marcado «se mide a volumen» y una densidad elegida a mano. Ninguna
-- densidad de gmp.densidades_referencia estaba vinculada a un insumo, así que
-- una fórmula cargada sin esos dos pasos mostraba el alcohol isopropílico o el
-- acetato de butilo solo en masa: el único volumen a la vista era el del lote,
-- con la densidad del producto terminado.
--
-- LA CORRECCIÓN.
-- 1. gmp.insumos_catalogo.densidad_referencia_id: el compuesto con el que se
--    convierte ese insumo por defecto. Va en el insumo y no en la densidad
--    (gmp.densidades_referencia.insumo_id), porque un mismo compuesto de
--    literatura sirve a varios insumos: el etanol 96 GL es el del cleanser y el
--    del sanitizante. `densidades_referencia.insumo_id` sigue siendo para lo que
--    fue pensado: la densidad propia de un insumo, por certificado o medición.
-- 2. gmp.calcular_lote(): la densidad de un componente es la elegida en la
--    fórmula si la hay, y si no la del insumo. El volumen se informa para todo
--    componente con densidad conocida, a la temperatura pedida. `se_mide_a_volumen`
--    sigue diciendo cómo se carga en planta (probeta o balanza), no si se
--    calcula el volumen.
--
-- La masa sigue siendo lo que manda: la fórmula es %P/P y el volumen de cada
-- componente es la conversión de su masa, no un dato de la fórmula.

alter table gmp.insumos_catalogo
  add column if not exists densidad_referencia_id uuid references gmp.densidades_referencia(id);

comment on column gmp.insumos_catalogo.densidad_referencia_id is
  'Densidad con la que se convierte este insumo entre masa y volumen cuando la fórmula no elige otra. '
  'NULL = no se convierte (sólidos, o líquidos sin densidad cargada).';

-- Vínculo de cada líquido con su compuesto. Los mismos criterios ya usados en
-- las recetas y el saldo provisorio (20260923140000, 20260923150000).
update gmp.insumos_catalogo i
   set densidad_referencia_id = d.id
  from (values
          ('138CL1',  'Etanol 96 GL'),
          ('135SAN',  'Etanol 96 GL'),
          ('138CL2',  '2-Propanol (IPA)'),
          ('136PRE',  'Acetato de n-butilo'),
          ('135AGUA', 'Agua desionizada'),
          ('135GLI',  'Glicerina'),
          ('135PRO',  'Propilenglicol'),
          ('101MONO', 'Metacrilato de etilo (EMA)'),
          ('378ACE',  'Vaselina líquida liviana (Paraffinum liquidum perliquidum)'),
          ('131AC',   'Vaselina líquida liviana (Paraffinum liquidum perliquidum)')
       ) as v(codigo, compuesto)
  join gmp.densidades_referencia d on d.nombre = v.compuesto and d.activo
 where i.codigo_interno = v.codigo;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from gmp.insumos_catalogo where densidad_referencia_id is not null;
  if v_n < 10 then
    raise exception 'Se esperaban 10 insumos con densidad por defecto y quedaron %: falta algún compuesto o insumo.', v_n;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- gmp.calcular_lote: misma firma y mismo tipo de retorno que 20260917110000.
-- Cambia solo de dónde sale la densidad y cuándo se informa el volumen.
-- ---------------------------------------------------------------------------

create or replace function gmp.calcular_lote(
  p_formula_id  uuid,
  p_volumen_l   numeric default null,
  p_masa_kg     numeric default null,
  p_temp_c      numeric default 20
)
returns setof gmp.renglon_pesada
language plpgsql
stable
set search_path = ''
as $$
declare
  v_f        gmp.formulas_fabricacion%rowtype;
  v_masa     numeric;
  v_declarado numeric;
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
  else
    if v_f.densidad_producto is null then
      raise exception
        'La fórmula no tiene densidad del producto terminado, así que un volumen objetivo no se puede convertir a masa. '
        'Medirla con el densitómetro (I.50.25) y cargarla.'
        using errcode = 'check_violation';
    end if;
    -- densidad en g/mL es numéricamente igual a kg/L, así que no hay factor.
    v_masa := p_volumen_l * v_f.densidad_producto;
  end if;

  -- El rendimiento agranda la carga, no la achica: para sacar 2000 L con 97 %
  -- de rendimiento hay que cargar 2000 / 0,97.
  v_masa := v_masa / v_f.rendimiento;

  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0)
    into v_declarado
    from gmp.formula_componentes where formula_id = p_formula_id;

  return query
  with base as (
    select
      c.*,
      i.nombre          as insumo_nombre,
      i.codigo_interno  as insumo_codigo,
      -- La elegida en la fórmula manda; si no hay, la del insumo.
      coalesce(c.densidad_id, i.densidad_referencia_id) as densidad_efectiva,
      v_masa * coalesce(c.porcentaje_pp, 100 - v_declarado) / 100 as masa
    from gmp.formula_componentes c
    left join gmp.insumos_catalogo i on i.id = c.insumo_id
    where c.formula_id = p_formula_id
  ),
  con_densidad as (
    select b.*,
           -- densidad_a() rechaza un id nulo: se evalúa solo si hay densidad.
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
$$;

comment on function gmp.calcular_lote is
  'Explota una fórmula a masas por componente, y a volumen todo componente con densidad conocida (la de la fórmula '
  'o, si no hay, la del insumo) a la temperatura pedida. El volumen es informativo: su suma no da el volumen del lote.';

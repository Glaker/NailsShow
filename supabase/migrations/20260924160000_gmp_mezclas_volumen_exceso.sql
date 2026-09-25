-- ---------------------------------------------------------------------------
-- Propósito : Modelo de densidad de mezclas con contracción de volumen:
--             pares binarios Redlich-Kister, tabla CRC de etanol-agua,
--             composición de las densidades que son mezclas, y las funciones
--             gmp.densidad_mezcla(), gmp.densidad_mezcla_formula() y
--             gmp.grado_alcoholico_a_pp(). gmp.calcular_lote() pasa a estimar
--             la densidad del producto cuando la fórmula no tiene una medida.
-- Reglas    : PG.60.8 (fórmula maestra y hoja de pesada), I.50.25 (la
--             densidad medida con densitómetro sigue mandando cuando existe),
--             RN-01 (dato de literatura, no verificado). Pedido del
--             codirector técnico del 2026-09-24: «usá este nuevo excel para
--             la calculadora de lotes».
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- EL MODELO (hoja «Mezclas (teoría)» de la planilla).
-- La masa se suma siempre; el volumen solo si la mezcla es ideal. En general
--
--     rho_mezcla = 1 / [ Σ w_i/rho_i  +  V^E · Σ (w_i/M_i) ]
--
-- con w fracción másica, M masa molar y V^E el volumen molar de exceso de la
-- mezcla (cm³/mol). Para un par, Redlich-Kister:
--
--     V^E_12 = x1·x2·Σ_k A_k(t)·(x1 − x2)^k,    A_k(t) = A_k + dA_k/dT·(t − 25)
--
-- y para más de dos componentes, Muggianu: la suma de los V^E de cada par
-- evaluados con las fracciones molares de la mezcla completa. Un par sin datos
-- se asume ideal y se informa; un componente sin masa molar (vaselina,
-- aceites: mezclas naturales) suma su volumen pero queda fuera del V^E.
--
-- Etanol/agua 50/50 p/p a 20 °C da 0,9139 con el modelo y 0,9138 en la tabla
-- CRC: la contracción es de casi 4 %. Para 2000 L de un producto con alcohol,
-- ignorarla son 70 L.
--
-- DENSIDAD DEL PRODUCTO ESTIMADA. Hasta acá un volumen objetivo exigía la
-- densidad medida del granel. Ahora, si no hay medida y todos los componentes
-- tienen densidad, se usa la del modelo. La medida sigue mandando cuando
-- existe, y la pantalla dice cuál se usó (queda como D-33 para que la DT lo
-- confirme antes de emitir hojas de pesada con ella).

-- ===========================================================================
-- 1. Pares binarios
-- ===========================================================================

create table gmp.pares_volumen_exceso (
  id              uuid primary key default gen_random_uuid(),
  -- El orden importa: x1 es la fracción molar del compuesto 1. Invertido el
  -- par, los A_k impares cambian de signo, y eso lo resuelve la función.
  compuesto_1_id  uuid not null references gmp.densidades_referencia(id),
  compuesto_2_id  uuid not null references gmp.densidades_referencia(id),
  -- A_0..A_n (cm³/mol) y su pendiente con la temperatura (cm³/mol/°C).
  a               double precision[] not null,
  da_dt           double precision[] not null,
  t_ref_c         numeric(5,2) not null default 25,
  rango_datos     text,
  calidad         text,
  fuente          text not null,
  notas           text,
  creado_en       timestamptz not null default now(),
  constraint pares_distintos check (compuesto_1_id <> compuesto_2_id),
  constraint pares_terminos check (
    array_length(a, 1) between 1 and 8 and array_length(da_dt, 1) = array_length(a, 1)
  )
);

comment on table gmp.pares_volumen_exceso is
  'Coeficientes Redlich-Kister del volumen molar de exceso de pares binarios (hoja «Pares V^E»). '
  'Un par que no está se asume ideal.';

-- Un par es uno solo, en el orden que sea.
create unique index pares_volumen_exceso_par_idx
  on gmp.pares_volumen_exceso (least(compuesto_1_id, compuesto_2_id), greatest(compuesto_1_id, compuesto_2_id));

-- ===========================================================================
-- 2. Composición de las densidades que son mezclas o sinónimos
-- ===========================================================================

create table gmp.densidad_composicion (
  id               uuid primary key default gen_random_uuid(),
  densidad_id      uuid not null references gmp.densidades_referencia(id),
  constituyente_id uuid not null references gmp.densidades_referencia(id),
  fraccion_masica  numeric(8,6) not null check (fraccion_masica > 0 and fraccion_masica <= 1),
  fuente           text not null,
  creado_en        timestamptz not null default now(),
  unique (densidad_id, constituyente_id),
  constraint composicion_no_recursiva check (densidad_id <> constituyente_id)
);

comment on table gmp.densidad_composicion is
  'Para el modelo de mezcla, una densidad que no es un compuesto puro («Etanol 96 GL») se reemplaza por sus '
  'constituyentes. Sus fracciones suman 1; lo verifica gmp.densidad_mezcla().';

-- ===========================================================================
-- 3. Tabla CRC etanol-agua
-- ===========================================================================

create table gmp.etanol_agua_crc (
  pct_pp             numeric(6,2) primary key check (pct_pp between 0 and 100),
  rho_10             numeric(8,5) not null,
  rho_20             numeric(8,5) not null,
  rho_25             numeric(8,5) not null,
  rho_30             numeric(8,5) not null,
  pct_vv_20          double precision not null,
  contraccion_20_pct double precision not null
);

comment on table gmp.etanol_agua_crc is
  'Densidad de etanol-agua por % p/p (CRC Handbook, Hodgman 1963) y su % v/v a 20 °C (definición OIML). '
  'Para el binario puro es más exacta que Redlich-Kister.';

-- ===========================================================================
-- 4. RLS y auditoría
-- ===========================================================================

alter table gmp.pares_volumen_exceso enable row level security;
alter table gmp.pares_volumen_exceso force  row level security;
alter table gmp.densidad_composicion enable row level security;
alter table gmp.densidad_composicion force  row level security;
alter table gmp.etanol_agua_crc      enable row level security;
alter table gmp.etanol_agua_crc      force  row level security;

grant select, insert, update on gmp.pares_volumen_exceso to authenticated;
grant select, insert, update on gmp.densidad_composicion to authenticated;
grant select on gmp.etanol_agua_crc to authenticated;

create policy pares_volumen_exceso_select_authenticated on gmp.pares_volumen_exceso
  for select to authenticated using (core.rol() is not null);
comment on policy pares_volumen_exceso_select_authenticated on gmp.pares_volumen_exceso is
  '§3.3: consulta de maestros habilitada para todos los roles.';
create policy pares_volumen_exceso_insert_calidad on gmp.pares_volumen_exceso
  for insert to authenticated with check (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'));
comment on policy pares_volumen_exceso_insert_calidad on gmp.pares_volumen_exceso is
  'Mismo criterio que gmp.densidades_referencia: el dato físico lo cargan DT y Calidad.';
create policy pares_volumen_exceso_update_calidad on gmp.pares_volumen_exceso
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'))
  with check (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'));
comment on policy pares_volumen_exceso_update_calidad on gmp.pares_volumen_exceso is
  'Mismo criterio que gmp.densidades_referencia.';

create policy densidad_composicion_select_authenticated on gmp.densidad_composicion
  for select to authenticated using (core.rol() is not null);
comment on policy densidad_composicion_select_authenticated on gmp.densidad_composicion is
  '§3.3: consulta de maestros habilitada para todos los roles.';
create policy densidad_composicion_insert_calidad on gmp.densidad_composicion
  for insert to authenticated with check (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'));
comment on policy densidad_composicion_insert_calidad on gmp.densidad_composicion is
  'Mismo criterio que gmp.densidades_referencia.';
create policy densidad_composicion_update_calidad on gmp.densidad_composicion
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'))
  with check (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'));
comment on policy densidad_composicion_update_calidad on gmp.densidad_composicion is
  'Mismo criterio que gmp.densidades_referencia.';

create policy etanol_agua_crc_select_authenticated on gmp.etanol_agua_crc
  for select to authenticated using (core.rol() is not null);
comment on policy etanol_agua_crc_select_authenticated on gmp.etanol_agua_crc is
  'Tabla de referencia de literatura: la lee todo rol; se carga solo por migración.';

select core.adjuntar_auditoria('gmp.pares_volumen_exceso');
select core.adjuntar_auditoria('gmp.densidad_composicion');
select core.adjuntar_auditoria('gmp.etanol_agua_crc');

-- ===========================================================================
-- 5. °GL → % p/p
-- ===========================================================================
--
-- Interpolación lineal en la tabla de 1 % p/p. Con ese paso el error queda
-- por debajo de 0,01 % p/p; lo que estaba mal era interpolar entre dos o tres
-- puntos sueltos (calculoLote.ts lo había dejado sin implementar por eso).

create or replace function gmp.grado_alcoholico_a_pp(p_pct_vv numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round((a.pct_pp + (p_pct_vv - a.pct_vv_20) * (b.pct_pp - a.pct_pp) / (b.pct_vv_20 - a.pct_vv_20))::numeric, 4)
    from gmp.etanol_agua_crc a
    join gmp.etanol_agua_crc b on b.pct_pp = a.pct_pp + 1
   where p_pct_vv between a.pct_vv_20 and b.pct_vv_20
   order by a.pct_pp
   limit 1;
$$;

comment on function gmp.grado_alcoholico_a_pp(numeric) is
  'Graduación alcohólica (% v/v a 20 °C, °GL) de una mezcla etanol-agua pasada a % p/p de etanol, según la tabla CRC.';

grant execute on function gmp.grado_alcoholico_a_pp(numeric) to authenticated;

-- ===========================================================================
-- 6. Densidad de una mezcla
-- ===========================================================================
--
-- p_componentes: [{ "densidad_id": uuid, "masa": numeric }] (la masa en la
-- unidad que sea: solo importan las proporciones).

create or replace function gmp.densidad_mezcla(p_componentes jsonb, p_temp_c numeric default 20)
returns table (
  densidad_ideal       double precision,
  densidad_real        double precision,
  volumen_exceso_molar double precision,
  cambio_volumen_pct   double precision,
  pares_con_datos      integer,
  pares_sin_datos      text[],
  sin_masa_molar       text[]
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids    uuid[];
  v_nom    text[];
  v_masa   double precision[];
  v_mm     double precision[];
  v_rho    double precision[];
  v_total  double precision;
  v_n      double precision[];
  v_sum_n  double precision := 0;
  v_sw_rho double precision := 0;
  v_sw_m   double precision := 0;
  v_ve     double precision := 0;
  v_con    integer := 0;
  v_sin    text[] := '{}';
  v_sinmm  text[] := '{}';
  v_par    gmp.pares_volumen_exceso%rowtype;
  v_s      double precision;
  v_d      double precision;
  v_suma   double precision;
  v_xi     double precision;
  v_xj     double precision;
  i integer; j integer; k integer;
begin
  if exists (
    select 1 from gmp.densidad_composicion
     group by densidad_id having abs(sum(fraccion_masica) - 1) > 1e-4
  ) then
    raise exception 'La composición de alguna densidad no suma 100 %%.' using errcode = 'check_violation';
  end if;

  -- Cada componente, reemplazado por sus constituyentes si es una mezcla.
  with entrada as (
    select (e ->> 'densidad_id')::uuid as id, (e ->> 'masa')::double precision as masa
      from jsonb_array_elements(coalesce(p_componentes, '[]'::jsonb)) e
     where (e ->> 'densidad_id') is not null and (e ->> 'masa')::double precision > 0
  ),
  expandida as (
    select coalesce(c.constituyente_id, en.id) as id,
           en.masa * coalesce(c.fraccion_masica::double precision, 1) as masa
      from entrada en
      left join gmp.densidad_composicion c on c.densidad_id = en.id
  ),
  agrupada as (
    select id, sum(masa) as masa from expandida group by id
  )
  select array_agg(a.id order by d.nombre),
         array_agg(d.nombre order by d.nombre),
         array_agg(a.masa order by d.nombre),
         array_agg(d.masa_molar::double precision order by d.nombre),
         array_agg(gmp.densidad_a(a.id, p_temp_c)::double precision order by d.nombre)
    into v_ids, v_nom, v_masa, v_mm, v_rho
    from agrupada a
    join gmp.densidades_referencia d on d.id = a.id;

  if v_ids is null then
    return;
  end if;

  select sum(m) into v_total from unnest(v_masa) m;
  v_n := array_fill(0::double precision, array[array_length(v_ids, 1)]);

  for i in 1 .. array_length(v_ids, 1) loop
    v_sw_rho := v_sw_rho + (v_masa[i] / v_total) / v_rho[i];
    if v_mm[i] is null or v_mm[i] <= 0 then
      v_sinmm := v_sinmm || v_nom[i];
    else
      v_n[i] := v_masa[i] / v_total / v_mm[i];
      v_sum_n := v_sum_n + v_n[i];
    end if;
  end loop;
  v_sw_m := v_sum_n;

  if v_sum_n > 0 then
    for i in 1 .. array_length(v_ids, 1) loop
      continue when v_n[i] = 0;
      for j in i + 1 .. array_length(v_ids, 1) loop
        continue when v_n[j] = 0;
        select * into v_par from gmp.pares_volumen_exceso p
         where (p.compuesto_1_id = v_ids[i] and p.compuesto_2_id = v_ids[j])
            or (p.compuesto_1_id = v_ids[j] and p.compuesto_2_id = v_ids[i]);
        if not found then
          v_sin := v_sin || (v_nom[i] || ' + ' || v_nom[j]);
          continue;
        end if;
        v_con := v_con + 1;
        v_xi := v_n[i] / v_sum_n;
        v_xj := v_n[j] / v_sum_n;
        v_s := case when v_par.compuesto_1_id = v_ids[i] then 1 else -1 end;
        v_d := v_s * (v_xi - v_xj);
        v_suma := 0;
        for k in 1 .. array_length(v_par.a, 1) loop
          v_suma := v_suma
            + (v_par.a[k] + coalesce(v_par.da_dt[k], 0) * (p_temp_c::double precision - v_par.t_ref_c::double precision))
            * case when k = 1 then 1 else power(v_d, k - 1) end;
        end loop;
        v_ve := v_ve + v_xi * v_xj * v_suma;
      end loop;
    end loop;
  end if;

  densidad_ideal       := 1 / v_sw_rho;
  densidad_real        := 1 / (v_sw_rho + v_ve * v_sw_m);
  volumen_exceso_molar := v_ve;
  cambio_volumen_pct   := (densidad_ideal / densidad_real - 1) * 100;
  pares_con_datos      := v_con;
  pares_sin_datos      := v_sin;
  sin_masa_molar       := v_sinmm;
  return next;
end;
$$;

comment on function gmp.densidad_mezcla(jsonb, numeric) is
  'Densidad ideal (aditividad de volúmenes) y real estimada (con V^E de Redlich-Kister por pares, Muggianu) de una '
  'mezcla dada por masas. Informa los pares sin datos (asumidos ideales) y los componentes sin masa molar.';

grant execute on function gmp.densidad_mezcla(jsonb, numeric) to authenticated;

-- La mezcla de una fórmula: sus %P/P con la densidad de cada componente (la de
-- la fórmula o la del insumo, mismo criterio que calcular_lote).
create or replace function gmp.densidad_mezcla_formula(p_formula_id uuid, p_temp_c numeric default 20)
returns table (
  densidad_ideal         double precision,
  densidad_real          double precision,
  volumen_exceso_molar   double precision,
  cambio_volumen_pct     double precision,
  pares_con_datos        integer,
  pares_sin_datos        text[],
  sin_masa_molar         text[],
  sin_densidad           text[]
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_declarado numeric;
  v_comp      jsonb;
  v_sin       text[];
begin
  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0)
    into v_declarado
    from gmp.formula_componentes where formula_id = p_formula_id;

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
    ) x;

  return query
    select m.densidad_ideal, m.densidad_real, m.volumen_exceso_molar, m.cambio_volumen_pct,
           m.pares_con_datos, m.pares_sin_datos, m.sin_masa_molar, v_sin
      from gmp.densidad_mezcla(v_comp, p_temp_c) m;
end;
$$;

comment on function gmp.densidad_mezcla_formula(uuid, numeric) is
  'gmp.densidad_mezcla() aplicada a una fórmula. `sin_densidad` lista los componentes que no tienen densidad: '
  'si hay alguno, la estimación no representa al producto.';

grant execute on function gmp.densidad_mezcla_formula(uuid, numeric) to authenticated;

-- ===========================================================================
-- 7. calcular_lote: densidad del producto estimada si no hay medida
-- ===========================================================================
--
-- Copia de 20260923160000 salvo el bloque marcado NUEVO. Misma firma.

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
    from gmp.formula_componentes where formula_id = p_formula_id;

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
$$;

comment on function gmp.calcular_lote is
  'Explota una fórmula a masas por componente, y a volumen todo componente con densidad conocida. Un volumen '
  'objetivo se convierte a masa con la densidad medida del producto o, si no hay, con la estimada por '
  'gmp.densidad_mezcla_formula() (D-33).';

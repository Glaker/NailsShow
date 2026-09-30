-- ---------------------------------------------------------------------------
-- Propósito : Carga del manual de fórmulas de producción v10: 44 fórmulas en
--             BORRADOR, cada una con su procedimiento (texto del manual) y los
--             componentes con % p/p donde el manual da el peso en kg. Alta de
--             los clientes tercerizados Glam y Jennifer Beauty y de 20
--             productos tercerizados (Navi, Glam, Jennifer Beauty).
-- Reglas    : §4.6 del alcance (fórmula maestra, aprobación DT), ítem 3 de la
--             cola del 2026-09-24 (procedimiento por fórmula), RN-50.
-- Origen    : manual_formulas_produccion_v10.pdf, sha256 5a9dc2c94042d7184dfbd8a2a2d0d87ff6e436e32c6e47e955481d49e8ec164a.
--             Generada por scripts/manual_formulas/generar_migracion.mjs; lo
--             que no entró está en scripts/manual_formulas/pendientes.md.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- TODO QUEDA EN BORRADOR. Una fórmula la aprueba Dirección Técnica: la carga
-- no la hace vigente. La 377 (PREP) tiene una v1 VIGENTE en 70/30 % p/p; el
-- manual da 70/30 en VOLUMEN (14 L + 6 L), que en masa es 67,55/32,45
-- (10,99 + 5,28 kg). Se carga como v2 en borrador para que la DT decida.
--
-- % P/P. Se calcula sobre lo que el manual pesa en kg por tanda; el
-- componente más pesado es csp. Cucharadas, «según aroma» y ml sin densidad
-- no entran a la tabla de la fórmula: quedan en el procedimiento, que es el
-- texto del manual. Los polímeros y el removedor de Nail Show quedan sin
-- componentes hasta pesar las cucharadas / confirmar densidades.
--
-- AUTORÍA. `db push` corre sin sesión de usuario: se registra como autora a
-- la Dirección Técnica activa (titular si existe), como en las cargas de
-- saldo de apertura y de precios: es quien autoriza la carga.

create function pg_temp.insumo(p_codigo text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from gmp.insumos_catalogo where codigo_interno = p_codigo;
  if v is null then raise exception 'No está el insumo % en el catálogo.', p_codigo; end if;
  return v;
end;
$$;

create function pg_temp.producto(p_codigo text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from gmp.productos where codigo_interno = p_codigo and tercero_id is null;
  if v is null then raise exception 'No está el producto % en el catálogo.', p_codigo; end if;
  return v;
end;
$$;

do $carga$
declare
  v_dt   uuid;
  v_prod uuid;
  v_f    uuid;
  v_t_navi uuid;
  v_t_glam uuid;
  v_t_jennifer_beauty uuid;
begin
  select id into v_dt from core.usuarios
   where rol = 'DIRECCION_TECNICA' and activo
   order by es_dt_titular desc, creado_en
   limit 1;
  if v_dt is null then
    raise exception 'No hay Dirección Técnica activa: la carga de fórmulas necesita un responsable identificado.';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA')::text, true);

  select id into v_t_navi from gmp.terceros where nombre = 'Navi' and activo;
  if v_t_navi is null then
    insert into gmp.terceros (nombre, color, observaciones, creado_por) values ('Navi', 'teal', 'Alta con la carga del manual_formulas_produccion_v10.pdf.', v_dt) returning id into v_t_navi;
  end if;
  select id into v_t_glam from gmp.terceros where nombre = 'Glam' and activo;
  if v_t_glam is null then
    insert into gmp.terceros (nombre, color, observaciones, creado_por) values ('Glam', 'pink', 'Alta con la carga del manual_formulas_produccion_v10.pdf.', v_dt) returning id into v_t_glam;
  end if;
  select id into v_t_jennifer_beauty from gmp.terceros where nombre = 'Jennifer Beauty' and activo;
  if v_t_jennifer_beauty is null then
    insert into gmp.terceros (nombre, color, observaciones, creado_por) values ('Jennifer Beauty', 'indigo', 'Alta con la carga del manual_formulas_produccion_v10.pdf.', v_dt) returning id into v_t_jennifer_beauty;
  end if;

  -- 377: PREP NAIL SHOW - BIDON DE 20 L

  v_prod := pg_temp.producto('377');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL2'), null, null, true, 'Manual: 14,00 L — 10,99 kg por tanda (16,27 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('136PRE'), null, 32.4524, false, 'Manual: 6,00 L — 5,28 kg por tanda (16,27 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$PREP NAIL SHOW - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 2.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol isopropilico: 14,00 L — 10,99 kg
  - Acetato de butilo: 6,00 L — 5,28 kg

ORDEN DE PREPARACION
  1. Agregar alcohol isopropilico.
  2. Agregar acetato de butilo.
  3. Mezclar hasta homogeneizar.

TOTAL: 20,00 L — 16,27 kg aprox.$txt$, v_dt);

  -- 384: CLARIFICADOR NAIL SHOW - BIDON DE 20 L

  v_prod := pg_temp.producto('384');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL1'), null, null, true, 'Manual: 15,96 L — 12,59 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('138CL2'), null, 19.9112, false, 'Manual: 4,00 L — 3,14 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('384ESE'), null, 0.2536, false, 'Manual: 40 ml por bidon de 20 L — 0,040 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CLARIFICADOR NAIL SHOW - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 2.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol comun / cereal: 15,96 L — 12,59 kg aprox.
  - Alcohol isopropilico: 4,00 L — 3,14 kg aprox.
  - Esencia Chicle Tutti Bazook: 40 ml por bidon de 20 L — 0,040 kg aprox.

ORDEN DE PREPARACION
  1. Agregar el ALCOHOL COMUN / CEREAL.
  2. Agregar el ALCOHOL ISOPROPILICO.
  3. Preparar 2 bidones de 20 L y pasarlos a la OLLA de 40 L.
  4. En la olla agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK en total (40 ml por cada bidon de 20 L).
  5. Mezclar hasta homogeneizar.

IMPORTANTE - OLLA DE 40 L: son 2 bidones de 20 L. Agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK EN TOTAL en la olla.$txt$, v_dt);

  -- 385: CLARIFICADOR NAIL SHOW - BIDON DE 20 L

  v_prod := pg_temp.producto('385');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL1'), null, null, true, 'Manual: 15,96 L — 12,59 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('138CL2'), null, 19.9112, false, 'Manual: 4,00 L — 3,14 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('384ESE'), null, 0.2536, false, 'Manual: 40 ml por bidon de 20 L — 0,040 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CLARIFICADOR NAIL SHOW - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 2.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol comun / cereal: 15,96 L — 12,59 kg aprox.
  - Alcohol isopropilico: 4,00 L — 3,14 kg aprox.
  - Esencia Chicle Tutti Bazook: 40 ml por bidon de 20 L — 0,040 kg aprox.

ORDEN DE PREPARACION
  1. Agregar el ALCOHOL COMUN / CEREAL.
  2. Agregar el ALCOHOL ISOPROPILICO.
  3. Preparar 2 bidones de 20 L y pasarlos a la OLLA de 40 L.
  4. En la olla agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK en total (40 ml por cada bidon de 20 L).
  5. Mezclar hasta homogeneizar.

IMPORTANTE - OLLA DE 40 L: son 2 bidones de 20 L. Agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK EN TOTAL en la olla.$txt$, v_dt);

  -- 386: CLARIFICADOR NAIL SHOW - BIDON DE 20 L

  v_prod := pg_temp.producto('386');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL1'), null, null, true, 'Manual: 15,96 L — 12,59 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('138CL2'), null, 19.9112, false, 'Manual: 4,00 L — 3,14 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('384ESE'), null, 0.2536, false, 'Manual: 40 ml por bidon de 20 L — 0,040 kg aprox. por tanda (15,77 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CLARIFICADOR NAIL SHOW - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 2.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol comun / cereal: 15,96 L — 12,59 kg aprox.
  - Alcohol isopropilico: 4,00 L — 3,14 kg aprox.
  - Esencia Chicle Tutti Bazook: 40 ml por bidon de 20 L — 0,040 kg aprox.

ORDEN DE PREPARACION
  1. Agregar el ALCOHOL COMUN / CEREAL.
  2. Agregar el ALCOHOL ISOPROPILICO.
  3. Preparar 2 bidones de 20 L y pasarlos a la OLLA de 40 L.
  4. En la olla agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK en total (40 ml por cada bidon de 20 L).
  5. Mezclar hasta homogeneizar.

IMPORTANTE - OLLA DE 40 L: son 2 bidones de 20 L. Agregar 80 ml de ESENCIA CHICLE TUTTI BAZOOK EN TOTAL en la olla.$txt$, v_dt);

  -- 192: REMOVEDOR NAIL SHOW - BIDON AZUL DE 60 L

  v_prod := pg_temp.producto('192');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$REMOVEDOR NAIL SHOW - BIDON AZUL DE 60 L
Fuente: manual_formulas_produccion_v10.pdf, página 2.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Acetona: 60,00 L — 60 L de acetona
  - Aloe Vera Tintura: 90 ml — Medir 90 ml
  - Enmascarante: 85 ml — Medir 85 ml

ORDEN DE PREPARACION
  1. Preparar directamente en el BIDON AZUL DE 60 L.
  2. Agregar 60 LITROS DE ACETONA.
  3. Agregar 90 ml de ALOE VERA TINTURA.
  4. Agregar 85 ml de ENMASCARANTE.
  5. Mezclar hasta homogeneizar.

FORMULA CONFIRMADA: 60 L de ACETONA + 90 ml de ALOE VERA TINTURA + 85 ml de ENMASCARANTE.
Los dos aditivos se miden en ml; no convertir a kg sin densidad confirmada.$txt$, v_dt);

  -- 391: SANITIZANTE NAIL SHOW 200 ml AMOR - BIDON DE 20 L

  v_prod := pg_temp.producto('391');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.7265, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 0.9512, false, 'Manual: 0,13 L — 0,16 kg aprox. (165 gr) por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135FRA1'), null, 1.1891, false, 'Manual: 0,20 L — 0,20 kg aprox. (200 gr) por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE NAIL SHOW 200 ml AMOR - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 3.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,16 kg aprox. (165 gr)
  - Fragancia AMOR: 0,20 L — 0,20 kg aprox. (200 gr)
  - Pigmento / colorante: Segun aroma — Segun aroma

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.
  3. Agregar el ALCOHOL.
  4. Pasar la mezcla a la OLLA.
  5. En la olla agregar la ESENCIA y despues el COLORANTE / PIGMENTO segun el aroma (ver abajo).

IMPORTANTE - OLLA DE 40 L: juntar 2 bidones de 20 L. En la olla agregar 400 ml de ESENCIA EN TOTAL (200 ml por cada bidon). Despues agregar colorantes / pigmentos segun el aroma.

AROMA AMOR (en la olla de 40 L). Usar la CUCHARA 2,5 ml en todas las medidas:
  1. Agregar 400 ml de ESENCIA AMOR en la olla de 40 L (2 bidones de 20 L).
  2. Agregar 2 cucharadas de 2,5 ml de colorante ROJO (total 5 ml).
  3. Mezclar.
  4. Agregar 8 cucharadas de 2,5 ml de pigmento ROSA OSCURO #148 (total 20 ml).$txt$, v_dt);

  -- 393: SANITIZANTE NAIL SHOW 200 ml AIRE - BIDON DE 20 L

  v_prod := pg_temp.producto('393');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.7265, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 0.9512, false, 'Manual: 0,13 L — 0,16 kg aprox. (165 gr) por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135FRA2'), null, 1.1891, false, 'Manual: 0,20 L — 0,20 kg aprox. (200 gr) por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE NAIL SHOW 200 ml AIRE - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 3.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,16 kg aprox. (165 gr)
  - Fragancia AIRE: 0,20 L — 0,20 kg aprox. (200 gr)
  - Pigmento / colorante: Segun aroma — Segun aroma

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.
  3. Agregar el ALCOHOL.
  4. Pasar la mezcla a la OLLA.
  5. En la olla agregar la ESENCIA y despues el COLORANTE / PIGMENTO segun el aroma (ver abajo).

IMPORTANTE - OLLA DE 40 L: juntar 2 bidones de 20 L. En la olla agregar 400 ml de ESENCIA EN TOTAL (200 ml por cada bidon). Despues agregar colorantes / pigmentos segun el aroma.

AROMA AIRE (en la olla de 40 L). Usar la CUCHARA 2,5 ml en todas las medidas:
  1. Agregar 400 ml de ESENCIA AIRE en la olla de 40 L (2 bidones de 20 L).
  2. Agregar 8 cucharadas de 2,5 ml de pigmento CAMALEON LILA #328 (total 20 ml).
  3. No lleva otro colorante.$txt$, v_dt);

  -- 395: SANITIZANTE NAIL SHOW 200 ml PAZ - BIDON DE 20 L

  v_prod := pg_temp.producto('395');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.7265, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 0.9512, false, 'Manual: 0,13 L — 0,16 kg aprox. (165 gr) por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135FRA3'), null, 1.1891, false, 'Manual: 0,20 L — 0,20 kg aprox. (200 gr) por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE NAIL SHOW 200 ml PAZ - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 3.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,16 kg aprox. (165 gr)
  - Fragancia PAZ: 0,20 L — 0,20 kg aprox. (200 gr)
  - Pigmento / colorante: Segun aroma — Segun aroma

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.
  3. Agregar el ALCOHOL.
  4. Pasar la mezcla a la OLLA.
  5. En la olla agregar la ESENCIA y despues el COLORANTE / PIGMENTO segun el aroma (ver abajo).

IMPORTANTE - OLLA DE 40 L: juntar 2 bidones de 20 L. En la olla agregar 400 ml de ESENCIA EN TOTAL (200 ml por cada bidon). Despues agregar colorantes / pigmentos segun el aroma.

AROMA PAZ (en la olla de 40 L). Usar la CUCHARA 2,5 ml en todas las medidas:
  1. Agregar 400 ml de ESENCIA PAZ en la olla de 40 L (2 bidones de 20 L).
  2. Agregar 2 cucharadas de 2,5 ml de colorante ROJO (total 5 ml).
  3. MEZCLAR BIEN.
  4. Agregar 2 y 1/2 cucharadas de 2,5 ml de colorante AZUL (total 6,25 ml).
  5. MEZCLAR BIEN.
  6. Agregar 8 cucharadas de 2,5 ml de pigmento VIOLETA #158 XVII (total 20 ml).
  7. PAZ: respetar este orden -> ROJO -> MEZCLAR -> AZUL -> MEZCLAR -> PIGMENTO VIOLETA #158 XVII.$txt$, v_dt);

  -- 392: SANITIZANTE NAIL SHOW 125 ml AMOR - BIDON DE 20 L

  v_prod := pg_temp.producto('392');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.5055, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 1.0032, false, 'Manual: 0,13 L — 0,17 kg aprox. (165 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135ALOE'), null, 0.6491, false, 'Manual: 0,10 L — 0,11 kg aprox. (110 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 5, pg_temp.insumo('135FRA1'), null, 1.1802, false, 'Manual: 0,20 L — 0,20 kg (200 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 6, pg_temp.insumo('148PIG'), null, 0.0354, false, 'Manual: 0,01 L — 0,006 kg aprox. (6 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE NAIL SHOW 125 ml AMOR - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 4.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,17 kg aprox. (165 gr)
  - Extracto glicolico de aloe vera: 0,10 L — 0,11 kg aprox. (110 gr)
  - Fragancia AMOR: 0,20 L — 0,20 kg (200 gr)
  - Pigmento ROSA OSCURO #148: 0,01 L — 0,006 kg aprox. (6 gr)

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.
  3. Mezclar el EXTRACTO DE ALOE con un chorrito de PROPILENGLICOL en el ENVASE BLANCO con tapa negra (aloe + propilenglicol) y luego incorporarlo.
  4. Agregar el ALCOHOL.
  5. Pasar a la OLLA.
  6. En la olla agregar ESENCIA + COLORANTE / PIGMENTO segun el aroma (ver abajo).

RENDIMIENTO: 160 unidades de 125 ml por bidon.
IMPORTANTE - OLLA DE 40 L: juntar 2 bidones de 20 L. En la olla agregar 400 ml de ESENCIA EN TOTAL (200 ml por cada bidon). Despues agregar colorantes / pigmentos segun el aroma.

AROMA AMOR (en la olla de 40 L). Usar la CUCHARA 2,5 ml en todas las medidas:
  1. Agregar 400 ml de ESENCIA AMOR en la olla de 40 L (2 bidones de 20 L).
  2. Agregar 2 cucharadas de 2,5 ml de colorante ROJO (total 5 ml).
  3. Mezclar.
  4. Agregar 8 cucharadas de 2,5 ml de pigmento ROSA OSCURO #148 (total 20 ml).$txt$, v_dt);

  -- 394: SANITIZANTE NAIL SHOW 125 ml AIRE - BIDON DE 20 L

  v_prod := pg_temp.producto('394');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.5055, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 1.0032, false, 'Manual: 0,13 L — 0,17 kg aprox. (165 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135ALOE'), null, 0.6491, false, 'Manual: 0,10 L — 0,11 kg aprox. (110 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 5, pg_temp.insumo('135FRA2'), null, 1.1802, false, 'Manual: 0,20 L — 0,20 kg (200 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 6, pg_temp.insumo('328PIG'), null, 0.0354, false, 'Manual: 0,01 L — 0,006 kg aprox. (6 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE NAIL SHOW 125 ml AIRE - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 4.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,17 kg aprox. (165 gr)
  - Extracto glicolico de aloe vera: 0,10 L — 0,11 kg aprox. (110 gr)
  - Fragancia AIRE: 0,20 L — 0,20 kg (200 gr)
  - Pigmento CAMALEON LILA #328: 0,01 L — 0,006 kg aprox. (6 gr)

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.
  3. Mezclar el EXTRACTO DE ALOE con un chorrito de PROPILENGLICOL en el ENVASE BLANCO con tapa negra (aloe + propilenglicol) y luego incorporarlo.
  4. Agregar el ALCOHOL.
  5. Pasar a la OLLA.
  6. En la olla agregar ESENCIA + COLORANTE / PIGMENTO segun el aroma (ver abajo).

RENDIMIENTO: 160 unidades de 125 ml por bidon.
IMPORTANTE - OLLA DE 40 L: juntar 2 bidones de 20 L. En la olla agregar 400 ml de ESENCIA EN TOTAL (200 ml por cada bidon). Despues agregar colorantes / pigmentos segun el aroma.

AROMA AIRE (en la olla de 40 L). Usar la CUCHARA 2,5 ml en todas las medidas:
  1. Agregar 400 ml de ESENCIA AIRE en la olla de 40 L (2 bidones de 20 L).
  2. Agregar 8 cucharadas de 2,5 ml de pigmento CAMALEON LILA #328 (total 20 ml).
  3. No lleva otro colorante.$txt$, v_dt);

  -- 396: SANITIZANTE NAIL SHOW 125 ml PAZ - BIDON DE 20 L

  v_prod := pg_temp.producto('396');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.5055, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 1.0032, false, 'Manual: 0,13 L — 0,17 kg aprox. (165 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135ALOE'), null, 0.6491, false, 'Manual: 0,10 L — 0,11 kg aprox. (110 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 5, pg_temp.insumo('135FRA3'), null, 1.1802, false, 'Manual: 0,20 L — 0,20 kg (200 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 6, pg_temp.insumo('158PIG'), null, 0.0354, false, 'Manual: 0,01 L — 0,006 kg aprox. (6 gr) por tanda (16,946 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE NAIL SHOW 125 ml PAZ - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 4.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,17 kg aprox. (165 gr)
  - Extracto glicolico de aloe vera: 0,10 L — 0,11 kg aprox. (110 gr)
  - Fragancia PAZ: 0,20 L — 0,20 kg (200 gr)
  - Pigmento VIOLETA #158 XVII: 0,01 L — 0,006 kg aprox. (6 gr)

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua en el ENVASE BLANCO (glicerina + agua) y luego incorporarla.
  3. Mezclar el EXTRACTO DE ALOE con un chorrito de PROPILENGLICOL en el ENVASE BLANCO con tapa negra (aloe + propilenglicol) y luego incorporarlo.
  4. Agregar el ALCOHOL.
  5. Pasar a la OLLA.
  6. En la olla agregar ESENCIA + COLORANTE / PIGMENTO segun el aroma (ver abajo).

RENDIMIENTO: 160 unidades de 125 ml por bidon.
IMPORTANTE - OLLA DE 40 L: juntar 2 bidones de 20 L. En la olla agregar 400 ml de ESENCIA EN TOTAL (200 ml por cada bidon). Despues agregar colorantes / pigmentos segun el aroma.

AROMA PAZ (en la olla de 40 L). Usar la CUCHARA 2,5 ml en todas las medidas:
  1. Agregar 400 ml de ESENCIA PAZ en la olla de 40 L (2 bidones de 20 L).
  2. Agregar 2 cucharadas de 2,5 ml de colorante ROJO (total 5 ml).
  3. MEZCLAR BIEN.
  4. Agregar 2 y 1/2 cucharadas de 2,5 ml de colorante AZUL (total 6,25 ml).
  5. MEZCLAR BIEN.
  6. Agregar 8 cucharadas de 2,5 ml de pigmento VIOLETA #158 XVII (total 20 ml).
  7. PAZ: respetar este orden -> ROJO -> MEZCLAR -> AZUL -> MEZCLAR -> PIGMENTO VIOLETA #158 XVII.$txt$, v_dt);

  -- 86: SOFT COVER PINK

  v_prod := pg_temp.producto('86');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SOFT COVER PINK
Fuente: manual_formulas_produccion_v10.pdf, página 6.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Mezclar previamente en un tarrito: 1 y 1/2 cucharada (blanca) filtrada de Ferrite + 8 cucharadas (blancas) filtradas de Blanco Saturado.
  3. Batir durante 20 minutos.
  4. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 99: SOFT COVER PINK

  v_prod := pg_temp.producto('99');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SOFT COVER PINK
Fuente: manual_formulas_produccion_v10.pdf, página 6.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Mezclar previamente en un tarrito: 1 y 1/2 cucharada (blanca) filtrada de Ferrite + 8 cucharadas (blancas) filtradas de Blanco Saturado.
  3. Batir durante 20 minutos.
  4. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 87: DARK COVER PINK

  v_prod := pg_temp.producto('87');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$DARK COVER PINK
Fuente: manual_formulas_produccion_v10.pdf, página 6.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Mezclar previamente en un tarrito: 6 cucharadas filtradas de Ferrite + 14 cucharadas filtradas de Blanco Saturado.
  3. Batir durante 20 minutos.
  4. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 100: DARK COVER PINK

  v_prod := pg_temp.producto('100');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$DARK COVER PINK
Fuente: manual_formulas_produccion_v10.pdf, página 6.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Mezclar previamente en un tarrito: 6 cucharadas filtradas de Ferrite + 14 cucharadas filtradas de Blanco Saturado.
  3. Batir durante 20 minutos.
  4. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 85: SHOW COVER PINK

  v_prod := pg_temp.producto('85');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SHOW COVER PINK
Fuente: manual_formulas_produccion_v10.pdf, página 7.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Mezclar previamente en un tarrito: 6 cucharadas (blancas) filtradas de Ferrite + 14 cucharadas (blancas) filtradas de Blanco Saturado.
  3. Agregar 20 cucharadas blancas de Sugar XL Dorado.
  4. Batir durante 20 minutos.
  5. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 98: SHOW COVER PINK

  v_prod := pg_temp.producto('98');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SHOW COVER PINK
Fuente: manual_formulas_produccion_v10.pdf, página 7.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Mezclar previamente en un tarrito: 6 cucharadas (blancas) filtradas de Ferrite + 14 cucharadas (blancas) filtradas de Blanco Saturado.
  3. Agregar 20 cucharadas blancas de Sugar XL Dorado.
  4. Batir durante 20 minutos.
  5. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 83: BLANCO FRENCH

  v_prod := pg_temp.producto('83');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$BLANCO FRENCH
Fuente: manual_formulas_produccion_v10.pdf, página 8.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Agregar 1 balde entero de EZ Flow de Blanco Saturado, previamente filtrado.
  3. Batir durante 20 minutos.
  4. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 96: BLANCO FRENCH

  v_prod := pg_temp.producto('96');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$BLANCO FRENCH
Fuente: manual_formulas_produccion_v10.pdf, página 8.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Agregar 1 balde entero de EZ Flow de Blanco Saturado, previamente filtrado.
  3. Batir durante 20 minutos.
  4. Probar el color y dejar una muestra en el libro de muestras.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 80: ROSADO TRANSLUCIDO

  v_prod := pg_temp.producto('80');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$ROSADO TRANSLUCIDO
Fuente: manual_formulas_produccion_v10.pdf, página 8.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 12 kg de Polimero Clear
  2. Agregar 1 cucharada blanca de pigmento rosa #144 III.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 88: PINKY COVER PINK

  v_prod := pg_temp.producto('88');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$PINKY COVER PINK
Fuente: manual_formulas_produccion_v10.pdf, página 8.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 8 baldes de EZ Flow de Clear
  2. Agregar 4 cucharadas (blancas) filtradas de Blanco Saturado.
  3. Agregar 12 cucharadas mini de Ferrite.
  4. Agregar 10 cucharadas mini de pigmento rosa #144 III.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 91: PRINCESS

  v_prod := pg_temp.producto('91');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$PRINCESS
Fuente: manual_formulas_produccion_v10.pdf, página 8.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 8 baldes de EZ Flow de Clear
  2. Agregar 8 cucharadas mini de Ferrite.
  3. Agregar 12 cucharadas blancas de Sugar XLI Rainbow.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 90: DIAMONDS

  v_prod := pg_temp.producto('90');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$DIAMONDS
Fuente: manual_formulas_produccion_v10.pdf, página 9.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 8 baldes de EZ Flow de Clear
  2. Agregar 4 cucharadas blancas de Glitter Plata Comun.
  3. Agregar 6 cucharadas blancas de Blanco Perlado #143 II.
  4. Agregar 20 cucharadas mini de Ferrite.
  5. Agregar 2 cucharadas mini de pigmento rosa #144 III.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- 89: BEIGE COVER PINK - FORMULA ACTUALIZADA

  v_prod := pg_temp.producto('89');
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$BEIGE COVER PINK - FORMULA ACTUALIZADA
Fuente: manual_formulas_produccion_v10.pdf, página 9.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. 8 baldes de EZ Flow de Clear
  2. Agregar 18 cucharadas mini de pigmento verde oscuro #157 XVI.
  3. Agregar 50 cucharadas mini de Ferrite.
  4. Agregar 4 cucharadas blancas de Blanco Saturado.

MEDIDAS: usar exactamente el tipo de cuchara indicado (cuchara blanca / cuchara mini). Cuando diga FILTRADO, filtrar antes de incorporar.
Probar y dejar muestra en el libro de muestras cuando corresponda.
Las cucharadas no tienen peso confirmado: esta fórmula no tiene componentes con % p/p hasta pesarlas.$txt$, v_dt);

  -- Navi: PREP NAVI 8ml

  v_prod := (gmp.alta_producto_tercero(v_t_navi, 'PREP NAVI 8ml', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL2'), null, null, true, 'Manual: 14,00 L — 10,99 kg por tanda (16,27 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('136PRE'), null, 32.4524, false, 'Manual: 6,00 L — 5,28 kg por tanda (16,27 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$PREP NAVI - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 10.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol isopropilico: 14,00 L — 10,99 kg
  - Acetato de butilo: 6,00 L — 5,28 kg

ORDEN DE PREPARACION
  1. Agregar alcohol isopropilico.
  2. Agregar acetato de butilo.
  3. Mezclar hasta homogeneizar.

TOTAL: 20,00 L — 16,27 kg aprox.
RENDIMIENTO ORIENTATIVO: 20 L = 2.500 envases de PREP de 8 ml.
No confundir estas formulas con Nail Show o Glam.$txt$, v_dt);

  -- Navi: CLARIFICADOR NAVI

  v_prod := (gmp.alta_producto_tercero(v_t_navi, 'CLARIFICADOR NAVI', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL1'), null, null, true, 'Manual: 15,96 L — 12,59 kg por tanda (15,768 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('138CL2'), null, 19.9137, false, 'Manual: 4,00 L — 3,14 kg por tanda (15,768 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135FRA6'), null, 0.1585, false, 'Manual: 25 ml — 0,025 kg aprox. por tanda (15,768 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135FRA7'), null, 0.0824, false, 'Manual: 12,5 ml — 0,013 kg aprox. por tanda (15,768 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CLARIFICADOR NAVI - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 10.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol comun / cereal: 15,96 L — 12,59 kg
  - Alcohol isopropilico: 4,00 L — 3,14 kg
  - Chicle Pumita: 25 ml — 0,025 kg aprox.
  - Frambuesa: 12,5 ml — 0,013 kg aprox.

ORDEN DE PREPARACION
  1. Agregar alcohol comun / cereal.
  2. Agregar alcohol isopropilico.
  3. Agregar Chicle Pumita y Frambuesa al final.
  4. Mezclar hasta homogeneizar.

No confundir estas formulas con Nail Show o Glam.$txt$, v_dt);

  -- Navi: POLYGEL NAVI

  v_prod := (gmp.alta_producto_tercero(v_t_navi, 'POLYGEL NAVI', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL2'), null, null, true, 'Manual: 42,48 L — 33,35 kg por tanda (49,692 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('136PRE'), null, 26.5636, false, 'Manual: 15,00 L — 13,20 kg por tanda (49,692 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 6.0774, false, 'Manual: 2,40 L — 3,02 kg por tanda (49,692 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135FRA6'), null, 0.161, false, 'Manual: 80 ml — 0,080 kg aprox. por tanda (49,692 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 5, pg_temp.insumo('135FRA7'), null, 0.0845, false, 'Manual: 40 ml — 0,042 kg aprox. por tanda (49,692 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$POLYGEL NAVI - BIDON DE 60 L
Fuente: manual_formulas_produccion_v10.pdf, página 10.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol isopropilico: 42,48 L — 33,35 kg
  - Acetato de butilo: 15,00 L — 13,20 kg
  - Glicerina: 2,40 L — 3,02 kg
  - Chicle Pumita: 80 ml — 0,080 kg aprox.
  - Frambuesa: 40 ml — 0,042 kg aprox.

ORDEN DE PREPARACION
  1. Agregar primero el alcohol isopropilico.
  2. Agregar la glicerina.
  3. Agregar el acetato de butilo.
  4. Agregar Chicle Pumita + Frambuesa al final.
  5. Mezclar hasta homogeneizar.

No confundir estas formulas con Nail Show o Glam.$txt$, v_dt);

  -- Navi: REMOVEDOR DE ESMALTE NAVI 250ml

  v_prod := (gmp.alta_producto_tercero(v_t_navi, 'REMOVEDOR DE ESMALTE NAVI 250ml', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Removedor base', null, true, 'Manual: 20,00 L — 20,00 kg aprox. por tanda (35,856 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('138CL1'), null, 44.0094, false, 'Manual: 20,00 L — 15,78 kg aprox. por tanda (35,856 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135FRA6'), null, 0.1394, false, 'Manual: 50 ml — 0,050 kg aprox. por tanda (35,856 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, pg_temp.insumo('135FRA7'), null, 0.0725, false, 'Manual: 25 ml — 0,026 kg aprox. por tanda (35,856 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$REMOVEDOR DE ESMALTE NAVI - OLLA DE 40 L
Fuente: manual_formulas_produccion_v10.pdf, página 11.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Removedor base: 20,00 L — 20,00 kg aprox.
  - Alcohol comun / cereal: 20,00 L — 15,78 kg aprox.
  - Chicle Pumita: 50 ml — 0,050 kg aprox.
  - Frambuesa: 25 ml — 0,026 kg aprox.

ORDEN DE PREPARACION
  1. Agregar el removedor base y el alcohol comun / cereal en la OLLA DE 40 L.
  2. Agregar Chicle Pumita y Frambuesa.
  3. Mezclar hasta homogeneizar.

RECIPIENTE: OLLA DE 40 L. Rendimiento aproximado: 160 envases de 250 ml.
El manual no trae orden de preparacion para esta formula: el orden de arriba es el de la tabla de componentes y lo tiene que confirmar Produccion.$txt$, v_dt);

  -- Navi: REMOVEDOR DE UÑAS ARTIFICIALES NAVI 250ml

  v_prod := (gmp.alta_producto_tercero(v_t_navi, 'REMOVEDOR DE UÑAS ARTIFICIALES NAVI 250ml', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Removedor base', null, true, 'Manual: 3 bidones de 20 L — 60,00 kg aprox. por tanda (60,115 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135FRA6'), null, 0.1248, false, 'Manual: 75 ml — 0,075 kg aprox. por tanda (60,115 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135FRA7'), null, 0.0665, false, 'Manual: 37,5 ml — 0,040 kg aprox. por tanda (60,115 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$REMOVEDOR DE UÑAS ARTIFICIALES NAVI - BIDON AZUL DE 60 L
Fuente: manual_formulas_produccion_v10.pdf, página 11.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Removedor base: 3 bidones de 20 L — 60,00 kg aprox.
  - Chicle Pumita: 75 ml — 0,075 kg aprox.
  - Frambuesa: 37,5 ml — 0,040 kg aprox.

ORDEN DE PREPARACION
  1. Preparar directamente en el BIDON AZUL DE 60 L.
  2. Agregar los 3 bidones de 20 L de removedor base.
  3. Agregar Chicle Pumita y Frambuesa.
  4. Mezclar hasta homogeneizar.

Rendimiento aproximado: 240 envases de 250 ml.
El manual no trae orden de preparacion para esta formula: el orden de arriba es el de la tabla de componentes y lo tiene que confirmar Produccion.$txt$, v_dt);

  -- Glam: SANITIZANTE LIMON GLAM

  v_prod := (gmp.alta_producto_tercero(v_t_glam, 'SANITIZANTE LIMON GLAM', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 29,00 L — 22,88 kg aprox. por tanda (33,285 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 30.0436, false, 'Manual: 10,00 L — 10,00 kg por tanda (33,285 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 0.9914, false, 'Manual: 260 ml — 0,33 kg aprox. por tanda (33,285 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, null, 'Esencia Limon', 0.2253, false, 'Manual: 75 ml — 0,075 kg aprox. por tanda (33,285 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE LIMON GLAM - OLLA DE 40 L (y BIDON GRANDE DE 200 L)
Fuente: manual_formulas_produccion_v10.pdf, página 12.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol comun / cereal: 29,00 L — 22,88 kg aprox.
  - Agua desionizada: 10,00 L — 10,00 kg
  - Glicerina: 260 ml — 0,33 kg aprox.
  - Esencia Limon: 75 ml — 0,075 kg aprox.
  - Colorante amarillo: 2 cucharadas de 1/8 tsp — Medir con cuchara 1/8

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua e incorporar.
  3. Agregar el ALCOHOL.
  4. Pasar a la OLLA.
  5. En la olla agregar 75 ml de esencia LIMON.
  6. Agregar 2 cucharadas de 1/8 tsp de colorante AMARILLO.

Aroma/color del sanitizante: LIMON + AMARILLO. Usar la cuchara 1/8 tsp para el colorante amarillo.

TANDA EN BIDON GRANDE DE 200 L (mismas proporciones):
  - Alcohol comun / cereal: 145 L — 114,41 kg aprox.
  - Agua desionizada: 50 L — 50,00 kg
  - Glicerina: 1,30 L — 1,64 kg aprox.
  - Esencia Limon: 375 ml — 0,375 kg aprox.
  - Colorante amarillo: 10 cucharadas de 1/8 tsp
Orden en 200 L: AGUA; GLICERINA con un chorrito de agua; ALCOHOL; 375 ml de esencia LIMON; 10 cucharadas de 1/8 tsp de colorante AMARILLO.$txt$, v_dt);

  -- Glam: CLARIFICADOR GLAM

  v_prod := (gmp.alta_producto_tercero(v_t_glam, 'CLARIFICADOR GLAM', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('138CL1'), null, null, true, 'Manual: 15,85 L aprox. — 12,50 kg aprox. por tanda (15,79 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('138CL2'), null, 19.886, false, 'Manual: 4,00 L — 3,14 kg por tanda (15,79 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, null, 'Esencia Frutilla', 0.95, false, 'Manual: 150 ml — 0,150 kg aprox. por tanda (15,79 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CLARIFICADOR GLAM - BIDON DE 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 13.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol comun / cereal: 15,85 L aprox. — 12,50 kg aprox.
  - Alcohol isopropilico: 4,00 L — 3,14 kg
  - Esencia Frutilla: 150 ml — 0,150 kg aprox.
  - Colorante rojo: Ajustar visualmente — Agregar de a poco

ORDEN DE PREPARACION
  1. Agregar el alcohol comun / cereal.
  2. Agregar el alcohol isopropilico.
  3. Agregar la esencia FRUTILLA.
  4. Agregar el colorante rojo de a poco, ajustando visualmente.

ESENCIA CONFIRMADA: FRUTILLA - 150 ml (aprox. 0,150 kg) por cada 20 L.
El manual no trae orden de preparacion para esta formula: el orden de arriba es el de la tabla de componentes y lo tiene que confirmar Produccion.$txt$, v_dt);

  -- Glam: POLYGEL GLAM

  v_prod := (gmp.alta_producto_tercero(v_t_glam, 'POLYGEL GLAM', null, null)).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from null
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, null, coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$POLYGEL GLAM - REFERENCIA DE TANDA DE 60 L
Fuente: manual_formulas_produccion_v10.pdf, página 13.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Base de Polygel Glam: 60 L de liquido preparado — Segun formula operativa vigente
  - Esencia Anana: 200 ml — 0,200 kg aprox.
  - Colorante azul: 1 cucharada de 2,5 ml — Medir con cuchara 2,5 ml

ORDEN DE PREPARACION
  1. Preparar los 60 L de base de Polygel Glam.
  2. Agregar 200 ml de esencia ANANA.
  3. Agregar 1 cucharada de 2,5 ml de colorante AZUL.

REFERENCIA CONFIRMADA EN PRODUCCION: 60 L + 200 ml de ANANA + 1 cucharada de 2,5 ml de colorante AZUL.
La base de Polygel Glam no esta en el manual ("segun formula operativa vigente"): sin ella no hay % p/p. No asumir la base de otra marca.$txt$, v_dt);

  -- Jennifer Beauty: CREMA HUMECTANTE JENNIFER BEAUTY 200g MANGO / DURAZNO

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'CREMA HUMECTANTE JENNIFER BEAUTY 200g MANGO / DURAZNO', null, 'MANGO / DURAZNO')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'MANGO / DURAZNO'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'MANGO / DURAZNO', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de crema humectante (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia MANGO / DURAZNO', 0.6, false, 'Manual: esencia al 0,60 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CREMA HUMECTANTE JENNIFER BEAUTY 200 g MANGO / DURAZNO
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Crema humectante a producir: 100 kg — 100 kg
  - Esencia MANGO / DURAZNO (0,6 %): 0,6 % — 0,600 kg — PESAR EN KG

ORDEN DE PREPARACION
  1. Pesar la base de crema humectante.
  2. Pesar la esencia al 0,6 % (0,600 kg cada 100 kg) e incorporarla.
  3. Mezclar hasta homogeneizar.

TOTAL HUMECTANTE: 1.500 unidades x 200 g = 300 kg. Dividir 100 kg por aroma.
La base de la crema no esta en el manual: solo la dosificacion de esencia. No asumir la formula de otra marca/cliente.$txt$, v_dt);

  -- Jennifer Beauty: CREMA EXFOLIANTE JENNIFER BEAUTY 200g MANGO / DURAZNO

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'CREMA EXFOLIANTE JENNIFER BEAUTY 200g MANGO / DURAZNO', null, 'MANGO / DURAZNO')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'MANGO / DURAZNO'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'MANGO / DURAZNO', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de crema exfoliante (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia MANGO / DURAZNO', 0.6, false, 'Manual: esencia al 0,60 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CREMA EXFOLIANTE JENNIFER BEAUTY 200 g MANGO / DURAZNO
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Crema exfoliante a producir: 100 kg — 100 kg
  - Esencia MANGO / DURAZNO (0,6 %): 0,6 % — 0,600 kg — PESAR EN KG

ORDEN DE PREPARACION
  1. Pesar la base de crema exfoliante.
  2. Pesar la esencia al 0,6 % (0,600 kg cada 100 kg) e incorporarla.
  3. Mezclar hasta homogeneizar.

TOTAL EXFOLIANTE: 1.500 unidades x 200 g = 300 kg. Dividir 100 kg por aroma.
La base de la crema no esta en el manual: solo la dosificacion de esencia. No asumir la formula de otra marca/cliente.$txt$, v_dt);

  -- Jennifer Beauty: SANITIZANTE JENNIFER BEAUTY 100ml MANGO / DURAZNO

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'SANITIZANTE JENNIFER BEAUTY 100ml MANGO / DURAZNO', null, 'MANGO / DURAZNO')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'MANGO / DURAZNO'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'MANGO / DURAZNO', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.7265, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 0.9512, false, 'Manual: 0,13 L — 0,16 kg aprox. por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, null, 'Esencia MANGO / DURAZNO', 1.1891, false, 'Manual: 200 g por 20 L — 0,200 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE JENNIFER BEAUTY 100 ml MANGO / DURAZNO - REFERENCIA POR 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,16 kg aprox.
  - Esencia MANGO / DURAZNO: 200 g por 20 L — 0,200 kg
  - Colorante: Segun variante — Segun variante

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua e incorporar.
  3. Agregar el ALCOHOL.
  4. Agregar la ESENCIA y el colorante de la variante.

PEDIDO DE REFERENCIA: 500 unidades x 100 ml = 50 L — esencia necesaria 0,500 kg (MANGO / DURAZNO).$txt$, v_dt);

  -- Jennifer Beauty: ACEITE DE CUTICULA JENNIFER BEAUTY 30ml MANGO / DURAZNO

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'ACEITE DE CUTICULA JENNIFER BEAUTY 30ml MANGO / DURAZNO', null, 'MANGO / DURAZNO')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'MANGO / DURAZNO'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'MANGO / DURAZNO', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de aceite de cuticula (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia MANGO / DURAZNO', 0.8, false, 'Manual: esencia al 0,80 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$ACEITE DE CUTICULA JENNIFER BEAUTY 30 ml MANGO / DURAZNO
Fuente: manual_formulas_produccion_v10.pdf, página 15.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. Preparar la base del aceite de cuticula.
  2. Agregar la esencia al 0,80 %.
  3. Mezclar hasta homogeneizar.

PEDIDO DE REFERENCIA: 500 unidades x 30 ml = 15 L — esencia al 0,80 %: 0,120 kg aprox. (MANGO / DURAZNO).
La dosificacion confirmada de esencia es 0,80 %. La formula/base completa del aceite no fue especificada en este manual.$txt$, v_dt);

  -- Jennifer Beauty: CREMA HUMECTANTE JENNIFER BEAUTY 200g FRUTOS ROJOS

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'CREMA HUMECTANTE JENNIFER BEAUTY 200g FRUTOS ROJOS', null, 'FRUTOS ROJOS')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'FRUTOS ROJOS'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'FRUTOS ROJOS', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de crema humectante (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia FRUTOS ROJOS', 0.6, false, 'Manual: esencia al 0,60 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CREMA HUMECTANTE JENNIFER BEAUTY 200 g FRUTOS ROJOS
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Crema humectante a producir: 100 kg — 100 kg
  - Esencia FRUTOS ROJOS (0,6 %): 0,6 % — 0,600 kg — PESAR EN KG

ORDEN DE PREPARACION
  1. Pesar la base de crema humectante.
  2. Pesar la esencia al 0,6 % (0,600 kg cada 100 kg) e incorporarla.
  3. Mezclar hasta homogeneizar.

TOTAL HUMECTANTE: 1.500 unidades x 200 g = 300 kg. Dividir 100 kg por aroma.
La base de la crema no esta en el manual: solo la dosificacion de esencia. No asumir la formula de otra marca/cliente.$txt$, v_dt);

  -- Jennifer Beauty: CREMA EXFOLIANTE JENNIFER BEAUTY 200g FRUTOS ROJOS

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'CREMA EXFOLIANTE JENNIFER BEAUTY 200g FRUTOS ROJOS', null, 'FRUTOS ROJOS')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'FRUTOS ROJOS'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'FRUTOS ROJOS', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de crema exfoliante (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia FRUTOS ROJOS', 0.6, false, 'Manual: esencia al 0,60 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CREMA EXFOLIANTE JENNIFER BEAUTY 200 g FRUTOS ROJOS
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Crema exfoliante a producir: 100 kg — 100 kg
  - Esencia FRUTOS ROJOS (0,6 %): 0,6 % — 0,600 kg — PESAR EN KG

ORDEN DE PREPARACION
  1. Pesar la base de crema exfoliante.
  2. Pesar la esencia al 0,6 % (0,600 kg cada 100 kg) e incorporarla.
  3. Mezclar hasta homogeneizar.

TOTAL EXFOLIANTE: 1.500 unidades x 200 g = 300 kg. Dividir 100 kg por aroma.
La base de la crema no esta en el manual: solo la dosificacion de esencia. No asumir la formula de otra marca/cliente.$txt$, v_dt);

  -- Jennifer Beauty: SANITIZANTE JENNIFER BEAUTY 100ml FRUTOS ROJOS

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'SANITIZANTE JENNIFER BEAUTY 100ml FRUTOS ROJOS', null, 'FRUTOS ROJOS')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'FRUTOS ROJOS'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'FRUTOS ROJOS', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.7265, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 0.9512, false, 'Manual: 0,13 L — 0,16 kg aprox. por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, null, 'Esencia FRUTOS ROJOS', 1.1891, false, 'Manual: 200 g por 20 L — 0,200 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE JENNIFER BEAUTY 100 ml FRUTOS ROJOS - REFERENCIA POR 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,16 kg aprox.
  - Esencia FRUTOS ROJOS: 200 g por 20 L — 0,200 kg
  - Colorante: Segun variante — Segun variante

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua e incorporar.
  3. Agregar el ALCOHOL.
  4. Agregar la ESENCIA y el colorante de la variante.

PEDIDO DE REFERENCIA: 500 unidades x 100 ml = 50 L — esencia necesaria 0,500 kg (FRUTOS ROJOS).$txt$, v_dt);

  -- Jennifer Beauty: ACEITE DE CUTICULA JENNIFER BEAUTY 30ml FRUTOS ROJOS

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'ACEITE DE CUTICULA JENNIFER BEAUTY 30ml FRUTOS ROJOS', null, 'FRUTOS ROJOS')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'FRUTOS ROJOS'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'FRUTOS ROJOS', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de aceite de cuticula (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia FRUTOS ROJOS', 0.8, false, 'Manual: esencia al 0,80 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$ACEITE DE CUTICULA JENNIFER BEAUTY 30 ml FRUTOS ROJOS
Fuente: manual_formulas_produccion_v10.pdf, página 15.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. Preparar la base del aceite de cuticula.
  2. Agregar la esencia al 0,80 %.
  3. Mezclar hasta homogeneizar.

PEDIDO DE REFERENCIA: 500 unidades x 30 ml = 15 L — esencia al 0,80 %: 0,120 kg aprox. (FRUTOS ROJOS).
La dosificacion confirmada de esencia es 0,80 %. La formula/base completa del aceite no fue especificada en este manual.$txt$, v_dt);

  -- Jennifer Beauty: CREMA HUMECTANTE JENNIFER BEAUTY 200g COCO / VAINILLA

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'CREMA HUMECTANTE JENNIFER BEAUTY 200g COCO / VAINILLA', null, 'COCO / VAINILLA')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'COCO / VAINILLA'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'COCO / VAINILLA', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de crema humectante (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia COCO / VAINILLA', 0.6, false, 'Manual: esencia al 0,60 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CREMA HUMECTANTE JENNIFER BEAUTY 200 g COCO / VAINILLA
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Crema humectante a producir: 100 kg — 100 kg
  - Esencia COCO / VAINILLA (0,6 %): 0,6 % — 0,600 kg — PESAR EN KG

ORDEN DE PREPARACION
  1. Pesar la base de crema humectante.
  2. Pesar la esencia al 0,6 % (0,600 kg cada 100 kg) e incorporarla.
  3. Mezclar hasta homogeneizar.

TOTAL HUMECTANTE: 1.500 unidades x 200 g = 300 kg. Dividir 100 kg por aroma.
La base de la crema no esta en el manual: solo la dosificacion de esencia. No asumir la formula de otra marca/cliente.$txt$, v_dt);

  -- Jennifer Beauty: CREMA EXFOLIANTE JENNIFER BEAUTY 200g COCO / VAINILLA

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'CREMA EXFOLIANTE JENNIFER BEAUTY 200g COCO / VAINILLA', null, 'COCO / VAINILLA')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'COCO / VAINILLA'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'COCO / VAINILLA', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de crema exfoliante (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia COCO / VAINILLA', 0.6, false, 'Manual: esencia al 0,60 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$CREMA EXFOLIANTE JENNIFER BEAUTY 200 g COCO / VAINILLA
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Crema exfoliante a producir: 100 kg — 100 kg
  - Esencia COCO / VAINILLA (0,6 %): 0,6 % — 0,600 kg — PESAR EN KG

ORDEN DE PREPARACION
  1. Pesar la base de crema exfoliante.
  2. Pesar la esencia al 0,6 % (0,600 kg cada 100 kg) e incorporarla.
  3. Mezclar hasta homogeneizar.

TOTAL EXFOLIANTE: 1.500 unidades x 200 g = 300 kg. Dividir 100 kg por aroma.
La base de la crema no esta en el manual: solo la dosificacion de esencia. No asumir la formula de otra marca/cliente.$txt$, v_dt);

  -- Jennifer Beauty: SANITIZANTE JENNIFER BEAUTY 100ml COCO / VAINILLA

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'SANITIZANTE JENNIFER BEAUTY 100ml COCO / VAINILLA', null, 'COCO / VAINILLA')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'COCO / VAINILLA'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'COCO / VAINILLA', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, pg_temp.insumo('135SAN'), null, null, true, 'Manual: 14,50 L — 11,46 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, pg_temp.insumo('135AGUA'), null, 29.7265, false, 'Manual: 5,00 L — 5,00 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 3, pg_temp.insumo('135GLI'), null, 0.9512, false, 'Manual: 0,13 L — 0,16 kg aprox. por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 4, null, 'Esencia COCO / VAINILLA', 1.1891, false, 'Manual: 200 g por 20 L — 0,200 kg por tanda (16,82 kg pesados en total).');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$SANITIZANTE JENNIFER BEAUTY 100 ml COCO / VAINILLA - REFERENCIA POR 20 L
Fuente: manual_formulas_produccion_v10.pdf, página 14.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)
  - Alcohol de cereal / cleanser: 14,50 L — 11,46 kg
  - Agua desionizada: 5,00 L — 5,00 kg
  - Glicerina: 0,13 L — 0,16 kg aprox.
  - Esencia COCO / VAINILLA: 200 g por 20 L — 0,200 kg
  - Colorante: Segun variante — Segun variante

ORDEN DE PREPARACION
  1. Agregar primero el AGUA.
  2. Mezclar la GLICERINA con un chorrito de agua e incorporar.
  3. Agregar el ALCOHOL.
  4. Agregar la ESENCIA y el colorante de la variante.

PEDIDO DE REFERENCIA: 500 unidades x 100 ml = 50 L — esencia necesaria 0,500 kg (COCO / VAINILLA).$txt$, v_dt);

  -- Jennifer Beauty: ACEITE DE CUTICULA JENNIFER BEAUTY 30ml COCO / VAINILLA

  v_prod := (gmp.alta_producto_tercero(v_t_jennifer_beauty, 'ACEITE DE CUTICULA JENNIFER BEAUTY 30ml COCO / VAINILLA', null, 'COCO / VAINILLA')).id;
  v_f := null;
  select f.id into v_f from gmp.formulas_fabricacion f where f.producto_id = v_prod and f.estado = 'BORRADOR'
     and f.variedad is not distinct from 'COCO / VAINILLA'
     and not exists (select 1 from gmp.formula_componentes c where c.formula_id = f.id)
     and not exists (select 1 from gmp.formula_procedimientos p where p.formula_id = f.id)
   order by f.creado_en limit 1;
  if v_f is null then
    insert into gmp.formulas_fabricacion (producto_id, variedad, version, emitida_por)
    values (v_prod, 'COCO / VAINILLA', coalesce((select (max(version::int) + 1)::text from gmp.formulas_fabricacion where producto_id = v_prod and version ~ '^[0-9]+$'), '1'), v_dt)
    returning id into v_f;
  end if;
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 1, null, 'Base de aceite de cuticula (no especificada en el manual)', null, true, 'Base no especificada en el manual: completar antes de aprobar.');
  insert into gmp.formula_componentes (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, observacion) values (v_f, 2, null, 'Esencia COCO / VAINILLA', 0.8, false, 'Manual: esencia al 0,80 %.');
  insert into gmp.formula_procedimientos (formula_id, version, texto, redactado_por) values (v_f, 1, $txt$ACEITE DE CUTICULA JENNIFER BEAUTY 30 ml COCO / VAINILLA
Fuente: manual_formulas_produccion_v10.pdf, página 15.

BALANZA: SIEMPRE EN KG. No pesar en gramos sin convertir a kg.

COMPONENTES (cantidad por tanda — peso en balanza)


ORDEN DE PREPARACION
  1. Preparar la base del aceite de cuticula.
  2. Agregar la esencia al 0,80 %.
  3. Mezclar hasta homogeneizar.

PEDIDO DE REFERENCIA: 500 unidades x 30 ml = 15 L — esencia al 0,80 %: 0,120 kg aprox. (COCO / VAINILLA).
La dosificacion confirmada de esencia es 0,80 %. La formula/base completa del aceite no fue especificada en este manual.$txt$, v_dt);
end;
$carga$;

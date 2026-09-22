-- ---------------------------------------------------------------------------
-- Propósito : Reemplazar el modelo lineal de densidad por el ajuste polinómico
--             de grado 4 válido de 0 a 45 °C, y cargar los 91 compuestos de
--             la tabla de referencia. Agrega gmp.densidad_a(), que es de ahora
--             en más la única autoridad sobre «cuánto pesa un litro de esto a
--             esta temperatura».
-- Reglas    : PG.60.8 (fórmula maestra y hoja de pesada). RN-01: el dato de
--             literatura no sirve para fabricar, y por eso los 91 entran con
--             fuente LITERATURA.
-- Fecha     : 2026-09-22
-- ---------------------------------------------------------------------------
--
-- QUÉ CAMBIA Y POR QUÉ.
-- La tabla modelaba la densidad como `densidad_ref * (1 - beta_k * (T - T_ref))`:
-- una recta trazada desde un punto. Sirve cerca de la referencia y se desvía
-- lejos. La tabla de origen trae para cada compuesto un ajuste
--
--     rho(T) = a0 + a1·T + a2·T² + a3·T³ + a4·T⁴        (T en °C, rho en g/cm³)
--
-- con el residuo máximo del ajuste, la incertidumbre estimada y la fuente
-- citada. Guardar eso como una pendiente sería tirar el dato.
--
-- EL beta NO SE BORRA. Una densidad que entra por certificado de lote o por
-- medición propia va a seguir teniendo un punto y, con suerte, un coeficiente
-- de expansión. `gmp.densidad_a()` usa el polinomio cuando está y cae al
-- modelo lineal cuando no, así que las dos formas conviven sin que quien
-- calcula tenga que saber cuál le tocó.
--
-- POR QUÉ LOS 91 ENTRAN COMO `LITERATURA`.
-- Son correlaciones publicadas y ajustes a datos de literatura, no mediciones
-- de los lotes que se van a usar. La calculadora ya marca con una advertencia
-- todo componente cuya densidad sea de literatura, y la hoja de pesada exige
-- reemplazarla por la del certificado o por una medición propia. Cargarlos como
-- FARMACOPEA o MEDICION_PROPIA silenciaría esa advertencia, que es justamente
-- el control que hace falta.
--
-- Archivo de origen: Densidades_liquidos_0-45C.xlsx
-- sha256: 1dc13e7743e7ee198a381aa49a13e3d8fc7b0940f6a854fd15a1500dffecc308

-- ---------------------------------------------------------------------------
-- 1. Columnas del ajuste polinómico
-- ---------------------------------------------------------------------------

alter table gmp.densidades_referencia
  add column if not exists cas             text,
  add column if not exists formula_quimica text,
  add column if not exists masa_molar      numeric(9,3),
  add column if not exists temp_fusion_c   numeric(6,2),
  add column if not exists categoria       text,
  -- Coeficientes del polinomio. `double precision` y no `numeric`: a4 anda en
  -- el orden de 1e-10 y lo que importa es el rango del exponente, no los
  -- decimales exactos de cada coeficiente.
  add column if not exists a0 double precision,
  add column if not exists a1 double precision,
  add column if not exists a2 double precision,
  add column if not exists a3 double precision,
  add column if not exists a4 double precision,
  add column if not exists residuo_max     double precision,
  add column if not exists valido_desde_c  numeric(5,2) not null default 0,
  add column if not exists valido_hasta_c  numeric(5,2) not null default 45,
  add column if not exists calidad         text,
  add column if not exists metodo          text,
  add column if not exists incertidumbre   text,
  add column if not exists referencia      text,
  add column if not exists rango_datos     text,
  add column if not exists notas           text;

-- densidad_ref pasa a ser opcional: un compuesto descripto por el polinomio no
-- necesita un punto de referencia suelto. Se exige que haya una cosa o la otra.
alter table gmp.densidades_referencia
  alter column densidad_ref drop not null;

alter table gmp.densidades_referencia
  drop constraint if exists densidad_tiene_modelo;
alter table gmp.densidades_referencia
  add constraint densidad_tiene_modelo check (
    densidad_ref is not null or a0 is not null
  );

alter table gmp.densidades_referencia
  drop constraint if exists densidad_rango_valido;
alter table gmp.densidades_referencia
  add constraint densidad_rango_valido check (valido_desde_c < valido_hasta_c);

comment on column gmp.densidades_referencia.a0 is
  'Coeficiente independiente de rho(T) = a0 + a1*T + a2*T^2 + a3*T^3 + a4*T^4, T en grados Celsius, rho en g/cm3.';
comment on column gmp.densidades_referencia.calidad is
  'Grado del dato de origen: A+ (ecuacion de estado de referencia), A (correlacion publicada), B (ajuste a datos experimentales), C (punto de referencia mas pendiente estimada).';
comment on constraint densidad_tiene_modelo on gmp.densidades_referencia is
  'Una densidad sirve si se puede evaluar: o trae polinomio, o trae un punto de referencia. Sin ninguno de los dos no es un dato.';

-- ---------------------------------------------------------------------------
-- 2. La autoridad sobre rho(T)
-- ---------------------------------------------------------------------------
--
-- Fuera del rango de validez NO extrapola: un polinomio de grado 4 ajustado
-- entre 0 y 45 °C se dispara apenas se sale, y devolver un número que parece
-- una densidad es peor que no devolver nada. El que llama decide qué hacer con
-- el error; la funcion no inventa.

create or replace function gmp.densidad_a(p_densidad_id uuid, p_temp_c numeric)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  d gmp.densidades_referencia%rowtype;
  t double precision := p_temp_c::double precision;
begin
  select * into d from gmp.densidades_referencia where id = p_densidad_id;
  if not found then
    raise exception 'No existe la densidad de referencia %.', p_densidad_id
      using errcode = 'no_data_found';
  end if;

  if p_temp_c < d.valido_desde_c or p_temp_c > d.valido_hasta_c then
    raise exception
      'La densidad de «%» esta definida entre % y % grados C; se pidio a %.',
      d.nombre, d.valido_desde_c, d.valido_hasta_c, p_temp_c
      using errcode = 'check_violation';
  end if;

  if d.a0 is not null then
    return (
      d.a0
      + coalesce(d.a1, 0) * t
      + coalesce(d.a2, 0) * t * t
      + coalesce(d.a3, 0) * t * t * t
      + coalesce(d.a4, 0) * t * t * t * t
    )::numeric;
  end if;

  -- Sin polinomio: el modelo lineal de siempre, para las densidades que entran
  -- por certificado de lote o medicion propia.
  return (
    d.densidad_ref * (1 - coalesce(d.beta_k, 0) * (p_temp_c - d.temp_ref_c))
  )::numeric;
end;
$$;

comment on function gmp.densidad_a is
  'Densidad en g/cm3 de una referencia a una temperatura. Usa el polinomio si esta cargado y el modelo lineal si no. No extrapola fuera del rango de validez.';

-- ---------------------------------------------------------------------------
-- 3. Carga de los 91 compuestos
-- ---------------------------------------------------------------------------
--
-- `nombre` no era unico: la tabla solo tenia un indice unico sobre insumo_id.
-- Se agrega, porque el nombre del compuesto es de hecho su identidad en esta
-- tabla y porque el upsert de abajo lo necesita: asi, corregir un coeficiente
-- manana es volver a pasar por aca y no crear una segunda fila que compita con
-- la primera.

create unique index if not exists densidades_nombre_idx
  on gmp.densidades_referencia (nombre);

-- SOBRE LAS 10 DENSIDADES QUE YA ESTABAN (seed de 20260917110000).
-- Cinco coinciden exactamente de nombre con las nuevas —Acetona, Glicerina,
-- Propilenglicol, Acetato de etilo y Metacrilato de etilo (EMA)— y el upsert
-- las completa con el polinomio, sin tocarles la densidad_ref que ya tenian.
--
-- Las otras cinco quedan como estaban, con modelo lineal, y conviven con una
-- entrada nueva parecida:
--
--   'Agua desionizada'   junto a  'Agua'
--   'Etanol absoluto'    junto a  'Etanol'
--   'Isopropanol'        junto a  '2-Propanol (IPA)'
--   'Acetato de butilo'  junto a  'Acetato de n-butilo'
--   'Etanol 96 GL'       — esta NO tiene equivalente: es una mezcla al 96 %,
--                          no etanol puro, y su densidad no es la del etanol.
--
-- No se desactiva ninguna. Cual de las dos entradas corresponde usar en cada
-- formula es una decision de quien escribe la formula, no de esta migracion, y
-- desactivar una densidad a la que una formula ya apunta la dejaria sin dato.
-- Queda para consolidar cuando Direccion Tecnica revise el listado.

insert into gmp.densidades_referencia
  (nombre, categoria, cas, formula_quimica, masa_molar, temp_fusion_c,
   a0, a1, a2, a3, a4, residuo_max, densidad_ref, calidad, metodo,
   incertidumbre, referencia, rango_datos, notas,
   temp_ref_c, fuente, valido_desde_c, valido_hasta_c, activo)
select
  v.nombre, v.categoria, v.cas, v.formula_quimica, v.masa_molar, v.temp_fusion_c,
  v.a0, v.a1, v.a2, v.a3, v.a4, v.residuo_max, v.rho20, v.calidad, v.metodo,
  v.incertidumbre, v.referencia, v.rango_datos, v.notas,
  20, 'LITERATURA', 0, 45, true
from (values
  ('Agua', 'Solventes y alcoholes', '7732-18-5', 'H2O', 18.02, 0.0, 0.999846169590415, 6.51101347498192e-05, -8.61963710873087e-06, 7.1195320239951e-08, -3.89812347670752e-10, 3.08408607618826e-06, 0.998207710028212, 'A+', 'A+ · EOS de referencia (IAPWS-95)', '±0.0001 %', 'IAPWS-95 (Wagner & Pruß 2002, J. Phys. Chem. Ref. Data 31:387), 1 atm', '0 a 45', 'Máximo de densidad a 3.98 °C'),
  ('Metanol', 'Solventes y alcoholes', '67-56-1', 'CH4O', 32.04, null, 0.80972217977035, -0.000937268964023709, 1.33025636650661e-07, -2.11450481265024e-09, -5.69504902861717e-11, 4.08340012136854e-07, 0.791003982627589, 'A', 'A · EOS de referencia (Helmholtz)', '±0.05 %', 'Ecuación de estado de referencia (Helmholtz, NIST REFPROP/CoolProp), ajuste en thermo (C. Bell)', '0 a 45', null),
  ('Etanol', 'Solventes y alcoholes', '64-17-5', 'C2H6O', 46.07, null, 0.806413774768253, -0.000845832981684972, -8.60796206808377e-08, -4.70355794058011e-09, -2.00817210630658e-11, 4.8515718997777e-07, 0.789421841747386, 'A', 'A · EOS de referencia (Helmholtz)', '±0.05 %', 'Ecuación de estado de referencia (Helmholtz, NIST REFPROP/CoolProp), ajuste en thermo (C. Bell)', '0 a 45', null),
  ('Acetona', 'Solventes y alcoholes', '67-64-1', 'C3H6O', 58.08, null, 0.812180145263344, -0.00108333257358698, -5.17506741292219e-07, -4.32559981707421e-09, -1.10232246004394e-11, 7.34802147794866e-07, 0.790270122580615, 'A', 'A · EOS de referencia (Helmholtz)', '±0.05 %', 'Ecuación de estado de referencia (Helmholtz, NIST REFPROP/CoolProp), ajuste en thermo (C. Bell)', '0 a 45', null),
  ('Tolueno', 'Solventes y alcoholes', '108-88-3', 'C7H8', 92.14, null, 0.885420870981221, -0.000924424369302833, -5.57837845624401e-08, -2.29576607218485e-09, -3.17256299345238e-12, 2.24736654841351e-07, 0.866891196342683, 'A', 'A · EOS de referencia (Helmholtz)', '±0.05 %', 'Ecuación de estado de referencia (Helmholtz, NIST REFPROP/CoolProp), ajuste en thermo (C. Bell)', '0 a 45', null),
  ('n-Heptano', 'Solventes y alcoholes', '142-82-5', 'C7H16', 100.2, null, 0.700617848788936, -0.00083257787530431, -2.59968540414314e-07, -1.85461870882829e-09, -1.31619896019282e-11, 3.98976194526668e-07, 0.683845360998677, 'A', 'A · EOS de referencia (Helmholtz)', '±0.05 %', 'Ecuación de estado de referencia (Helmholtz, NIST REFPROP/CoolProp), ajuste en thermo (C. Bell)', '0 a 45', null),
  ('1-Propanol', 'Solventes y alcoholes', '71-23-8', 'C3H8O', 60.1, null, 0.820857453500666, -0.000824020611190873, -7.8384883182117e-07, -1.42838594151374e-09, -5.34480713969542e-12, 9.98348759218004e-09, 0.804051219487445, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('2-Propanol (IPA)', 'Solventes y alcoholes', '67-63-0', 'C3H8O', 60.1, null, 0.80408901697855, -0.000869006880988773, -1.01603645303823e-06, -1.89400346518078e-09, -8.35929526683925e-12, 1.78490330293712e-08, 0.786285975262595, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('1-Butanol', 'Solventes y alcoholes', '71-36-3', 'C4H10O', 74.12, null, 0.825757842474557, -0.000783594974935214, -6.43826534179036e-07, -1.10448435702449e-09, -3.60206219224139e-12, 6.02661709425689e-09, 0.809819000157374, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('Isobutanol', 'Solventes y alcoholes', '78-83-1', 'C4H10O', 74.12, null, 0.818437165044247, -0.000780562431363495, -9.23055755269081e-07, -1.13607836342085e-09, -3.72519979670254e-12, 6.61252863576323e-09, 0.802447009455994, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('Metiletilcetona (MEK)', 'Solventes y alcoholes', '78-93-3', 'C4H8O', 72.11, null, 0.826516284401997, -0.00105129278879657, -7.82011845320304e-07, -1.42364020936684e-09, -5.12816284052674e-12, 9.37729938144116e-09, 0.805165414260208, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('Acetato de metilo', 'Solventes y alcoholes', '79-20-9', 'C3H6O2', 74.08, null, 0.959435332832887, -0.00124126057764251, -1.09190585767987e-06, -2.38360212308071e-09, -1.0538339833992e-11, 2.22743198330377e-08, 0.934152603985607, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('Acetato de etilo', 'Solventes y alcoholes', '141-78-6', 'C4H8O2', 88.11, null, 0.92292999281304, -0.00112717542745981, -9.37087240044862e-07, -1.95714203769585e-09, -7.73924643125188e-12, 1.50325092374004e-08, 0.899994753952096, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('Acetato de n-propilo', 'Solventes y alcoholes', '109-60-4', 'C5H10O2', 102.13, null, 0.908752508695766, -0.00103090636155, -7.62948675635035e-07, -1.38331102017113e-09, -4.71070789824301e-12, 8.1826456721501e-09, 0.887817381793087, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('Alcohol bencílico', 'Solventes y alcoholes', '100-51-6', 'C7H8O', 108.14, null, 1.06119737112994, -0.000743852078271257, -3.7317341918609e-07, -3.95960619304803e-10, -7.12138722922133e-13, 7.31306792900455e-10, 1.04616777856969, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas, 2ª ed. (2010), correlación PPDS', '0 a 45', null),
  ('2-Butanol', 'Solventes y alcoholes', '78-92-2', 'C4H10O', 74.12, null, 0.826047628714773, -0.000929687058357986, -7.73902853480172e-07, -1.51956522094609e-09, -5.50012125994673e-12, 1.00282869786028e-08, 0.807131289865052, 'A', 'A · Correlación DIPPR 105', '±0.3 %', 'Perry''s Chemical Engineers'' Handbook 8ª ed., Tabla 2-32 (DIPPR 105)', '0 a 45', null),
  ('terc-Butanol', 'Solventes y alcoholes', '75-65-0', 'C4H10O', 74.12, 25.5, 0.810443240102242, -0.0010601249318294, -9.55790160239169e-07, -2.08694616473784e-09, -9.02432150125037e-12, 1.88600977057973e-08, 0.788840285940801, 'A', 'A · Correlación DIPPR 105', '±0.3 %', 'Perry''s Chemical Engineers'' Handbook 8ª ed., Tabla 2-32 (DIPPR 105)', '0 a 45', 'Funde a 25.5 °C: por debajo es líquido subenfriado (extrapolación)'),
  ('Acetato de n-butilo', 'Solventes y alcoholes', '123-86-4', 'C6H12O2', 116.16, null, 0.900424161587424, -0.000963942296713015, -6.11700452520136e-07, -1.066023837365e-09, -3.14958455286555e-12, 4.88487672534177e-09, 0.880891603347929, 'A', 'A · Correlación DIPPR 105', '±0.3 %', 'Perry''s Chemical Engineers'' Handbook 8ª ed., Tabla 2-32 (DIPPR 105)', '0 a 45', null),
  ('Acetato de isopropilo', 'Solventes y alcoholes', '108-21-4', 'C5H10O2', 102.13, null, 0.893983655808274, -0.00108951178297639, -9.83550371870053e-07, 3.62592658414025e-19, -3.48964813001532e-21, 2.1094237467878e-15, 0.871800000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.3 %', 'ρ20 = 0.8718 (CRC Handbook); 0.8665 @25 °C medido (JCED 2019, doi 10.1021/acs.jced.9b00430). Pendiente: Rackett escalado', 'punto único + pendiente', null),
  ('Acetato de isobutilo', 'Solventes y alcoholes', '110-19-0', 'C6H12O2', 116.16, null, 0.891339817629666, -0.000991456061892251, -7.76740979554248e-07, 1.50771947248689e-19, -9.48815450763401e-22, 2.66453525910038e-15, 0.8712, 'C', 'C · Punto de referencia + pendiente estimada', '±0.3 %', 'ρ20 = 0.8712 (CRC; 0.8713 @20.05 °C medido, Cheméo/LLE data). Pendiente: Rackett escalado', 'punto único + pendiente', null),
  ('Acetato de sec-butilo', 'Solventes y alcoholes', '105-46-4', 'C6H12O2', 116.16, null, 0.890837717916711, -0.000975409829182265, -7.23955499445053e-07, -2.86744194153948e-20, 7.03306209000601e-22, 1.33226762955019e-15, 0.871039939133287, 'C', 'C · Punto de referencia + pendiente estimada', '±0.4 %', 'ρ25 = 0.866 (mediana de 4 mediciones VLE, JCED, vía Cheméo). Pendiente: Rackett escalado', 'punto único + pendiente', 'Fuentes dispersas 0.864 a 0.871 @25 °C'),
  ('Acetato de terc-butilo', 'Solventes y alcoholes', '540-88-5', 'C6H12O2', 116.16, null, 0.887313402322182, -0.00102275870510545, -8.95570550180069e-07, -6.56736702739687e-20, 1.30107045565476e-21, 1.77635683940025e-15, 0.8665, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 0.8665 (CRC Handbook). Pendiente: Rackett escalado', 'punto único + pendiente', 'CAMEO/DOE da 0.8593 @25 °C (implicaría α anómalo)'),
  ('Acetato de n-amilo (pentilo)', 'Solventes y alcoholes', '628-63-7', 'C7H14O2', 130.18, null, 0.89737, -0.0010504, 3.73935712026182e-18, -1.53546891063082e-19, 1.82904902172027e-21, 1.22124532708767e-15, 0.876362000000001, 'B', 'B · Ajuste a datos experimentales', '±0.1 %', 'Cheméo: J. Solution Chem./JCED (tributilamina + ésteres C1-C5), 20 a 40 °C', '20 a 40', null),
  ('Diacetona alcohol', 'Solventes y alcoholes', '123-42-2', 'C6H12O2', 116.16, null, 0.956479820040433, -0.000911783005686756, -6.10399816742949e-07, -1.09147790032793e-19, 1.90701940702895e-21, 2.33146835171283e-15, 0.938, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 0.938 (CAMEO/PubChem). Pendiente: Rackett escalado', 'punto único + pendiente', 'Merck Index da 0.9306 @25 °C'),
  ('Lactato de etilo', 'Solventes y alcoholes', '97-64-3', 'C5H10O3', 118.13, null, 1.05548196078431, -0.00107934158926724, -2.71207430337262e-07, -2.10895729893871e-19, 3.36630890334742e-21, 2.66453525910038e-15, 1.03378664602683, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'Cheméo: ''Thermophysical Properties of Lactates'' (JCED), 5 a 45 °C', '5 a 45', null),
  ('Etoxidiglicol (DEGEE, Transcutol)', 'Solventes y alcoholes', '111-90-0', 'C6H14O3', 134.17, null, 1.0066, -0.000901999999999956, -9.41092071677905e-18, 4.01441871815527e-19, -4.60086150983859e-21, 1.55431223447522e-15, 0.988560000000001, 'B', 'B · Ajuste a datos experimentales', '±0.15 %', 'Cheméo (isobaras de menor presión), 10 a 40 °C', '10 a 40', 'JCED 2019 da valores 0.001 a 0.002 menores'),
  ('Ciclohexano', 'Solventes y alcoholes', '110-82-7', 'C6H12', 84.16, 6.5, 0.797665976052712, -0.000938265699177031, -2.58218001116649e-07, -1.25167899571752e-09, -4.65784127568978e-12, 8.08251410244765e-09, 0.778786616182155, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas (PPDS)', '0 a 45', 'Funde a 6.5 °C: por debajo, subenfriado'),
  ('Ácido acético', 'Solventes y alcoholes', '64-19-7', 'C2H4O2', 60.05, 16.6, 1.06831721524543, -0.00101408344098814, -5.79745671591664e-07, -1.07102649031376e-09, -3.15247807564053e-12, 4.76790229519963e-09, 1.04779457554862, 'A', 'A · Correlación VDI/PPDS', '±0.2 %', 'VDI Heat Atlas (PPDS)', '0 a 45', 'Funde a 16.6 °C: por debajo, líquido subenfriado'),
  ('Metacrilato de metilo (MMA)', 'Monómeros y ácidos (acrílicos)', '80-62-6', 'C5H8O2', 100.12, null, 0.966363810881395, -0.00111716722172626, -6.94480802126475e-07, -1.25385953044815e-09, -3.8660041472008e-12, 6.20635187686958e-09, 0.943732024689112, 'A', 'A · Correlación DIPPR 105', '±0.3 %', 'Perry 8ª ed. (DIPPR 105)', '0 a 45', null),
  ('Metacrilato de etilo (EMA)', 'Monómeros y ácidos (acrílicos)', '97-63-2', 'C6H10O2', 114.14, null, 0.932796571428571, -0.00102539999999982, 2.85714285652181e-08, 3.88492134015026e-20, 2.17239847050988e-22, 1.88737914186277e-15, 0.912300000000001, 'B', 'B · Ajuste a datos experimentales', '±0.05 % (20 a 45 °C)', 'Cheméo: ''Densities, ultrasonic speeds… acetonitrile with alkyl methacrylates, 293.15 to 318.15 K''', '20 a 45', null),
  ('Metacrilato de n-butilo (BMA)', 'Monómeros y ácidos (acrílicos)', '97-88-1', 'C8H14O2', 142.2, null, 0.914253714285715, -0.000954257142856989, 1.42857142843588e-07, 3.77392358757454e-19, -3.76482122291909e-21, 1.11022302462516e-15, 0.895225714285715, 'B', 'B · Ajuste a datos experimentales', '±0.05 % (20 a 45 °C)', 'Cheméo: 3 papers (acetonitrilo, DMC, ciclohexano + BMA), 20 a 45 °C', '20 a 45', null),
  ('Metacrilato de 2-hidroxietilo (HEMA)', 'Monómeros y ácidos (acrílicos)', '868-77-9', 'C6H10O3', 130.14, null, 1.090175, -0.000924999999999822, -1.71372376389753e-17, 5.77188313393753e-19, -5.96903344646839e-21, 1.77635683940025e-15, 1.071675, 'B', 'B · Ajuste a datos experimentales', '±0.1 %', 'Chen & Chang, JCED 50 (2005), doi 10.1021/je050196o (NIST ThermoML); Sigma 1.071 @20', '25 a 45', 'El valor CRC 1.034 @25 corresponde a bencil metacrilato (error de transcripción)'),
  ('Metacrilato de hidroxipropilo (HPMA)', 'Monómeros y ácidos (acrílicos)', '27813-02-1', 'C7H12O3', 144.17, null, 1.0495, -0.000899999999999858, -1.37366037575609e-17, 4.95789961504891e-19, -5.3679783504747e-21, 1.77635683940025e-15, 1.0315, 'C', 'C · Punto de referencia + pendiente estimada', '±1 %', 'ρ25 = 1.027 (Dow ROCRYL 410, SG). Pendiente: clase metacrilatos −0.00090 g/cm³/K', 'punto único + pendiente', 'Sigma declara 1.066 @25 °C: fuentes en conflicto, verificar CoA'),
  ('Metacrilato de isobornilo (IBOMA)', 'Monómeros y ácidos (acrílicos)', '7534-94-3', 'C14H22O2', 222.32, null, 0.997407870229048, -0.000715437073980259, -2.47821873610632e-07, 3.07093782126164e-19, -2.91358226088381e-21, 2.33146835171283e-15, 0.983000000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 0.983 (Evonik VISIOMER IBOMA, DIN 51757). Pendiente: Rackett escalado', 'punto único + pendiente', null),
  ('Metacrilato de tetrahidrofurfurilo (THFMA)', 'Monómeros y ácidos (acrílicos)', '2455-24-5', 'C9H14O3', 170.21, null, 1.05891311254972, -0.00083785019322956, -3.90271712834006e-07, 5.64238575593252e-19, -7.30700908630392e-21, 1.99840144432528e-15, 1.042, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 1.042 (Evonik VISIOMER THFMA, DIN 51757). Pendiente: Rackett escalado', 'punto único + pendiente', null),
  ('Dimetacrilato de etilenglicol (EGDMA)', 'Monómeros y ácidos (acrílicos)', '97-90-5', 'C10H14O4', 198.22, null, 1.0681755249096, -0.000851527670542273, -3.62428746889665e-07, 1.97945992093371e-19, -1.66614039509931e-21, 1.99840144432528e-15, 1.051, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 1.051 (Evonik VISIOMER EGDMA). Pendiente: Rackett escalado', 'punto único + pendiente', null),
  ('Dimetacrilato de trietilenglicol (TEGDMA)', 'Monómeros y ácidos (acrílicos)', '109-16-0', 'C14H22O6', 286.32, null, 1.0916766614097, -0.000779534707825128, -2.1491813298447e-07, -1.49846965977224e-19, 1.25461836032534e-21, 1.55431223447522e-15, 1.076, 'C', 'C · Punto de referencia + pendiente estimada', '±0.7 %', 'ρ20 = 1.076 (GEO Bisomer TEGDMA SDS, ASTM D1298). Pendiente: Rackett escalado', 'punto único + pendiente', 'Sigma declara 1.092 @25 °C'),
  ('Dimetacrilato de uretano (UDMA)', 'Monómeros y ácidos (acrílicos)', '72869-86-4', 'mezcla', null, null, 1.128, -0.000799999999999875, -1.21370485093932e-17, 4.62490635732174e-19, -5.40132421246035e-21, 1.99840144432528e-15, 1.112, 'C', 'C · Punto de referencia + pendiente estimada', '±0.7 %', 'ρ20 = 1.112 (Evonik VISIOMER HEMA-TMDI). Pendiente: clase −0.00080 g/cm³/K', 'punto único + pendiente', 'Muy viscoso (10 a 15 Pa·s)'),
  ('Cianoacrilato de etilo', 'Monómeros y ácidos (acrílicos)', '7085-85-0', 'C6H7NO2', 125.13, null, 1.05867733189048, -0.000925632836402799, -4.11687906048767e-07, 3.69992508585739e-20, -4.86289696492166e-22, 1.33226762955019e-15, 1.04, 'C', 'C · Punto de referencia + pendiente estimada', '±0.7 %', 'ρ20 = 1.040 (Merck Index vía PubChem). Pendiente: Rackett escalado', 'punto único + pendiente', 'Polimeriza con humedad'),
  ('Acrilato de etilo', 'Monómeros y ácidos (acrílicos)', '140-88-5', 'C5H8O2', 100.12, null, 0.944762619047619, -0.0011324129870129, -5.26406926416717e-07, 3.64442620956953e-19, -3.97543456850705e-21, 1.4432899320127e-15, 0.921903796536796, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'Cheméo: ''Thermophysical Properties of Three Compounds from the Acrylate Family'' (JCED), 5 a 45 °C', '5 a 45', null),
  ('Acrilato de n-butilo', 'Monómeros y ácidos (acrílicos)', '141-32-2', 'C7H12O2', 128.17, null, 0.918846904761904, -0.000983507792207699, -2.55844155850666e-07, 2.127456924368e-19, -1.96252640049123e-21, 1.88737914186277e-15, 0.899074411255411, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'Cheméo: mismo paper de acrilatos (JCED), 5 a 45 °C', '5 a 45', null),
  ('Ácido acrílico', 'Monómeros y ácidos (acrílicos)', '79-10-7', 'C3H4O2', 72.06, 13.0, 1.07309025152664, -0.00108956496857287, -5.51568492876389e-07, -8.68809957860145e-10, -2.17213340807416e-12, 2.93337665269178e-09, 1.05107102673702, 'A', 'A · Correlación DIPPR 105', '±0.3 %', 'Perry 8ª ed. (DIPPR 105)', '0 a 45', 'Funde a 13 °C: por debajo, subenfriado'),
  ('Ácido metacrílico', 'Monómeros y ácidos (acrílicos)', '79-41-4', 'C4H6O2', 86.09, 15.0, 1.03271650512875, -0.000919851379755709, -4.35368071348154e-07, -6.00224213301034e-10, -1.27255942886946e-12, 1.49452394904159e-09, 1.01414032490188, 'A', 'A · Correlación DIPPR 105', '±0.3 %', 'Perry 8ª ed. (DIPPR 105)', '0 a 45', 'Funde a 15 a 16 °C: por debajo, subenfriado'),
  ('Glicerina', 'Glicoles, polioles y humectantes', '56-81-5', 'C3H8O3', 92.09, 18.0, 1.27383352399586, -0.000622631843462901, -3.09379670384736e-07, -2.28881834464109e-10, -3.04376536665745e-13, 2.41430431202616e-10, 1.26125525550352, 'A', 'A · Correlación VDI/PPDS', '±0.1 %', 'VDI Heat Atlas (PPDS)', '0 a 45', 'Funde a 18 °C pero casi nunca cristaliza (se subenfría); muy higroscópica'),
  ('Propilenglicol', 'Glicoles, polioles y humectantes', '57-55-6', 'C3H8O2', 76.09, null, 1.05114250205859, -0.000727934987479124, -5.6874986050273e-07, -8.62198315157519e-10, -2.1200870954783e-12, 2.81323253581434e-09, 1.03634906556435, 'A', 'A · Correlación DIPPR 105', '±0.2 %', 'Perry 8ª ed. (DIPPR 105)', '0 a 45', null),
  ('Etilenglicol', 'Glicoles, polioles y humectantes', '107-21-1', 'C2H6O2', 62.07, null, 1.12738516960831, -0.000700777456544239, 5.24037826319785e-08, -2.40764776943402e-09, 1.83619304660989e-13, 1.02776345212163e-07, 1.11337135018741, 'A', 'A · EOS de referencia (Helmholtz)', '±0.1 %', 'Ecuación de estado de referencia, ajuste en thermo', '0 a 45', null),
  ('1,3-Butilenglicol', 'Glicoles, polioles y humectantes', '107-88-0', 'C4H10O2', 90.12, null, 1.01623833333333, -0.000619642857142615, -8.33333333352038e-07, 6.32687189681614e-19, -6.74219570230934e-21, 1.77635683940025e-15, 1.00351214285714, 'B', 'B · Ajuste a datos experimentales', '±0.3 %', 'Zorębski, JCED 2007, doi 10.1021/je6005778 (NIST ThermoML), 15 a 45 °C', '15 a 45', 'Otro set (JCED 2020) da ~0.003 más'),
  ('Dipropilenglicol (mezcla de isómeros)', 'Glicoles, polioles y humectantes', '25265-71-8', 'C6H14O3', 134.17, null, 1.04125, -0.000769999999999884, -1.03046198010589e-17, 3.23743445012522e-19, -2.98655284490374e-21, 1.99840144432528e-15, 1.02585, 'C', 'C · Punto de referencia + pendiente estimada', '±0.3 %', 'ρ25 = 1.022 (Dow TDS). Pendiente −0.00077 de Sun & Teja, JCED 2004', 'punto único + pendiente', null),
  ('1,2-Pentanodiol (pentilenglicol)', 'Glicoles, polioles y humectantes', '5343-92-0', 'C5H12O2', 104.15, null, 0.985059714285714, -0.00073468571428564, -5.50381426897862e-18, 1.35047265633795e-19, -5.59003266711791e-22, 2.1094237467878e-15, 0.970366, 'B', 'B · Ajuste a datos experimentales', '±0.1 %', 'Parsa, J. Chem. Thermodyn. 2008 (NIST ThermoML) + Cheméo', '20 a 40', null),
  ('1,2-Hexanodiol', 'Glicoles, polioles y humectantes', '6920-22-5', 'C6H14O2', 118.17, null, 0.965801428571428, -0.000691619047618937, -6.47619047628068e-07, 2.36795205494873e-19, -1.68302246262957e-21, 1.22124532708767e-15, 0.95171, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'Cheméo (2 papers, acuerdo ±0.0001), 10 a 40 °C', '10 a 40', null),
  ('PEG-400', 'Glicoles, polioles y humectantes', '25322-68-3', 'mezcla', null, 6.0, 1.141, -0.000799999999999776, -1.94645159860223e-17, 6.30837227138686e-19, -6.11769600342547e-21, 2.66453525910038e-15, 1.125, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 1.125 (Dow CARBOWAX Sentry PEG 400 TDS). Pendiente: clase PEG −0.00080 g/cm³/K', 'punto único + pendiente', 'Solidifica a 4 a 8 °C'),
  ('Etilhexilglicerina', 'Glicoles, polioles y humectantes', '70445-33-9', 'mezcla', null, null, 0.965000000000001, -0.000750000000000056, 3.43704432910936e-18, -7.02985766312905e-20, 7.46546123661867e-22, 1.77635683940025e-15, 0.95, 'C', 'C · Punto de referencia + pendiente estimada', '±1 %', 'ρ20 = 0.95 (SDS). Pendiente: clase −0.00075 g/cm³/K', 'punto único + pendiente', null),
  ('Trietanolamina (TEA)', 'Glicoles, polioles y humectantes', '102-71-6', 'C6H15NO3', 149.19, 21.0, 1.13420685714286, -0.000521485714285471, -5.71428571433946e-07, 5.91988013737183e-20, -1.61881143271055e-21, 1.33226762955019e-15, 1.12354857142857, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'JCED 2009, doi 10.1021/je900739x (NIST ThermoML), 20 a 45 °C', '20 a 45', 'Funde a ~21 °C: por debajo, subenfriado'),
  ('D-Pantenol', 'Glicoles, polioles y humectantes', '81-13-0', 'C9H19NO4', 205.25, null, 1.212, -0.000599999999999865, -9.03551298247096e-18, 2.29395355323158e-19, -1.44493646590219e-21, 2.44249065417534e-15, 1.2, 'C', 'C · Punto de referencia + pendiente estimada', '±2 %', 'ρ20 = 1.20 (Merck Index vía PubChem). Pendiente: estimada −0.00060 g/cm³/K', 'punto único + pendiente', 'Líquido muy viscoso; dato de baja precisión'),
  ('Escualano', 'Emolientes, aceites y siliconas', '111-01-3', 'C30H62', 422.81, null, 0.821452648592284, -0.000657779283976372, 2.74730622177476e-07, -1.66496628863583e-20, -2.67255170397095e-22, 8.88178419700125e-16, 0.808406955161627, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'Fandiño et al., JCED 50 (2005) 939, doi 10.1021/je049580w (vía Cheméo), 0 a 40 °C', '0 a 40', null),
  ('Escualeno', 'Emolientes, aceites y siliconas', '111-02-4', 'C30H50', 410.72, null, 0.87425, -0.000649999999999963, -1.6073038449462e-18, 8.04733706173983e-20, -9.15189677997259e-22, 1.88737914186277e-15, 0.861250000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ25 = 0.858 (lit.). Pendiente: análoga a escualano −0.00065', 'punto único + pendiente', null),
  ('Miristato de isopropilo (IPM)', 'Emolientes, aceites y siliconas', '110-27-0', 'C17H34O2', 270.45, 3.0, 0.8674, -0.000719999999999922, -6.91666999454636e-18, 2.30320336594623e-19, -2.19913019421344e-21, 1.77635683940025e-15, 0.853000000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 0.853 (lit. 0.850 a 0.855). Pendiente: clase ésteres grasos −0.00072', 'punto único + pendiente', 'Funde a ~3 °C'),
  ('Palmitato de isopropilo (IPP)', 'Emolientes, aceites y siliconas', '142-91-6', 'C19H38O2', 298.5, 14.0, 0.8674, -0.000719999999999922, -6.91666999454636e-18, 2.30320336594623e-19, -2.19913019421344e-21, 1.77635683940025e-15, 0.853000000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.4 %', 'ρ20 = 0.853 (BASF TDS 0.852 a 0.854). Pendiente −0.00072', 'punto único + pendiente', 'Solidifica a 13 a 15 °C'),
  ('Triglicérido caprílico/cáprico (MCT)', 'Emolientes, aceites y siliconas', '73398-61-5', 'mezcla', null, null, 0.9604, -0.000769999999999865, -1.33690423309518e-17, 4.51390860474602e-19, -4.68715857188992e-21, 9.99200722162641e-16, 0.945, 'C', 'C · Punto de referencia + pendiente estimada', '±1 %', 'ρ20 = 0.945 (Miglyol 812 N: 0.93 a 0.96). Pendiente −0.00077 de tricaprilina (JCT 2017, vía Cheméo)', 'punto único + pendiente', null),
  ('Octildodecanol', 'Emolientes, aceites y siliconas', '5333-42-6', 'C20H42O', 298.55, 0.0, 0.85425, -0.000649999999999964, -6.46341779711608e-18, 3.10793707212021e-19, -3.94983774135302e-21, 1.33226762955019e-15, 0.84125, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ25 = 0.838 (lit.). Pendiente: clase −0.00065', 'punto único + pendiente', 'Punto de fusión ~0 °C'),
  ('Benzoato de alquilo C12-15', 'Emolientes, aceites y siliconas', '68411-27-8', 'C19H30O2', 290.44, null, 0.94, -0.00074999999999997, -3.0768462807451e-18, 9.24981271464348e-20, -4.66126089597125e-22, 1.88737914186277e-15, 0.925, 'C', 'C · Punto de referencia + pendiente estimada', '±1 %', 'ρ20 = 0.925 (SDS: SG 0.915 a 0.935). Pendiente: clase −0.00075', 'punto único + pendiente', null),
  ('Isododecano', 'Emolientes, aceites y siliconas', '31807-55-3', 'C12H26', 170.33, null, 0.759739830508475, -0.000723898305084603, -1.57716643312717e-17, 5.7441336957936e-19, -6.32974719108489e-21, 1.4432899320127e-15, 0.74526186440678, 'B', 'B · Ajuste a datos experimentales', '±0.3 %', 'Componente principal 2,2,4,6,6-pentametilheptano (Cheméo), 15 a 40 °C', '15 a 40', 'Grado comercial ~0.747 @20 °C'),
  ('Isohexadecano', 'Emolientes, aceites y siliconas', '4390-04-9', 'C16H34', 226.44, null, 0.79785, -0.000669999999999902, -1.03180272538519e-17, 3.85717190200633e-19, -4.23951682609294e-21, 1.33226762955019e-15, 0.78445, 'B', 'B · Ajuste a datos experimentales', '±0.5 %', '2,2,4,4,6,8,8-heptametilnonano puro (Cheméo), 15 a 40 °C', '15 a 40', 'Grados comerciales (mezcla de isómeros) ~0.79 @20 °C'),
  ('Vaselina líquida liviana (Paraffinum liquidum perliquidum)', 'Emolientes, aceites y siliconas', '8042-47-5', 'mezcla', null, null, 0.8576, -0.000629999999999936, -5.42972509290069e-18, 1.89621160650191e-19, -1.98567560410876e-21, 8.88178419700125e-16, 0.845, 'C', 'C · Punto de referencia + pendiente estimada', '±3 % (depende del grado)', 'ρ20 típico 0.845 (Ph.Eur 0.810 a 0.875). Pendiente −0.00063 (ASTM D1250/API 11.1, K1 = 0.34878)', 'punto único + pendiente', 'Usar ρ del CoA del lote en la calculadora'),
  ('Vaselina líquida pesada (Paraffinum liquidum)', 'Emolientes, aceites y siliconas', '8042-47-5', 'mezcla', null, null, 0.8826, -0.00062999999999996, -2.83987737947564e-18, 9.06481646035061e-20, -4.79656556435419e-22, 2.33146835171283e-15, 0.87, 'C', 'C · Punto de referencia + pendiente estimada', '±3 % (depende del grado)', 'ρ20 típico 0.870 (Ph.Eur 0.827 a 0.890; USP 0.845 a 0.905 @25). Pendiente −0.00063 (ASTM D1250)', 'punto único + pendiente', 'Usar ρ del CoA del lote en la calculadora'),
  ('Aceite de jojoba', 'Emolientes, aceites y siliconas', '61789-91-1', 'mezcla', null, 8.0, 0.8766, -0.000599999999999902, -9.50452041645184e-18, 3.35768201541558e-19, -3.46322605470555e-21, 1.33226762955019e-15, 0.8646, 'B', 'B · Correlación lineal publicada', '±0.5 %', 'ρ = 0.8766 − 0.0006·t (10 a 75 °C), ScienceDirect S2666202723000800 (2023)', '10 a 75', 'Cera líquida; se enturbia/solidifica a ~7 a 10 °C'),
  ('Aceite de ricino', 'Emolientes, aceites y siliconas', '8001-79-4', 'C57H104O9', 933.43, null, 0.973, -0.000699999999999872, -9.57185703759607e-18, 2.36795205494873e-19, -1.93467083504086e-21, 9.99200722162641e-16, 0.959000000000001, 'B', 'B · Correlación lineal publicada', '±0.3 %', 'ρ = 0.973 − 0.0007·t (10 a 75 °C), mismo paper 2023; USP SG 0.957 a 0.961', '10 a 75', null),
  ('Aceite de oliva', 'Emolientes, aceites y siliconas', '8001-25-0', 'mezcla', null, 3.0, 0.9268, -0.000699999999999918, -9.66340427649944e-18, 3.73692433671597e-19, -4.01893687081683e-21, 1.77635683940025e-15, 0.9128, 'B', 'B · Correlación lineal publicada', '±0.4 %', 'ρ = 0.9268 − 0.0007·t (10 a 75 °C), paper 2023; Codex 0.910 a 0.916 @20', '10 a 75', 'Se enturbia a 0 a 6 °C'),
  ('Aceite de girasol', 'Emolientes, aceites y siliconas', '8001-21-6', 'mezcla', null, null, 0.931, -0.000641449999999844, -1.13932537059397e-17, 3.4039310789888e-19, -3.34059388749362e-21, 8.88178419700125e-16, 0.918171, 'B', 'B · Correlación lineal publicada', '±0.3 %', 'ρ = 0.9310 − 6.4145e-4·t (10 a 140 °C), Esteban et al., Biomass Bioenergy 42 (2012) 164', '10 a 140', null),
  ('Aceite de pepita de uva', 'Emolientes, aceites y siliconas', '8024-22-4', 'C18H32O2', 280.45, null, 0.9314, -0.000623429999999916, -7.91162848684358e-18, 2.99693931954449e-19, -3.40750402746162e-21, 1.33226762955019e-15, 0.918931400000001, 'B', 'B · Correlación lineal publicada', '±0.3 %', 'ρ = 0.9314 − 6.2343e-4·t (10 a 140 °C), Esteban et al. 2012', '10 a 140', null),
  ('Aceite de almendras dulces', 'Emolientes, aceites y siliconas', '8007-69-0', 'mezcla', null, null, 0.928750000000001, -0.000649999999999913, -8.68186051496483e-18, 3.27443370098379e-19, -3.89667126199214e-21, 1.22124532708767e-15, 0.915750000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.4 %', 'ρ25 = 0.9125 (USP 0.910 a 0.915). Pendiente clase aceites vegetales −0.00065', 'punto único + pendiente', null),
  ('Aceite de argán', 'Emolientes, aceites y siliconas', '223747-87-3', 'mezcla', null, null, 0.9255, -0.000649999999999914, -4.52635940824437e-18, 3.88492134015026e-20, 1.00046453967262e-21, 1.99840144432528e-15, 0.9125, 'C', 'C · Punto de referencia + pendiente estimada', '±0.8 %', 'ρ20 = 0.9125 (0.906 a 0.919). Pendiente −0.00065', 'punto único + pendiente', null),
  ('Aceite de coco', 'Emolientes, aceites y siliconas', '8001-31-8', 'mezcla', null, 24.0, 0.931160000000001, -0.000699999999999965, -3.56618036331482e-18, 9.61980522322922e-20, -6.31790526002146e-22, 9.99200722162641e-16, 0.91716, 'B', 'B · Correlación lineal publicada', '±0.3 % (solo >24 °C)', 'ρ = 0.93116 − 7.0e-4·t (24 a 110 °C), Noureddini et al., JAOCS 69 (1992) 1184', '24 a 110', 'Sólido por debajo de ~24 °C: valores <24 °C son extrapolación ficticia'),
  ('Ácido oleico', 'Emolientes, aceites y siliconas', '112-80-1', 'C18H34O2', 282.46, 13.5, 0.906, -0.000699999999999949, -4.26013453477067e-18, 1.59096778691868e-19, -1.75790767492161e-21, 1.11022302462516e-15, 0.892, 'C', 'C · Punto de referencia + pendiente estimada', '±0.4 %', 'ρ20 = 0.892 (lit.). Pendiente −0.00070', 'punto único + pendiente', 'Funde a 13 a 14 °C'),
  ('Dimeticona 5 cSt', 'Emolientes, aceites y siliconas', '63148-62-9', 'C8H24O2Si3', 236.53, null, 0.944801026254933, -0.00101878360624994, 1.09846949827583e-06, -1.17902714474325e-09, 1.13396129792562e-12, 7.02705560406969e-10, 0.924855491145894, 'C', 'C · Punto de referencia + α de ficha técnica', '±0.5 %', 'SG25 = 0.920, α = 1.05e-3 K⁻¹ (Dow XIAMETER PMX-200 TDS)', 'punto único + pendiente', null),
  ('Dimeticona 50 cSt', 'Emolientes, aceites y siliconas', '63148-62-9', 'C8H24O2Si3', 236.53, null, 0.985626282668752, -0.00105241354813407, 1.12363701269321e-06, -1.19434890586306e-09, 1.13866716941794e-12, 6.98804236698436e-10, 0.965018093906649, 'C', 'C · Punto de referencia + α de ficha técnica', '±0.5 %', 'SG25 = 0.960, α = 1.04e-3 K⁻¹ (Dow PMX-200)', 'punto único + pendiente', null),
  ('Dimeticona 100 cSt', 'Emolientes, aceites y siliconas', '63148-62-9', 'C8H24O2Si3', 236.53, null, 0.987704917563559, -0.000971512662840834, 9.55525841765409e-07, -9.36219533066072e-10, 8.29217603855391e-13, 4.69228322863557e-10, 0.968649517562, 'C', 'C · Punto de referencia + α de ficha técnica', '±0.5 %', 'SG25 = 0.964, α = 0.96e-3 K⁻¹ (Dow PMX-200)', 'punto único + pendiente', 'TDS citan 0.960 a 0.965'),
  ('Dimeticona 350 cSt', 'Emolientes, aceites y siliconas', '63148-62-9', 'C8H24O2Si3', 236.53, null, 0.993852458544244, -0.000977559422153104, 9.61473098043837e-07, -9.42046625670007e-10, 8.34378709798652e-13, 4.72149652708254e-10, 0.974678456467988, 'C', 'C · Punto de referencia + α de ficha técnica', '±0.5 %', 'SG25 = 0.970, α = 0.96e-3 K⁻¹ (Dow PMX-200)', 'punto único + pendiente', null),
  ('Ciclopentasiloxano (D5)', 'Emolientes, aceites y siliconas', '541-02-6', 'C10H30O5Si5', 370.77, null, 0.98382541646981, -0.00106086379868204, 1.1438410645115e-06, -1.2277260920379e-09, 1.18079882907814e-12, 7.31730454006652e-10, 0.96305604404105, 'C', 'C · Punto de referencia + α de ficha técnica', '±0.5 %', 'ρ25 = 0.958 (lit.); α ≈ 1.05e-3 K⁻¹ (clase siloxanos)', 'punto único + pendiente', 'UE: restringido (REACH) en cosméticos'),
  ('Vitamina E (dl-α-tocoferol)', 'Activos, filtros UV, fragancia y otros', '10191-41-0', 'C29H50O2', 430.71, 3.0, 0.9675, -0.000699999999999907, -6.86828727627441e-18, 1.83146291749941e-19, -1.30736719286647e-21, 1.88737914186277e-15, 0.953500000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ25 = 0.950 (BASF SDS). Pendiente −0.00070 (estimada)', 'punto único + pendiente', 'Funde a 2.5 a 3.5 °C; muy viscoso'),
  ('Acetato de tocoferilo (vit. E acetato)', 'Activos, filtros UV, fragancia y otros', '7695-91-2', 'C31H52O3', 472.74, null, 0.969, -0.000699999999999925, -5.32172473356467e-18, 1.38747190719652e-19, -8.853720384137e-22, 1.88737914186277e-15, 0.955000000000001, 'C', 'C · Punto de referencia + pendiente estimada', '±0.8 %', 'ρ20 = 0.955 (lit. 0.953 a 0.962). Pendiente −0.00070 (estimada)', 'punto único + pendiente', null),
  ('Fenoxietanol', 'Activos, filtros UV, fragancia y otros', '122-99-6', 'C8H10O2', 138.16, 12.0, 1.12452571428571, -0.000858285714285615, -7.77729870349318e-18, 3.18193557383736e-19, -4.13240982931934e-21, 1.55431223447522e-15, 1.10736, 'B', 'B · Ajuste a datos experimentales', '±0.1 %', 'J. Chem. Thermodyn. 2018 (NIST ThermoML), 20 a 40 °C', '20 a 40', 'Funde a 11 a 14 °C (se subenfría)'),
  ('Triacetina', 'Activos, filtros UV, fragancia y otros', '102-76-1', 'C9H14O6', 218.2, 3.0, 1.17998785714286, -0.0010827857142857, -7.14285714377241e-08, 2.81194306525162e-19, -2.56074466756882e-21, 1.99840144432528e-15, 1.15830357142857, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'Cheméo (paper solubilidad SO₂), 20 a 45 °C; CRC 1.1583 @20', '20 a 45', 'Funde a ~3 °C'),
  ('Benzoato de bencilo', 'Activos, filtros UV, fragancia y otros', '120-51-4', 'C14H12O2', 212.24, 19.0, 1.13000228657886, -0.000709760185085795, -2.53251122747998e-07, 4.84690186247319e-19, -5.24441810458151e-21, 2.22044604925031e-15, 1.11570578242805, 'C', 'C · Punto de referencia + pendiente estimada', '±0.4 %', 'ρ25 = 1.1121 (CRC). Pendiente: Rackett escalado', 'punto único + pendiente', 'Funde a 18 a 21 °C'),
  ('Linalol', 'Activos, filtros UV, fragancia y otros', '78-70-6', 'C10H18O', 154.25, null, 0.878015000000001, -0.000815000000000062, 3.51953363064885e-18, 4.62490635732174e-21, -1.020659999575e-21, 1.77635683940025e-15, 0.861715000000001, 'B', 'B · Ajuste a datos experimentales', '±0.05 %', 'JCED 2009, doi 10.1021/je8007414 (NIST ThermoML), 10 a 40 °C', '10 a 40', null),
  ('d-Limoneno', 'Activos, filtros UV, fragancia y otros', '5989-27-5', 'C10H16', 136.23, null, 0.860625, -0.000788999999999918, -7.149300620572e-18, 2.52519887109767e-19, -3.07850271258548e-21, 7.7715611723761e-16, 0.844845000000001, 'B', 'B · Ajuste a datos experimentales', '±0.3 %', 'JCED 2009 (NIST ThermoML), 10 a 40 °C', '10 a 40', 'CRC da 0.8411 @20 °C'),
  ('Acetil tributil citrato (ATBC)', 'Activos, filtros UV, fragancia y otros', '77-90-7', 'C20H34O8', 402.48, null, 1.06271191845611, -0.000666266322358591, -8.84166354412767e-08, 2.51594905838303e-19, -2.78573360283775e-21, 1.33226762955019e-15, 1.04935122535477, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ25 = 1.046 (Hawley''s). Pendiente: Rackett escalado', 'punto único + pendiente', 'Plastificante de esmaltes'),
  ('Octocrileno', 'Activos, filtros UV, fragancia y otros', '6197-30-4', 'C24H27NO2', 361.48, null, 1.06150342915927, -0.000573792707880603, -6.8937504136407e-08, 5.54988762878609e-20, -4.36210709527133e-22, 1.77635683940025e-15, 1.05, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 1.050 (TDS típico 1.045 a 1.055). Pendiente: Rackett escalado', 'punto único + pendiente', 'Valor de ficha técnica recordado, verificar CoA'),
  ('Metoxicinamato de etilhexilo (octinoxato)', 'Activos, filtros UV, fragancia y otros', '5466-77-3', 'C18H26O3', 290.4, null, 1.02370557479391, -0.00068218119049936, -1.54877459803294e-07, 4.49540897931673e-19, -4.45624000705753e-21, 2.33146835171283e-15, 1.01, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 1.010 (TDS típico 1.007 a 1.013). Pendiente: Rackett escalado', 'punto único + pendiente', 'Valor de ficha técnica recordado, verificar CoA'),
  ('Homosalato', 'Activos, filtros UV, fragancia y otros', '118-56-9', 'C16H22O3', 262.34, null, 1.06223805080785, -0.000609109045820553, -1.39674728593557e-07, 6.27137302052828e-19, -6.6504633566659e-21, 1.33226762955019e-15, 1.05, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ20 = 1.050 (TDS típico 1.049 a 1.053). Pendiente: Rackett escalado', 'punto único + pendiente', 'Valor de ficha técnica recordado, verificar CoA'),
  ('Salicilato de etilhexilo (octisalato)', 'Activos, filtros UV, fragancia y otros', '118-60-5', 'C15H22O3', 250.33, null, 1.03019129984382, -0.000643497216404527, -1.66191093927319e-07, 2.7009453126759e-19, -3.01255486968172e-21, 2.44249065417534e-15, 1.01725487907816, 'C', 'C · Punto de referencia + pendiente estimada', '±0.5 %', 'ρ25 = 1.014 (lit.). Pendiente: Rackett escalado', 'punto único + pendiente', 'Valor recordado, verificar CoA')
) as v(nombre, categoria, cas, formula_quimica, masa_molar, temp_fusion_c,
       a0, a1, a2, a3, a4, residuo_max, rho20, calidad, metodo,
       incertidumbre, referencia, rango_datos, notas)
on conflict (nombre) do update set
  categoria       = excluded.categoria,
  cas             = excluded.cas,
  formula_quimica = excluded.formula_quimica,
  masa_molar      = excluded.masa_molar,
  temp_fusion_c   = excluded.temp_fusion_c,
  a0              = excluded.a0,
  a1              = excluded.a1,
  a2              = excluded.a2,
  a3              = excluded.a3,
  a4              = excluded.a4,
  residuo_max     = excluded.residuo_max,
  calidad         = excluded.calidad,
  metodo          = excluded.metodo,
  incertidumbre   = excluded.incertidumbre,
  referencia      = excluded.referencia,
  rango_datos     = excluded.rango_datos,
  notas           = excluded.notas;

-- ---------------------------------------------------------------------------
-- 4. Verificacion
-- ---------------------------------------------------------------------------
--
-- Dos puntos conocidos contra la tabla de origen. Si un coeficiente se cargo
-- mal, esto lo detecta ahora y no el dia que alguien pese un lote.

do $$
declare
  v_agua   numeric;
  v_etanol numeric;
  v_faltan integer;
begin
  select count(*) into v_faltan
    from gmp.densidades_referencia
   where a0 is not null and (a1 is null or valido_hasta_c <> 45);
  if v_faltan > 0 then
    raise exception 'Quedaron % densidades polinomicas mal formadas.', v_faltan
      using errcode = 'check_violation';
  end if;

  select gmp.densidad_a(id, 20) into v_agua
    from gmp.densidades_referencia where nombre = 'Agua';
  if abs(v_agua - 0.998207710028212) > 1e-9 then
    raise exception 'Agua a 20 C dio % y deberia dar 0.998207710028212.', v_agua
      using errcode = 'check_violation';
  end if;

  select gmp.densidad_a(id, 20) into v_etanol
    from gmp.densidades_referencia where nombre = 'Etanol';
  if abs(v_etanol - 0.789421841747386) > 1e-9 then
    raise exception 'Etanol a 20 C dio % y deberia dar 0.789421841747386.', v_etanol
      using errcode = 'check_violation';
  end if;
end;
$$;

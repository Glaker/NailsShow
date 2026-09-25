-- ---------------------------------------------------------------------------
-- Propósito : Cargar los datos del modelo de mezcla: 24 pares binarios con
--             coeficientes Redlich-Kister de volumen molar de exceso, la tabla
--             CRC de etanol-agua (101 filas, 0 a 100 % p/p) y la composición
--             de las densidades que son mezclas o sinónimos de un compuesto.
-- Reglas    : PG.60.8 (fórmula maestra y hoja de pesada). Los datos entran
--             como literatura: siguen valiendo las advertencias de RN-01 sobre
--             densidades no verificadas.
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- GENERADO por scripts/densidades/generar_mezclas.mjs. No editar a mano:
-- regenerar desde la planilla.
--
-- Archivo de origen: Densidades_liquidos_0-45C.xlsx (versión con mezclas)
-- sha256: beded93e5ec3d077f817a94e6ab89d0d97f427f0c31b1006c47d112c9c3fecdc
--
-- Los 91 compuestos de la hoja «Coeficientes» son idénticos a los cargados en
-- 20260922210000 (verificado contra la base el 2026-09-24): no se tocan.

-- ---- Pares binarios ---------------------------------------------------
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Etanol'), (select id from gmp.densidades_referencia where nombre = 'Acetato de etilo'), array[0.62567, -0.10517, 0, 0, 0, 0]::double precision[], array[0.01351, -0.00202, 0, 0, 0, 0]::double precision[], 25, '20 a 30', 'A', 'González et al., J. Chem. Thermodyn. 39 (2007), doi 10.1016/j.jct.2007.05.004 (coef. publicados; signos verificados con densidades)', null);
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Etanol'), (select id from gmp.densidades_referencia where nombre = 'Acetato de n-butilo'), array[0.467, -0.206, -0.021, 0, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '25', 'B', 'Ajuste propio a densidades de JCED 2018, doi 10.1021/acs.jced.8b00182', 'Sin dependencia con T: se asume dA/dT = 0');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Etanol'), (select id from gmp.densidades_referencia where nombre = 'Acetato de metilo'), array[0.7735, 0.01547, 0.1382, 0, 0, 0]::double precision[], array[0.01415, -0.00176, 0.00105, 0, 0, 0]::double precision[], 25, '20 a 30', 'A', 'González et al., J. Chem. Thermodyn. 39 (2007), doi 10.1016/j.jct.2007.05.004 (coef. publicados; signos verificados con densidades)', null);
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = '2-Propanol (IPA)'), (select id from gmp.densidades_referencia where nombre = 'Acetato de etilo'), array[1.99133, -0.01533, 0.50733, 0, 0, 0]::double precision[], array[0.0205, -0.0053, 0.0265, 0, 0, 0]::double precision[], 25, '20 a 30', 'B', 'Ajuste propio a densidades de Pereiro & Rodríguez, J. Chem. Thermodyn. 2007, doi 10.1016/j.jct.2007.02.008 (vía Cheméo)', null);
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = '2-Propanol (IPA)'), (select id from gmp.densidades_referencia where nombre = 'Acetato de n-butilo'), array[1.775, 0.011, 0.208, 0, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '25', 'B', 'Ajuste propio a densidades de JCED 2017, doi 10.1021/acs.jced.7b00141', 'dA/dT = 0 asumido');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = '2-Propanol (IPA)'), (select id from gmp.densidades_referencia where nombre = 'Acetato de isopropilo'), array[1.847, 0.066, 0.116, 0, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '25', 'B', 'Ajuste propio a V^E publicados, Fluid Phase Equilib. 2009, doi 10.1016/j.fluid.2009.09.015', 'dA/dT = 0 asumido');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Metanol'), (select id from gmp.densidades_referencia where nombre = 'Acetato de metilo'), array[-0.29173, 0.03657, 0.0498, 0.0448, 0, 0]::double precision[], array[0.00491, -0.00277, 0.00261, 0.00064, 0, 0]::double precision[], 25, '20 a 30', 'A', 'González et al., J. Chem. Thermodyn. 39 (2007), doi 10.1016/j.jct.2007.05.004 (coef. publicados; signos verificados con densidades)', null);
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Metanol'), (select id from gmp.densidades_referencia where nombre = 'Acetato de etilo'), array[-0.30327, -0.0378, -0.07667, 0, 0, 0]::double precision[], array[0.00574, -0.00278, 0.00115, 0, 0, 0]::double precision[], 25, '20 a 30', 'A', 'González et al., J. Chem. Thermodyn. 39 (2007), doi 10.1016/j.jct.2007.05.004 (coef. publicados; signos verificados con densidades)', null);
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = '1-Butanol'), (select id from gmp.densidades_referencia where nombre = 'Acetato de n-butilo'), array[0.792, -0.012, 0, 0, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '25', 'B', 'Ajuste propio a densidades de JCED 2018, doi 10.1021/acs.jced.8b00182', 'dA/dT = 0 asumido');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = '1-Propanol'), (select id from gmp.densidades_referencia where nombre = 'Acetato de n-propilo'), array[0.721, -0.083, 0.191, 0, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '25', 'B', 'Ajuste propio a densidades de JCED 2013, doi 10.1021/je400622g', 'dA/dT = 0 asumido');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Etanol'), (select id from gmp.densidades_referencia where nombre = 'Acetona'), array[-0.28323, -0.10667, -0.11913, -0.14177, 0, 0]::double precision[], array[0.00786, 0.00022, 0.00082, -0.00006, 0, 0]::double precision[], 25, '15 a 35', 'B', 'Ajuste propio a densidades de Chen & Tu, JCED 2005, doi 10.1021/je050010l (vía Cheméo)', null);
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Acetato de etilo'), (select id from gmp.densidades_referencia where nombre = 'Acetato de n-butilo'), array[0.241, 0.071, 0, 0, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '25', 'C', 'Ajuste propio, JCED 2013, doi 10.1021/je400036b (densidades puras extrapoladas)', 'Confianza baja: solo signo y orden de magnitud');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Acetato de n-butilo'), (select id from gmp.densidades_referencia where nombre = 'Tolueno'), array[-0.41, -0.074, -0.158, 0, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '35', 'B', 'Ajuste propio a V^E publicados, Fluid Phase Equilib. 2005, doi 10.1016/j.fluid.2005.06.011', 'Dato a 35 °C usado como si fuera 25 °C');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Etanol'), (select id from gmp.densidades_referencia where nombre = 'Metiletilcetona (MEK)'), array[-0.27, -0.1945, -0.171, 0, 0, 0]::double precision[], array[0.0109, 0.0012, 0.0056, 0, 0, 0]::double precision[], 25, '20 a 45', 'B', 'Ajuste propio a densidades de J. Chem. Thermodyn. 2007 (doi 10.1016/j.jct.2007.02.008) y JCED 2005 (doi 10.1021/je049655w); A(25 °C) promedio de ambos, dA/dT del segundo', null);
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Agua'), (select id from gmp.densidades_referencia where nombre = 'Etanol'), array[-4.25024, -0.75477, -2.03417, -2.82575, 1.56958, 3.99236]::double precision[], array[0.01191, 0.0051, 0.03291, 0.06658, -0.05888, -0.11376]::double precision[], 25, '10 a 30', 'A−', 'Ajuste propio (6 términos) a la tabla CRC de densidad etanol-agua 0 a 100 % p/p (hoja ''Etanol-agua CRC'')', 'Error del ajuste: Δρ máx 6·10⁻⁴ g/cm³. Para binario puro etanol-agua usar la tabla CRC directamente');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Agua'), (select id from gmp.densidades_referencia where nombre = 'Metanol'), array[-3.9823, -0.2166, -0.19095, 0.7198, 1.0062, 0]::double precision[], array[-0.00166, 0.01058, -0.01663, -0.01558, -0.0035, 0]::double precision[], 25, '10 a 20', 'A−', 'Ajuste propio a tabla Lange/CRC (densidad vs % p/p)', 'Δρ rms 1 a 2·10⁻⁴ g/cm³');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Agua'), (select id from gmp.densidades_referencia where nombre = '2-Propanol (IPA)'), array[-3.486, -1.5796, -1.5719, -5.7065, -0.8982, 4.8062]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '20', 'B', 'Ajuste propio a tabla de Perry 6ª ed. p. 3-92', 'Δρ máx 2.7·10⁻³ g/cm³ en 6 a 11 % p/p de IPA; dA/dT = 0 asumido');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Agua'), (select id from gmp.densidades_referencia where nombre = 'Glicerina'), array[-1.3901, -0.8482, -0.176, 0.3911, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '20', 'A−', 'Ajuste propio a CRC ''Concentrative properties of aqueous solutions'' (0 a 100 % p/p)', 'Δρ máx 3.4·10⁻⁴ g/cm³; dA/dT = 0 asumido');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Agua'), (select id from gmp.densidades_referencia where nombre = 'Propilenglicol'), array[-2.3919, -1.6861, -1.2932, 2.0421, 0, 0]::double precision[], array[0.01764, 0, 0, 0, 0, 0]::double precision[], 25, '20 a 30', 'C', 'Ajuste propio a Khattab et al., Arabian J. Chem. (doi 10.1016/j.arabjc.2012.07.012)', 'Datos de 4 decimales; coeficientes a 25 °C, pendiente solo en A0');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Agua'), (select id from gmp.densidades_referencia where nombre = '1,3-Butilenglicol'), array[-1.9163, -1.6833, -0.3763, -1.7434, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '25', 'C', 'Ajuste propio a J. Chem. Thermodyn. 2010, doi 10.1016/j.jct.2009.11.018 (NIST ThermoML)', 'Datos picnométricos ±2.6 kg/m³');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Agua'), (select id from gmp.densidades_referencia where nombre = 'Etoxidiglicol (DEGEE, Transcutol)'), array[-4.2817, -3.0301, -3.0319, -2.273, 0, 0]::double precision[], array[0.00902, 0, 0, 0, 0, 0]::double precision[], 25, '15 a 35', 'C', 'Ajuste propio a JCED 2019, doi 10.1021/acs.jced.8b01012 (NIST ThermoML)', 'Sin datos por debajo de ~49 % p/p de DEGEE (zona rica en agua extrapolada); pendiente solo en A0');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Glicerina'), (select id from gmp.densidades_referencia where nombre = 'Etanol'), array[-4.4393, 1.4533, -0.1133, 0.3764, 0, 0]::double precision[], array[0, 0, 0, 0, 0, 0]::double precision[], 25, '21', 'B', 'Ajuste propio a Alkindi et al., JCED 53 (2008), doi 10.1021/je8004479 (NIST ThermoML), 294 K', 'dA/dT = 0 asumido');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Glicerina'), (select id from gmp.densidades_referencia where nombre = '1-Propanol'), array[-2.51436, -0.53648, -2.29462, 0, 0, 0]::double precision[], array[-0.0217, -0.00322, -0.01801, 0, 0, 0]::double precision[], 25, '25 a 45', 'B', 'Ajuste propio a densidades de glicerina + 1-propanol, 298 a 318 K (serie JCED ''Densities and excess molar volumes for binary glycerol + 1-propanol, + 2-propanol…'')', 'Útil como análogo para glicerina + IPA');
insert into gmp.pares_volumen_exceso (compuesto_1_id, compuesto_2_id, a, da_dt, t_ref_c, rango_datos, calidad, fuente, notas)
values ((select id from gmp.densidades_referencia where nombre = 'Glicerina'), (select id from gmp.densidades_referencia where nombre = '2-Propanol (IPA)'), array[-2.51436, -0.53648, -2.29462, 0, 0, 0]::double precision[], array[-0.0217, -0.00322, -0.01801, 0, 0, 0]::double precision[], 25, '25 a 45', 'C', 'Análogo: mismos coeficientes que glicerina + 1-propanol (sin datos directos recuperados para IPA)', 'Estimación por analogía estructural; verificar si la precisión importa');

-- ---- Tabla CRC etanol-agua --------------------------------------------
insert into gmp.etanol_agua_crc (pct_pp, rho_10, rho_20, rho_25, rho_30, pct_vv_20, contraccion_20_pct) values
  (0, 0.99973, 0.99823, 0.99708, 0.99568, 0, 0),
  (1, 0.99785, 0.99636, 0.9952, 0.99379, 1.26226974434338, -0.0767525284656686),
  (2, 0.99602, 0.99453, 0.99336, 0.99194, 2.51990270352446, -0.156414724583036),
  (3, 0.99426, 0.99275, 0.99157, 0.99014, 3.77308890972205, -0.240008951396441),
  (4, 0.99258, 0.99103, 0.98984, 0.98839, 5.02206907036258, -0.328560399138455),
  (5, 0.99098, 0.98938, 0.98817, 0.9867, 6.2671345681202, -0.423096092889072),
  (6, 0.98946, 0.9878, 0.98656, 0.98507, 7.5085514480452, -0.52363664087336),
  (7, 0.98801, 0.98627, 0.985, 0.98347, 8.74640839182101, -0.628185054826118),
  (8, 0.9866, 0.98478, 0.98346, 0.98189, 9.98079408113107, -0.735746645473416),
  (9, 0.98524, 0.98331, 0.98193, 0.98031, 11.2116325031039, -0.844315686618453),
  (10, 0.98393, 0.98187, 0.98043, 0.97875, 12.4391263587301, -0.954909161574943),
  (11, 0.98267, 0.98047, 0.97897, 0.97723, 13.6635290242481, -1.06854512089259),
  (12, 0.98145, 0.9791, 0.97753, 0.97573, 14.8848404996579, -1.18422360786074),
  (13, 0.98026, 0.97775, 0.97611, 0.97424, 16.1030101097119, -1.30094319000453),
  (14, 0.97911, 0.97643, 0.97472, 0.97278, 17.3182912306484, -1.41972060374581),
  (15, 0.978, 0.97514, 0.97334, 0.97133, 18.5307978817746, -1.54056313577507),
  (16, 0.97692, 0.97387, 0.97199, 0.9699, 19.7404413814073, -1.66246787956461),
  (17, 0.97583, 0.97259, 0.97062, 0.96844, 20.9466516330099, -1.7824117190987),
  (18, 0.97473, 0.97129, 0.96923, 0.96697, 22.1491625915322, -1.89939024652102),
  (19, 0.97363, 0.96997, 0.96782, 0.96547, 23.3478982441027, -2.01340832383566),
  (20, 0.97252, 0.96864, 0.96639, 0.96395, 24.5430359540882, -2.12548081924059),
  (21, 0.97139, 0.96729, 0.96495, 0.96242, 25.7342716700028, -2.23460186305993),
  (22, 0.97024, 0.96592, 0.96348, 0.96087, 26.9215293789748, -2.34077516163209),
  (23, 0.96907, 0.96453, 0.96199, 0.95929, 28.1047330681329, -2.44400398249874),
  (24, 0.96787, 0.96312, 0.96048, 0.95769, 29.2838067246054, -2.54429115312099),
  (25, 0.96665, 0.96168, 0.95895, 0.95607, 30.4583576152228, -2.64062668149775),
  (26, 0.96539, 0.9602, 0.95738, 0.95422, 31.6279423315681, -2.73199782373858),
  (27, 0.96406, 0.95867, 0.95576, 0.95272, 32.7920667899764, -2.81738822960226),
  (28, 0.96268, 0.9571, 0.9541, 0.95098, 33.9508956850027, -2.89780600018255),
  (29, 0.96125, 0.95548, 0.95241, 0.94922, 35.1039095953582, -2.97223001820958),
  (30, 0.95977, 0.95382, 0.95067, 0.94741, 36.2512985532217, -3.04166668584133),
  (31, 0.95823, 0.95212, 0.9489, 0.94557, 37.3929105328502, -3.10610729970913),
  (32, 0.95665, 0.95038, 0.94709, 0.9437, 38.5285935085008, -3.16554174886065),
  (33, 0.95502, 0.9486, 0.94525, 0.9418, 39.6581954544303, -3.21995849891239),
  (34, 0.95334, 0.94679, 0.94337, 0.93986, 40.781995084501, -3.27036624470567),
  (35, 0.95162, 0.94494, 0.94146, 0.9379, 41.8994349709884, -3.31573194541988),
  (36, 0.94986, 0.94306, 0.93952, 0.93591, 43.0108191653787, -3.35706479087396),
  (37, 0.94805, 0.94114, 0.93756, 0.9339, 44.1155649023235, -3.39332632707924),
  (38, 0.9462, 0.93919, 0.93556, 0.93186, 45.2140015709327, -3.42552654353508),
  (39, 0.94431, 0.9372, 0.93353, 0.92979, 46.3055210682342, -3.45262113684329),
  (40, 0.94238, 0.93518, 0.93148, 0.9277, 47.3904781209618, -3.475621200916),
  (41, 0.94042, 0.93314, 0.9294, 0.92558, 48.4692781310969, -3.49554455741748),
  (42, 0.93842, 0.93107, 0.92729, 0.92344, 49.5413129956673, -3.51134389199706),
  (43, 0.93639, 0.92897, 0.92516, 0.92128, 50.6064686953657, -3.52300104337996),
  (44, 0.93433, 0.92685, 0.92301, 0.9191, 51.6651886386095, -3.5315376394564),
  (45, 0.93226, 0.92472, 0.92085, 0.91692, 52.7179669090633, -3.53798369466572),
  (46, 0.93017, 0.92257, 0.91868, 0.91472, 53.7641827349431, -3.54128711485353),
  (47, 0.92806, 0.92041, 0.91649, 0.9125, 54.8043555375377, -3.54248174152414),
  (48, 0.92593, 0.91823, 0.91429, 0.91028, 55.8378392074391, -3.54050984915964),
  (49, 0.92379, 0.91604, 0.91208, 0.90805, 56.8651785035599, -3.53640930915661),
  (50, 0.92162, 0.91384, 0.90985, 0.9058, 57.8863354194644, -3.53017217693052),
  (51, 0.91943, 0.9116, 0.9076, 0.90353, 58.8993336204931, -3.51861520282349),
  (52, 0.91723, 0.90936, 0.90524, 0.90125, 59.9066561937821, -3.50594960730164),
  (53, 0.91502, 0.90711, 0.90307, 0.89896, 60.9076316922999, -3.49111061384968),
  (54, 0.91279, 0.90485, 0.90079, 0.89667, 61.9022221096106, -3.47408880817589),
  (55, 0.91055, 0.90258, 0.8985, 0.89437, 62.8903894392784, -3.45487446926069),
  (56, 0.90831, 0.90031, 0.89621, 0.89206, 63.8728051283351, -3.4345301573415),
  (57, 0.90607, 0.89803, 0.89392, 0.88975, 64.8487470545012, -3.41197890588251),
  (58, 0.90381, 0.89574, 0.89162, 0.88744, 65.8181772113411, -3.38721020448249),
  (59, 0.90154, 0.89344, 0.88931, 0.88512, 66.781057592419, -3.36021322115116),
  (60, 0.89927, 0.89113, 0.88699, 0.88278, 67.7373501912991, -3.33097679770777),
  (61, 0.89698, 0.88882, 0.88466, 0.88044, 68.6877897990727, -3.30057741010371),
  (62, 0.89468, 0.8865, 0.88233, 0.87809, 69.6315909494008, -3.26792172426635),
  (63, 0.89237, 0.88417, 0.87998, 0.87574, 70.5687156358477, -3.2329977395916),
  (64, 0.89006, 0.88183, 0.87763, 0.87337, 71.4991258519776, -3.19579311223695),
  (65, 0.88774, 0.87948, 0.87527, 0.871, 72.4227835913548, -3.15629514987688),
  (66, 0.88541, 0.87713, 0.87291, 0.86863, 73.3404869891302, -3.11559538041866),
  (67, 0.88308, 0.87477, 0.87054, 0.86625, 74.2513872349051, -3.07258279288016),
  (68, 0.88071, 0.87241, 0.86817, 0.86387, 75.1563078014544, -3.02835534175517),
  (69, 0.87839, 0.87004, 0.86579, 0.86148, 76.0543745407556, -2.98179466481423),
  (70, 0.87602, 0.86766, 0.8634, 0.85908, 76.9455494463729, -2.9328866030552),
  (71, 0.87365, 0.86527, 0.861, 0.85667, 77.8297945118707, -2.8816166205358),
  (72, 0.87127, 0.86287, 0.85859, 0.85426, 78.7070717308131, -2.82796979814481),
  (73, 0.86888, 0.86047, 0.85618, 0.85184, 79.5782679200345, -2.77306076861193),
  (74, 0.86648, 0.85806, 0.85376, 0.84941, 80.4424455874528, -2.7157515952102),
  (75, 0.86408, 0.85564, 0.85135, 0.84698, 81.2995667266324, -2.65602636015299),
  (76, 0.86168, 0.85322, 0.84891, 0.84455, 82.1505561608432, -2.59501036893348),
  (77, 0.85927, 0.85079, 0.84647, 0.84211, 82.9944383915676, -2.53155329419766),
  (78, 0.85685, 0.84835, 0.84403, 0.83966, 83.8311754123698, -2.46563817434954),
  (79, 0.85422, 0.8459, 0.84158, 0.8372, 84.660729216814, -2.39724762318367),
  (80, 0.85197, 0.84344, 0.83911, 0.83473, 85.4830617984645, -2.3263638222839),
  (81, 0.8495, 0.84096, 0.83664, 0.83224, 86.2971089771201, -2.25180618644116),
  (82, 0.84702, 0.83848, 0.83415, 0.82974, 87.104872425064, -2.17587631929794),
  (83, 0.84453, 0.83599, 0.83164, 0.82724, 87.9053006309068, -2.09739700432139),
  (84, 0.84203, 0.83348, 0.82913, 0.82473, 88.6972914080118, -2.01517301585681),
  (85, 0.83951, 0.83095, 0.8266, 0.8222, 89.4807687435072, -1.9291704938921),
  (86, 0.83697, 0.8284, 0.82405, 0.81965, 90.2556566245218, -1.83935456706343),
  (87, 0.83441, 0.82583, 0.82148, 0.81708, 91.0218790381838, -1.74568932927913),
  (88, 0.83181, 0.82323, 0.81888, 0.81448, 91.778245116173, -1.64694310855327),
  (89, 0.82919, 0.82062, 0.81626, 0.81186, 92.5268958877037, -1.54546223349241),
  (90, 0.82654, 0.81797, 0.81362, 0.80922, 93.2643727671219, -1.43760789668823),
  (91, 0.82386, 0.81529, 0.81094, 0.80655, 93.9916765905693, -1.32451821821729),
  (92, 0.82114, 0.81257, 0.80823, 0.80384, 94.7075278080422, -1.20491883967887),
  (93, 0.81839, 0.80983, 0.80549, 0.80111, 95.4141307928143, -1.0811752151275),
  (94, 0.81561, 0.80705, 0.80272, 0.79835, 96.1090277953734, -0.950787126274795),
  (95, 0.81278, 0.80424, 0.79991, 0.79555, 96.7932703271087, -0.814905206446074),
  (96, 0.80991, 0.80138, 0.79706, 0.79271, 97.4643119568247, -0.670983190223035),
  (97, 0.80698, 0.79846, 0.79415, 0.78981, 98.1207337775863, -0.517667378222093),
  (98, 0.80399, 0.79547, 0.79117, 0.78684, 98.7610662072111, -0.353572592501755),
  (99, 0.80094, 0.79243, 0.78814, 0.78382, 99.3875516254086, -0.181058297818543),
  (100, 0.79784, 0.78934, 0.78506, 0.78075, 100, 0);

-- ---- Composición de las densidades que no son un compuesto puro -------------
--
-- Las cinco entradas anteriores a la tabla de 91 compuestos no tienen masa
-- molar: son un grado comercial («Etanol 96 GL») o un sinónimo («Agua
-- desionizada», «Isopropanol»). Para el modelo de mezcla se descomponen en
-- compuestos de la tabla; su densidad propia no cambia.
--
-- Etanol 96 GL: 96 % v/v a 20 °C = 93.8431 % p/p de etanol, interpolado en
-- la tabla CRC (OIML R 22 da 93,84).
insert into gmp.densidad_composicion (densidad_id, constituyente_id, fraccion_masica, fuente) values
  ((select id from gmp.densidades_referencia where nombre = 'Etanol 96 GL'), (select id from gmp.densidades_referencia where nombre = 'Etanol'), 0.938431, 'Tabla CRC etanol-agua, 96 % v/v a 20 °C'),
  ((select id from gmp.densidades_referencia where nombre = 'Etanol 96 GL'), (select id from gmp.densidades_referencia where nombre = 'Agua'), 0.061569, 'Tabla CRC etanol-agua, 96 % v/v a 20 °C'),
  ((select id from gmp.densidades_referencia where nombre = 'Etanol absoluto'), (select id from gmp.densidades_referencia where nombre = 'Etanol'), 1, 'Sinónimo'),
  ((select id from gmp.densidades_referencia where nombre = 'Agua desionizada'), (select id from gmp.densidades_referencia where nombre = 'Agua'), 1, 'Sinónimo'),
  ((select id from gmp.densidades_referencia where nombre = 'Isopropanol'), (select id from gmp.densidades_referencia where nombre = '2-Propanol (IPA)'), 1, 'Sinónimo'),
  ((select id from gmp.densidades_referencia where nombre = 'Acetato de butilo'), (select id from gmp.densidades_referencia where nombre = 'Acetato de n-butilo'), 1, 'Sinónimo');

do $$
declare v_n integer;
begin
  select count(*) into v_n from gmp.pares_volumen_exceso;
  if v_n <> 24 then
    raise exception 'Se esperaban 24 pares y quedaron % (¿falta un compuesto por nombre?).', v_n;
  end if;
  select count(*) into v_n from gmp.densidad_composicion;
  if v_n <> 6 then
    raise exception 'Se esperaban 6 renglones de composición y quedaron %.', v_n;
  end if;
end;
$$;

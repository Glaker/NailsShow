-- ---------------------------------------------------------------------------
-- Propósito : Cargar la lista de materiales de cada producto terminado desde
--             la hoja «C.V.D.» de la planilla de inventario, solo los bloques
--             en celeste. Alimenta la explosión de pedidos y la baja de stock
--             al terminarlos (20260923130000).
-- Reglas    : §3.3 (Gerencia de Producción define la lista de materiales),
--             RN-50 (auditoría de la carga).
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- GENERADA, NO ESCRITA A MANO. Sale de:
--   scripts/lista_materiales/extraer_cvd.mjs     xlsx → cvd_celeste.csv
--   scripts/lista_materiales/decisiones.mjs      qué bloque es qué producto,
--                                                en qué unidad está cada
--                                                cantidad, con qué densidad
--   scripts/lista_materiales/generar_migracion.mjs  → este archivo
-- Origen: 05 INVENTARIO NAIL SHOW FABRICA(4).xlsx (hoja C.V.D.), sha256
-- 6957d867a8def01126281de327069c8587b4cc1b1bfbe82d7676e28df95f89ec.
-- Para corregir algo: se cambia decisiones.mjs y se genera una migración
-- nueva. Esta no se edita una vez aplicada (CLAUDE.md §6).
--
-- QUÉ ENTRA. 142 renglones para 26 productos, de 204 renglones
-- celestes en 36 bloques. 17 renglones de líquidos se pasan de ml o litros a
-- gramos con gmp.densidad_a(…, 20 °C); la densidad y el compuesto usados
-- quedan escritos en la columna `origen` de cada fila.
--
-- QUÉ NO ENTRA, Y POR QUÉ. 62 renglones, listados en
-- scripts/lista_materiales/pendientes.md, cada uno con su motivo: variantes no
-- vigentes o discontinuadas, bloques cuyo producto no está en el catálogo, los
-- componentes de los DUO (son productos terminados, no insumos) y la etiqueta
-- de lote del primer, que no tiene código en la planilla. Los insumos que
-- faltaban en el catálogo se dieron de alta en 20260923135000. **Un producto
-- con renglones afuera va a mostrar menos faltantes de los reales para esos
-- insumos**: la lista está incompleta en esos puntos, no esos insumos sobran.
--
-- UNIDADES. Materia prima y crema a granel en gramos (volumen × densidad a
-- 20 °C, o kg × 1000); esencia y granel líquido sin densidad medida (primer,
-- bonder, removedor) en ml; envases, cierres y etiquetas en unidades.
--
-- ON CONFLICT DO NOTHING: si alguien ya cargó a mano un insumo para un
-- producto desde la pantalla, se respeta lo suyo y esta carga no lo pisa.

alter table gmp.materiales_acondicionamiento
  add column if not exists origen text;

comment on column gmp.materiales_acondicionamiento.origen is
  'De dónde salió la cantidad: celda de la planilla, unidad original y, si se convirtió, densidad usada. NULL = cargada a mano.';
comment on table gmp.materiales_acondicionamiento is
  'Lista de materiales por unidad de producto terminado: envase, tapa, etiqueta y, donde la planilla lo declara, las materias primas del granel. En la unidad de medida del insumo.';

do $$
declare
  v_sin_densidad text;
begin
  create temp table _cvd (
    producto  text,
    insumo    text,
    cantidad  numeric,
    factor    numeric,
    compuesto text,
    origen    text
  ) on commit drop;

  insert into _cvd values
  ('101', '101ENVA', 1, 1, null, 'C.V.D. D249 fila 250: 1 u'),
  ('101', '101ET', 1, 1, null, 'C.V.D. D249 fila 251: 1 u'),
  ('101', '101TAPACIEGA', 1, 1, null, 'C.V.D. D249 fila 252: 1 u'),
  ('101', '101ESE', 0.002, 1000, null, 'C.V.D. D249 fila 253: 2E-3 L → ml (misma escala que el monómero: 0,002 / 0,005 / 0,01 L para 100 / 250 / 500 ml)'),
  ('101', '101MONO', 0.1, 1000, 'Metacrilato de etilo (EMA)', 'C.V.D. D249 fila 254: 0.1 L → g (costo = precio por litro del tacho de 200 L × cantidad; 0,1 para 100 ml)'),
  ('102', '104ENV', 1, 1, null, 'C.V.D. D257 fila 258: 1 u'),
  ('102', '102ET', 1, 1, null, 'C.V.D. D257 fila 259: 1 u'),
  ('102', '104TAP', 1, 1, null, 'C.V.D. D257 fila 260: 1 u'),
  ('102', '101ESE', 0.005, 1000, null, 'C.V.D. D257 fila 261: 5.0000000000000001E-3 L → ml (misma escala que el monómero: 0,002 / 0,005 / 0,01 L para 100 / 250 / 500 ml)'),
  ('102', '101MONO', 0.25, 1000, 'Metacrilato de etilo (EMA)', 'C.V.D. D257 fila 262: 0.25 L → g (costo = precio por litro del tacho de 200 L × cantidad; 0,1 para 100 ml)'),
  ('103', '103ENVA', 1, 1, null, 'C.V.D. D265 fila 266: 1 u'),
  ('103', '103ET', 1, 1, null, 'C.V.D. D265 fila 267: 1 u'),
  ('103', '320TAPA', 1, 1, null, 'C.V.D. D265 fila 268: 1 u'),
  ('103', '101ESE', 0.01, 1000, null, 'C.V.D. D265 fila 269: 0.01 L → ml (misma escala que el monómero: 0,002 / 0,005 / 0,01 L para 100 / 250 / 500 ml)'),
  ('103', '101MONO', 0.5, 1000, 'Metacrilato de etilo (EMA)', 'C.V.D. D265 fila 270: 0.5 L → g (costo = precio por litro del tacho de 200 L × cantidad; 0,1 para 100 ml)'),
  ('105', '105ENV', 1, 1, null, 'C.V.D. D281 fila 282: 1 u'),
  ('387', '387ENV', 1, 1, null, 'C.V.D. J281 fila 282: 1 u'),
  ('105', '105TAP', 1, 1, null, 'C.V.D. D281 fila 283: 1 u'),
  ('387', '105TAP', 1, 1, null, 'C.V.D. J281 fila 283: 1 u'),
  ('105', '105PIN', 1, 1, null, 'C.V.D. D281 fila 284: 1 u'),
  ('387', '387PIN', 1, 1, null, 'C.V.D. J281 fila 284: 1 u'),
  ('105', '105ET', 1, 1, null, 'C.V.D. D281 fila 286: 1 u'),
  ('387', '387ET', 1, 1, null, 'C.V.D. J281 fila 286: 1 u'),
  ('105', '105MO', 0.008, 1000, null, 'C.V.D. D281 fila 287: 8.0000000000000002E-3 L → ml (0,008 L = 8 ml de primer por envase)'),
  ('387', '387ETD', 1, 1, null, 'C.V.D. J281 fila 287: 1 u'),
  ('387', '387MO', 0.008, 1000, null, 'C.V.D. J281 fila 288: 8.0000000000000002E-3 L → ml (0,008 L = 8 ml de primer por envase)'),
  ('DUO01', '105BOL', 1, 1, null, 'C.V.D. D291 fila 294: 1 u'),
  ('DUO02', '105BOL', 1, 1, null, 'C.V.D. J291 fila 294: 1 u'),
  ('106', '105ENV', 1, 1, null, 'C.V.D. D322 fila 323: 1 u'),
  ('106', '106ET', 1, 1, null, 'C.V.D. D322 fila 324: 1 u'),
  ('106', '105TAP', 1, 1, null, 'C.V.D. D322 fila 325: 1 u'),
  ('106', '105PIN', 1, 1, null, 'C.V.D. D322 fila 326: 1 u'),
  ('106', '080ETL', 1, 1, null, 'C.V.D. D322 fila 327: 1 u'),
  ('106', '106LIQ', 0.008, 1000, null, 'C.V.D. D322 fila 328: 8.0000000000000002E-3 L → ml (costo = precio por litro × cantidad; 0,008 L = 8 ml)'),
  ('391', '391ENV', 1, 1, null, 'C.V.D. R435 fila 436: 1 u'),
  ('392', '392ENV', 1, 1, null, 'C.V.D. Y435 fila 436: 1 u'),
  ('391', '135GAT', 1, 1, null, 'C.V.D. R435 fila 437: 1 u'),
  ('392', '391BOM', 1, 1, null, 'C.V.D. Y435 fila 437: 1 u'),
  ('391', '391ET', 1, 1, null, 'C.V.D. R435 fila 438: 1 u'),
  ('392', '392ET', 1, 1, null, 'C.V.D. Y435 fila 438: 1 u'),
  ('391', '391ETD', 1, 1, null, 'C.V.D. R435 fila 439: 1 u'),
  ('392', '392ETD', 1, 1, null, 'C.V.D. Y435 fila 439: 1 u'),
  ('391', '138CL1', 146.5, 1, 'Etanol 96 GL', 'C.V.D. R435 fila 440: 146.5 ml → g (líquido principal, dosificado por volumen)'),
  ('392', '138CL1', 87.5, 1, 'Etanol 96 GL', 'C.V.D. Y435 fila 440: 87.5 ml → g (líquido principal, dosificado por volumen)'),
  ('391', '135AGUA', 50, 1, 'Agua desionizada', 'C.V.D. R435 fila 441: 50 ml → g (líquido principal, dosificado por volumen)'),
  ('392', '135AGUA', 31.25, 1, 'Agua desionizada', 'C.V.D. Y435 fila 441: 31.25 ml → g (líquido principal, dosificado por volumen)'),
  ('391', '135GLI', 1.3, 1, 'Glicerina', 'C.V.D. R435 fila 442: 1.3 ml → g (líquido, dosificado por volumen)'),
  ('392', '135GLI', 0.8125, 1, 'Glicerina', 'C.V.D. Y435 fila 442: 0.8125 ml → g (líquido, dosificado por volumen)'),
  ('391', '135FRA1', 2, 1, null, 'C.V.D. R435 fila 443: 2 g (aditivo: mismo costeo por kg que en las cremas)'),
  ('392', '135ALOE', 0.63, 1, null, 'C.V.D. Y435 fila 443: 0.63 g (aditivo, costeado por kg)'),
  ('391', '148PIG', 0.08, 1, null, 'C.V.D. R435 fila 444: 0.08 g (pigmento en polvo)'),
  ('392', '135FRA1', 1.25, 1, null, 'C.V.D. Y435 fila 444: 1.25 g (aditivo: mismo costeo por kg que en las cremas)'),
  ('392', '148PIG', 0.05, 1, null, 'C.V.D. Y435 fila 445: 0.05 g (pigmento en polvo)'),
  ('384', '101ENVA', 1, 1, null, 'C.V.D. D450 fila 451: 1 u'),
  ('384', '101TAPA', 1, 1, null, 'C.V.D. D450 fila 452: 1 u'),
  ('384', '384ET', 1, 1, null, 'C.V.D. D450 fila 453: 1 u'),
  ('384', '384ESE', 0.0002, 1000, null, 'C.V.D. D450 fila 454: 2.0000000000000001E-4 L → ml (costo = precio por litro de esencia × cantidad; 0,0002 L = 0,2 ml por 100 ml)'),
  ('384', '138CL1', 0.08, 1000, 'Etanol 96 GL', 'C.V.D. D450 fila 455: 0.08 L → g (código corregido a 138CL1: la celda de código es «0»; el costo se calcula con INVENTARIO!J238, que es 138CL1; costo = precio por litro × cantidad; 0,08 L por 100 ml)'),
  ('384', '138CL2', 0.02, 1000, '2-Propanol (IPA)', 'C.V.D. D450 fila 456: 0.02 L → g (código corregido a 138CL2: la celda de código es «0»; el costo se calcula con INVENTARIO!J239, que es 138CL2; costo = precio por litro × cantidad; 0,02 L por 100 ml)'),
  ('385', '104ENV', 1, 1, null, 'C.V.D. D459 fila 460: 1 u'),
  ('385', '104TAP', 1, 1, null, 'C.V.D. D459 fila 461: 1 u'),
  ('385', '385ET', 1, 1, null, 'C.V.D. D459 fila 462: 1 u'),
  ('385', '384ESE', 0.0005, 1000, null, 'C.V.D. D459 fila 463: 5.0000000000000001E-4 L → ml (costo = precio por litro de esencia × cantidad; 0,0002 L = 0,2 ml por 100 ml)'),
  ('385', '138CL1', 0.2, 1000, 'Etanol 96 GL', 'C.V.D. D459 fila 464: 0.2 L → g (código corregido a 138CL1: la celda de código es «0»; el costo se calcula con INVENTARIO!J238, que es 138CL1; costo = precio por litro × cantidad; 0,08 L por 100 ml)'),
  ('385', '138CL2', 0.05, 1000, '2-Propanol (IPA)', 'C.V.D. D459 fila 465: 0.05 L → g (código corregido a 138CL2: la celda de código es «0»; el costo se calcula con INVENTARIO!J239, que es 138CL2; costo = precio por litro × cantidad; 0,02 L por 100 ml)'),
  ('386', '103ENV', 1, 1, null, 'C.V.D. D468 fila 469: 1 u'),
  ('386', '103TAP', 1, 1, null, 'C.V.D. D468 fila 470: 1 u'),
  ('386', '386ET', 1, 1, null, 'C.V.D. D468 fila 471: 1 u'),
  ('386', '384ESE', 0.002, 1000, null, 'C.V.D. D468 fila 472: 2E-3 L → ml (costo = precio por litro de esencia × cantidad; 0,0002 L = 0,2 ml por 100 ml)'),
  ('386', '138CL1', 0.8, 1000, 'Etanol 96 GL', 'C.V.D. D468 fila 473: 0.8 L → g (código corregido a 138CL1: la celda de código es «0»; el costo se calcula con INVENTARIO!J238, que es 138CL1; costo = precio por litro × cantidad; 0,08 L por 100 ml)'),
  ('386', '138CL2', 0.2, 1000, '2-Propanol (IPA)', 'C.V.D. D468 fila 474: 0.2 L → g (código corregido a 138CL2: la celda de código es «0»; el costo se calcula con INVENTARIO!J239, que es 138CL2; costo = precio por litro × cantidad; 0,02 L por 100 ml)'),
  ('192', '192ENV', 1, 1, null, 'C.V.D. R487 fila 488: 1 u'),
  ('192', '192ET', 1, 1, null, 'C.V.D. R487 fila 489: 1 u'),
  ('192', '192ALOE', 0.146, 1, null, 'C.V.D. R487 fila 490: 0.14599999999999999 g (aditivo, costeado por kg / 1000)'),
  ('192', '192ENM', 0.136, 1, null, 'C.V.D. R487 fila 491: 0.13600000000000001 g (aditivo, costeado por kg / 1000)'),
  ('192', '192REM', 120, 1, null, 'C.V.D. R487 fila 492: 120 ml (costo = precio por litro / 1000 × 120 ml)'),
  ('370', '364ENV', 1, 1, null, 'C.V.D. K696 fila 697: 1 u'),
  ('373', '367ENV', 1, 1, null, 'C.V.D. R696 fila 697: 1 u'),
  ('367', '367ENV', 1, 1, null, 'C.V.D. Y696 fila 697: 1 u'),
  ('370', '370BOM', 1, 1, null, 'C.V.D. K696 fila 698: 1 u'),
  ('373', '367TAP', 1, 1, null, 'C.V.D. R696 fila 698: 1 u'),
  ('367', '367TAP', 1, 1, null, 'C.V.D. Y696 fila 698: 1 u'),
  ('370', '370ET', 1, 1, null, 'C.V.D. K696 fila 699: 1 u'),
  ('373', '373ET', 1, 1, null, 'C.V.D. R696 fila 699: 1 u'),
  ('367', '367ET', 1, 1, null, 'C.V.D. Y696 fila 699: 1 u'),
  ('370', '370ETD', 1, 1, null, 'C.V.D. K696 fila 700: 1 u'),
  ('373', '373ETD', 1, 1, null, 'C.V.D. R696 fila 700: 1 u'),
  ('367', '367ETD', 1, 1, null, 'C.V.D. Y696 fila 700: 1 u'),
  ('370', '135FRA1', 1.92, 1, null, 'C.V.D. K696 fila 701: 1.92 g (aditivo, costeado por kg / 1000)'),
  ('373', '135FRA1', 0.8, 1, null, 'C.V.D. R696 fila 701: 0.8 g (aditivo, costeado por kg / 1000)'),
  ('367', '135FRA1', 0.8, 1, null, 'C.V.D. Y696 fila 701: 0.8 g (aditivo, costeado por kg / 1000)'),
  ('370', '370CREMA', 0.24, 1000, null, 'C.V.D. K696 fila 702: 0.24 kg → g (costo = precio por kg × cantidad; 0,24 para 240 ml)'),
  ('373', '370CREMA', 0.1, 1000, null, 'C.V.D. R696 fila 702: 0.1 kg → g (costo = precio por kg × cantidad; 0,24 para 240 ml)'),
  ('367', '364CREMA', 0.1, 1000, null, 'C.V.D. Y696 fila 702: 0.1 kg → g (idem)'),
  ('371', '364ENV', 1, 1, null, 'C.V.D. K705 fila 706: 1 u'),
  ('374', '367ENV', 1, 1, null, 'C.V.D. R705 fila 706: 1 u'),
  ('368', '367ENV', 1, 1, null, 'C.V.D. Y705 fila 706: 1 u'),
  ('371', '370BOM', 1, 1, null, 'C.V.D. K705 fila 707: 1 u'),
  ('374', '367TAP', 1, 1, null, 'C.V.D. R705 fila 707: 1 u'),
  ('368', '367TAP', 1, 1, null, 'C.V.D. Y705 fila 707: 1 u'),
  ('371', '370ET', 1, 1, null, 'C.V.D. K705 fila 708: 1 u'),
  ('374', '374ET', 1, 1, null, 'C.V.D. R705 fila 708: 1 u'),
  ('368', '368ET', 1, 1, null, 'C.V.D. Y705 fila 708: 1 u'),
  ('371', '370ETD', 1, 1, null, 'C.V.D. K705 fila 709: 1 u'),
  ('374', '374ETD', 1, 1, null, 'C.V.D. R705 fila 709: 1 u'),
  ('368', '368ETD', 1, 1, null, 'C.V.D. Y705 fila 709: 1 u'),
  ('371', '135FRA2', 1.92, 1, null, 'C.V.D. K705 fila 710: 1.92 g (idem)'),
  ('374', '135FRA2', 0.8, 1, null, 'C.V.D. R705 fila 710: 0.8 g (idem)'),
  ('368', '135FRA2', 0.8, 1, null, 'C.V.D. Y705 fila 710: 0.8 g (idem)'),
  ('371', '371CREMA', 0.24, 1000, null, 'C.V.D. K705 fila 711: 0.24 kg → g (idem)'),
  ('374', '371CREMA', 0.1, 1000, null, 'C.V.D. R705 fila 711: 0.1 kg → g (idem)'),
  ('368', '365CREMA', 0.1, 1000, null, 'C.V.D. Y705 fila 711: 0.1 kg → g (idem)'),
  ('372', '364ENV', 1, 1, null, 'C.V.D. K714 fila 715: 1 u'),
  ('375', '367ENV', 1, 1, null, 'C.V.D. R714 fila 715: 1 u'),
  ('369', '367ENV', 1, 1, null, 'C.V.D. Y714 fila 715: 1 u'),
  ('372', '370BOM', 1, 1, null, 'C.V.D. K714 fila 716: 1 u'),
  ('375', '367TAP', 1, 1, null, 'C.V.D. R714 fila 716: 1 u'),
  ('369', '367TAP', 1, 1, null, 'C.V.D. Y714 fila 716: 1 u'),
  ('372', '370ET', 1, 1, null, 'C.V.D. K714 fila 717: 1 u'),
  ('375', '375ET', 1, 1, null, 'C.V.D. R714 fila 717: 1 u'),
  ('369', '369ET', 1, 1, null, 'C.V.D. Y714 fila 717: 1 u'),
  ('372', '370ETD', 1, 1, null, 'C.V.D. K714 fila 718: 1 u'),
  ('375', '375ETD', 1, 1, null, 'C.V.D. R714 fila 718: 1 u'),
  ('369', '369ETD', 1, 1, null, 'C.V.D. Y714 fila 718: 1 u'),
  ('372', '135FRA3', 1.92, 1, null, 'C.V.D. K714 fila 719: 1.92 g (idem)'),
  ('375', '135FRA3', 0.8, 1, null, 'C.V.D. R714 fila 719: 0.8 g (idem)'),
  ('369', '135FRA3', 0.8, 1, null, 'C.V.D. Y714 fila 719: 0.8 g (idem)'),
  ('372', '372CREMA', 0.24, 1000, null, 'C.V.D. K714 fila 720: 0.24 kg → g (idem)'),
  ('375', '372CREMA', 0.1, 1000, null, 'C.V.D. R714 fila 720: 0.1 kg → g (idem)'),
  ('369', '366CREMA', 0.1, 1000, null, 'C.V.D. Y714 fila 720: 0.1 kg → g (idem)'),
  ('381', '105ENV', 1, 1, null, 'C.V.D. R752 fila 753: 1 u'),
  ('381', '105TAPA', 1, 1, null, 'C.V.D. R752 fila 754: 1 u'),
  ('381', '105PIN', 1, 1, null, 'C.V.D. R752 fila 755: 1 u'),
  ('381', '381ET', 1, 1, null, 'C.V.D. R752 fila 756: 1 u'),
  ('381', '381ETD', 1, 1, null, 'C.V.D. R752 fila 757: 1 u'),
  ('381', '378ACE', 8, 1, 'Vaselina líquida liviana (Paraffinum liquidum perliquidum)', 'C.V.D. R752 fila 758: 8 ml → g (8 para un envase de 8 ml)'),
  ('378', '131ENV', 1, 1, null, 'C.V.D. R762 fila 763: 1 u'),
  ('378', '378ET', 1, 1, null, 'C.V.D. R762 fila 764: 1 u'),
  ('378', '378ETD', 1, 1, null, 'C.V.D. R762 fila 765: 1 u'),
  ('378', '378ACE', 33, 1, 'Vaselina líquida liviana (Paraffinum liquidum perliquidum)', 'C.V.D. R762 fila 766: 33 ml → g (33 para un envase de 33 ml)'),
  ('321', '321TOALLA', 1, 1, null, 'C.V.D. K965 fila 966: 1 u'),
  ('321', '321ET', 1, 1, null, 'C.V.D. K965 fila 967: 1 u');

  -- Un líquido sin densidad en la base no se convierte a ojo: se aborta.
  select string_agg(c.insumo || ' (' || c.compuesto || ')', ', ')
    into v_sin_densidad
    from _cvd c
   where c.compuesto is not null
     and not exists (
       select 1 from gmp.densidades_referencia d where d.nombre = c.compuesto and d.activo
     );
  if v_sin_densidad is not null then
    raise exception 'Faltan densidades en gmp.densidades_referencia: %', v_sin_densidad;
  end if;

  insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, origen)
  select
    p.id,
    i.id,
    round(
      -- densidad_a() rechaza un id nulo: la densidad se pide solo si hay.
      c.cantidad * c.factor * case when d.id is null then 1 else gmp.densidad_a(d.id, 20) end,
      6),
    c.origen || case
      when d.id is not null then format(' × %s g/ml (%s, 20 °C)', round(gmp.densidad_a(d.id, 20), 5), d.nombre)
      else ''
    end
  from _cvd c
  join gmp.productos p        on p.codigo_interno = c.producto
  join gmp.insumos_catalogo i on i.codigo_interno = c.insumo
  left join gmp.densidades_referencia d on d.nombre = c.compuesto and d.activo
  on conflict (producto_id, insumo_id) do nothing;

  -- Todo renglón tiene que haber encontrado su producto y su insumo.
  if (select count(*) from _cvd c
        join gmp.productos p        on p.codigo_interno = c.producto
        join gmp.insumos_catalogo i on i.codigo_interno = c.insumo) <> 142 then
    raise exception 'Hay renglones cuyo producto o insumo no está en la base.';
  end if;
end;
$$;

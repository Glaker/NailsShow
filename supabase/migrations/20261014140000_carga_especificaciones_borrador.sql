-- ---------------------------------------------------------------------------
-- Propósito : Cargar en borrador las especificaciones de producto que existen
--             como documento en la carpeta de POE (I-E.50.11 a I-E.50.17,
--             I-E.50.25 a I-E.50.28, I-E.50.31). Dirección Técnica las revisa
--             y las aprueba desde Especificaciones; esta migración no aprueba
--             ninguna.
-- Reglas    : §4.6 y §7.1 del alcance, PG.60.8. Invariante 1: nacen en
--             BORRADOR (trigger gmp.fn_especificacion_editable). Pedido del
--             codirector técnico, 2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- FUENTE. Transcripción de los .docx de la carpeta POE´S (generada con
-- scripts fuera del repo y revisada). No se inventó ningún límite: lo que el
-- documento no trae, no está.
--
-- A REVISAR POR DT ANTES DE APROBAR (también en DECISIONES_ABIERTAS D-55):
--   - Ningún documento fuente está firmado (Emitió/Revisó/Aprobó vacíos).
--   - Los polvos (I-E.50.11 a .17) usan la numeración nueva inferida de los
--     ME.40.x; los archivos dicen I-E.40.x. Solo tienen requisitos
--     organolépticos.
--   - Vida útil: I-E.50.14 COLOR DARK COVER PINK; I-E.50.17 COLOR BLANCO SHIMMER no la declaran; se cargó 36 meses,
--     el provisorio del catálogo (D-19).
--   - Densidad de cremas y aceites: el documento no da unidad; se cargó g/ml.
--   - I-E.50.31 (gel paint): los códigos del fabricante no se pudieron
--     vincular a los colores del catálogo.
--   - Ninguna queda vinculada a un producto ni a una fórmula: el vínculo es
--     de la fórmula (formulas_fabricacion.especificacion_id).
--   - Natural, EzFlow, Ferrite, Blanco saturado y Blanco French Nail Show no
--     se cargan: sus documentos no tienen requisitos.
--
-- EMISOR. emitida_por es NOT NULL y una migración no tiene usuario: queda a
-- nombre del codirector técnico, que pidió la carga. El rol de base que
-- escribió queda en core.auditoria (db_role).

do $$
declare
  v_emisor uuid;
  v_id     uuid;
begin
  select id into v_emisor from core.usuarios where email = 'salta.agustin@gmail.com';
  -- Base reconstruida desde cero: no hay usuarios, no se carga nada.
  if v_emisor is null then
    return;
  end if;

  -- I-E.50.25: I-E.50.25. ESPECIFICACION LIQUIDO ACRILICO VERSION 00 PARA VIGENCIA 20-10-25.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.25', '00', null, 'TERMINADO', 'LÍQUIDO ACRÍLICO', 'Ethyl Methacrylate, Glycol Dimethacrylate, Fragance (Benzyl Salicylate, Linalool, Hexyl Cinnamal, Manzana Verde 20276, Coumarin), Dimethyltolylamine, Benzophenone-3, CI 60725',
    'Almacenar en lugar fresco y oscuro, a temperaturas menores de 25°C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Metacrilato de etilo (Ethyl Methacrylate)', 90, 95, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Etilenglicol dimetacrilato (Glycol Dimethacrylate)', 1.8, 2.2, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Fragancia (Benzyl Salicylate, Linalool, Hexyl Cinnamal, Coumarin)', 3.8, 4.2, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'N,N-Dimetil-p-toluidina (Dimethyltolylamine)', 1, 2, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'Benzofenona-3 (Benzophenone-3)', 0.8, 1.2, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'D&C Violet 2 (CI 60725)', 0, 0.1, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Líquido translúcido, no presenta turbidez ni agentes externos', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Levemente violáceo', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Característico de los ésteres acrílicos con ligero matiz frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'Volátiles', 'FISICOQUIMICO', 'MINIMO', 95, null, null, '%', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.91, 0.92, null, 'g/ml', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Tiempo de gelificado', 'FUNCIONAL', 'RANGO', 80, 120, null, 's', null, '24-25 °C', null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 7, 'Tiempo de curado', 'FUNCIONAL', 'RANGO', 6, 9, null, 'min', null, '24-25 °C', null);

  -- I-E.50.26 AIRE: I-E.50.26. ESPECIFICACION CREMA HUMECTANTE  VERSION 00 VIGENCIA 20-10-25.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.26', '00', 'AIRE', 'TERMINADO', 'CREMA HUMECTANTE VARIEDAD AIRE. MARCA NAIL SHOW', 'Aqua, Cetearyl Alcohol/Ceteareth-20, Paraffinum Liquidum, Cetyl Alcohol, Propylene Glycol, Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol, Parfum, Aloe Barbadensis Leaf Juice, Retinyl Palmitate, CI 77019/CI 77891',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Aqua', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Cetearyl Alcohol/Ceteareth-20', 5, 10, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Paraffinum Liquidum', 3, 6, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Cetyl Alcohol', 1.5, 3.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'Propylene Glycol', 1, 3, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol', 0, 0.8, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 7, 'Aloe Barbadensis Leaf Juice', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 8, 'Retinyl Palmitate', 0.05, 0.1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 9, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 10, 'CI 77019/CI 77891', 0.05, 0.5, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Crema homogénea', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'BLANCO', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'pH', 'FISICOQUIMICO', 'RANGO', 6, 7, null, null, 'pHmetro ADWA AD12 (I.50.24)', 'Semisólido de base acuosa: dilución 1:10 en agua destilada (según I.50.24)', null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.95, 1, null, 'g/ml', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Control microbiológico', 'MICROBIOLOGICO', 'REFERENCIA_EXTERNA', null, null, null, null, null, null, 'Disp. ANMAT 1108/99 Anexo II Tipo II');

  -- I-E.50.26 AMOR: I-E.50.26. ESPECIFICACION CREMA HUMECTANTE  VERSION 00 VIGENCIA 20-10-25.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.26', '00', 'AMOR', 'TERMINADO', 'CREMA HUMECTANTE VARIEDAD AMOR. MARCA NAIL SHOW', 'Aqua, Cetearyl Alcohol/Ceteareth-20, Paraffinum Liquidum, Cetyl Alcohol, Propylene Glycol, Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol, Parfum, Aloe Barbadensis Leaf Juice, Retinyl Palmitate, CI 77019/CI 77891, CI 16185/CI 16255',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Aqua', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Cetearyl Alcohol/Ceteareth-20', 5, 10, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Paraffinum Liquidum', 3, 6, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Cetyl Alcohol', 1.5, 3.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'Propylene Glycol', 1, 3, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol', 0, 0.8, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 7, 'Aloe Barbadensis Leaf Juice', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 8, 'Retinyl Palmitate', 0.05, 0.1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 9, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 10, 'CI 77019/CI 77891', 0.05, 0.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 11, 'CI 16185/CI 16255', 0.001, 0.005, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Crema homogénea', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'ROSA', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'pH', 'FISICOQUIMICO', 'RANGO', 6, 7, null, null, 'pHmetro ADWA AD12 (I.50.24)', 'Semisólido de base acuosa: dilución 1:10 en agua destilada (según I.50.24)', null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.95, 1, null, 'g/ml', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Control microbiológico', 'MICROBIOLOGICO', 'REFERENCIA_EXTERNA', null, null, null, null, null, null, 'Disp. ANMAT 1108/99 Anexo II Tipo II');

  -- I-E.50.26 PAZ: I-E.50.26. ESPECIFICACION CREMA HUMECTANTE  VERSION 00 VIGENCIA 20-10-25.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.26', '00', 'PAZ', 'TERMINADO', 'CREMA HUMECTANTE VARIEDAD PAZ. MARCA NAIL SHOW', 'Aqua, Cetearyl Alcohol/Ceteareth-20, Paraffinum Liquidum, Cetyl Alcohol, Propylene Glycol, Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol, Parfum, Aloe Barbadensis Leaf Juice, Retinyl Palmitate, CI 77019/CI 77491/CI 51319',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Aqua', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Cetearyl Alcohol/Ceteareth-20', 5, 10, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Paraffinum Liquidum', 3, 6, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Cetyl Alcohol', 1.5, 3.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'Propylene Glycol', 1, 3, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol', 0, 0.8, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 7, 'Aloe Barbadensis Leaf Juice', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 8, 'Retinyl Palmitate', 0.05, 0.1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 9, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 10, 'CI 77019/CI 77491/CI 51319', 0.05, 0.5, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Crema homogénea', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'VIOLETA', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'pH', 'FISICOQUIMICO', 'RANGO', 6, 7, null, null, 'pHmetro ADWA AD12 (I.50.24)', 'Semisólido de base acuosa: dilución 1:10 en agua destilada (según I.50.24)', null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.95, 1, null, 'g/ml', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Control microbiológico', 'MICROBIOLOGICO', 'REFERENCIA_EXTERNA', null, null, null, null, null, null, 'Disp. ANMAT 1108/99 Anexo II Tipo II');

  -- I-E.50.27 AIRE: I-E.50.27. ESPECIFICACION CREMA EXFOLIANTE  VERSION 00 BORRADOR.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.27', '00', 'AIRE', 'TERMINADO', 'CREMA EXFOLIANTE VARIEDAD AIRE. MARCA NAIL SHOW', 'Aqua, Cetearyl Alcohol/Ceteareth-20, Paraffinum Liquidum, Cetyl Alcohol, Juglans Regia Shell Powder, Propylene Glycol, Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol, Parfum, Aloe Barbadensis Leaf Juice, CI 77019/CI 77891',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Aqua', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Cetearyl Alcohol/Ceteareth-20', 5, 10, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Paraffinum Liquidum', 3, 6, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Cetyl Alcohol', 1.5, 3.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'Juglans Regia Shell Powder', 1, 5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'Propylene Glycol', 1, 3, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 7, 'Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol', 0, 0.8, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 8, 'Aloe Barbadensis Leaf Juice', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 9, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 10, 'CI 77019/CI 77891', 0.05, 0.5, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Crema homogénea', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'BLANCO', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'pH', 'FISICOQUIMICO', 'RANGO', 6, 7, null, null, 'pHmetro ADWA AD12 (I.50.24)', 'Semisólido de base acuosa: dilución 1:10 en agua destilada (según I.50.24)', null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.95, 1, null, 'g/ml', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Control microbiológico', 'MICROBIOLOGICO', 'REFERENCIA_EXTERNA', null, null, null, null, null, null, 'Disp. ANMAT 1108/99 Anexo II Tipo II');

  -- I-E.50.27 AMOR: I-E.50.27. ESPECIFICACION CREMA EXFOLIANTE  VERSION 00 BORRADOR.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.27', '00', 'AMOR', 'TERMINADO', 'CREMA EXFOLIANTE VARIEDAD AMOR. MARCA NAIL SHOW', 'Aqua, Cetearyl Alcohol/Ceteareth-20, Paraffinum Liquidum, Cetyl Alcohol, Juglans Regia Shell Powder, Propylene Glycol, Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol, Parfum, Aloe Barbadensis Leaf Juice, CI 77019/CI 77891, CI 16185/CI 16255',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Aqua', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Cetearyl Alcohol/Ceteareth-20', 5, 10, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Paraffinum Liquidum', 3, 6, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Cetyl Alcohol', 1.5, 3.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'Juglans Regia Shell Powder', 1, 5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'Propylene Glycol', 1, 3, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 7, 'Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol', 0, 0.8, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 8, 'Aloe Barbadensis Leaf Juice', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 9, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 10, 'CI 77019/CI 77891', 0.05, 0.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 11, 'CI 16185/CI 16255', 0.001, 0.005, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Crema homogénea', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'ROSA', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'pH', 'FISICOQUIMICO', 'RANGO', 6, 7, null, null, 'pHmetro ADWA AD12 (I.50.24)', 'Semisólido de base acuosa: dilución 1:10 en agua destilada (según I.50.24)', null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.95, 1, null, 'g/ml', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Control microbiológico', 'MICROBIOLOGICO', 'REFERENCIA_EXTERNA', null, null, null, null, null, null, 'Disp. ANMAT 1108/99 Anexo II Tipo II');

  -- I-E.50.27 PAZ: I-E.50.27. ESPECIFICACION CREMA EXFOLIANTE  VERSION 00 BORRADOR.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.27', '00', 'PAZ', 'TERMINADO', 'CREMA EXFOLIANTE VARIEDAD PAZ. MARCA NAIL SHOW', 'Aqua, Cetearyl Alcohol/Ceteareth-20, Paraffinum Liquidum, Cetyl Alcohol, Juglans Regia Shell Powder, Propylene Glycol, Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol, Parfum, Aloe Barbadensis Leaf Juice, CI 77019/CI 77491/CI 51319',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Aqua', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Cetearyl Alcohol/Ceteareth-20', 5, 10, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Paraffinum Liquidum', 3, 6, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Cetyl Alcohol', 1.5, 3.5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'Juglans Regia Shell Powder', 1, 5, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'Propylene Glycol', 1, 3, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 7, 'Diazolidinyl Urea/2-Bromo-2-Nitropropane-1,3-Diol', 0, 0.8, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 8, 'Aloe Barbadensis Leaf Juice', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 9, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 10, 'CI 77019/CI 77491/CI 51319', 0.05, 0.5, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Crema homogénea', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'VIOLETA', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'pH', 'FISICOQUIMICO', 'RANGO', 6, 7, null, null, 'pHmetro ADWA AD12 (I.50.24)', 'Semisólido de base acuosa: dilución 1:10 en agua destilada (según I.50.24)', null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.95, 1, null, 'g/ml', null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Control microbiológico', 'MICROBIOLOGICO', 'REFERENCIA_EXTERNA', null, null, null, null, null, null, 'Disp. ANMAT 1108/99 Anexo II Tipo II');

  -- I-E.50.28 AIRE: I-E.50.28. ESPECIFICACION ACEITE PARA CUTICULAS Y UNAS VERSION 00 VIGENCIA 19-11-25.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.28', '00', 'AIRE', 'TERMINADO', 'ACEITE PARA CUTÍCULAS Y UÑAS VARIEDAD AIRE', 'Paraffinum Liquidum, Synthetic Jojoba Oil, Parfum (Benzyl Salicylate, Hexyl Cinnamal, Citronellol, Alpha-Isomethyl Ionone, d-Limonene, Benzyl Alcohol, Linalool, Citral, Hydroxycitronella), Tocopheryl Acetate',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Paraffinum Liquidum', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Synthetic Jojoba Oil', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Tocopheryl Acetate', 0.05, 0.1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Líquido oleoso homogéneo transparente sin partículas en suspensión y/o sedimentadas', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'AMARILLO', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.9, 0.95, null, 'g/ml', null, null, null);

  -- I-E.50.28 AMOR: I-E.50.28. ESPECIFICACION ACEITE PARA CUTICULAS Y UNAS VERSION 00 VIGENCIA 19-11-25.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.28', '00', 'AMOR', 'TERMINADO', 'ACEITE PARA CUTÍCULAS Y UÑAS VARIEDAD AMOR', 'Paraffinum Liquidum, Synthetic Jojoba Oil, Parfum (Hexyl Cinnamal, Benzyl Salicylate, Linalool, Coumarin, Butylphenyl Methylpropional), Tocopheryl Acetate, CI 26100, CI 60725',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Paraffinum Liquidum', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Synthetic Jojoba Oil', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Tocopheryl Acetate', 0.05, 0.1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Parfum', 0.5, 0.7, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'CI 26100', 0.001, 0.005, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'CI 60725', 0.001, 0.005, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Líquido oleoso homogéneo transparente sin partículas en suspensión y/o sedimentadas', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'ROSA', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.9, 0.95, null, 'g/ml', null, null, null);

  -- I-E.50.28 PAZ: I-E.50.28. ESPECIFICACION ACEITE PARA CUTICULAS Y UNAS VERSION 00 VIGENCIA 19-11-25.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.28', '00', 'PAZ', 'TERMINADO', 'ACEITE PARA CUTÍCULAS Y UÑAS VARIEDAD PAZ', 'Paraffinum Liquidum, Synthetic Jojoba Oil, Parfum (Hydroxycitronella, d-Limonene), Tocopheryl Acetate, CI 26100, CI 60725',
    'Almacenar a temperatura ambiente, menores a 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 24, v_emisor)
  returning id into v_id;
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 1, 'Paraffinum Liquidum', null, null, true);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 2, 'Synthetic Jojoba Oil', 0.5, 1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 3, 'Tocopheryl Acetate', 0.05, 0.1, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 4, 'Parfum', 0.5, 0.8, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 5, 'CI 26100', 0.001, 0.005, false);
  insert into gmp.espec_formula (especificacion_id, orden, componente, porcentaje_min, porcentaje_max, es_csp) values (v_id, 6, 'CI 60725', 0.001, 0.005, false);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Líquido oleoso homogéneo transparente sin partículas en suspensión y/o sedimentadas', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'VIOLETA', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según patrón', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'Densidad', 'FISICOQUIMICO', 'RANGO', 0.9, 0.95, null, 'g/ml', null, null, null);

  -- I-E.50.31: I-E.50.31. ESPECIFICACION ESMALTE DE UNAS EN GEL - GEL PAINT VERSION 00.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.31', '00', null, 'TERMINADO', 'ESMALTE DE UÑAS EN GEL // GEL PAINT (producto terminado importado)', 'Acrylates copolymer, 2-Hydroxyethyl methacrylate, Acryloyl morpholine, Ethyl trimethylbenzoyl phenylphosphinate, Hydroxycyclohexyl phenyl ketone, Silica. Puede contener: Mica, CI 77266, CI 77891, CI 73360, CI 15880, CI 74160, CI 74260, CI 19140, CI 60725, CI 77007. Made in PRC.',
    'Temperaturas menores de 25 °C.', 'Utilizar EPP durante todo el proceso.', null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo de color uniforme, sin estratificación ni aglomeración, sin impurezas a simple vista', null, null, null, 'Ficha técnica del fabricante');
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Color', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Característico según variedad', null, null, null, 'Ficha técnica del fabricante');
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'No posee', null, null, null, 'Ficha técnica del fabricante');
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 4, 'Densidad', 'FISICOQUIMICO', 'RANGO', 1.05, 1.15, null, 'g/ml', null, null, 'Ficha técnica del fabricante');
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 5, 'pH', 'FISICOQUIMICO', 'RANGO', 6.5, 7.5, null, null, null, null, 'Ficha técnica del fabricante');
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 6, 'Consistencia', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Cremosa que no autonivela; al aplicar sobre superficie lisa no deja grumos', null, 'Inspección visual', null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 7, 'Color y transparencia', 'ORGANOLEPTICO', 'CONTRA_PATRON', null, null, 'Comparar visualmente con la contramuestra archivada, sobre hoja fotográfica blanca y negra', null, 'Inspección visual contra contramuestra', null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 8, 'Tiempo de curado en lámpara UV', 'FUNCIONAL', 'MAXIMO', null, 2, null, 'min', null, null, 'Ficha técnica del fabricante');
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 9, 'Polimerización (curado 60 s en lámpara LED)', 'FUNCIONAL', 'VALOR_TEXTO', null, null, 'Superficie seca y mate que al tacto no deja residuos', null, 'Análisis visual y táctil', null, null);

  -- I-E.50.11: ESPECIFICACION COLOR ROSA TRANSLUCIDO.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.11', '00', null, 'TERMINADO', 'COLOR ROSA TRANSLÚCIDO', null,
    null, null, null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Rosa muy suave', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Suave, simil frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo suave', null, null, null, null);

  -- I-E.50.12: ESPECIFICACION ROSADO  NATURAL.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.12', '00', null, 'TERMINADO', 'COLOR ROSADO NATURAL', null,
    null, null, null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Rosa suave', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Suave, simil frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo suave', null, null, null, null);

  -- I-E.50.13: ESPECIFICACION COLOR SOFT COVER PINK.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.13', '00', null, 'TERMINADO', 'COLOR SOFT COVER PINK', null,
    null, null, null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Piel/nude claro', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Suave, simil frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo suave', null, null, null, null);

  -- I-E.50.14: ESPECIFICACION COLOR DARK COVER PINK.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.14', '00', null, 'TERMINADO', 'COLOR DARK COVER PINK', null,
    null, null, null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Piel/nude oscuro', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Suave, simil frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo suave', null, null, null, null);

  -- I-E.50.15: ESPECIFICACION COLOR SHOW COVER PINK.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.15', '00', null, 'TERMINADO', 'COLOR SHOW COVER PINK', null,
    null, null, null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Piel/nude oscuro con brillo dorado', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Suave, simil frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo suave', null, null, null, null);

  -- I-E.50.16: ESPECIFICACION COLOR BLANCO FRENCH.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.16', '00', null, 'TERMINADO', 'COLOR BLANCO FRENCH', null,
    null, null, null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Blanco', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Suave, simil frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo suave', null, null, null, null);

  -- I-E.50.17: ESPECIFICACION COLOR BLANCO SHIMMER.docx
  insert into gmp.especificaciones (codigo_poe, version, variedad, tipo_producto, denominacion, composicion_inci,
    condiciones_almacenamiento, instrucciones_muestreo, periodo_reanalisis_meses, vida_util_meses, emitida_por)
  values ('I-E.50.17', '00', null, 'TERMINADO', 'COLOR BLANCO SHIMMER', null,
    null, null, null, 36, v_emisor)
  returning id into v_id;
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 1, 'Color', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Blanco con brillo blanco perlado', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 2, 'Olor', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Suave, simil frutal', null, null, null, null);
  insert into gmp.espec_parametros (especificacion_id, orden, nombre, grupo, tipo_criterio, valor_min, valor_max, valor_texto, unidad, metodo_ensayo, condicion_ensayo, referencia_norma) values (v_id, 3, 'Aspecto', 'ORGANOLEPTICO', 'VALOR_TEXTO', null, null, 'Polvo suave', null, null, null, null);
end;
$$;

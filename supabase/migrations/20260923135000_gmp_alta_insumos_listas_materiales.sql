-- ---------------------------------------------------------------------------
-- Propósito : Dar de alta en gmp.insumos_catalogo los insumos que las listas
--             de materiales de la hoja C.V.D. usan y el catálogo no tenía, y
--             pasar las esencias a mililitros.
-- Reglas    : RN-01 (protocolo del proveedor en materia prima y granel),
--             RN-48 (inflamables al depósito exterior), §4.2 del alcance.
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- DE DÓNDE SALE CADA ÍTEM.
-- Código, nombre y familia de la hoja INVENTARIO de la misma planilla (fila
-- indicada al lado). Solo dos no están en INVENTARIO y se toman de C.V.D.:
-- 384ESE (esencia del cleanser) y la tela y estampa de la toalla, que sí
-- están pero con familia «TOALLA» / «STIGMA».
--
-- INDICACIONES DE LA CONDUCCIÓN DEL PROYECTO (2026-09-23).
--   - «Agregá los insumos que no están en el catálogo.»
--   - Las cremas se compran a granel y solo se envasan: son SEMIELABORADO, en
--     gramos (la planilla las da en kg), con protocolo del proveedor.
--   - La esencia tiene densidad muy variable y se maneja siempre en ml. Por eso
--     101ESE pasa de g a ml (abajo) y 384ESE nace en ml.
--
-- CRITERIOS DE QUIEN ESCRIBE (a revisar, D-28 / D-29):
--   - Primer, bonder y removedor también se compran como líquido a granel
--     (Acrilab, Keystone, Birdlab) y se envasan: SEMIELABORADO. La planilla da
--     su cantidad en volumen y no hay densidad cargada, así que van en ml, igual
--     que la esencia. Pasarlos a gramos exigiría una densidad que nadie midió.
--   - `es_inflamable = true` en primer, bonder y removedor: son a base de
--     solvente y RN-48 los manda al depósito exterior. Es la opción
--     conservadora mientras no esté la hoja de seguridad de cada uno; si alguno
--     no es inflamable, se corrige desde la ficha del insumo.
--   - Pincel, gatillo, bomba, cremera y gotero son parte del cierre o del
--     envase: MATERIAL_ENVASE.
--   - La toalla (321) no es un cosmético (D-18). Su tela entra como
--     MATERIA_PRIMA sin protocolo, y la estampa como ETIQUETA, porque son las
--     categorías del enum que menos la deforman; se reclasifica cuando se
--     resuelva D-18.
--
-- QUÉ NO SE AGREGA.
--   - La etiqueta de lote del primer (fila 62 de INVENTARIO): no tiene código
--     en la planilla, y un código inventado acá sería un insumo que nadie
--     reconoce en el depósito.
--   - 101MO…387MO como «producto + mano de obra»: sí se agregan 105MO y 387MO,
--     pero como el líquido a granel que son (ver arriba), no como costo.
--   - Monómero premium (104): discontinuado.

insert into gmp.insumos_catalogo
  (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo,
   requiere_pesada_recepcion, es_inflamable)
values
  -- Envases, cierres y accesorios del envase ---------------------------------
  ('103TAP',    'TAPA CLEANSER Y MONOMERO 1Lt.',            'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- fila 45
  ('105PIN',    'PINCEL P/ PRIMER, BONDER, TOP, ACEITE',    'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- fila 57
  ('387PIN',    'PINCEL LARGO PELO CORTO',                  'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- fila 500
  ('387ENV',    'ENVASE CUADRADO TRANSP+PINTURA MATE',      'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- fila 499
  ('135GAT',    'GATILLO VAPORIZADOR',                      'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- fila 199
  ('391BOM',    'BOMBA SPRAY ROSA 24/410',                  'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- fila 221
  ('370BOM',    'CREMERA TRANSPARENTE 24/410',              'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- fila 452
  ('131ENV',    'ENVASE TIPO GOTERO 30ml.',                 'MATERIAL_ENVASE', 'UNIDAD', false, false, false), -- filas 391-392

  -- Etiquetas ----------------------------------------------------------------
  ('080ETL',    'ETIQUETAS DE LOTE Y VENCIMIENTO',          'ETIQUETA',        'UNIDAD', false, false, false), -- fila 8
  ('101ET',     'ETIQUETA MONOMERO DE 100ml.',              'ETIQUETA',        'UNIDAD', false, false, false), -- filas 40-41
  ('105ET',     'ETIQUETA PRIMER 10ml.',                    'ETIQUETA',        'UNIDAD', false, false, false), -- fila 60
  ('321ET',     'ESTAMPA TOALLA NAIL SHOW MULTICOLOR',      'ETIQUETA',        'UNIDAD', false, false, false), -- fila 630

  -- Cremas a granel: se compran hechas y se envasan -----------------------------
  ('370CREMA',  'CREMA HUMECTANTE AMOR (a granel)',         'SEMIELABORADO',   'g',      true,  false, false), -- fila 437
  ('371CREMA',  'CREMA HUMECTANTE AIRE (a granel)',         'SEMIELABORADO',   'g',      true,  false, false), -- fila 438
  ('372CREMA',  'CREMA HUMECTANTE PAZ (a granel)',          'SEMIELABORADO',   'g',      true,  false, false), -- fila 439
  ('364CREMA',  'CREMA EXFOLIANTE AMOR (a granel)',         'SEMIELABORADO',   'g',      true,  false, false), -- fila 446
  ('365CREMA',  'CREMA EXFOLIANTE AIRE (a granel)',         'SEMIELABORADO',   'g',      true,  false, false), -- fila 447
  ('366CREMA',  'CREMA EXFOLIANTE PAZ (a granel)',          'SEMIELABORADO',   'g',      true,  false, false), -- fila 448

  -- Líquidos a granel, en ml (sin densidad medida) ------------------------------
  ('105MO',     'PRIMER LOW ACID (a granel)',               'SEMIELABORADO',   'ml',     true,  false, true),  -- fila 64
  ('387MO',     'PRIMER ACIDO (a granel)',                  'SEMIELABORADO',   'ml',     true,  false, true),  -- fila 498
  ('106LIQ',    'BONDER (a granel)',                        'SEMIELABORADO',   'ml',     true,  false, true),  -- fila 67
  ('192REM',    'REMOVEDOR (a granel)',                     'SEMIELABORADO',   'ml',     true,  false, true),  -- fila 668

  -- Materias primas ---------------------------------------------------------------
  ('384ESE',    'ESENCIA TUTTI BAZOOK (cleanser)',          'MATERIA_PRIMA',   'ml',     true,  false, false), -- C.V.D. fila 454
  ('192ENM',    'ENMASCARANTE 6394',                        'MATERIA_PRIMA',   'g',      true,  false, false), -- fila 667
  ('321TOALLA', 'TELA TOALLA 25x25',                        'MATERIA_PRIMA',   'UNIDAD', false, false, false)  -- fila 628
on conflict (codigo_interno) do nothing;

-- La esencia se maneja en ml (indicación 2026-09-23). El código no cambia, así
-- que el resguardo de 20260911200000 no interviene.
--
-- Advertencia: los lotes que ya existan de 101ESE conservan su unidad (`g`),
-- porque la unidad de un lote es la de su recepción y no se reescribe. El de
-- saldo de apertura queda así hasta que se rehaga ese saldo (D-26); mientras
-- tanto «Terminado» rechaza descontar esencia de un lote en g contra una
-- receta en ml, con un mensaje que lo dice.
update gmp.insumos_catalogo
   set unidad_medida = 'ml'
 where codigo_interno = '101ESE';

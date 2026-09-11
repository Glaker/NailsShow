-- ---------------------------------------------------------------------------
-- Propósito : Carga de las 40 materias primas provistas por la Gerencia el
--             2026-09-11. Primeros ítems de tipo MATERIA_PRIMA del catálogo:
--             la carga del 2026-09-10 (299 ítems) era toda envase, empaque y
--             etiqueta.
-- Reglas    : RN-01 (protocolo de análisis obligatorio en materia prima):
--             `requiere_protocolo = true` en las 40.
--             RN-03 (pesada de pigmentos en recepción): `true` en los 29
--             pigmentos, según I.20.1 paso 5.
--             RN-48: `es_inflamable` queda en su default `false`; la planta
--             todavía no clasificó cuáles lo son.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- `unidad_medida` va NULL en las 40: está pendiente de confirmación en planta.
-- La migración 20260911130000 habilitó ese NULL y, a cambio, bloquea la
-- recepción de un lote cuyo insumo no la tenga. O sea: estos 40 ítems quedan
-- catalogados pero no recepcionables hasta que se complete la unidad. Es el
-- comportamiento buscado, no un efecto colateral.
--
-- La columna `proveedor` del archivo se ignora, por el mismo motivo que en la
-- carga anterior: el vínculo insumo-proveedor no existe en el modelo —un mismo
-- insumo se le compra a varios— y la trazabilidad del origen la lleva el lote,
-- no el catálogo.
--
-- ON CONFLICT sobre `codigo_interno`, para que reaplicar no falle ni duplique.

insert into gmp.insumos_catalogo
  (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo, requiere_pesada_recepcion)
values
  ('080POL',  'POLVO POLIMERIZADOR',            'MATERIA_PRIMA', null, true, false),
  ('101ESE',  'ESENCIA PARA MONOMERO',          'MATERIA_PRIMA', null, true, false),
  ('131AC',   'MP ACEITE DE CUTICULA',          'MATERIA_PRIMA', null, true, false),
  ('378ACE',  'ACEITE AMOR MATERIA PRIMA',      'MATERIA_PRIMA', null, true, false),
  ('135FRA1', 'FRAGANCIA 34764 AMOR',           'MATERIA_PRIMA', null, true, false),
  ('135FRA2', 'FRAGANCIA 37052 AIRE',           'MATERIA_PRIMA', null, true, false),
  ('135FRA3', 'FRAGANCIA 37051 PAZ',            'MATERIA_PRIMA', null, true, false),
  ('135FRA4', 'FRAGANCIA 38635',                'MATERIA_PRIMA', null, true, false),
  ('135FRA5', 'FRAGANCIA 38636',                'MATERIA_PRIMA', null, true, false),
  ('135FRA6', 'CHICLE PUMITA GE-40970',         'MATERIA_PRIMA', null, true, false),
  ('135FRA7', 'FRAMBUESA 15073',                'MATERIA_PRIMA', null, true, false),
  ('142PIG',  'PIGMENTO I negro',               'MATERIA_PRIMA', null, true, true),
  ('143PIG',  'PIGMENTO II blanco',             'MATERIA_PRIMA', null, true, true),
  ('144PIG',  'PIGMENTO III rosa',              'MATERIA_PRIMA', null, true, true),
  ('145PIG',  'PIGMENTO IV celeste',            'MATERIA_PRIMA', null, true, true),
  ('146PIG',  'PIGMENTO V cobre',               'MATERIA_PRIMA', null, true, true),
  ('147PIG',  'PIGMENTO VI turquesa',           'MATERIA_PRIMA', null, true, true),
  ('148PIG',  'PIGMENTO VII rosa oscuro',       'MATERIA_PRIMA', null, true, true),
  ('149PIG',  'PIGMENTO VIII azul',             'MATERIA_PRIMA', null, true, true),
  ('150PIG',  'PIGMENTO IX bronce oscuro',      'MATERIA_PRIMA', null, true, true),
  ('151PIG',  'PIGMENTO X rosa neon',           'MATERIA_PRIMA', null, true, true),
  ('152PIG',  'PIGMENTO XI verde neon',         'MATERIA_PRIMA', null, true, true),
  ('153PIG',  'PIGMENTO XII naranja neon',      'MATERIA_PRIMA', null, true, true),
  ('154PIG',  'PIGMENTO XIII magenta neon',     'MATERIA_PRIMA', null, true, true),
  ('155PIG',  'PIGMENTO XIV amarillo neon',     'MATERIA_PRIMA', null, true, true),
  ('156PIG',  'PIGMENTO XV azul oscuro',        'MATERIA_PRIMA', null, true, true),
  ('157PIG',  'PIGMENTO XVI verde oscuro',      'MATERIA_PRIMA', null, true, true),
  ('158PIG',  'PIGMENTO XVII violeta',          'MATERIA_PRIMA', null, true, true),
  ('159PIG',  'PIGMENTO XVIII naranja',         'MATERIA_PRIMA', null, true, true),
  ('160PIG',  'PIGMENTO XIX dorado',            'MATERIA_PRIMA', null, true, true),
  ('161PIG',  'PIGMENTO XX oro',                'MATERIA_PRIMA', null, true, true),
  ('162PIG',  'PIGMENTO XXI plata',             'MATERIA_PRIMA', null, true, true),
  ('163PIG',  'PIGMENTO XXII violeta oscuro',   'MATERIA_PRIMA', null, true, true),
  ('164PIG',  'PIGMENTO XXIII salmón neon',     'MATERIA_PRIMA', null, true, true),
  ('165PIG',  'PIGMENTO XXIV verde manzana',    'MATERIA_PRIMA', null, true, true),
  -- El archivo trae «XXIV» también acá, repitiendo el de 165PIG, y salta de
  -- XXVII a XXXI. La numeración romana del nombre se transcribe tal cual: es
  -- la denominación que usa la planta, no un identificador del sistema, y
  -- corregirla por cuenta propia rompería la correspondencia con el papel.
  -- Queda anotado en docs/DECISIONES_ABIERTAS.md para que lo revisen.
  ('247PIG',  'PIGMENTO XXIV blanco mate',      'MATERIA_PRIMA', null, true, true),
  ('252PIG',  'PIGMENTO XXXI negro mate',       'MATERIA_PRIMA', null, true, true),
  ('328PIG',  'PIGMENTO XXV camaleón lila',     'MATERIA_PRIMA', null, true, true),
  ('329PIG',  'PIGMENTO XXVI cobre anaranjado', 'MATERIA_PRIMA', null, true, true),
  ('330PIG',  'PIGMENTO XXVII cobre rojizo',    'MATERIA_PRIMA', null, true, true)
on conflict (codigo_interno) do nothing;

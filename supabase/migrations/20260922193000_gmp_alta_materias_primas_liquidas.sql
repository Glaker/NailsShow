-- ---------------------------------------------------------------------------
-- Propósito : Dar de alta en gmp.insumos_catalogo las materias primas que la
--             planilla de inventario declara y el catálogo todavía no tenía:
--             los líquidos de fabricación (monómero, alcoholes, glicerina,
--             propilenglicol, agua desionizada, acetato de butilo) y los 29
--             acrílicos de color. Sin esto, la carga de saldo de apertura las
--             deja afuera: solo importa códigos que ya están en el catálogo.
-- Reglas    : RN-01 (protocolo del fabricante en materia prima), RN-03
--             (pesada en recepción de colorantes), RN-48 (inflamables al
--             depósito exterior). §4.2 del alcance.
-- Fecha     : 2026-09-22
-- ---------------------------------------------------------------------------
--
-- DE DÓNDE SALE LA LISTA.
-- De las familias de `scripts/apertura/inventario_apertura.csv` que son materia
-- prima y quedaron listadas en `scripts/apertura/pendientes.md` como fuera de
-- catálogo. No se inventó ningún ítem: cada código de acá está en la planilla.
--
-- QUÉ SE DEJÓ AFUERA A PROPÓSITO: LOS RENGLONES «+ MANO DE OBRA».
-- La planilla trae, junto a la materia prima, renglones como `101MO` («LIQ.
-- ACRILICO + MANO DE OBRA»), `384MO` («CLEANSER 100ml. + MO») o `381AC`
-- («ACEITE DE CUT 8ml. + MO»). Un insumo no tiene mano de obra incorporada:
-- esos renglones son presentaciones de producto ya fraccionado, o líneas de
-- costeo, no materia prima. Cargarlos como `MATERIA_PRIMA` metería producto
-- terminado en el circuito de recepción y control de materia prima, que es
-- precisamente lo que la clasificación tiene que evitar.
--
-- Quedan sin resolver, en `pendientes.md`: 101MO, 102MO, 103MO, 104MO, 105MO,
-- 106LIQ, 249MO, 378AC, 381AC, 384MO, 385MO, 386MO, 387MO, 514MO. Corresponden
-- a `gmp.productos` o a nada, y eso lo decide la Gerencia (D-23).
--
-- UNIDAD DE MEDIDA: GRAMOS.
-- Igual que las 40 materias primas que la Gerencia confirmó en gramos
-- (20260911150000), y por la misma razón por la que las fórmulas se escriben
-- en %P/P: la masa es aditiva y el volumen no. Un tacho de 200 litros de
-- monómero se recibe en litros y se registra en gramos; la conversión la hace
-- la densidad, que para eso está `gmp.densidades_referencia`.
--
-- `es_inflamable`: SE MARCA, NO SE DEJA EN EL DEFAULT.
-- La carga de 20260911140000 dejó `es_inflamable` en false para todo y anotó
-- que la planta lo confirmaría. Acá no se puede hacer lo mismo: que el alcohol
-- etílico, el isopropílico y el acetato de butilo son inflamables no es una
-- regla de negocio que alguien deba confirmar, es la identidad de la sustancia,
-- y RN-48 manda esos lotes al depósito exterior. Dejarlos en false sería
-- declarar que no lo son.
--
-- `requiere_pesada_recepcion` EN LOS ACRÍLICOS DE COLOR.
-- Se marca en true, igual que los 24 pigmentos de 20260911140000: son
-- colorantes y RN-03 los pesa antes de continuar la recepción. Si la planta
-- distingue entre «pigmento» y «acrílico de color» a estos efectos, se corrige
-- con una migración de ajuste; se prefirió el control de más al de menos.
--
-- ON CONFLICT sobre `codigo_interno`: reaplicar no falla ni duplica, mismo
-- criterio que la carga de materias primas anterior.

insert into gmp.insumos_catalogo
  (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo,
   requiere_pesada_recepcion, es_inflamable)
values
  -- Líquidos de fabricación -------------------------------------------------
  ('101MONO', 'MONOMERO LIQUIDO ACRILICO (a granel)', 'MATERIA_PRIMA', 'g', true, false, true),
  ('135SAN',  'ALCOHOL PARA SANITIZANTE',             'MATERIA_PRIMA', 'g', true, false, true),
  ('138CL1',  'ALCOHOL DE CEREAL (cleanser)',         'MATERIA_PRIMA', 'g', true, false, true),
  ('138CL2',  'ALCOHOL ISOPROPILICO (cleanser)',      'MATERIA_PRIMA', 'g', true, false, true),
  ('136PRE',  'ACETATO DE BUTILO (nail prep)',        'MATERIA_PRIMA', 'g', true, false, true),
  ('135GLI',  'GLICERINA',                            'MATERIA_PRIMA', 'g', true, false, false),
  ('135PRO',  'PROPILENGLICOL USP',                   'MATERIA_PRIMA', 'g', true, false, false),
  ('135AGUA', 'AGUA DESIONIZADA',                     'MATERIA_PRIMA', 'g', true, false, false),
  ('135ALOE', 'EXTRACTO GLICOLICO DE ALOE VERA',      'MATERIA_PRIMA', 'g', true, false, false),
  ('192ALOE', 'ALOE VERA TINTURA',                    'MATERIA_PRIMA', 'g', true, false, false),
  ('130TOP',  'MP TOP COAT',                          'MATERIA_PRIMA', 'g', true, false, false),
  ('137AD',   'MP ADHESIVO FOIL',                     'MATERIA_PRIMA', 'g', true, false, false),
  ('450RES',  'RESINA PARA TAPA',                     'MATERIA_PRIMA', 'g', true, false, false),
  ('274MP',   'MICROPERLAS',                          'MATERIA_PRIMA', 'g', true, false, false),

  -- Acrílicos de color ------------------------------------------------------
  ('139AC01', 'ACRILICO COLOR 10 BLANCO',             'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC02', 'ACRILICO COLOR 26 PIEL',               'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC03', 'ACRILICO COLOR 200 NEGRO',             'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC04', 'ACRILICO COLOR 131 VERDE CADMIO',      'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC05', 'ACRILICO COLOR 212 ORO IMPERIO',       'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC06', 'ACRILICO COLOR 111 CHOCOLATE',         'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC07', 'ACRILICO COLOR 86 MAGENTA',            'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC08', 'ACRILICO COLOR 43 AMARILLO CADMIO',    'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC09', 'ACRILICO COLOR 163 AZUL UNIFORME',     'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC10', 'ACRILICO COLOR 80 ROJO AD',            'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC11', 'ACRILICO COLOR 226 PLATA',             'MATERIA_PRIMA', 'g', true, true, false),
  ('139AC12', 'ACRILICO COLOR 222 BLANCO PERLADO',    'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC13', 'ACRILICO COLOR 264 VERDE FLUOR',       'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC14', 'ACRILICO COLOR 220 COBRE',             'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC15', 'ACRILICO COLOR 29 ROSA PALIDO',        'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC16', 'ACRILICO COLOR 149 TURQUESA',          'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC17', 'ACRILICO COLOR 123 VERDE BEBE',        'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC18', 'ACRILICO COLOR 174 LAVANDA',           'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC19', 'ACRILICO COLOR 265 ROJO FLUOR',        'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC20', 'ACRILICO COLOR 183 GRIS TOPO',         'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC21', 'ACRILICO COLOR 114 SIENA NATURAL',     'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC22', 'ACRILICO COLOR 134 VERDE OXIDO CROMO', 'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC23', 'ACRILICO COLOR 88 ROJO OXIDO',         'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC24', 'ACRILICO COLOR 30 ROSA CHICLE',        'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC25', 'ACRILICO COLOR 261 AMARILLO FLUOR',    'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC26', 'ACRILICO COLOR 169 ULTRAMAR PROFUNDO', 'MATERIA_PRIMA', 'g', true, true, false),
  ('140AC27', 'ACRILICO COLOR 214 ORO ANTIGUO',       'MATERIA_PRIMA', 'g', true, true, false),
  ('198ACNS', 'ACRILICO NAIL SHOW',                   'MATERIA_PRIMA', 'g', true, true, false),
  ('198ACE',  'ACRILICO SOCIO-EDUCADOR',              'MATERIA_PRIMA', 'g', true, true, false)
on conflict (codigo_interno) do nothing;

comment on table gmp.insumos_catalogo is
  'Catálogo de insumos (§4.2). Incluye materias primas líquidas de fabricación desde 2026-09-22.';

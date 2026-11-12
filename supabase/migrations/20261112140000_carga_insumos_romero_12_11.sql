-- ---------------------------------------------------------------------------
-- Propósito : Existencias históricas de materias primas y accesorios de la
--             planilla «INSUMOS ROMERO 12-11» (panel de stock del depósito 10,
--             SOLO la columna «Stock x Dep.»). Alta de los códigos que no
--             estaban en el catálogo y conteo de cada uno con
--             comercial.registrar_conteo: el saldo pasa a lo contado, queda el
--             conteo (existencia histórica) y el ajuste en el kardex.
-- Reglas    : RN-50, RN-54 (el movimiento no se edita: la diferencia es un
--             ajuste), §3.3 «Ajustar stock por diferencia de inventario».
-- Fecha     : 2026-11-12
-- Origen    : INSUMOS ROMERO 12-11.xlsx,
--             sha256 3ec3729a1acdeb0f47d82cc53a4673e5b2d9bffea25b7b96ca891ad72e2706c6
-- ---------------------------------------------------------------------------
--
-- UNIDADES. La planilla da líquidos en litros y sólidos en kg (codirector
-- técnico, 2026-11-12). Se pasan a la unidad del catálogo:
--   - insumo en g y líquido con densidad en su ficha: L × densidad × 1000;
--   - insumo en g y sólido: kg × 1000;
--   - insumo en ml: L × 1000;  en UNIDAD: tal cual.
-- La columna «planilla» guarda el número original para poder rehacer la cuenta.
--
-- 138CL2 (isopropílico): la planilla dice 20; el codirector corrigió a 27 L.
--
-- LÍQUIDOS SIN DENSIDAD. 135ALOE, 137AD, 192ALOE, 192ENM y las pinturas
-- acrílicas 139AC01–140AC27 están en g y no tienen densidad. Se cargan con
-- densidad 1 supuesta y conteo PROVISORIO (pedido del codirector); la DT carga
-- la densidad en la ficha y se vuelve a contar.
--
-- NEGATIVOS Y VACÍOS. Una existencia no puede ser negativa: los renglones con
-- «Stock x Dep.» negativo (101ESE, 101MONO, 348FRE, 350FRE, 364CREMA,
-- 365CREMA, 366CREMA, 371CREMA, 372CREMA, 377PREP) se cuentan en 0. Las
-- fragancias 135FRA1/2/3 vienen sin valor en esa columna y no se tocan.
--
-- ALTAS. Tipo y unidad elegidos por el código y el nombre: pigmentos, sugar,
-- micas, glitter y accesorios → materia prima en g; aceites, prep y
-- colorantes → materia prima en ml; 101MO/103MO/132CRE → semielaborado;
-- fresas, gorra, delantal y remache → material de empaque en unidades.
-- Las que ya existan no se tocan.
--
-- A NOMBRE DE QUIÉN. Del codirector técnico (DT suplente), que pidió la carga,
-- como 20261030120100: el claim se fija solo para esta transacción.

do $$
declare
  v_dt     uuid;
  v_obs    constant text := 'Planilla «INSUMOS ROMERO 12-11» (depósito 10, Stock x Dep.), existencia al 2026-11-12';
  r        record;
  v_insumo gmp.insumos_catalogo%rowtype;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com), a cuyo nombre va la carga.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  -- 1. Altas -----------------------------------------------------------------
  insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
  select v.codigo, v.nombre, v.tipo::gmp.tipo_insumo_enum, v.unidad
    from (values
      ('080PIG02', 'PIGMENTO AZUL ULTRAMAR', 'MATERIA_PRIMA', 'g'),
      ('080PIG03', 'PIGMENTO ROJO 48:2', 'MATERIA_PRIMA', 'g'),
      ('080PIG04', 'PIGMENTO ROJO FERRITE', 'MATERIA_PRIMA', 'g'),
      ('080PIG05', 'VIOLETA CARVASOLE', 'MATERIA_PRIMA', 'g'),
      ('080PIG07', 'N1 AMARILLO', 'MATERIA_PRIMA', 'g'),
      ('080PIG08', 'NEGRO BP-430', 'MATERIA_PRIMA', 'g'),
      ('080PIG09', 'DIOXIDO DE TITANIO', 'MATERIA_PRIMA', 'g'),
      ('101MO', 'MONOMERO DE 100ml. + MANO DE OBRA', 'SEMIELABORADO', 'ml'),
      ('103MO', 'MONOMERO 500ml. + MANO DE OBRA', 'SEMIELABORADO', 'ml'),
      ('132CRE', 'CREMA HIDRATANTE', 'SEMIELABORADO', 'g'),
      ('135COL1', 'COLORANTE SANITIZANTE AMOR', 'MATERIA_PRIMA', 'ml'),
      ('135COL2', 'COLORANTE SANITIZANTE PAZ', 'MATERIA_PRIMA', 'ml'),
      ('166SUG', 'SUGGAR XL Dorado lamí', 'MATERIA_PRIMA', 'g'),
      ('167SUG', 'SUGGAR XLI Tornasol efecto verde/rosa', 'MATERIA_PRIMA', 'g'),
      ('168SUG', 'SUGGAR XLII Transparente', 'MATERIA_PRIMA', 'g'),
      ('198DEL', 'DELANTAL', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('198RE', 'REMACHE PARA GORRA Y DELANTAL', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('199GOR', 'GORRA', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('245PIG', 'PIGMENTO VIOLETA FLUOR', 'MATERIA_PRIMA', 'g'),
      ('246PIG', 'PIGMENTO CELESTE FLUOR', 'MATERIA_PRIMA', 'g'),
      ('253PIG', 'PIGMENTO AURORA COBRE', 'MATERIA_PRIMA', 'g'),
      ('254PIG', 'PIGMENTO AURORA AZUL', 'MATERIA_PRIMA', 'g'),
      ('255PIG', 'PIGMENTO AURORA ROSE', 'MATERIA_PRIMA', 'g'),
      ('259MP', 'mic per a granel blanco 0.5', 'MATERIA_PRIMA', 'g'),
      ('260MP', 'mic per a granel negro 0.5', 'MATERIA_PRIMA', 'g'),
      ('261MP', 'mic per a granel cobre 0.5', 'MATERIA_PRIMA', 'g'),
      ('262MP', 'mic per a granel dorado 0.5', 'MATERIA_PRIMA', 'g'),
      ('265MP', 'mic per a granel cobre 1.0', 'MATERIA_PRIMA', 'g'),
      ('266MP', 'mic per a granel negro 1.0', 'MATERIA_PRIMA', 'g'),
      ('267MP', 'mic per a granel blanco 0.8', 'MATERIA_PRIMA', 'g'),
      ('268MP', 'mic per a granel negro 0.8', 'MATERIA_PRIMA', 'g'),
      ('269MP', 'mic per a granel cobre 0.8', 'MATERIA_PRIMA', 'g'),
      ('270MP', 'mic per a granel dorado 0.8', 'MATERIA_PRIMA', 'g'),
      ('271MP', 'mic per a granel negro 0.6', 'MATERIA_PRIMA', 'g'),
      ('272MP', 'mic per a granel cobre 0.6', 'MATERIA_PRIMA', 'g'),
      ('273MP', 'mic per a granel dorado 0.6', 'MATERIA_PRIMA', 'g'),
      ('275MP', 'mic per a granel blanco 0.4', 'MATERIA_PRIMA', 'g'),
      ('276MP', 'mic per a granel dorado 0.4', 'MATERIA_PRIMA', 'g'),
      ('277MP', 'mic per a granel cobre 0.4', 'MATERIA_PRIMA', 'g'),
      ('288SUG', 'SUGGAR XLIV Tornasol efecto Verde/Rosa o', 'MATERIA_PRIMA', 'g'),
      ('289SUG', 'SUGGAR XLV Tornasol efecto Violeta X-Fio', 'MATERIA_PRIMA', 'g'),
      ('290SUG', 'SUGGAR XLVI Turquesa', 'MATERIA_PRIMA', 'g'),
      ('291SUG', 'SUGGAR XLVII Verde Neon', 'MATERIA_PRIMA', 'g'),
      ('292SUG', 'SUGGAR XLVIII Amarillo Neon', 'MATERIA_PRIMA', 'g'),
      ('293SUG', 'SUGGAR XLIX Naranja Neon', 'MATERIA_PRIMA', 'g'),
      ('294SUG', 'SUGGAR L Fucsia Neon', 'MATERIA_PRIMA', 'g'),
      ('295SUG', 'SUGGAR LI Rosa Neon', 'MATERIA_PRIMA', 'g'),
      ('296SUG', 'SUGGAR LII Violeta', 'MATERIA_PRIMA', 'g'),
      ('297SUG', 'SUGGAR LIII Negro', 'MATERIA_PRIMA', 'g'),
      ('298SUG', 'SUGAR PLATA', 'MATERIA_PRIMA', 'g'),
      ('300AC', 'ACCESORIOS XLVIII Plata Fino', 'MATERIA_PRIMA', 'g'),
      ('301AC', 'ACCESORIOS XLVII Plata', 'MATERIA_PRIMA', 'g'),
      ('302AC', 'ACCESORIOS XLVI Oro', 'MATERIA_PRIMA', 'g'),
      ('303AC', 'ACCESORIOS XLV  Plata octogonal', 'MATERIA_PRIMA', 'g'),
      ('304AC', 'ACCESORIOS XLIV Oro tornasol', 'MATERIA_PRIMA', 'g'),
      ('305AC', 'ACCESORIOS XLIII Plata tornasol', 'MATERIA_PRIMA', 'g'),
      ('306AC', 'ACCESORIOS XLII Negro octogonal tornasol', 'MATERIA_PRIMA', 'g'),
      ('307AC', 'ACCESORIOS XLI Plata octogonal tornasol', 'MATERIA_PRIMA', 'g'),
      ('308AC', 'ACCESORIOS XL Champagne octogonal', 'MATERIA_PRIMA', 'g'),
      ('309AC', 'ACCESORIOS XXXIX Fucsia octogonal', 'MATERIA_PRIMA', 'g'),
      ('311AC', 'ACCESORIOS XXXVII Glitter turquesa torna', 'MATERIA_PRIMA', 'g'),
      ('312AC', 'ACCESORIOS LASSER XXXVI Glitter fucsia', 'MATERIA_PRIMA', 'g'),
      ('313AC', 'ACCESORIOS LASSER XXXV Violeta', 'MATERIA_PRIMA', 'g'),
      ('314AC', 'ACCESORIOS LASSER XXXIV Azul', 'MATERIA_PRIMA', 'g'),
      ('315AC', 'ACCESORIOS LASSER XXXIII Turquesa', 'MATERIA_PRIMA', 'g'),
      ('316AC', 'ACCESORIOS LASSER XXXII Rosa', 'MATERIA_PRIMA', 'g'),
      ('317AC', 'ACCESORIOS LASSER XXXI Magenta', 'MATERIA_PRIMA', 'g'),
      ('318AC', 'ACCESORIOS LASSER XXX Plata', 'MATERIA_PRIMA', 'g'),
      ('319AC', 'ACCESORIOS LASSER XXIX Negro', 'MATERIA_PRIMA', 'g'),
      ('331AC', 'ACCESORIOS LASSER XXVIII Cobre', 'MATERIA_PRIMA', 'g'),
      ('332AC', 'ACCESORIOS LASSER XXVII Verde', 'MATERIA_PRIMA', 'g'),
      ('333AC', 'ACCESORIOS LASSER XXVI Oro', 'MATERIA_PRIMA', 'g'),
      ('334AC', 'ACCESORIOS LASSER XXV Celeste Oscuro', 'MATERIA_PRIMA', 'g'),
      ('336MP', 'mic per a granel blanco 0.6', 'MATERIA_PRIMA', 'g'),
      ('337MP', 'mic per a granel dorado 1.0', 'MATERIA_PRIMA', 'g'),
      ('338MP', 'mic per a granel blanco 1.0', 'MATERIA_PRIMA', 'g'),
      ('340AC', 'ACEITE PARA TORNO', 'MATERIA_PRIMA', 'ml'),
      ('344FRE', 'FRESA CONICA AZUL L-14mm x Ø6mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('348FRE', 'FRESA CILINDRICA SEGURA L-14mm x Ø6mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('349FRE', 'FRESA DE DIAM. CILIND AZUL L-13mm x Ø6mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('350FRE', 'FRESA DE DIAM CILIND VERDE L-13mm x Ø6mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('351FRE', 'FRESA DE DIAM CILIND ROJA L-8mm x Ø2.3mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('352FRE', 'FRESA DE DIAM "FRUSTUM" ROJA, L-9mm Ø4mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('353FRE', 'Diamond bur frustum blue, L-9,0 mm, 4mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('357FRE', 'Stainless steel bur with toothed blade', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('359FR', 'Tungsten carbide bur corn blue L-14mm', 'MATERIAL_EMPAQUE', 'UNIDAD'),
      ('377PREP', 'PREP (BUTIL ACETATO+ISOPROPILICO)', 'MATERIA_PRIMA', 'ml'),
      ('379ACE', 'ACEITE AIRE (MATERIA PRIMA)', 'MATERIA_PRIMA', 'ml'),
      ('380ACE', 'ACEITE PAZ (MATERIA PRIMA)', 'MATERIA_PRIMA', 'ml'),
      ('450PPA', 'SP8922 SPARKLING RED (FLAKES)', 'MATERIA_PRIMA', 'g'),
      ('453PPA', '48525PB', 'MATERIA_PRIMA', 'g'),
      ('456PPA', '1007C', 'MATERIA_PRIMA', 'g'),
      ('460PPA', '#56', 'MATERIA_PRIMA', 'g'),
      ('M0100', 'SUGAR REFLECTIVO PLATA', 'MATERIA_PRIMA', 'g'),
      ('M0208', 'SUGAR REFLECTIVO BEIGE', 'MATERIA_PRIMA', 'g'),
      ('M0409', 'SUGAR REFLECTIVO LADRILLO', 'MATERIA_PRIMA', 'g'),
      ('M0603', 'SUGAR REFLECTIVO VERDE', 'MATERIA_PRIMA', 'g'),
      ('M0707', 'SUGAR REFLECTIVO AZUL', 'MATERIA_PRIMA', 'g'),
      ('M0903', 'SUGAR REFLECTIVO LILA', 'MATERIA_PRIMA', 'g'),
      ('M1000', 'SUGAR REFLECTIVO NEGRO', 'MATERIA_PRIMA', 'g'),
      ('MIX01', 'GLITTER MIX NARANJA', 'MATERIA_PRIMA', 'g'),
      ('MIX02', 'GLITTER MIX SALMÓN', 'MATERIA_PRIMA', 'g'),
      ('MIX03', 'GLITTER MIX AMARILLO NEÓN', 'MATERIA_PRIMA', 'g'),
      ('MIX04', 'GLITTER MIX ROSA', 'MATERIA_PRIMA', 'g'),
      ('MIX05', 'GLITTER MIX FUCSIA', 'MATERIA_PRIMA', 'g'),
      ('MIX06', 'GLITTER MIX CELESTE PASTEL', 'MATERIA_PRIMA', 'g'),
      ('MIX07', 'GLITTER MIX LILA', 'MATERIA_PRIMA', 'g'),
      ('MIX08', 'GLITTER MIX VERDE', 'MATERIA_PRIMA', 'g'),
      ('MIX09', 'GLITTER MIX COBRE', 'MATERIA_PRIMA', 'g'),
      ('MIX10', 'GLITTER MIX AMARILLO', 'MATERIA_PRIMA', 'g'),
      ('MIX11', 'GLITTER MIX CELESTE', 'MATERIA_PRIMA', 'g'),
      ('MIX12', 'GLITTER MIX AZUL', 'MATERIA_PRIMA', 'g')
    ) as v (codigo, nombre, tipo, unidad)
   where not exists (select 1 from gmp.insumos_catalogo i where i.codigo_interno = v.codigo);

  -- 2. Conteo ----------------------------------------------------------------
  for r in
    select * from (values
      ('080PIG02', 'g', 1780, 1.78, false),
      ('080PIG03', 'g', 1120, 1.12, false),
      ('080PIG04', 'g', 3625, 3.625, false),
      ('080PIG05', 'g', 600, 0.6, false),
      ('080PIG07', 'g', 600, 0.6, false),
      ('080PIG08', 'g', 13407, 13.407, false),
      ('080PIG09', 'g', 20000, 20, false),
      ('080POL', 'g', 1750000, 1750, false),
      ('101ESE', 'ml', 0, 0, false),
      ('101MO', 'ml', 0, 0, false),
      ('101MONO', 'g', 0, 0, false),
      ('103MO', 'ml', 0, 0, false),
      ('132CRE', 'g', 0, 0, false),
      ('135AGUA', 'g', 159712, 160, false),
      ('135ALOE', 'g', 400, 0.4, true),
      ('135COL1', 'ml', 0, 0, false),
      ('135COL2', 'ml', 0, 0, false),
      ('135GLI', 'g', 12613, 10, false),
      ('135PRO', 'g', 15541.5, 15, false),
      ('136PRE', 'g', 13653.795, 15.5, false),
      ('137AD', 'g', 2000, 2, true),
      ('138CL1', 'g', 212992.12, 263.8, false),
      ('138CL2', 'g', 21229.83, 27, false),
      ('139AC01', 'g', 13200, 13.2, true),
      ('139AC02', 'g', 3600, 3.6, true),
      ('139AC03', 'g', 10500, 10.5, true),
      ('139AC04', 'g', 7500, 7.5, true),
      ('139AC05', 'g', 28500, 28.5, true),
      ('139AC06', 'g', 5500, 5.5, true),
      ('139AC07', 'g', 65000, 65, true),
      ('139AC08', 'g', 5700, 5.7, true),
      ('139AC09', 'g', 28700, 28.7, true),
      ('139AC10', 'g', 21900, 21.9, true),
      ('139AC11', 'g', 54500, 54.5, true),
      ('139AC12', 'g', 6000, 6, true),
      ('140AC13', 'g', 60100, 60.1, true),
      ('140AC14', 'g', 68200, 68.2, true),
      ('140AC15', 'g', 77000, 77, true),
      ('140AC16', 'g', 75700, 75.7, true),
      ('140AC17', 'g', 76900, 76.9, true),
      ('140AC18', 'g', 96300, 96.3, true),
      ('140AC19', 'g', 94100, 94.1, true),
      ('140AC20', 'g', 77500, 77.5, true),
      ('140AC21', 'g', 39400, 39.4, true),
      ('140AC22', 'g', 48400, 48.4, true),
      ('140AC23', 'g', 74400, 74.4, true),
      ('140AC24', 'g', 77600, 77.6, true),
      ('140AC25', 'g', 82200, 82.2, true),
      ('140AC26', 'g', 87400, 87.4, true),
      ('140AC27', 'g', 74000, 74, true),
      ('142PIG', 'g', 7000, 7, false),
      ('143PIG', 'g', 30636, 30.636, false),
      ('144PIG', 'g', 8064, 8.064, false),
      ('145PIG', 'g', 5996, 5.996, false),
      ('146PIG', 'g', 540, 0.54, false),
      ('147PIG', 'g', 1800, 1.8, false),
      ('148PIG', 'g', 100, 0.1, false),
      ('149PIG', 'g', 2000, 2, false),
      ('150PIG', 'g', 104, 0.104, false),
      ('151PIG', 'g', 424, 0.424, false),
      ('152PIG', 'g', 1000, 1, false),
      ('153PIG', 'g', 1000, 1, false),
      ('154PIG', 'g', 2920, 2.92, false),
      ('155PIG', 'g', 524, 0.524, false),
      ('156PIG', 'g', 936, 0.936, false),
      ('157PIG', 'g', 12880, 12.88, false),
      ('158PIG', 'g', 1000, 1, false),
      ('159PIG', 'g', 3040, 3.04, false),
      ('160PIG', 'g', 0, 0, false),
      ('161PIG', 'g', 4284, 4.284, false),
      ('162PIG', 'g', 2848, 2.848, false),
      ('163PIG', 'g', 5312, 5.312, false),
      ('164PIG', 'g', 1000, 1, false),
      ('165PIG', 'g', 92, 0.092, false),
      ('166SUG', 'g', 15148, 15.148, false),
      ('167SUG', 'g', 272, 0.272, false),
      ('168SUG', 'g', 2284, 2.284, false),
      ('192ALOE', 'g', 2000, 2, true),
      ('192ENM', 'g', 2000, 2, true),
      ('192REM', 'ml', 37040, 37.04, false),
      ('198ACE', 'g', 0, 0, false),
      ('198ACNS', 'g', 0, 0, false),
      ('198DEL', 'UNIDAD', 0, 0, false),
      ('198RE', 'UNIDAD', 0, 0, false),
      ('199GOR', 'UNIDAD', 0, 0, false),
      ('245PIG', 'g', 1000, 1, false),
      ('246PIG', 'g', 1000, 1, false),
      ('253PIG', 'g', 2068, 2.068, false),
      ('254PIG', 'g', 2168, 2.168, false),
      ('255PIG', 'g', 4304, 4.304, false),
      ('259MP', 'g', 1960, 1.96, false),
      ('260MP', 'g', 1685, 1.685, false),
      ('261MP', 'g', 2060, 2.06, false),
      ('262MP', 'g', 2060, 2.06, false),
      ('265MP', 'g', 2240, 2.24, false),
      ('266MP', 'g', 2060, 2.06, false),
      ('267MP', 'g', 2060, 2.06, false),
      ('268MP', 'g', 2060, 2.06, false),
      ('269MP', 'g', 2010, 2.01, false),
      ('270MP', 'g', 2060, 2.06, false),
      ('271MP', 'g', 2060, 2.06, false),
      ('272MP', 'g', 1810, 1.81, false),
      ('273MP', 'g', 2060, 2.06, false),
      ('274MP', 'g', 2060, 2.06, false),
      ('275MP', 'g', 1560, 1.56, false),
      ('276MP', 'g', 2060, 2.06, false),
      ('277MP', 'g', 2060, 2.06, false),
      ('288SUG', 'g', 0, 0, false),
      ('289SUG', 'g', 772, 0.772, false),
      ('290SUG', 'g', 80, 0.08, false),
      ('291SUG', 'g', 148, 0.148, false),
      ('292SUG', 'g', 600, 0.6, false),
      ('293SUG', 'g', 600, 0.6, false),
      ('294SUG', 'g', 1780, 1.78, false),
      ('295SUG', 'g', 244, 0.244, false),
      ('296SUG', 'g', 520, 0.52, false),
      ('297SUG', 'g', 5260, 5.26, false),
      ('298SUG', 'g', 420, 0.42, false),
      ('300AC', 'g', 3120, 3.12, false),
      ('301AC', 'g', 2260, 2.26, false),
      ('302AC', 'g', 2012, 2.012, false),
      ('303AC', 'g', 112, 0.112, false),
      ('304AC', 'g', 2280, 2.28, false),
      ('305AC', 'g', 932, 0.932, false),
      ('306AC', 'g', 752, 0.752, false),
      ('307AC', 'g', 808, 0.808, false),
      ('308AC', 'g', 860, 0.86, false),
      ('309AC', 'g', 2132, 2.132, false),
      ('311AC', 'g', 784, 0.784, false),
      ('312AC', 'g', 3652, 3.652, false),
      ('313AC', 'g', 4000, 4, false),
      ('314AC', 'g', 3000, 3, false),
      ('315AC', 'g', 3732, 3.732, false),
      ('316AC', 'g', 3608, 3.608, false),
      ('317AC', 'g', 2760, 2.76, false),
      ('318AC', 'g', 3500, 3.5, false),
      ('319AC', 'g', 3344, 3.344, false),
      ('321TOALLA', 'UNIDAD', 309, 309, false),
      ('328PIG', 'g', 2000, 2, false),
      ('329PIG', 'g', 92, 0.092, false),
      ('330PIG', 'g', 6172, 6.172, false),
      ('331AC', 'g', 7012, 7.012, false),
      ('332AC', 'g', 3320, 3.32, false),
      ('333AC', 'g', 3032, 3.032, false),
      ('334AC', 'g', 2224, 2.224, false),
      ('336MP', 'g', 2060, 2.06, false),
      ('337MP', 'g', 2060, 2.06, false),
      ('338MP', 'g', 1685, 1.685, false),
      ('340AC', 'ml', 110000, 110, false),
      ('344FRE', 'UNIDAD', 0, 0, false),
      ('348FRE', 'UNIDAD', 0, 0, false),
      ('349FRE', 'UNIDAD', 0, 0, false),
      ('350FRE', 'UNIDAD', 0, 0, false),
      ('351FRE', 'UNIDAD', 5, 5, false),
      ('352FRE', 'UNIDAD', 1340, 1340, false),
      ('353FRE', 'UNIDAD', 1176, 1176, false),
      ('357FRE', 'UNIDAD', 0, 0, false),
      ('359FR', 'UNIDAD', 0, 0, false),
      ('364CREMA', 'g', 0, 0, false),
      ('365CREMA', 'g', 0, 0, false),
      ('366CREMA', 'g', 0, 0, false),
      ('370CREMA', 'g', 35220, 35.22, false),
      ('371CREMA', 'g', 0, 0, false),
      ('372CREMA', 'g', 0, 0, false),
      ('377PREP', 'ml', 0, 0, false),
      ('378ACE', 'g', 1203.28, 1.424, false),
      ('379ACE', 'ml', 1332, 1.332, false),
      ('380ACE', 'ml', 4388, 4.388, false),
      ('384ESE', 'ml', 2500, 2.5, false),
      ('450PPA', 'g', 5000, 5, false),
      ('453PPA', 'g', 3000, 3, false),
      ('456PPA', 'g', 13520, 13.52, false),
      ('460PPA', 'g', 3000, 3, false),
      ('M0100', 'g', 1004, 1.004, false),
      ('M0208', 'g', 1004, 1.004, false),
      ('M0409', 'g', 1916, 1.916, false),
      ('M0603', 'g', 1916, 1.916, false),
      ('M0707', 'g', 1916, 1.916, false),
      ('M0903', 'g', 1916, 1.916, false),
      ('M1000', 'g', 1004, 1.004, false),
      ('MIX01', 'g', 1620, 1.62, false),
      ('MIX02', 'g', 1621, 1.621, false),
      ('MIX03', 'g', 1620, 1.62, false),
      ('MIX04', 'g', 1621, 1.621, false),
      ('MIX05', 'g', 1621, 1.621, false),
      ('MIX06', 'g', 1621, 1.621, false),
      ('MIX07', 'g', 1621, 1.621, false),
      ('MIX08', 'g', 1620, 1.62, false),
      ('MIX09', 'g', 1621, 1.621, false),
      ('MIX10', 'g', 1621, 1.621, false),
      ('MIX11', 'g', 1620, 1.62, false),
      ('MIX12', 'g', 1621, 1.621, false)
    ) as t (codigo, unidad, cantidad, planilla, provisorio)
  loop
    select * into v_insumo from gmp.insumos_catalogo where codigo_interno = r.codigo;
    if not found then
      raise exception 'Falta el insumo % en el catálogo.', r.codigo;
    end if;
    if v_insumo.unidad_medida is distinct from r.unidad then
      raise exception 'El insumo % está en % y la carga se calculó en %.', r.codigo, v_insumo.unidad_medida, r.unidad;
    end if;
    perform comercial.registrar_conteo(
      v_insumo.id, r.cantidad,
      v_obs || format(': planilla %s', r.planilla)
            || case when r.provisorio then ' (densidad 1 supuesta: falta la densidad en la ficha)' else '' end,
      r.provisorio);
  end loop;
end;
$$;

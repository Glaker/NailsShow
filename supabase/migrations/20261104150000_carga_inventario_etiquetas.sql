-- ---------------------------------------------------------------------------
-- Propósito : Carga del inventario físico de etiquetas (planilla
--             «Stock_etiquetas_Nail_Show.xlsx», columna Cantidad total).
-- Reglas    : RN-54 (el movimiento no se edita: la diferencia es un ajuste),
--             RN-50, §3.3 «Ajustar stock por diferencia de inventario».
-- Fecha     : 2026-11-04
-- ---------------------------------------------------------------------------
--
-- QUÉ SE CARGA.
--   1. Alta de 4 etiquetas que la planilla trae sin código, con los códigos
--      que definió el codirector técnico: «producto + ETF» para el frente y
--      «producto + ETD» para el dorso.
--      - Primer low (producto 105) y Prep (producto 377) pasan a tener frente y
--        dorso separados. 105ET y 377ET siguen existiendo y se cuentan como
--        vienen en la planilla. Los frentes nuevos no tienen conteo.
--   2. Lote de apertura vacío donde falte, como 20261030120100. Lo necesitan
--      las etiquetas nuevas y además 252ETT, 340ETF y 376ET, que no tenían
--      ningún lote.
--   3. El conteo, con comercial.registrar_conteo: 164 etiquetas que existían
--      (todas con saldo 0, así que el ajuste es igual a lo contado) y los dorsos
--      nuevos 105ETD y 377ETD. Un cero se registra igual.
--
-- LO QUE QUEDA AFUERA.
--   - Las celdas vacías de la planilla: no generan movimiento.
--   - Las filas sin código que el codirector técnico descartó: #460, #463 y
--     #457 dorso, rótulos de monómero, Color Blender, Dorso Gel, círculo
--     transparente y negro, clips 3,8 y #482 código.
--   - Los 107 códigos de la planilla que no están en el catálogo (fresas
--     343–359, 280–286, NS-397/398/399, NST-510/511/512, entre otros): no se
--     crean sin pedido.
--
-- A NOMBRE DE QUIÉN.
-- Del codirector técnico, que pidió la carga. Mismo mecanismo que
-- 20261030120100: el claim se fija solo para esta transacción.

do $$
declare
  v_dt        uuid;
  v_migracion uuid;
  v_obs       constant text := 'Inventario físico de etiquetas (Stock_etiquetas_Nail_Show.xlsx), 2026-11-04';
  r           record;
  v_insumo    uuid;
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

  select id into v_migracion from gmp.migracion_apertura order by ejecutada_en limit 1;
  if v_migracion is null then
    raise exception 'No hay carga de saldo de apertura: el conteo no tiene lote donde asentarse.';
  end if;

  -- 1. Etiquetas nuevas ------------------------------------------------------
  insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
  select v.codigo, v.nombre, 'ETIQUETA', 'UNIDAD'
    from (values
      ('105ETF',         'ETIQUETA FRENTE PRIMER LOW'),
      ('105ETD',         'ETIQUETA DORSO PRIMER LOW'),
      ('377ETF',         'ETIQUETA FRENTE PREP 8ml'),
      ('377ETD',         'ETIQUETA DORSO PREP 8ml')
    ) as v (codigo, nombre)
   where not exists (select 1 from gmp.insumos_catalogo i where i.codigo_interno = v.codigo);

  -- 2. Lote de apertura vacío donde falte -----------------------------------
  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id, cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, unidad
  )
  select i.id, 'SALDO_APERTURA', v_migracion, 0, true,
         'SALDO DE APERTURA — sin cantidad declarada (inventario de etiquetas 2026-11-04)', i.unidad_medida
    from gmp.insumos_catalogo i
   where i.codigo_interno in (
           '105ETF','105ETD','377ETF','377ETD','252ETT','340ETF','376ET')
     and not exists (
       select 1 from gmp.lotes_insumo l
        where l.insumo_id = i.id and l.estado = 'SALDO_APERTURA' and l.unidad = i.unidad_medida
     );

  -- 3. Conteo ---------------------------------------------------------------
  for r in
    select * from (values
      ('371ETD', 8544), ('334ETB', 7363), ('374ETD', 7247), ('333ETB', 5572), ('278ET', 5562),
      ('319ETB', 5530), ('331ETB', 5501), ('166ET', 5450), ('332ETB', 5402), ('287ET', 5120),
      ('291ET', 4766), ('290ET', 4761), ('294ET', 4730), ('292ET', 4696), ('296ET', 4563),
      ('295ET', 4559), ('289ET', 4526), ('288ET', 4392), ('167ET', 4373), ('168ET', 4372),
      ('293ET', 4365), ('137ET', 4126), ('117ET', 4110), ('309ETB', 3980), ('315ETB', 3976),
      ('306ETB', 3969), ('304ETB', 3948), ('307ETB', 3926), ('300ETB', 3918), ('302ETB', 3911),
      ('297ET', 3899), ('303ETB', 3880), ('311ETB', 3872), ('308ETB', 3862), ('310ETB', 3811),
      ('313ETB', 3808), ('165ET', 3766), ('301ETB', 3760), ('305ETB', 3711), ('317ETB', 3687),
      ('147ET', 3671), ('163ET', 3669), ('159ET', 3664), ('156ET', 3612), ('145ET', 3608),
      ('314ETB', 3578), ('166ETT', 3577), ('148ET', 3564), ('318ETB', 3554), ('299ET', 3550),
      ('150ET', 3532), ('316ETB', 3528), ('144ET', 3519), ('330ET', 3517), ('164ET', 3516),
      ('279ET', 3510), ('146ET', 3496), ('312ETB', 3490), ('329ET', 3450), ('365ETD', 3426),
      ('157ET', 3388), ('116ET', 3321), ('152ET', 3265), ('115ET', 3263), ('111ET', 3228),
      ('158ET', 3218), ('149ET', 3182), ('154ET', 3093), ('328ET', 3069), ('155ET', 3036),
      ('327ET', 3016), ('153ET', 2940), ('379ET', 2903), ('151ET', 2840), ('369ETD', 2822),
      ('160ET', 2821), ('380ET', 2765), ('383ET', 2765), ('114ET', 2624), ('394ETD', 2567),
      ('375ETD', 2555), ('278ETC', 2524), ('392ET', 2437), ('162ET', 2352), ('365ET', 2300),
      ('369ET', 2247), ('112ET', 2231), ('371ET', 2227), ('375ET', 2123), ('382ET', 2121),
      ('114ETC', 2098), ('113ETC', 2055), ('392ETD', 1973), ('142ET', 1910), ('368ETD', 1841),
      ('368ET', 1800), ('366ET', 1790), ('373ETD', 1695), ('372ETD', 1678), ('299ETC', 1667),
      ('366ETD', 1662), ('279ETC', 1641), ('372ET', 1622), ('140ET', 1585), ('379ETD', 1412),
      ('364ETD', 1411), ('300ETT', 1346), ('105ET', 1330), ('111ETT', 1311), ('139ET', 1283),
      ('367ETD', 1283), ('364ET', 1186), ('367ET', 1168), ('380ETD', 1157), ('089ET', 1104),
      ('394ET', 1072), ('143ET', 1038), ('092ET', 1010), ('374ET', 981), ('383ETD', 954),
      ('115ETC', 927), ('370ETD', 839), ('119ETC', 785), ('391ET', 767), ('088ET', 750),
      ('118ETC', 737), ('139ETE', 735), ('087ET', 732), ('112ETC', 723), ('252ETT', 698),
      ('370ET', 696), ('113ET', 658), ('396ET', 657), ('111ETC', 656), ('373ET', 651),
      ('116ETC', 624), ('381ET', 571), ('396ETD', 560), ('378ETD', 549), ('395ETD', 488),
      ('393ET', 484), ('097ET', 474), ('382ETD', 453), ('327ETC', 451), ('393ETD', 448),
      ('340ETF', 432), ('387ETD', 429), ('387ET', 395), ('096ET', 367), ('378ET', 339),
      ('091ET', 330), ('395ET', 315), ('082ET', 298), ('377ET', 290), ('090ET', 279),
      ('117ETC', 228), ('098ET', 161), ('376ET', 136), ('095ET', 108), ('100ET', 95),
      ('343ETD', 90), ('103ET', 40), ('142ETT', 0), ('249ET', 0), ('105ETD', 1385),
      ('377ETD', 117)
    ) as t (codigo, cantidad)
  loop
    select id into v_insumo from gmp.insumos_catalogo where codigo_interno = r.codigo;
    if not found then
      raise exception 'Falta la etiqueta % en el catálogo.', r.codigo;
    end if;
    perform comercial.registrar_conteo(v_insumo, r.cantidad, v_obs, false);
  end loop;
end;
$$;

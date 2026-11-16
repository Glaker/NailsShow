-- ---------------------------------------------------------------------------
-- Propósito : Llevar el stock de Berna (BER) al del panel de stock de
--             Casiopea al viernes 13/11/2026 (depósito 6, columna «Stock x
--             Dep.»): 457 productos, negativos de Casiopea incluidos. Lo que
--             se haya movido en BER después del viernes queda encima, como si
--             la carga se hubiera hecho el viernes.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditados). Pedido del codirector técnico del
--             2026-11-16.
-- Fecha     : 2026-11-16
-- ---------------------------------------------------------------------------
--
-- Fuente: «STOCK CASIOPEA 13-11.xlsx», columna I. Igual que 20261106150000:
-- quedan afuera los códigos que no están en el catálogo (500 ENVIO, 289SUG,
-- 298, 631PACK, 650, 663, 664, 665, 716 y 21 más en cero); «NST-512» es
-- «NST - 512» en el catálogo.
--
-- Corte: fin del viernes 13/11 en Argentina. Por producto, el ajuste es
-- (stock de Casiopea) − (saldo de BER con los movimientos anteriores al
-- corte). No depende de lo que pasó después: los movimientos de hoy, y los
-- que se registren mientras corre la carga, siguen sumando sobre el saldo del
-- viernes. ocurrido_en no se puede antedatar; el motivo dice la fecha.
--
-- Entradas como ENTRADA_AJUSTE (sin lote); salidas como SALIDA_AJUSTE,
-- primero de los lotes con saldo (el trigger reparte) y lo que falte sin
-- lote. Los negativos de Casiopea (101, 137, 160, 252, 392, 458, 633PACK,
-- DUO02, NS-398) quedan negativos: el control de stock no negativo se apaga
-- durante la carga y se prende al terminar, en la misma transacción. Los
-- ajustes no pasan por el control de reservas (fn_reservas_pt_alcanzan solo
-- mira ventas y transferencias).
--
-- A nombre de Administración, como 20261106150000.

do $$
declare
  v_adm    uuid;
  v_ber    uuid;
  v_corte  constant timestamptz := '2026-11-14 00:00:00-03';
  v_falta  text;
  r        record;
  v_saldo  numeric;
  v_dif    numeric;
  v_lotes  numeric;
  v_hay    numeric;
  v_motivo text;
begin
  select id into v_adm
    from core.usuarios
   where email = 'nailshowargentina@hotmail.com' and rol = 'ADMINISTRACION' and activo;
  if v_adm is null then
    raise exception 'No está activa la cuenta de Administración (nailshowargentina@hotmail.com), a cuyo nombre va la carga.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_adm::text, 'rol', 'ADMINISTRACION',
                      'roles', json_build_array('ADMINISTRACION'))::text,
    true
  );
  set constraints all immediate;

  select id into v_ber from gmp.depositos where numero = 'BER' and activo;
  if v_ber is null then
    raise exception 'No existe el depósito Berna (BER).';
  end if;

  create temp table stock_berna on commit drop as
  select * from (values
      ('100', 235), ('100PACK', 0), ('101', -3), ('102', 13), ('103', 10), ('105', 291),
      ('106', 0), ('107', 0), ('108', 22), ('109', 0), ('110', 0), ('111', 0), ('112', 16),
      ('113', 11), ('114', 4), ('115', 51), ('116', 17), ('117', 68), ('118', 19), ('119', 17),
      ('120', 0), ('121', 0), ('122', 0), ('123', 0), ('124', 0), ('125', 0), ('126', 0),
      ('127', 0), ('128', 0), ('129', 0), ('130', 0), ('131', 0), ('132', 0), ('133', 0),
      ('134', 0), ('135', 0), ('136', 0), ('137', -2), ('138', 0), ('139', 32), ('140', 6),
      ('142', 60), ('143', 27), ('144', 44), ('145', 56), ('146', 105), ('147', 54), ('148', 40),
      ('149', 134), ('150', 110), ('151', 108), ('152', 156), ('153', 175), ('154', 120),
      ('155', 150), ('156', 57), ('157', 87), ('158', 96), ('159', 95), ('160', -1), ('161', 8),
      ('162', 14), ('163', 97), ('164', 134), ('165', 173), ('166', 59), ('166PACK', 0),
      ('167', 60), ('168', 25), ('169', 0), ('171', 0), ('173', 0), ('174', 30), ('175', 53),
      ('176', 106), ('177', 10), ('178', 144), ('179', 98), ('180', 203), ('181', 177),
      ('192', 89), ('195', 78), ('198', 0), ('199', 0), ('201', 267), ('202', 164), ('203', 253),
      ('204', 224), ('205', 233), ('206', 211), ('207', 273), ('208', 40), ('209', 69),
      ('210', 125), ('212', 47), ('213', 30), ('214', 42), ('217', 0), ('231', 550), ('232', 927),
      ('233', 773), ('234', 610), ('235', 392), ('236', 296), ('237', 262), ('238', 346),
      ('240', 4), ('241', 20), ('242', 0), ('245', 185), ('246', 196), ('247', 163),
      ('247PACK', 0), ('248', 0), ('249', 0), ('249PACK', 0), ('251', 19), ('252', -73),
      ('252PACK', 0), ('253', 24), ('254', 38), ('255', 85), ('259', 2), ('260', 73), ('261', 73),
      ('262', 19), ('264', 0), ('265', 57), ('266', 87), ('267', 4), ('268', 74), ('269', 84),
      ('270', 16), ('271', 79), ('272', 45), ('273', 10), ('274', 65), ('275', 1), ('276', 2),
      ('277', 21), ('278', 42), ('279', 1), ('280', 0), ('281', 0), ('282', 0), ('283', 0),
      ('287', 6), ('288', 37), ('289', 52), ('290', 86), ('291', 137), ('292', 132), ('293', 60),
      ('294', 152), ('295', 14), ('296', 115), ('297', 0), ('299', 18), ('300', 38), ('301', 132),
      ('302', 63), ('303', 172), ('304', 120), ('305', 116), ('306', 57), ('307', 108),
      ('308', 81), ('309', 81), ('310', 56), ('311', 56), ('312', 92), ('313', 136), ('314', 146),
      ('315', 87), ('316', 88), ('317', 124), ('318', 42), ('319', 43), ('320', 0), ('321', 28),
      ('324', 19), ('327', 11), ('328', 0), ('329', 131), ('330', 38), ('331', 63), ('332', 118),
      ('333', 28), ('334', 94), ('336', 2), ('337', 36), ('338', 41), ('339', 585), ('340', 334),
      ('342', 0), ('343', 52), ('344', 0), ('345', 12), ('346', 34), ('347', 37), ('348', 43),
      ('349', 51), ('350', 59), ('351', 31), ('352', 61), ('353', 31), ('354', 42), ('355', 0),
      ('356', 37), ('357', 65), ('358', 73), ('359', 68), ('360', 0), ('361', 10), ('362', 10),
      ('363', 0), ('364', 137), ('365', 156), ('366', 90), ('367', 219), ('368', 290), ('369', 33),
      ('370', 13), ('371', 92), ('372', 113), ('373', 7), ('374', 118), ('375', 118), ('376', 0),
      ('377', 32), ('378', 594), ('379', 103), ('380', 141), ('381', 373), ('382', 1019),
      ('383', 348), ('384', 133), ('385', 148), ('386', 10), ('387', 65), ('389', 0), ('391', 229),
      ('392', -2), ('393', 100), ('394', 142), ('395', 215), ('396', 86), ('398', 0), ('399', 18),
      ('406', 0), ('407', 0), ('411', 0), ('412', 42), ('413', 49), ('414', 0), ('415', 0),
      ('416', 41), ('417', 32), ('418', 61), ('419', 32), ('420', 84), ('421', 105), ('422', 134),
      ('423', 56), ('424', 0), ('431', 0), ('432', 18), ('433', 122), ('434', 36), ('441', 66),
      ('442', 143), ('448', 70), ('449', 1), ('456', 11), ('457', 170), ('458', -4), ('459', 3),
      ('460', 323), ('461', 100), ('462', 24), ('463', 13), ('464', 8), ('465', 4), ('470', 83),
      ('471', 1), ('472', 16), ('473', 0), ('474', 0), ('475', 0), ('476', 0), ('481', 0),
      ('482', 4), ('483', 27), ('501', 16), ('502', 0), ('503', 11), ('504', 27), ('505', 19),
      ('506', 47), ('507', 0), ('508', 0), ('509', 0), ('510', 37), ('512', 25), ('513', 10),
      ('514', 3701), ('515', 197), ('516', 18), ('519', 25), ('520', 26), ('521', 38), ('522', 46),
      ('523', 11), ('548', 11), ('600', 9), ('601', 0), ('602', 0), ('603', 0), ('604', 0),
      ('605', 0), ('606', 0), ('607', 0), ('608', 0), ('609', 0), ('610', 0), ('611', 0),
      ('612', 0), ('613', 6), ('633PACK', -1), ('651', 58), ('652', 50), ('653', 65), ('700', 3),
      ('701', 0), ('702', 0), ('703', 0), ('704', 7), ('705', 7), ('706', 0), ('708', 0),
      ('712', 0), ('713', 21), ('715', 0), ('78', 405), ('79', 210), ('80', 44), ('803', 14),
      ('804', 11), ('80PACK', 0), ('81', 0), ('82', 766), ('83', 194), ('84', 51), ('85', 688),
      ('86', 139), ('87', 4), ('88', 104), ('89', 5), ('90', 102), ('91', 67), ('92', 5),
      ('93', 139), ('93PACK', 0), ('94', 0), ('95', 118), ('95PACK', 0), ('96', 44), ('96PACK', 0),
      ('97', 34), ('98', 141), ('99', 66), ('99PACK', 0), ('DUO01', 50), ('DUO02', -68),
      ('NS-397', 38), ('NS-398', -7), ('NS-399', 23), ('NSK-01', 0), ('NSK-02', 0), ('NSK-03', 0),
      ('NSK-04', 0), ('NSK-05', 0), ('NSK-06', 0), ('NSK-07', 0), ('NSK-08', 0), ('NSK-09', 0),
      ('NSK-20', 0), ('NST - 512', 34), ('NST-519', 14), ('NST-520', 40), ('NST-521', 74),
      ('NST-524', 0), ('POL02', 0), ('POL03', 0), ('POL04', 0), ('POL05', 0), ('POL06', 0),
      ('POL07', 0), ('POL08', 0), ('POL09', 0), ('POL10', 0), ('POL11', 0), ('POL12', 0),
      ('POL13', 0), ('POL14', 0), ('POL15', 0), ('POL16', 0), ('POL17', 0), ('POL18', 0),
      ('POL19', 0), ('POL20', 0), ('POL21', 0), ('POL22', 0), ('POL23', 0), ('POL24', 0),
      ('POL25', 0), ('POL26', 0), ('POL27', 0), ('POL28', 0), ('POL29', 0), ('POL30', 0),
      ('POL31', 0), ('POL32', 0), ('POL33', 0), ('POL34', 0), ('POL35', 0), ('POL36', 0),
      ('POL37', 0), ('POL38', 0), ('POL39', 0), ('POL40', 0), ('POL41', 0), ('POL42', 0),
      ('POL43', 0), ('POL44', 0), ('POL45', 0), ('POL46', 0), ('POL47', 0), ('POL48', 0),
      ('POL49', 0), ('POL50', 0), ('POL51', 0), ('POL52', 0), ('POL53', 0), ('POL54', 0),
      ('POL55', 0), ('POL56', 0), ('POL57', 0), ('POL58', 0), ('POL59', 0), ('POL60', 0),
      ('POL61', 0), ('POL62', 0), ('POL63', 0), ('POL64', 0), ('POL65', 0), ('POL66', 0)
  ) as t (codigo, cantidad);

  select string_agg(t.codigo, ', ') into v_falta
    from stock_berna t
   where not exists (select 1 from gmp.productos p where p.codigo_interno = t.codigo);
  if v_falta is not null then
    raise exception 'Faltan en el catálogo: %', v_falta;
  end if;

  alter table comercial.movimientos_pt disable trigger trg_stock_pt_no_negativo;

  for r in
    select p.id, t.codigo, t.cantidad::numeric as cantidad
      from stock_berna t join gmp.productos p on p.codigo_interno = t.codigo
     order by t.codigo
  loop
    -- Saldo al cierre del viernes: lo de después no entra en la cuenta.
    select coalesce(sum(cantidad), 0) into v_saldo
      from comercial.movimientos_pt
     where deposito_id = v_ber and producto_id = r.id and ocurrido_en < v_corte;
    v_dif := r.cantidad - v_saldo;
    continue when v_dif = 0;
    v_motivo := format(
      'Stock de Casiopea (Berna) al 13/11/2026: %s; había %s al cierre del viernes. Lo movido después queda encima. Cargado por Claude a pedido del codirector técnico, 2026-11-16.',
      trim_scale(r.cantidad), trim_scale(v_saldo));

    if v_dif > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ber, 'ENTRADA_AJUSTE', v_dif, v_motivo, 'CONTEO_PT');
      continue;
    end if;

    -- Sale primero de los lotes con saldo hoy; lo que falte, sin lote.
    select coalesce(sum(s), 0) into v_lotes
      from (select sum(cantidad) s from comercial.movimientos_pt
             where deposito_id = v_ber and producto_id = r.id
             group by orden_id having sum(cantidad) > 0) g;
    v_hay := least(-v_dif, v_lotes);
    if v_hay > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ber, 'SALIDA_AJUSTE', -v_hay, v_motivo, 'CONTEO_PT');
    end if;
    if -v_dif > v_hay then
      perform set_config('comercial.lote_pt_asignado', '1', true);
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ber, 'SALIDA_AJUSTE', -(-v_dif - v_hay),
              v_motivo || ' Puede quedar en negativo hasta registrar el ingreso.', 'CONTEO_PT');
      perform set_config('comercial.lote_pt_asignado', '', true);
    end if;
  end loop;

  alter table comercial.movimientos_pt enable trigger trg_stock_pt_no_negativo;
end;
$$;

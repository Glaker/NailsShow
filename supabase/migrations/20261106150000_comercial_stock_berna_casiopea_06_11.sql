-- ---------------------------------------------------------------------------
-- Propósito : Llevar el stock de Berna (BER) al del panel de stock de
--             Casiopea del 06/11/2026 (depósito 6, columna «Stock x Dep.»):
--             457 productos, con los negativos de Casiopea incluidos.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditados). Pedido del codirector técnico del
--             2026-11-06.
-- Fecha     : 2026-11-06
-- ---------------------------------------------------------------------------
--
-- Fuente: «PExportWWArtDep - 2026-11-06T140603.576.xlsx», columna I. Quedan
-- afuera los códigos que no están en el catálogo (500 ENVIO, 289SUG, 298,
-- 631PACK, 650, 663, 664, 665, 716 y 21 más en cero). «NST-512» es
-- «NST - 512» en el catálogo.
--
-- Por producto, la diferencia con el saldo de BER entra como ENTRADA_AJUSTE
-- (sin lote) o sale como SALIDA_AJUSTE: primero de los lotes con saldo (el
-- trigger reparte), y lo que falte, sin lote. Seis productos quedan en
-- negativo como en Casiopea (101, 137, 633PACK, DUO01, DUO02, NS-398): el
-- codirector técnico confirmó que falta registrar su ingreso. Para eso, los
-- controles de stock no negativo y de reservas se apagan durante la carga y se
-- prenden al terminar, en la misma transacción (set constraints all
-- immediate, como 20261106120100). No hay reservas en BER que choquen con los
-- saldos nuevos (consultado el 2026-11-06).
--
-- A nombre de Administración (la DT no registra movimientos de producto
-- terminado), como 20261106120100; el motivo dice quién lo pidió.

do $$
declare
  v_adm    uuid;
  v_ber    uuid;
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
      ('100', 322), ('100PACK', 0), ('101', -1), ('102', 15), ('103', 0), ('105', 479), ('106', 0),
      ('107', 0), ('108', 22), ('109', 0), ('110', 0), ('111', 0), ('112', 16), ('113', 11),
      ('114', 4), ('115', 51), ('116', 17), ('117', 68), ('118', 19), ('119', 17), ('120', 0),
      ('121', 0), ('122', 0), ('123', 0), ('124', 0), ('125', 0), ('126', 0), ('127', 0),
      ('128', 0), ('129', 0), ('130', 0), ('131', 0), ('132', 0), ('133', 0), ('134', 0),
      ('135', 0), ('136', 0), ('137', -2), ('138', 0), ('139', 32), ('140', 7), ('142', 81),
      ('143', 45), ('144', 50), ('145', 56), ('146', 105), ('147', 54), ('148', 40), ('149', 140),
      ('150', 110), ('151', 108), ('152', 156), ('153', 181), ('154', 120), ('155', 150),
      ('156', 57), ('157', 87), ('158', 96), ('159', 95), ('160', 0), ('161', 1), ('162', 14),
      ('163', 97), ('164', 134), ('165', 173), ('166', 9), ('166PACK', 0), ('167', 66), ('168', 25),
      ('169', 0), ('171', 0), ('173', 0), ('174', 29), ('175', 56), ('176', 107), ('177', 11),
      ('178', 145), ('179', 99), ('180', 204), ('181', 178), ('192', 382), ('195', 97), ('198', 0),
      ('199', 0), ('201', 279), ('202', 176), ('203', 255), ('204', 224), ('205', 233), ('206', 211),
      ('207', 273), ('208', 40), ('209', 71), ('210', 125), ('212', 47), ('213', 30), ('214', 42),
      ('217', 0), ('231', 511), ('232', 908), ('233', 736), ('234', 613), ('235', 393), ('236', 297),
      ('237', 265), ('238', 359), ('240', 4), ('241', 20), ('242', 0), ('245', 185), ('246', 196),
      ('247', 290), ('247PACK', 0), ('248', 0), ('249', 0), ('249PACK', 0), ('251', 19), ('252', 33),
      ('252PACK', 0), ('253', 24), ('254', 38), ('255', 85), ('259', 2), ('260', 73), ('261', 73),
      ('262', 19), ('264', 0), ('265', 57), ('266', 87), ('267', 4), ('268', 74), ('269', 84),
      ('270', 16), ('271', 79), ('272', 45), ('273', 10), ('274', 65), ('275', 1), ('276', 2),
      ('277', 21), ('278', 42), ('279', 1), ('280', 0), ('281', 0), ('282', 0), ('283', 0),
      ('287', 6), ('288', 37), ('289', 52), ('290', 86), ('291', 143), ('292', 132), ('293', 60),
      ('294', 152), ('295', 14), ('296', 115), ('297', 0), ('299', 18), ('300', 38), ('301', 132),
      ('302', 63), ('303', 172), ('304', 120), ('305', 120), ('306', 57), ('307', 108), ('308', 81),
      ('309', 81), ('310', 56), ('311', 56), ('312', 92), ('313', 136), ('314', 146), ('315', 87),
      ('316', 88), ('317', 124), ('318', 35), ('319', 43), ('320', 0), ('321', 34), ('324', 19),
      ('327', 11), ('328', 0), ('329', 137), ('330', 38), ('331', 63), ('332', 118), ('333', 28),
      ('334', 94), ('336', 2), ('337', 36), ('338', 41), ('339', 585), ('340', 368), ('342', 0),
      ('343', 52), ('344', 0), ('345', 16), ('346', 34), ('347', 37), ('348', 44), ('349', 49),
      ('350', 60), ('351', 31), ('352', 68), ('353', 34), ('354', 43), ('355', 0), ('356', 37),
      ('357', 65), ('358', 73), ('359', 68), ('360', 0), ('361', 10), ('362', 10), ('363', 0),
      ('364', 156), ('365', 169), ('366', 103), ('367', 257), ('368', 326), ('369', 33), ('370', 36),
      ('371', 98), ('372', 119), ('373', 151), ('374', 123), ('375', 125), ('376', 0), ('377', 156),
      ('378', 606), ('379', 103), ('380', 154), ('381', 383), ('382', 1026), ('383', 353), ('384', 52),
      ('385', 164), ('386', 7), ('387', 137), ('389', 0), ('391', 287), ('392', 107), ('393', 103),
      ('394', 61), ('395', 51), ('396', 87), ('398', 0), ('399', 18), ('406', 0), ('407', 0),
      ('411', 0), ('412', 43), ('413', 49), ('414', 0), ('415', 0), ('416', 41), ('417', 32),
      ('418', 61), ('419', 32), ('420', 84), ('421', 105), ('422', 134), ('423', 56), ('424', 0),
      ('431', 0), ('432', 18), ('433', 122), ('434', 36), ('441', 66), ('442', 143), ('448', 70),
      ('449', 1), ('456', 11), ('457', 175), ('458', 5), ('459', 0), ('460', 323), ('461', 100),
      ('462', 36), ('463', 14), ('464', 9), ('465', 19), ('470', 84), ('471', 1), ('472', 16),
      ('473', 0), ('474', 0), ('475', 0), ('476', 0), ('481', 0), ('482', 4), ('483', 27),
      ('501', 16), ('502', 0), ('503', 11), ('504', 27), ('505', 19), ('506', 47), ('507', 0),
      ('508', 0), ('509', 0), ('510', 39), ('512', 25), ('513', 10), ('514', 3727), ('515', 208),
      ('516', 18), ('519', 27), ('520', 26), ('521', 40), ('522', 48), ('523', 11), ('548', 11),
      ('600', 9), ('601', 0), ('602', 0), ('603', 0), ('604', 0), ('605', 0), ('606', 0),
      ('607', 0), ('608', 0), ('609', 0), ('610', 0), ('611', 0), ('612', 0), ('613', 14),
      ('633PACK', -1), ('651', 58), ('652', 50), ('653', 65), ('700', 3), ('701', 0), ('702', 0),
      ('703', 0), ('704', 7), ('705', 7), ('706', 0), ('708', 0), ('712', 0), ('713', 21),
      ('715', 0), ('78', 489), ('79', 238), ('80', 44), ('803', 14), ('804', 11), ('80PACK', 0),
      ('81', 0), ('82', 970), ('83', 194), ('84', 51), ('85', 690), ('86', 237), ('87', 66),
      ('88', 112), ('89', 53), ('90', 114), ('91', 91), ('92', 5), ('93', 155), ('93PACK', 0),
      ('94', 0), ('95', 193), ('95PACK', 0), ('96', 56), ('96PACK', 0), ('97', 34), ('98', 213),
      ('99', 195), ('99PACK', 0), ('DUO01', -4), ('DUO02', -25), ('NS-397', 57), ('NS-398', -8),
      ('NS-399', 23), ('NSK-01', 0), ('NSK-02', 0), ('NSK-03', 0), ('NSK-04', 0), ('NSK-05', 0),
      ('NSK-06', 0), ('NSK-07', 0), ('NSK-08', 0), ('NSK-09', 0), ('NSK-20', 0), ('NST-519', 14),
      ('NST-520', 40), ('NST-521', 74), ('NST-524', 3), ('POL02', 0), ('POL03', 0), ('POL04', 0),
      ('POL05', 0), ('POL06', 0), ('POL07', 0), ('POL08', 0), ('POL09', 0), ('POL10', 0),
      ('POL11', 0), ('POL12', 0), ('POL13', 0), ('POL14', 0), ('POL15', 0), ('POL16', 0),
      ('POL17', 0), ('POL18', 0), ('POL19', 0), ('POL20', 0), ('POL21', 0), ('POL22', 0),
      ('POL23', 0), ('POL24', 0), ('POL25', 0), ('POL26', 0), ('POL27', 0), ('POL28', 0),
      ('POL29', 0), ('POL30', 0), ('POL31', 0), ('POL32', 0), ('POL33', 0), ('POL34', 0),
      ('POL35', 0), ('POL36', 0), ('POL37', 0), ('POL38', 0), ('POL39', 0), ('POL40', 0),
      ('POL41', 0), ('POL42', 0), ('POL43', 0), ('POL44', 0), ('POL45', 0), ('POL46', 0),
      ('POL47', 0), ('POL48', 0), ('POL49', 0), ('POL50', 0), ('POL51', 0), ('POL52', 0),
      ('POL53', 0), ('POL54', 0), ('POL55', 0), ('POL56', 0), ('POL57', 0), ('POL58', 0),
      ('POL59', 0), ('POL60', 0), ('POL61', 0), ('POL62', 0), ('POL63', 0), ('POL64', 0),
      ('POL65', 0), ('POL66', 0), ('NST - 512', 34)
  ) as t (codigo, cantidad);

  select string_agg(t.codigo, ', ') into v_falta
    from stock_berna t
   where not exists (select 1 from gmp.productos p where p.codigo_interno = t.codigo);
  if v_falta is not null then
    raise exception 'Faltan en el catálogo: %', v_falta;
  end if;

  alter table comercial.movimientos_pt disable trigger trg_stock_pt_no_negativo;
  alter table comercial.movimientos_pt disable trigger trg_movimiento_pt_respeta_reservas;

  for r in
    select p.id, t.codigo, t.cantidad::numeric as cantidad
      from stock_berna t join gmp.productos p on p.codigo_interno = t.codigo
     order by t.codigo
  loop
    select coalesce(sum(cantidad), 0) into v_saldo
      from comercial.movimientos_pt where deposito_id = v_ber and producto_id = r.id;
    v_dif := r.cantidad - v_saldo;
    continue when v_dif = 0;
    v_motivo := format(
      'Stock de Casiopea (Berna) al 06/11/2026: %s; había %s. Cargado por Claude a pedido del codirector técnico, 2026-11-06.',
      trim_scale(r.cantidad), trim_scale(v_saldo));

    if v_dif > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ber, 'ENTRADA_AJUSTE', v_dif, v_motivo, 'CONTEO_PT');
      continue;
    end if;

    -- Sale primero de los lotes con saldo; lo que falte, sin lote.
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
              v_motivo || ' Queda en negativo hasta registrar el ingreso.', 'CONTEO_PT');
      perform set_config('comercial.lote_pt_asignado', '', true);
    end if;
  end loop;

  alter table comercial.movimientos_pt enable trigger trg_stock_pt_no_negativo;
  alter table comercial.movimientos_pt enable trigger trg_movimiento_pt_respeta_reservas;
end;
$$;

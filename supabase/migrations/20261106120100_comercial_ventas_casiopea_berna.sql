-- ---------------------------------------------------------------------------
-- Propósito : Descontar de Berna (BER) lo vendido según el panel de stock de
--             Casiopea al 31/10/2026 (Casiopea = Berna): 61 productos, 683
--             unidades, por vendedor y tienda online. Cinco productos no
--             tienen stock suficiente en el sistema y, por única vez, quedan
--             en negativo hasta que se registre su ingreso.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditados), RN-51 (lo que tiene lote sale de lo
--             despachable). Pedido del codirector técnico del 2026-11-06.
-- Fecha     : 2026-11-06
-- ---------------------------------------------------------------------------
--
-- Reemplaza a 20261106120000, que nunca se aplicó: apagaba el control de
-- stock no negativo, pero ese control es diferido y corría igual al cerrar
-- la transacción.
--
-- Fuente: «STOCK CASIOPEA 31-10-26.xlsx», columna TOTAL (Tapia, Capuano,
-- Barra, Gaona, Tienda MP, Tienda Pago Nube). Se deja afuera «500 ENVIO», que
-- no es un producto. «NST-512» de Casiopea es «NST - 512» en el catálogo.
--
-- Cada producto sale como SALIDA_VENTA en BER: primero lo que hay en el
-- sistema (el trigger reparte por lote, solo lo despachable). Si no alcanza,
-- el resto sale sin lote con los controles de stock no negativo y de
-- reservas apagados solo para esa fila y prendidos de nuevo enseguida:
-- removedor 120 ml (192), fresa 353, DUO02, NS-398 y NST - 512. Los controles
-- se evalúan en el momento (set constraints all immediate) para que no quede
-- ninguno pendiente al apagarlos. El codirector técnico confirmó que falta
-- registrar el ingreso de esos cinco. No hay reservas en BER de ninguno de
-- estos productos (consultado el 2026-11-06).
--
-- A nombre de Administración (la DT no registra salidas de producto
-- terminado), elegido por el codirector técnico; el motivo dice quién lo pidió.

do $$
declare
  v_adm    uuid;
  v_ber    uuid;
  v_falta  text;
  r        record;
  v_saldo  numeric;
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

  create temp table ventas_casiopea on commit drop as
  select * from (values
      ('100', 16, 'Tapia 12, Tienda Pago Nube 4'),
      ('101', 32, 'Tapia 24, Capuano 2, Tienda MP 2, Tienda Pago Nube 4'),
      ('105', 32, 'Tapia 12, Tienda MP 20'),
      ('137', 1, 'Tapia 1'),
      ('160', 3, 'Tapia 3'),
      ('192', 44, 'Tapia 24, Capuano 8, Barra 12'),
      ('195', 20, 'Tapia 20'),
      ('233', 20, 'Barra 20'),
      ('235', 20, 'Tapia 20'),
      ('236', 20, 'Barra 20'),
      ('238', 11, 'Tienda MP 11'),
      ('247', 12, 'Capuano 12'),
      ('272', 12, 'Barra 12'),
      ('273', 12, 'Barra 12'),
      ('275', 1, 'Barra 1'),
      ('276', 10, 'Barra 10'),
      ('277', 12, 'Barra 12'),
      ('324', 4, 'Barra 4'),
      ('336', 9, 'Barra 9'),
      ('340', 31, 'Barra 24, Gaona 7'),
      ('343', 1, 'Tienda Pago Nube 1'),
      ('348', 1, 'Tienda Pago Nube 1'),
      ('350', 2, 'Tienda Pago Nube 2'),
      ('351', 1, 'Barra 1'),
      ('352', 19, 'Barra 12, Gaona 7'),
      ('353', 9, 'Gaona 7, Tienda Pago Nube 2'),
      ('359', 1, 'Tienda Pago Nube 1'),
      ('364', 18, 'Tapia 8, Capuano 10'),
      ('367', 12, 'Tapia 12'),
      ('369', 8, 'Tapia 8'),
      ('370', 23, 'Tapia 8, Capuano 15'),
      ('372', 6, 'Tapia 6'),
      ('373', 9, 'Tapia 8, Tienda MP 1'),
      ('375', 10, 'Tapia 10'),
      ('377', 31, 'Tapia 12, Tienda MP 19'),
      ('378', 1, 'Tienda MP 1'),
      ('381', 12, 'Tapia 12'),
      ('382', 12, 'Tapia 12'),
      ('384', 8, 'Barra 6, Gaona 2'),
      ('386', 4, 'Barra 4'),
      ('391', 30, 'Tapia 10, Capuano 20'),
      ('392', 13, 'Tapia 6, Capuano 7'),
      ('393', 12, 'Barra 12'),
      ('395', 16, 'Tapia 10, Capuano 6'),
      ('396', 8, 'Tapia 8'),
      ('417', 1, 'Tienda Pago Nube 1'),
      ('441', 5, 'Barra 4, Tienda Pago Nube 1'),
      ('458', 3, 'Tienda Pago Nube 3'),
      ('462', 1, 'Tienda Pago Nube 1'),
      ('463', 5, 'Barra 2, Gaona 2, Tienda Pago Nube 1'),
      ('471', 7, 'Capuano 7'),
      ('78', 12, 'Capuano 12'),
      ('79', 1, 'Tienda Pago Nube 1'),
      ('83', 1, 'Tienda Pago Nube 1'),
      ('89', 7, 'Capuano 6, Tienda Pago Nube 1'),
      ('95', 15, 'Tapia 12, Tienda MP 2, Tienda Pago Nube 1'),
      ('97', 1, 'Tienda Pago Nube 1'),
      ('99', 13, 'Tapia 12, Tienda Pago Nube 1'),
      ('DUO02', 12, 'Barra 12'),
      ('NS-398', 4, 'Barra 4'),
      ('NST - 512', 6, 'Barra 6')
  ) as t (codigo, cantidad, detalle);

  select string_agg(t.codigo, ', ') into v_falta
    from ventas_casiopea t
   where not exists (select 1 from gmp.productos p where p.codigo_interno = t.codigo);
  if v_falta is not null then
    raise exception 'Faltan en el catálogo: %', v_falta;
  end if;

  for r in
    select p.id, t.codigo, t.cantidad::numeric as cantidad, t.detalle
      from ventas_casiopea t join gmp.productos p on p.codigo_interno = t.codigo
     order by t.codigo
  loop
    v_motivo := format('Ventas Casiopea (Berna) al 31/10/2026: %s. Cargado por Claude a pedido del codirector técnico, 2026-11-06.',
                       r.detalle);
    select coalesce(sum(cantidad), 0) into v_saldo
      from comercial.movimientos_pt where deposito_id = v_ber and producto_id = r.id;
    v_hay := least(r.cantidad, greatest(v_saldo, 0));

    if v_hay > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo)
      values (r.id, v_ber, 'SALIDA_VENTA', -v_hay, v_motivo);
    end if;

    if r.cantidad > v_hay then
      alter table comercial.movimientos_pt disable trigger trg_stock_pt_no_negativo;
      alter table comercial.movimientos_pt disable trigger trg_movimiento_pt_respeta_reservas;
      perform set_config('comercial.lote_pt_asignado', '1', true);
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo)
      values (r.id, v_ber, 'SALIDA_VENTA', -(r.cantidad - v_hay),
              v_motivo || format(' Sin stock en el sistema para %s: queda en negativo hasta registrar el ingreso.',
                                 trim_scale(r.cantidad - v_hay)));
      perform set_config('comercial.lote_pt_asignado', '', true);
      alter table comercial.movimientos_pt enable trigger trg_stock_pt_no_negativo;
      alter table comercial.movimientos_pt enable trigger trg_movimiento_pt_respeta_reservas;
    end if;
  end loop;
end;
$$;

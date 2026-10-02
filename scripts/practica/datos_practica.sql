-- ---------------------------------------------------------------------------
-- Datos inventados para la base de PRÁCTICA (nailshow-practica). NUNCA en la
-- base real: lo corre scripts/practica/armar_practica.mjs, que se niega a
-- apuntar al proyecto real. No es una migración.
--
-- Todo pasa por las mismas funciones que usa la app (registrar pago, cobro,
-- transferencia, factura), así que respeta las mismas reglas. Las facturas
-- se dan por autorizadas con una respuesta de ARCA simulada: en práctica no
-- hay certificados ni función de facturación, ARCA no se entera.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', (
  select json_build_object(
    'sub', id, 'usuario_id', id, 'rol', 'ADMINISTRADOR_SISTEMA',
    'roles', json_build_array('ADMINISTRADOR_SISTEMA', 'ADMINISTRACION', 'GERENCIA', 'VENTAS',
                              'DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'),
    'role', 'authenticated')
  from core.usuarios where email = 'verificacion@nailshow.com.ar')::text, false);

do $$
declare
  caja uuid; galicia uuid; santander uuid; mp uuid;
  pq uuid; pe uuid; pa uuid; pi uuid;
  fq1 uuid; fq2 uuid; fe1 uuid; fa1 uuid; fi1 uuid;
  cb uuid; cn uuid; cg uuid; cl uuid;
  mono uuid; prim uuid;
  ped uuid; fac uuid; n integer := 0;
  r record;
  aut jsonb := '{"FECAESolicitarResult":{"FeCabResp":{"Resultado":"A"},"FeDetResp":{"FECAEDetResponse":[{"Resultado":"A","CAE":"99999999999999","CAEFchVto":"20261231"}]}}}';
begin
  if exists (select 1 from comercial.cuentas_fondos where nombre = 'Galicia CC Nail Show') then
    raise notice 'Los datos de práctica ya estaban cargados.';
    return;
  end if;

  -- Cajas y bancos de las tres titulares.
  insert into comercial.cuentas_fondos (nombre, tipo) values ('Caja fábrica', 'CAJA') returning id into caja;
  insert into comercial.cuentas_fondos (nombre, tipo, banco, numero) values ('Galicia CC Nail Show', 'BANCO', 'Galicia', '4021-3 001-7') returning id into galicia;
  insert into comercial.cuentas_fondos (nombre, tipo, banco) values ('Santander Athene del Plata', 'BANCO', 'Santander') returning id into santander;
  insert into comercial.cuentas_fondos (nombre, tipo, de_tercero, titular) values ('Mercado Pago Virginia', 'BILLETERA', true, 'Virginia Arleo') returning id into mp;
  insert into comercial.movimientos_fondos (cuenta_id, fecha, tipo, importe, concepto) values
    (galicia,   current_date - 40, 'INGRESO', 3500000, 'Saldo inicial (práctica)'),
    (santander, current_date - 40, 'INGRESO', 1200000, 'Saldo inicial (práctica)'),
    (mp,        current_date - 40, 'INGRESO',  400000, 'Saldo inicial (práctica)'),
    (caja,      current_date - 40, 'INGRESO',   90000, 'Saldo inicial (práctica)');
  perform comercial.transferir_fondos(galicia, caja, 60000, 'Retiro para caja chica', current_date - 20);
  insert into comercial.movimientos_fondos (cuenta_id, fecha, tipo, importe, concepto, contraparte) values
    (galicia, current_date - 18, 'EGRESO', -185000, 'Luz y gas fábrica', 'Edelap / Camuzzi'),
    (caja,    current_date - 9,  'EGRESO',  -12500, 'Librería y fotocopias', 'Librería del Centro'),
    (mp,      current_date - 3,  'EGRESO',  -48000, 'Envíos por Andreani', 'Andreani');

  -- Proveedores (quedan sin dictamen: el dictamen es de la DT).
  insert into gmp.proveedores (razon_social, cuit) values ('Química Pampeana SA', '30712222227') returning id into pq;
  insert into gmp.proveedores (razon_social, cuit) values ('Envases del Plata SRL', '30713333332') returning id into pe;
  insert into gmp.proveedores (razon_social, cuit) values ('Andreani Logística SA', '30714444448') returning id into pa;
  insert into gmp.proveedores (razon_social, cuit) values ('Imprenta Sur', '27301112225') returning id into pi;

  -- Comprobantes de proveedor: A con IVA, B, una NC y uno sin factura.
  insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, fecha, vencimiento_pago, importe_neto, importe_iva, importe_total)
    values (pq, 'FACTURA_A', 3, 1520, current_date - 35, current_date - 5, 800000, 168000, 968000) returning id into fq1;
  insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, fecha, vencimiento_pago, importe_neto, importe_iva, importe_total)
    values (pq, 'FACTURA_A', 3, 1588, current_date - 12, current_date + 18, 450000, 94500, 544500) returning id into fq2;
  insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, fecha, vencimiento_pago, importe_neto, importe_iva, importe_total, comprobante_asociado_id)
    values (pq, 'NOTA_CREDITO_A', 3, 77, current_date - 10, null, 50000, 10500, 60500, fq1);
  insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, fecha, vencimiento_pago, importe_total)
    values (pe, 'FACTURA_B', 1, 9041, current_date - 25, current_date + 5, 312000) returning id into fe1;
  insert into comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero, fecha, vencimiento_pago, importe_neto, importe_iva, importe_total)
    values (pa, 'FACTURA_A', 12, 330120, current_date - 15, current_date + 15, 120000, 25200, 145200) returning id into fa1;
  insert into comercial.comprobantes_proveedor (proveedor_id, tipo, fecha, importe_total)
    values (pi, 'SIN_FACTURA', current_date - 8, 38000) returning id into fi1;

  -- Pagos: uno total y uno parcial, imputados.
  perform comercial.registrar_pago_proveedor(pq, galicia, 907500, 'TRANSFERENCIA',
    jsonb_build_array(jsonb_build_object('comprobante_id', fq1, 'importe', 907500)), current_date - 4, 'Op. 55120');
  perform comercial.registrar_pago_proveedor(pe, santander, 150000, 'TRANSFERENCIA',
    jsonb_build_array(jsonb_build_object('comprobante_id', fe1, 'importe', 150000)), current_date - 2, 'Op. 7781');

  -- Una solicitud de pago esperando aprobación.
  insert into comercial.solicitudes_pago (area, concepto, destinatario, proveedor_id, comprobante_id, importe, vencimiento)
    values ('PRODUCCION', 'Flete de insumos de la semana', 'Andreani Logística SA', pa, fa1, 145200, current_date + 15);

  -- Clientes.
  insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento, domicilio)
    values ('Distribuidora Belleza Sur SRL', 'RESPONSABLE_INSCRIPTO', 'CUIT', '30715555553', 'Av. 7 1200, La Plata') returning id into cb;
  insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento, domicilio)
    values ('Navi Nails', 'MONOTRIBUTO', 'CUIT', '30716666669', 'Calle 50 820, La Plata') returning id into cn;
  insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento)
    values ('Glam Estética', 'RESPONSABLE_INSCRIPTO', 'CUIT', '30717777774') returning id into cg;
  insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento)
    values ('Lucía Pérez', 'CONSUMIDOR_FINAL', 'DNI', '30111222') returning id into cl;

  -- Emisor de práctica en «producción» para que las facturas se vean como
  -- reales en las cuentas corrientes. CUIT inventado; no hay certificado.
  update comercial.configuracion_fiscal set vigente = false where vigente;
  insert into comercial.configuracion_fiscal (ambiente, cuit_emisor, punto_venta, razon_social, condicion_iva, observacion)
    values ('PRODUCCION', '30711111111', 9, 'Nail Show SRL (práctica)', 'RESPONSABLE_INSCRIPTO',
            'Emisor inventado de la base de práctica. No existe en ARCA.');

  -- Facturas a clientes, ya «autorizadas» (respuesta de ARCA simulada).
  select id into mono from gmp.productos where codigo_interno = '101';
  select id into prim from gmp.productos where codigo_interno = '105';
  for r in
    select * from (values
      (cb, 'Distribuidora Belleza Sur SRL', 60, 30, 28),
      (cn, 'Navi Nails', 24, 12, 20),
      (cg, 'Glam Estética', 40, 0, 12),
      (cl, 'Lucía Pérez', 3, 2, 6)
    ) as v(cli, nombre, cant_mono, cant_prim, dias)
  loop
    n := n + 1;
    insert into comercial.pedidos (numero, cliente, cliente_id, fecha) values (format('PR-%s', n), r.nombre, r.cli, current_date - r.dias) returning id into ped;
    insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values (ped, mono, r.cant_mono, 7024.79);
    if r.cant_prim > 0 then
      insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario) values (ped, prim, r.cant_prim, 5371.90);
    end if;
    update comercial.pedidos set estado = 'CONFIRMADO' where id = ped;
    perform comercial.preparar_factura(ped);
    select id into fac from comercial.facturas where pedido_id = ped and estado = 'PENDIENTE';
    perform comercial.fijar_numero_factura(fac, 100 + n);
    perform comercial.registrar_resultado_factura(fac, '{}'::jsonb, aut);
  end loop;

  -- Un cobro total y uno parcial.
  select id into fac from comercial.facturas f where f.cliente_id = cb and f.estado = 'AUTORIZADA';
  perform comercial.registrar_cobro_cliente(cb, galicia, (select importe_total from comercial.facturas where id = fac),
    'TRANSFERENCIA', jsonb_build_array(jsonb_build_object('factura_id', fac,
      'importe', (select importe_total from comercial.facturas where id = fac))), current_date - 6, 'Op. 90211');
  select id into fac from comercial.facturas f where f.cliente_id = cn and f.estado = 'AUTORIZADA';
  perform comercial.registrar_cobro_cliente(cn, mp, 100000, 'TRANSFERENCIA',
    jsonb_build_array(jsonb_build_object('factura_id', fac, 'importe', 100000)), current_date - 1, 'MP 8812');

  raise notice 'Datos de práctica cargados.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Propósito : Lo que necesita el inicio de Administración para los gráficos:
--             flujo de caja día a día (ingresos, egresos, neto y saldo de
--             bancos y de efectivo), el detalle de un día (de dónde vino y
--             adónde fue cada peso) y los volúmenes de venta y compra por
--             cliente y proveedor.
-- Reglas    : §6 del documento de Administración (inicio orientado a la
--             posición), RN-63 (imputaciones). Solo lectura: no escribe nada.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- UNA SOLA CAJA. Pedido del usuario: Nail Show, Athene del Plata y Virginia
-- Arleo se ven como uno solo (D-37). Suma todas las cuentas de fondos, propias
-- y de terceros; el detalle de cada cuenta dice su titular.
--
-- QUÉ ES INGRESO Y EGRESO. Lo que entra o sale de la caja consolidada: todo
-- movimiento menos las transferencias entre cuentas (que mueven plata de un
-- bolsillo al otro). Una anulación cuenta el día que se registra, con su
-- signo: la caja de ese día la tuvo.
--
-- Las tres funciones son SECURITY INVOKER: leen con el RLS de quien las llama,
-- así que solo muestran algo a los roles que ya ven la tesorería.

create function comercial.flujo_caja_diario(p_desde date, p_hasta date)
returns table (
  fecha          date,
  ingresos       numeric,
  egresos        numeric,
  neto           numeric,
  saldo_bancos   numeric,
  saldo_efectivo numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El período va de una fecha a otra posterior, hasta 400 días.' using errcode = 'check_violation';
  end if;

  -- ponytail: saldo por subconsulta correlativa (días × movimientos); si el
  -- libro crece a cientos de miles de filas, pasar a una suma acumulada.
  return query
  with mov as (
    select m.fecha, m.importe, m.tipo, c.tipo as cuenta_tipo
      from comercial.movimientos_fondos m
      join comercial.cuentas_fondos c on c.id = m.cuenta_id
  ),
  flujo as (
    select mov.fecha,
           coalesce(sum(mov.importe) filter (where mov.importe > 0 and mov.tipo <> 'TRANSFERENCIA'), 0) as ing,
           coalesce(-sum(mov.importe) filter (where mov.importe < 0 and mov.tipo <> 'TRANSFERENCIA'), 0) as egr
      from mov
     where mov.fecha between p_desde and p_hasta
     group by mov.fecha
  )
  select d.fecha::date,
         coalesce(f.ing, 0),
         coalesce(f.egr, 0),
         coalesce(f.ing, 0) - coalesce(f.egr, 0),
         (select coalesce(sum(x.importe), 0) from mov x where x.fecha <= d.fecha and x.cuenta_tipo <> 'CAJA'),
         (select coalesce(sum(x.importe), 0) from mov x where x.fecha <= d.fecha and x.cuenta_tipo = 'CAJA')
    from generate_series(p_desde, p_hasta, interval '1 day') d
    left join flujo f on f.fecha = d.fecha::date
   order by 1;
end;
$$;

comment on function comercial.flujo_caja_diario(date, date) is
  'Por día: ingresos y egresos de la caja consolidada (sin transferencias internas), neto, y saldo de bancos '
  '(bancos y billeteras) y de efectivo (cajas) al cierre. Todas las cuentas, propias y de terceros, como una sola.';

-- El día por dentro: cada movimiento con su origen o destino, y cada cuenta.
create function comercial.flujo_caja_dia(p_fecha date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'fecha', p_fecha,
    'movimientos', coalesce((
      select jsonb_agg(x order by x.orden)
        from (
          select m.orden, m.id, m.importe, m.tipo, m.concepto, m.contraparte, m.comprobante,
                 m.anula_a_id is not null as es_anulacion,
                 c.nombre as cuenta, c.tipo as cuenta_tipo, c.titular,
                 (select n.nombre_completo from core.v_nomina n where n.id = m.registrado_por) as registrado_por,
                 -- Cobro: cliente, y por cada factura imputada, a nombre de quién,
                 -- quién vendió y qué.
                 (select jsonb_build_object(
                           'cliente', cl.razon_social, 'medio', co.medio, 'referencia', co.referencia,
                           'facturas', coalesce((
                             select jsonb_agg(jsonb_build_object(
                                      'comprobante', f.tipo || ' ' || lpad(f.punto_venta::text, 4, '0') || '-'
                                                     || lpad(coalesce(f.numero, 0)::text, 8, '0'),
                                      'imputado', i.importe,
                                      'a_nombre_de', coalesce((
                                        select cf.razon_social from comercial.configuracion_fiscal cf
                                         where cf.cuit_emisor = f.cuit_emisor
                                         order by cf.vigente desc, cf.creado_en desc limit 1), f.cuit_emisor),
                                      'pedido', p.numero,
                                      'vendedor', (select n.nombre_completo from core.v_nomina n where n.id = p.creado_por),
                                      'productos', coalesce((
                                        select jsonb_agg(jsonb_build_object(
                                                 'producto', pd.nombre, 'cantidad', r.cantidad,
                                                 'importe', round(r.cantidad * coalesce(r.precio_unitario, 0)
                                                                  * (1 + r.alicuota_iva / 100), 2)))
                                          from comercial.pedido_renglones r
                                          join gmp.productos pd on pd.id = r.producto_id
                                         where r.pedido_id = p.id and not r.anulado), '[]'::jsonb)))
                               from comercial.imputaciones_cobro i
                               join comercial.facturas f on f.id = i.factura_id
                               join comercial.pedidos p on p.id = f.pedido_id
                              where i.cobro_id = co.id), '[]'::jsonb))
                    from comercial.cobros_cliente co
                    join comercial.clientes cl on cl.id = co.cliente_id
                   where co.id = m.cobro_id) as cobro,
                 -- Pago: proveedor, y por cada comprobante imputado, qué se recibió.
                 (select jsonb_build_object(
                           'proveedor', pr.razon_social, 'medio', pa.medio, 'referencia', pa.referencia,
                           'comprobantes', coalesce((
                             select jsonb_agg(jsonb_build_object(
                                      'comprobante', replace(cp.tipo::text, '_', ' ')
                                                     || coalesce(' ' || cp.punto_venta || '-' || cp.numero, ''),
                                      'imputado', ip.importe,
                                      'recepcion', rc.numero,
                                      'insumos', coalesce((
                                        select jsonb_agg(jsonb_build_object(
                                                 'insumo', ic.nombre, 'cantidad', l.cantidad_unidades, 'unidad', l.unidad))
                                          from gmp.lotes_insumo l
                                          join gmp.insumos_catalogo ic on ic.id = l.insumo_id
                                         where l.recepcion_id = cp.recepcion_id), '[]'::jsonb)))
                               from comercial.imputaciones_pago ip
                               join comercial.comprobantes_proveedor cp on cp.id = ip.comprobante_id
                               left join gmp.recepciones rc on rc.id = cp.recepcion_id
                              where ip.pago_id = pa.id), '[]'::jsonb))
                    from comercial.pagos_proveedor pa
                    join gmp.proveedores pr on pr.id = pa.proveedor_id
                   where pa.id = m.pago_id) as pago
            from comercial.movimientos_fondos m
            join comercial.cuentas_fondos c on c.id = m.cuenta_id
           where m.fecha = p_fecha
        ) x), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cuenta', c.nombre, 'tipo', c.tipo, 'banco', c.banco, 'titular', c.titular,
               'de_tercero', c.de_tercero, 'saldo', s.saldo, 'entro', s.entro, 'salio', s.salio)
             order by c.tipo, c.nombre)
        from comercial.cuentas_fondos c
        cross join lateral (
          select coalesce(sum(m.importe) filter (where m.fecha <= p_fecha), 0) as saldo,
                 coalesce(sum(m.importe) filter (where m.fecha = p_fecha and m.importe > 0), 0) as entro,
                 coalesce(-sum(m.importe) filter (where m.fecha = p_fecha and m.importe < 0), 0) as salio
            from comercial.movimientos_fondos m
           where m.cuenta_id = c.id
        ) s
       where c.activo or s.saldo <> 0 or s.entro <> 0 or s.salio <> 0), '[]'::jsonb)
  );
$$;

comment on function comercial.flujo_caja_dia(date) is
  'Un día de la caja consolidada: cada movimiento (con el cobro o el pago que lo originó: cliente, a nombre de quién '
  'se facturó, quién vendió y qué; proveedor, comprobante y qué se recibió) y el saldo de cada cuenta al cierre.';

-- Tortas: ventas por cliente y compras por proveedor. Las notas de crédito restan.
create function comercial.volumenes_por_contraparte(p_desde date, p_hasta date)
returns table (lado text, contraparte text, ambiente text, total numeric)
language sql
stable
set search_path = ''
as $$
  select 'VENTA', cl.razon_social, f.ambiente::text,
         sum(case when f.comprobante = 'NOTA_CREDITO' then -f.importe_total else f.importe_total end)
    from comercial.facturas f
    join comercial.clientes cl on cl.id = f.cliente_id
   where f.estado = 'AUTORIZADA' and f.fecha between p_desde and p_hasta
   group by cl.razon_social, f.ambiente
  union all
  select 'COMPRA', pr.razon_social, 'PRODUCCION',
         sum(case when c.tipo::text like 'NOTA_CREDITO%' then -coalesce(c.importe_total, 0)
                  else coalesce(c.importe_total, 0) end)
    from comercial.comprobantes_proveedor c
    join gmp.proveedores pr on pr.id = c.proveedor_id
   where c.anulado_en is null and c.fecha between p_desde and p_hasta
   group by pr.razon_social;
$$;

comment on function comercial.volumenes_por_contraparte(date, date) is
  'Ventas autorizadas por cliente (por ambiente: las de homologación no son fiscales) y compras por proveedor, en el período.';

grant execute on function comercial.flujo_caja_diario(date, date),
                          comercial.flujo_caja_dia(date),
                          comercial.volumenes_por_contraparte(date, date) to authenticated;
revoke execute on function comercial.flujo_caja_diario(date, date),
                           comercial.flujo_caja_dia(date),
                           comercial.volumenes_por_contraparte(date, date) from anon;

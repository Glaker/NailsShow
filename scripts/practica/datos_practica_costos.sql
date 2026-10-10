-- ---------------------------------------------------------------------------
-- Datos inventados del MÓDULO DE COSTOS para la base de PRÁCTICA. NUNCA en la
-- base real: lo corre scripts/practica/armar_practica.mjs (que se niega a
-- apuntar al proyecto real) después de datos_practica.sql. No es una migración.
--
-- Decisión del 2026-10-09: los ejemplos del módulo viven en el proyecto de
-- práctica, no marcados en la base real. Así no hay forma de que un número
-- inventado se mezcle con uno real; la base entera es de práctica y la
-- aplicación lo muestra con el cartel «PRÁCTICA».
--
-- Un bloque por fase. Cada bloque se saltea si ya está cargado.
-- ---------------------------------------------------------------------------

-- GUARDA: esta carga es sólo para la base de PRÁCTICA. La base real tiene la
-- cuenta de Nazarena (naza@nailshow.com); la de práctica no (sus cuentas de
-- arranque son las de la reconstrucción). Corrida por error contra la real,
-- crearía registros regulados que no se pueden borrar (invariante 1).
do $guarda$
begin
  if exists (select 1 from core.usuarios where email = 'naza@nailshow.com') then
    raise exception 'ALTO: esta base parece la REAL (tiene la cuenta de Nazarena). Los datos de práctica no se cargan acá.';
  end if;
end;
$guarda$;

select set_config('request.jwt.claims', (
  select json_build_object(
    'sub', id, 'usuario_id', id, 'rol', 'ADMINISTRADOR_SISTEMA',
    'roles', json_build_array('ADMINISTRADOR_SISTEMA', 'FINANZAS', 'GERENCIA', 'ADMINISTRACION',
                              'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'VENTAS'),
    'role', 'authenticated')
  from core.usuarios where email = 'verificacion@nailshow.com.ar')::text, false);

-- ===========================================================================
-- Fase 1: costos de insumos, productos, parámetros y 12 meses de IPC y dólar
-- ===========================================================================
do $$
declare
  hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  mes0   date := date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date;
  prov   uuid;
  rec    uuid;
  lote   uuid;
  r      record;
  m      integer;
  ipc    numeric;
  tc     numeric;
  base   numeric;
  precio numeric;
  n      integer := 0;
  prods  uuid[];
begin
  if exists (select 1 from comercial.series_macro) then
    raise notice 'Costos de práctica (Fase 1) ya cargados.';
    return;
  end if;

  -- 12 meses de IPC y A3500, con inflación y dólar crecientes y no parejos.
  -- El último mes, como en la realidad, todavía es provisorio.
  ipc := 100; tc := 1050;
  for m in reverse 11..0 loop
    insert into comercial.series_macro (serie, mes, valor, fuente, es_provisorio) values
      ('IPC', (mes0 - make_interval(months => m))::date, round(ipc, 4), 'INDEC (práctica)', m = 0),
      ('TC_A3500_PROMEDIO', (mes0 - make_interval(months => m))::date, round(tc, 2), 'BCRA Com. A 3500 (práctica)', false),
      ('TC_A3500_CIERRE', (mes0 - make_interval(months => m))::date, round(tc * 1.012, 2), 'BCRA Com. A 3500 (práctica)', false);
    ipc := ipc * (1 + 0.022 + (m % 4) * 0.006);
    tc  := tc  * (1 + 0.012 + (m % 3) * 0.009);
  end loop;

  -- Costo hora (costo laboral total por hora productiva) y parámetros.
  insert into comercial.parametros_costo (costo_hora, umbral_variacion, margen_minimo, vigencia_cotizacion_dias, motivo)
  values (6500, 0.05, 0.25, 7, 'Práctica: sueldos + cargas + SAC + vacaciones / horas productivas');

  -- Cuatro productos con fórmula y materiales: los ejemplos del costeo.
  select array_agg(id) into prods from (
    select p.id
      from gmp.productos p
     where p.activo
       and exists (select 1 from comercial.formula_para_costo(p.id))
     order by (select count(*) from gmp.materiales_acondicionamiento m where m.producto_id = p.id and m.activo) desc,
              p.codigo_interno
     limit 4
  ) x;
  update gmp.productos set contenido_neto = c.cont, unidad_contenido = 'g'
    from (select unnest(prods) as id, unnest(array[14, 30, 60, 100]::numeric[]) as cont) c
   where gmp.productos.id = c.id;
  insert into comercial.minutos_producto (producto_id, minutos_por_unidad, motivo)
  select unnest(prods), unnest(array[1.5, 2.2, 3.0, 4.5]::numeric[]), 'Práctica';

  -- Proveedor de las compras de práctica.
  select id into prov from gmp.proveedores where razon_social = 'Química Pampeana SA';

  -- Hasta 10 insumos de esos productos (granel y acondicionamiento), con tres
  -- compras cada uno en el año: el precio sigue la inflación, con ruido.
  for r in
    select i.id, i.codigo_interno, i.unidad_medida, i.requiere_pesada_recepcion,
           coalesce(cr.costo_apertura, case when i.unidad_medida = 'UNIDAD' then 180 else 25 end) as costo_hoy
      from gmp.insumos_catalogo i
      left join comercial.v_costo_referencia cr on cr.insumo_id = i.id
     where i.activo and not i.es_inflamable and i.unidad_medida is not null
       and (i.id in (select fc.insumo_id from gmp.formula_componentes fc
                       join gmp.formulas_fabricacion f on f.id = fc.formula_id
                      where f.producto_id = any (prods) and not fc.anulado)
            or i.id in (select ma.insumo_id from gmp.materiales_acondicionamiento ma
                         where ma.producto_id = any (prods) and ma.activo))
     order by i.codigo_interno
     limit 10
  loop
    n := n + 1;
    -- Tres de cada diez tienen precio de Finanzas desde hace dos meses.
    if n % 3 = 1 then
      insert into comercial.costos_referencia (insumo_id, importe, cantidad, unidad, vigente_desde, motivo)
      values (r.id, round(r.costo_hoy * 0.93, 4), 1, r.unidad_medida, (mes0 - interval '2 months')::date,
              'Práctica: cotización acordada con el proveedor');
    end if;
    foreach m in array array[11, 6, 1] loop
      base := r.costo_hoy
              * (select valor from comercial.series_macro where serie = 'IPC' and mes = (mes0 - make_interval(months => m))::date)
              / (select valor from comercial.series_macro where serie = 'IPC' and mes = mes0);
      -- El primero de la lista sube de golpe en la última compra: dispara el aviso.
      precio := round(base * case when n = 1 and m = 1 then 1.30 else 1 + ((n + m) % 5) * 0.01 end, 4);
      insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido, fecha_hora)
      values (prov, format('PR-%s-%s', r.codigo_interno, m), true, (hoy - m * 30) + time '10:00')
      returning id into rec;
      insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad,
                                    contenedores_limpiados, protocolo_recibido, peso_pigmento_kg)
      values (rec, r.id, format('L%s-%s', n, m), 1,
              case when r.unidad_medida = 'UNIDAD' then 1000 else 5000 end, r.unidad_medida, true, true,
              case when r.requiere_pesada_recepcion then 5 end)
      returning id into lote;
      insert into comercial.costos_lote (lote_insumo_id, tipo_comprobante, importe, incluye_iva, alicuota_iva,
                                         cantidad, unidad, fecha_costo)
      values (lote,
              case when m = 6 and n % 2 = 0 then 'SIN_COMPROBANTE' else 'FACTURA_A' end::comercial.comprobante_costo_enum,
              round(precio * case when r.unidad_medida = 'UNIDAD' then 1000 else 5000 end
                    * case when m = 6 and n % 2 = 0 then 1 else 1.21 end, 2),
              case when m = 6 and n % 2 = 0 then null else true end,
              case when m = 6 and n % 2 = 0 then null else 21 end,
              case when r.unidad_medida = 'UNIDAD' then 1000 else 5000 end, r.unidad_medida, hoy - m * 30);
      -- Un flete en la compra más reciente del primer insumo.
      if n = 1 and m = 1 then
        insert into comercial.costos_accesorios (recepcion_id, concepto, descripcion, tipo_comprobante, importe,
                                                 incluye_iva, alicuota_iva, fecha_costo)
        values (rec, 'FLETE', 'Andreani (práctica)', 'FACTURA_A', 24200, true, 21, hoy - 30);
      end if;
    end loop;
  end loop;

  raise notice 'Costos de práctica (Fase 1): % insumos con compras, % productos.', n, coalesce(cardinality(prods), 0);
end;
$$;

-- ===========================================================================
-- Fase 2: historia de 12 meses (fotos de costo y precios por banda) de los
-- productos de ejemplo, para que las líneas del panel muestren algo real.
-- ===========================================================================
do $$
declare
  mes0   date := date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date;
  r      record;
  m      integer;
  k      integer := 0;
  ipc0   numeric;
  ipcm   numeric;
  costo  numeric;
  neto   numeric;
begin
  if exists (select 1 from comercial.lista_mayorista where origen = 'PRÁCTICA') then
    raise notice 'Costos de práctica (Fase 2) ya cargados.';
    return;
  end if;
  select valor into ipc0 from comercial.series_macro where serie = 'IPC' and mes = mes0;

  for r in
    select c.producto_id, sum(c.subtotal) as costo_hoy, count(*) filter (where c.falta is not null) as faltan,
           sum(c.subtotal) filter (where c.tipo = 'GRANEL') as granel,
           sum(c.subtotal) filter (where c.tipo = 'ACONDICIONAMIENTO') as acond,
           sum(c.subtotal) filter (where c.tipo = 'MANO_DE_OBRA') as mo,
           (select fc.estado::text from comercial.formula_para_costo(c.producto_id) fc) as formula_estado
      from comercial.costos_productos(array(select id from gmp.productos where contenido_neto is not null)) c
     group by c.producto_id
    having sum(c.subtotal) > 0
  loop
    k := k + 1;
    -- Fotos de los once meses cerrados: el costo de hoy llevado por el IPC.
    for m in 1..11 loop
      select valor into ipcm from comercial.series_macro
       where serie = 'IPC' and mes = (mes0 - make_interval(months => m))::date;
      costo := round(r.costo_hoy * ipcm / ipc0, 4);
      -- Sin desglose: el de hoy no suma el costo de entonces (se escala sólo el total).
      insert into comercial.fotos_costo_producto
        (mes, producto_id, costo_unitario, granel, acondicionamiento, mano_de_obra, faltantes, formula_estado, detalle)
      values ((mes0 - make_interval(months => m))::date, r.producto_id, costo,
              round(r.granel * ipcm / ipc0, 4), round(r.acond * ipcm / ipc0, 4), round(r.mo * ipcm / ipc0, 4),
              r.faltan, r.formula_estado, '[]'::jsonb);
    end loop;

    -- Precios: se actualizan hace 11, 6 y 2 meses y hoy; entre aumentos el
    -- margen real se come. El segundo producto tiene la promo justa (margen
    -- bajo) para ver la advertencia en el cotizador.
    foreach m in array array[11, 6, 2, 0] loop
      select valor into ipcm from comercial.series_macro
       where serie = 'IPC' and mes = (mes0 - make_interval(months => m))::date;
      neto := r.costo_hoy * ipcm / ipc0;
      insert into comercial.precios_producto (producto_id, precio_lista, alicuota_iva, origen, motivo, cargado_en)
      values (r.producto_id, round(neto * 2.8 * 1.21, 2), 21, 'PRÁCTICA', 'Lista consumidor final (práctica)',
              case when m = 0 then now() else (mes0 - make_interval(months => m))::timestamptz + interval '5 days' end);
      insert into comercial.lista_mayorista
        (producto_id, numero_lista, rubro, precio_lista, precio_promo, unidades_pack, alicuota_iva, origen, cargado_en)
      values (r.producto_id, 'PRÁCTICA', 'Práctica', round(neto * 1.9 * 1.21, 2),
              round(neto * case when k = 2 then 1.18 else 1.6 end * 1.21, 2), 1, 21, 'PRÁCTICA',
              case when m = 0 then now() else (mes0 - make_interval(months => m))::timestamptz + interval '5 days' end);
    end loop;
  end loop;
  raise notice 'Costos de práctica (Fase 2): historia de % productos.', k;
end;
$$;

-- ===========================================================================
-- Fase 3: 12 meses de facturación (facturas autorizadas, fechadas en su mes),
-- costos fijos, nómina de producción, gastos operativos (algunos sin
-- comprobante) y una inversión que se amortiza. La facturación tiene
-- estacionalidad para que el resultado cruce el punto de equilibrio, y 15
-- productos con ventas muy desparejas para que el Pareto muestre A, B y C.
-- ===========================================================================
do $$
declare
  mes0   date := date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date;
  emisor record;
  cli    record;
  ped    uuid;
  fac    uuid;
  m      integer;
  j      integer;
  n      integer := 0;
  v_mes  date;
  v_fecha date;
  ipc0   numeric;
  ipcm   numeric;
  estacion numeric;
  neto   numeric;
  iva    numeric;
  prods  uuid[];
  precios numeric[];
  k      integer;
  cant   numeric;
begin
  if exists (select 1 from comercial.gastos where descripcion like '%(práctica)') then
    raise notice 'Costos de práctica (Fase 3) ya cargados.';
    return;
  end if;
  select * into emisor from comercial.configuracion_fiscal where vigente and ambiente = 'PRODUCCION' limit 1;
  if emisor.id is null then
    raise notice 'Sin emisor de práctica en producción (datos_practica.sql): no se carga la Fase 3.';
    return;
  end if;
  select valor into ipc0 from comercial.series_macro where serie = 'IPC' and mes = mes0;

  -- Los productos de ejemplo primero (tienen costo), después otros con precio.
  select array_agg(id order by orden), array_agg(neto_hoy order by orden) into prods, precios
    from (
      select p.id, (case when p.contenido_neto is not null then 0 else 1 end) * 1000 + row_number() over (order by p.codigo_interno) as orden,
             v.precio_neto as neto_hoy
        from gmp.productos p
        join comercial.v_precios_vigentes v on v.producto_id = p.id
       where p.activo and v.precio_neto > 0
       order by (p.contenido_neto is null), p.codigo_interno
       limit 15
    ) x;

  for m in reverse 11..0 loop
    v_mes := (mes0 - make_interval(months => m))::date;
    select valor into ipcm from comercial.series_macro where serie = 'IPC' and mes = v_mes;
    -- Temporada: fin de año fuerte, verano flojo.
    estacion := case extract(month from v_mes)::int
                  when 1 then 0.55 when 2 then 0.6 when 3 then 0.8 when 11 then 1.35 when 12 then 1.5
                  else 0.95 end;

    -- Gastos del mes, al ritmo de la inflación.
    insert into comercial.gastos (categoria_id, mes, fecha, descripcion, tipo_comprobante, importe, incluye_iva, alicuota_iva)
    select c.id, v_mes, v_mes + 5, g.descripcion || ' (práctica)', g.comprobante::comercial.comprobante_costo_enum,
           round(g.importe * ipcm / ipc0, 2),
           case when g.comprobante = 'FACTURA_A' then false end,
           case when g.comprobante = 'FACTURA_A' then 21 end
      from (values
        ('Alquiler', 'Alquiler de planta', 'FACTURA_A', 1400000),
        ('Servicios (luz, gas, agua, internet)', 'Servicios', 'FACTURA_A', 380000),
        ('Sueldos no productivos', 'Administración y ventas', 'SIN_COMPROBANTE', 2100000),
        ('Honorarios profesionales', 'Estudio contable', 'FACTURA_A', 450000),
        ('Nómina de producción', 'Operarios de planta', 'SIN_COMPROBANTE', 2600000),
        ('Librería y oficina', 'Librería', 'SIN_COMPROBANTE', 45000),
        ('Limpieza', 'Artículos de limpieza', 'FACTURA_A', 90000),
        ('Envíos a clientes', 'Envíos a clientes', 'FACTURA_A', 220000)
      ) g(categoria, descripcion, comprobante, importe)
      join comercial.categorias_gasto c on c.nombre = g.categoria;
    if m = 8 then
      insert into comercial.gastos (categoria_id, mes, fecha, descripcion, tipo_comprobante, importe, incluye_iva,
                                    alicuota_iva, vida_util_meses)
      select id, v_mes, v_mes + 12, 'Envasadora semiautomática (práctica)', 'FACTURA_A', 7260000, true, 21, 36
        from comercial.categorias_gasto where nombre = 'Maquinaria';
    end if;

    -- Tres facturas por mes, cada una con cinco productos; el producto k
    -- vende ~ 1 / k^1,4 del primero: Pareto con A, B y C.
    for j in 1..3 loop
      select * into cli from comercial.clientes
       where condicion_iva = 'RESPONSABLE_INSCRIPTO' order by razon_social offset (j - 1) % 2 limit 1;
      continue when cli.id is null;
      n := n + 1;
      -- Nunca una fecha futura (el mes en curso todavía no terminó).
      v_fecha := least(v_mes + 3 + j * 7, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
      insert into comercial.pedidos (numero, cliente, cliente_id, fecha)
      values (format('PRF-%s', n), cli.razon_social, cli.id, v_fecha) returning id into ped;
      for k in 1..cardinality(prods) loop
        continue when (k + j) % 3 <> 0 and k > 3;   -- los primeros en todas; el resto, repartido
        cant := greatest(1, round(260 * estacion / power(k, 1.4) * (0.85 + (j % 3) * 0.1)));
        insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad, precio_unitario, alicuota_iva)
        values (ped, prods[k], cant, round(precios[k] * ipcm / ipc0, 4), 21);
      end loop;
      update comercial.pedidos set estado = 'CONFIRMADO' where id = ped;
      select round(sum(cantidad * precio_unitario), 2) into neto from comercial.pedido_renglones where pedido_id = ped;
      iva := round(neto * 0.21, 2);
      insert into comercial.facturas
        (pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta, numero, fecha,
         receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva, importe_neto, importe_iva, importe_total,
         alicuotas, estado, cae, cae_vencimiento, respuesta_arca, resuelta_en)
      values (ped, cli.id, 'PRODUCCION', emisor.cuit_emisor, 'A', comercial.codigo_comprobante_arca('A', 'FACTURA'),
              emisor.punto_venta, 5000 + n, v_fecha, 80, cli.numero_documento, 1, neto, iva, neto + iva,
              jsonb_build_array(jsonb_build_object('Id', 5, 'BaseImp', neto, 'Importe', iva, 'alicuota', 21)),
              'AUTORIZADA', '99999999999999', v_mes + 40, '{"practica": true}'::jsonb, v_fecha::timestamptz)
      returning id into fac;
      -- Facturado y entregado: que no quede como pedido pendiente para siempre.
      update comercial.pedidos
         set estado = 'CUMPLIDO', entregado_en = v_fecha::timestamptz, entregado_por = core.usuario_actual()
       where id = ped;
    end loop;
  end loop;
  raise notice 'Costos de práctica (Fase 3): % facturas en 12 meses.', n;
end;
$$;

-- ===========================================================================
-- Fase 5: dos cotizaciones de ejemplo, una emitida para un cliente potencial
-- (con un insumo escrito a mano, óxido de zinc) y otra de uso interno.
-- ===========================================================================
do $$
declare
  pot  uuid;
  c1   uuid;
  c2   uuid;
  prod uuid;
begin
  if exists (select 1 from comercial.cotizaciones) then
    raise notice 'Costos de práctica (Fase 5) ya cargados.';
    return;
  end if;
  insert into comercial.clientes_potenciales (razon_social, contacto)
  values ('Spa del Bosque (práctica)', 'Laura — 221 555-0101') returning id into pot;

  insert into comercial.cotizaciones (titulo, contenido_cantidad, contenido_unidad, cantidad_cotizada, destino,
                                      cliente_potencial_id, minutos_por_unidad, fija, margen_objetivo, vigencia_dias,
                                      observaciones)
  values ('Protector solar para manos 60 g', 60, 'g', 500, 'POTENCIAL', pot, 2.5, 'MARGEN', 0.35, 7,
          'Entrega a 15 días de confirmado el pedido.')
  returning id into c1;
  insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio,
                                           cantidad_presentacion, unidad_presentacion, incluye_iva, alicuota_iva)
  values (c1, 1, 'NUEVO', 'Óxido de zinc (ZnO)', 6, 'g', 12000, 500, 'g', true, 21),
         (c1, 2, 'NUEVO', 'Base crema', 52, 'g', 9800, 1, 'kg', true, 21);
  -- El pote se cotizó por unidad: presentación de 1 unidad.
  insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio,
                                           cantidad_presentacion, unidad_presentacion, incluye_iva)
  values (c1, 3, 'NUEVO', 'Pote 60 g con tapa', 1, 'unidad', 420, 1, 'unidad', false);
  insert into comercial.cotizacion_lineas (cotizacion_id, orden, tipo, nombre, cantidad, unidad, precio, incluye_iva)
  values (c1, 4, 'LIBRE', 'Flete al cliente', 1, 'unidad', 35, false);
  perform comercial.emitir_cotizacion(c1);

  -- Uso interno, partiendo de un producto de ejemplo.
  select id into prod from gmp.productos where contenido_neto is not null order by codigo_interno limit 1;
  insert into comercial.cotizaciones (titulo, destino, fija, margen_objetivo, vigencia_dias)
  values ('Revisión de precio (uso interno)', 'INTERNO', 'MARGEN', 0.4, 7) returning id into c2;
  if prod is not null then
    perform comercial.lineas_desde_producto(c2, prod);
  end if;
  raise notice 'Costos de práctica (Fase 5): 2 cotizaciones.';
end;
$$;

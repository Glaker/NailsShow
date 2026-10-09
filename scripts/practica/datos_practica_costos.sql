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

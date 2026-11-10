-- ---------------------------------------------------------------------------
-- Propósito : Los productos que la lista mayorista tenía como «código PACK»
--             (80PACK, 82PACK, …) pasan a venderse por unidad con su código
--             numérico (80, 82, …): entra a la lista el producto unitario con
--             el mismo precio por unidad, rubro y orden, y el PACK se retira.
-- Reglas    : §4.12.1 (lista mayorista append-only).
-- Fecha     : 2026-11-10
-- ---------------------------------------------------------------------------
--
-- Pedido de Administración del 2026-11-10: «todos los productos que figuran
-- como Código Pack en la lista pasen a mostrarse únicamente con su código
-- numérico; se identifican y comercializan por unidad, no como packs».
--
-- El precio de la lista es por unidad (comentario de la tabla), así que el
-- unitario hereda precio_lista y precio_promo del PACK con unidades_pack = 1,
-- y el tamaño del pack queda como mínimo (pedido del 2026-11-10: «indicados en
-- la columna mínimo»).
-- Los pedidos de venta sin aprobar con códigos PACK pasan a unidades: el
-- renglón PACK × n se anula y el unitario suma n × pack (precio a mano, si lo
-- había, dividido por el pack). Uno con fecha propuesta vuelve a esperar fecha
-- (fn_renglon_reconfirma_fecha). Los aprobados no se tocan: tienen foto,
-- pedidos de stock y despacho atados al PACK.
-- 632PACK y 633PACK (surtidos de 75 y 45 unidades) no tienen un código
-- numérico propio: quedan como están hasta que se defina qué hacer con ellos.
-- A nombre de Administración, como las demás cargas de la lista.

do $$
declare
  v_adm uuid;
  v_n   integer;
  v_r   integer := 0;
  r     record;
begin
  select id into v_adm
    from core.usuarios
   where email = 'nailshowargentina@hotmail.com' and rol = 'ADMINISTRACION' and activo;
  if v_adm is null then
    raise exception 'No está activa la cuenta de Administración (nailshowargentina@hotmail.com), a cuyo nombre va el cambio.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_adm::text, 'rol', 'ADMINISTRACION',
                      'roles', json_build_array('ADMINISTRACION'))::text,
    true
  );

  create temp table pack_a_unidad on commit drop as
  select l.producto_id as pack_id, u.id as unidad_id, p.codigo_interno as pack, l.unidades_pack as n
    from comercial.v_lista_mayorista l
    join gmp.productos p on p.id = l.producto_id
    join gmp.productos u on u.codigo_interno = regexp_replace(p.codigo_interno, '(?i)pack$', '')
   where p.codigo_interno ~* '^[0-9]+pack$';

  -- El unitario entra a la lista con lo del PACK, por unidad.
  insert into comercial.lista_mayorista
    (producto_id, numero_lista, rubro, orden_lista, precio_lista, precio_promo, unidades_pack,
     minimo, es_regalo, alicuota_iva, origen)
  select t.unidad_id, l.numero_lista, l.rubro, l.orden_lista, l.precio_lista, l.precio_promo, 1,
         nullif(t.n, 1), l.es_regalo, l.alicuota_iva, format('Venta por unidad: antes %s (2026-11-10)', t.pack)
    from pack_a_unidad t
    join comercial.v_lista_mayorista l on l.producto_id = t.pack_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'No se encontró ningún código PACK con su unitario en la lista.';
  end if;

  -- Pedidos de venta sin aprobar: PACK × n pasa a unitario × n·pack. Con el
  -- unitario ya en la lista, el alta toma su precio (trg_renglon_precio_mayorista).
  for r in
    select rr.id, rr.pedido_id, rr.cantidad, rr.precio_manual, rr.precio_final,
           rr.descuento_caja_pct, rr.cantidad_caja, t.unidad_id, t.n
      from comercial.pedido_renglones rr
      join comercial.pedidos pe on pe.id = rr.pedido_id
      join pack_a_unidad t on t.pack_id = rr.producto_id
     where not rr.anulado and pe.es_venta and pe.eliminado_en is null
       and pe.estado in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA')
     order by rr.pedido_id, rr.id
  loop
    update comercial.pedido_renglones set anulado = true where id = r.id;
    update comercial.pedido_renglones
       set cantidad = cantidad + r.cantidad * r.n,
           cantidad_caja = case when cantidad_caja is null and r.cantidad_caja is null then null
                                else coalesce(cantidad_caja, 0) + coalesce(r.cantidad_caja, 0) * r.n end
     where pedido_id = r.pedido_id and producto_id = r.unidad_id and not anulado;
    if not found then
      insert into comercial.pedido_renglones
        (pedido_id, producto_id, cantidad, precio_manual, precio_final, descuento_caja_pct, cantidad_caja)
      values
        (r.pedido_id, r.unidad_id, r.cantidad * r.n, r.precio_manual,
         case when r.precio_manual then round(r.precio_final / r.n, 2) end,
         r.descuento_caja_pct, r.cantidad_caja * r.n);
    end if;
    v_r := v_r + 1;
  end loop;

  -- Y el PACK sale de la lista.
  insert into comercial.lista_mayorista
    (producto_id, numero_lista, rubro, orden_lista, precio_lista, precio_promo, unidades_pack,
     minimo, es_regalo, alicuota_iva, origen, retirado)
  select l.producto_id, l.numero_lista, l.rubro, l.orden_lista, l.precio_lista, l.precio_promo, l.unidades_pack,
         l.minimo, l.es_regalo, l.alicuota_iva, 'Se vende por unidad con el código numérico (2026-11-10)', true
    from pack_a_unidad t
    join comercial.lista_mayorista l on l.producto_id = t.pack_id
   where l.orden = (select max(x.orden) from comercial.lista_mayorista x where x.producto_id = t.pack_id);

  raise notice 'Pasaron a venta por unidad: % productos y % renglones de pedidos', v_n, v_r;
end;
$$;

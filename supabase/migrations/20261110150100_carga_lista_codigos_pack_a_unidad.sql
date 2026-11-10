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
-- unitario hereda precio_lista y precio_promo del PACK con unidades_pack = 1.
-- Los pedidos ya cargados con códigos PACK no se tocan: siguen en packs.
-- 632PACK y 633PACK (surtidos de 75 y 45 unidades) no tienen un código
-- numérico propio: quedan como están hasta que se defina qué hacer con ellos.
-- A nombre de Administración, como las demás cargas de la lista.

do $$
declare
  v_adm uuid;
  v_n   integer;
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
  select l.producto_id as pack_id, u.id as unidad_id, p.codigo_interno as pack
    from comercial.v_lista_mayorista l
    join gmp.productos p on p.id = l.producto_id
    join gmp.productos u on u.codigo_interno = regexp_replace(p.codigo_interno, '(?i)pack$', '')
   where p.codigo_interno ~* '^[0-9]+pack$';

  -- El unitario entra a la lista con lo del PACK, por unidad.
  insert into comercial.lista_mayorista
    (producto_id, numero_lista, rubro, orden_lista, precio_lista, precio_promo, unidades_pack,
     minimo, es_regalo, alicuota_iva, origen)
  select t.unidad_id, l.numero_lista, l.rubro, l.orden_lista, l.precio_lista, l.precio_promo, 1,
         null, l.es_regalo, l.alicuota_iva, format('Venta por unidad: antes %s (2026-11-10)', t.pack)
    from pack_a_unidad t
    join comercial.v_lista_mayorista l on l.producto_id = t.pack_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'No se encontró ningún código PACK con su unitario en la lista.';
  end if;

  -- Y el PACK sale de la lista.
  insert into comercial.lista_mayorista
    (producto_id, numero_lista, rubro, orden_lista, precio_lista, precio_promo, unidades_pack,
     minimo, es_regalo, alicuota_iva, origen, retirado)
  select l.producto_id, l.numero_lista, l.rubro, l.orden_lista, l.precio_lista, l.precio_promo, l.unidades_pack,
         l.minimo, l.es_regalo, l.alicuota_iva, 'Se vende por unidad con el código numérico (2026-11-10)', true
    from pack_a_unidad t
    join comercial.lista_mayorista l on l.producto_id = t.pack_id
   where l.orden = (select max(x.orden) from comercial.lista_mayorista x where x.producto_id = t.pack_id);

  raise notice 'Pasaron a venta por unidad: %', v_n;
end;
$$;

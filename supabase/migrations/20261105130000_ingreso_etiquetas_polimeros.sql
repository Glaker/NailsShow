-- ---------------------------------------------------------------------------
-- Propósito : Ingreso de etiquetas de polímeros (78 a 100) que llegaron a
--             planta: se SUMAN al saldo de cada etiqueta. Alta de 078ET y
--             079ET (Vía Láctea), que no estaban en el catálogo, y su
--             asignación como etiqueta de los productos 78 y 79.
-- Reglas    : RN-50, RN-54, §3.3 «Ajustar stock por diferencia de inventario».
-- Fecha     : 2026-11-05
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico (2026-11-05): las cantidades son lo que entró,
-- no un conteo total. Se asienta con comercial.registrar_conteo pasando
-- «saldo actual + lo que entró», así el ajuste registrado es exactamente lo que
-- entró, en el lote de saldo de apertura de cada etiqueta, a nombre de la DT
-- suplente como 20261104150000. Guarda: si falta alguna etiqueta o algún
-- producto, no se carga nada.

do $$
declare
  v_dt        uuid;
  v_migracion uuid;
  v_obs       constant text := 'Ingreso de etiquetas de polímeros (se suman al saldo), 2026-11-05';
  v_saldo     numeric(16,4);
  v_faltan    text;
  r           record;
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
    raise exception 'No hay carga de saldo de apertura: el ingreso no tiene lote donde asentarse.';
  end if;

  create temp table ingreso_etiquetas on commit drop as
  select * from (values
      ('078ET', '78',  'VIA LACTEA 14GR', 4500),
      ('079ET', '79',  'VIA LACTEA 45GR', 5500),
      ('080ET', '80',  null, 700),
      ('082ET', '82',  null, 4000),
      ('083ET', '83',  null, 3000),
      ('085ET', '85',  null, 3500),
      ('086ET', '86',  null, 4000),
      ('087ET', '87',  null, 2000),
      ('088ET', '88',  null, 1500),
      ('089ET', '89',  null, 700),
      ('090ET', '90',  null, 3700),
      ('091ET', '91',  null, 3000),
      ('093ET', '93',  null, 700),
      ('095ET', '95',  null, 3000),
      ('096ET', '96',  null, 1200),
      ('098ET', '98',  null, 2500),
      ('099ET', '99',  null, 4500),
      ('100ET', '100', null, 2000)
  ) as t (codigo, producto, nombre_nuevo, cantidad);

  -- Alta de las que faltan (solo 078ET y 079ET traen nombre).
  insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
  select t.codigo, t.nombre_nuevo, 'ETIQUETA', 'UNIDAD'
    from ingreso_etiquetas t
   where t.nombre_nuevo is not null
     and not exists (select 1 from gmp.insumos_catalogo i where i.codigo_interno = t.codigo);

  select string_agg(t.codigo, ', ') into v_faltan
    from ingreso_etiquetas t
   where not exists (select 1 from gmp.insumos_catalogo i
                      where i.codigo_interno = t.codigo and i.tipo = 'ETIQUETA' and i.unidad_medida = 'UNIDAD')
      or not exists (select 1 from gmp.productos p where p.codigo_interno = t.producto);
  if v_faltan is not null then
    raise exception 'Faltan en el catálogo (etiqueta en UNIDAD o su producto): %', v_faltan;
  end if;

  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id, cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, unidad
  )
  select i.id, 'SALDO_APERTURA', v_migracion, 0, true,
         'SALDO DE APERTURA — sin cantidad declarada (ingreso de etiquetas de polímeros 2026-11-05)', i.unidad_medida
    from ingreso_etiquetas t
    join gmp.insumos_catalogo i on i.codigo_interno = t.codigo
   where not exists (
       select 1 from gmp.lotes_insumo l
        where l.insumo_id = i.id and l.estado = 'SALDO_APERTURA' and l.unidad = i.unidad_medida
     );

  -- 78 y 79 llevan su etiqueta (no tenían ninguna asignada).
  insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol)
  select p.id, i.id, 1, 'ETIQUETA'
    from ingreso_etiquetas t
    join gmp.insumos_catalogo i on i.codigo_interno = t.codigo
    join gmp.productos p on p.codigo_interno = t.producto
   where t.nombre_nuevo is not null
     and not exists (select 1 from gmp.materiales_acondicionamiento m
                      where m.producto_id = p.id and m.activo and m.rol = 'ETIQUETA');

  for r in
    select i.id, t.cantidad
      from ingreso_etiquetas t
      join gmp.insumos_catalogo i on i.codigo_interno = t.codigo
  loop
    select coalesce(sum(s.saldo), 0) into v_saldo
      from comercial.v_saldos_stock s
     where s.articulo_id = comercial.articulo_de_insumo(r.id);
    perform comercial.registrar_conteo(r.id, v_saldo + r.cantidad, v_obs, false);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Propósito : Stock de etiquetas de cleanser (384, 385, 386), removedor (192,
--             195) y monómero (101, 102) que pasó el codirector técnico. Las
--             siete estaban en 0, así que se suma lo indicado al saldo.
-- Reglas    : RN-50, RN-54, §3.3 «Ajustar stock por diferencia de inventario».
-- Fecha     : 2026-11-06
-- ---------------------------------------------------------------------------
--
-- Mismo mecanismo que 20261105130000: comercial.registrar_conteo con «saldo
-- actual + cantidad» sobre el lote de saldo de apertura de cada etiqueta, a
-- nombre de la DT suplente. Guarda: si falta alguna etiqueta, no se carga nada.
-- Con 192ET cargada se destraba la tanda del removedor 120 ml.

do $$
declare
  v_dt        uuid;
  v_migracion uuid;
  v_obs       constant text := 'Stock de etiquetas informado por el codirector técnico, 2026-11-06';
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
    raise exception 'No hay carga de saldo de apertura: el stock no tiene lote donde asentarse.';
  end if;

  create temp table stock_etiquetas on commit drop as
  select * from (values
      ('384ET', 3600),
      ('192ET', 2700),
      ('195ET', 1700),
      ('386ET', 2250),
      ('385ET', 3828),
      ('101ET', 3510),
      ('102ET', 6475)
  ) as t (codigo, cantidad);

  select string_agg(t.codigo, ', ') into v_faltan
    from stock_etiquetas t
   where not exists (select 1 from gmp.insumos_catalogo i
                      where i.codigo_interno = t.codigo and i.tipo = 'ETIQUETA' and i.unidad_medida = 'UNIDAD');
  if v_faltan is not null then
    raise exception 'Faltan en el catálogo (etiqueta en UNIDAD): %', v_faltan;
  end if;

  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id, cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, unidad
  )
  select i.id, 'SALDO_APERTURA', v_migracion, 0, true,
         'SALDO DE APERTURA — sin cantidad declarada (stock de etiquetas 2026-11-06)', i.unidad_medida
    from stock_etiquetas t
    join gmp.insumos_catalogo i on i.codigo_interno = t.codigo
   where not exists (
       select 1 from gmp.lotes_insumo l
        where l.insumo_id = i.id and l.estado = 'SALDO_APERTURA' and l.unidad = i.unidad_medida
     );

  for r in
    select i.id, t.cantidad
      from stock_etiquetas t
      join gmp.insumos_catalogo i on i.codigo_interno = t.codigo
  loop
    select coalesce(sum(s.saldo), 0) into v_saldo
      from comercial.v_saldos_stock s
     where s.articulo_id = comercial.articulo_de_insumo(r.id);
    perform comercial.registrar_conteo(r.id, v_saldo + r.cantidad, v_obs, false);
  end loop;
end;
$$;

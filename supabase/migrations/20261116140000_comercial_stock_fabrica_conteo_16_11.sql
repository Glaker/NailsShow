-- ---------------------------------------------------------------------------
-- Propósito : Llevar el stock de producto terminado de fábrica (PTF) al conteo
--             que pasó el codirector técnico el 16/11/2026 para 38 productos.
--             Coinciden 8; se corrigen 30.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditados). Pedido del codirector técnico del
--             2026-11-16.
-- Fecha     : 2026-11-16
-- ---------------------------------------------------------------------------
--
-- Solo los productos de la lista; el resto de PTF no se toca. El ajuste es
-- (conteo) − (saldo de PTF al aplicar). Entradas como ENTRADA_AJUSTE (sin
-- lote); salidas como SALIDA_AJUSTE, primero de los lotes con saldo (el
-- trigger reparte) y lo que falte sin lote. Ningún producto queda negativo,
-- así que el control de stock no negativo sigue prendido. No hay reservas en
-- PTF para estos productos (consultado el 2026-11-16).
--
-- A nombre de Administración, como 20261116130000.

do $$
declare
  v_adm    uuid;
  v_ptf    uuid;
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

  select id into v_ptf from gmp.depositos where numero = 'PTF' and activo;
  if v_ptf is null then
    raise exception 'No existe el depósito de fábrica (PTF).';
  end if;

  create temp table conteo_fabrica on commit drop as
  select * from (values
      ('95', 264), ('99', 268), ('79', 138), ('96', 117), ('100', 225), ('98', 151),
      ('88', 42), ('92', 65), ('89', 9), ('91', 14),
      ('192', 906), ('195', 96), ('386', 8), ('371', 200), ('374', 392), ('375', 96),
      ('373', 98), ('380', 138), ('378', 364), ('247', 380), ('252', 72), ('162', 118),
      ('333', 6), ('166', 87), ('161', 144),
      ('396', 360), ('394', 192), ('391', 412), ('393', 200), ('395', 160), ('NS-398', 15),
      ('377', 447), ('105', 117), ('514', 1250), ('234', 500), ('236', 399), ('237', 500),
      ('339', 72)
  ) as t (codigo, cantidad);

  select string_agg(t.codigo, ', ') into v_falta
    from conteo_fabrica t
   where not exists (select 1 from gmp.productos p where p.codigo_interno = t.codigo);
  if v_falta is not null then
    raise exception 'Faltan en el catálogo: %', v_falta;
  end if;

  for r in
    select p.id, t.codigo, t.cantidad::numeric as cantidad
      from conteo_fabrica t join gmp.productos p on p.codigo_interno = t.codigo
     order by t.codigo
  loop
    select coalesce(sum(cantidad), 0) into v_saldo
      from comercial.movimientos_pt where deposito_id = v_ptf and producto_id = r.id;
    v_dif := r.cantidad - v_saldo;
    continue when v_dif = 0;
    v_motivo := format(
      'Conteo de fábrica del 16/11/2026: %s; había %s. Cargado por Claude a pedido del codirector técnico, 2026-11-16.',
      trim_scale(r.cantidad), trim_scale(v_saldo));

    if v_dif > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ptf, 'ENTRADA_AJUSTE', v_dif, v_motivo, 'CONTEO_PT');
      continue;
    end if;

    -- Sale primero de los lotes con saldo; lo que falte, sin lote.
    select coalesce(sum(s), 0) into v_lotes
      from (select sum(cantidad) s from comercial.movimientos_pt
             where deposito_id = v_ptf and producto_id = r.id
             group by orden_id having sum(cantidad) > 0) g;
    v_hay := least(-v_dif, v_lotes);
    if v_hay > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ptf, 'SALIDA_AJUSTE', -v_hay, v_motivo, 'CONTEO_PT');
    end if;
    if -v_dif > v_hay then
      perform set_config('comercial.lote_pt_asignado', '1', true);
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ptf, 'SALIDA_AJUSTE', -(-v_dif - v_hay), v_motivo, 'CONTEO_PT');
      perform set_config('comercial.lote_pt_asignado', '', true);
    end if;
  end loop;
end;
$$;

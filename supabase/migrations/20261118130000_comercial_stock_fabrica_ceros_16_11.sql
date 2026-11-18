-- ---------------------------------------------------------------------------
-- Propósito : Completar el conteo de fábrica (PTF) del 16/11/2026
--             (20261116140000): los productos que no estaban en la lista
--             tenían 0 ese día. Se llevan a 0 al momento del conteo; lo que
--             se movió después queda encima.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditados). Pedido del codirector técnico del
--             2026-11-18.
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------
--
-- Corte: el primer movimiento de 20261116140000 (16/11 13:20 hora argentina).
-- Para cada producto de PTF fuera de la lista, ajuste = −(saldo de PTF antes
-- del corte). La base pone ocurrido_en = now(): el movimiento queda con fecha
-- de hoy y el motivo cita el conteo. Consultado el 2026-11-18: 13 productos
-- (318, 364-368, 370, 372, 384, 385, 392, DUO01, NS-399), ninguno movido
-- después del corte, así que ninguno queda negativo. DUO01 tiene una reserva
-- vigente de 11 en PTF (hecha después del conteo) que no se toca aquí.
--
-- A nombre de Administración, como 20261116140000.

do $$
declare
  v_adm    uuid;
  v_ptf    uuid;
  v_corte  timestamptz;
  r        record;
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

  select min(ocurrido_en) into v_corte
    from comercial.movimientos_pt
   where deposito_id = v_ptf and documento_tipo = 'CONTEO_PT'
     and motivo like 'Conteo de fábrica del 16/11/2026:%';
  if v_corte is null then
    raise exception 'No está aplicado el conteo de fábrica del 16/11 (20261116140000).';
  end if;

  for r in
    select p.id, p.codigo_interno, sum(m.cantidad) as saldo
      from comercial.movimientos_pt m join gmp.productos p on p.id = m.producto_id
     where m.deposito_id = v_ptf and m.ocurrido_en < v_corte
       and p.codigo_interno not in (
         '95','99','79','96','100','98','88','92','89','91',
         '192','195','386','371','374','375','373','380','378','247','252','162',
         '333','166','161',
         '396','394','391','393','395','NS-398',
         '377','105','514','234','236','237','339')
     group by p.id, p.codigo_interno
    having sum(m.cantidad) <> 0
     order by p.codigo_interno
  loop
    v_motivo := format(
      'Conteo de fábrica del 16/11/2026: 0 (no figuraba en la lista); había %s. Cargado por Claude a pedido del codirector técnico, 2026-11-18.',
      trim_scale(r.saldo));

    if r.saldo < 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ptf, 'ENTRADA_AJUSTE', -r.saldo, v_motivo, 'CONTEO_PT');
      continue;
    end if;

    -- Sale primero de los lotes con saldo; lo que falte, sin lote.
    select coalesce(sum(s), 0) into v_lotes
      from (select sum(cantidad) s from comercial.movimientos_pt
             where deposito_id = v_ptf and producto_id = r.id
             group by orden_id having sum(cantidad) > 0) g;
    v_hay := least(r.saldo, v_lotes);
    if v_hay > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ptf, 'SALIDA_AJUSTE', -v_hay, v_motivo, 'CONTEO_PT');
    end if;
    if r.saldo > v_hay then
      perform set_config('comercial.lote_pt_asignado', '1', true);
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.id, v_ptf, 'SALIDA_AJUSTE', -(r.saldo - v_hay), v_motivo, 'CONTEO_PT');
      perform set_config('comercial.lote_pt_asignado', '', true);
    end if;
  end loop;
end;
$$;

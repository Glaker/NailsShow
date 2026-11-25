-- ---------------------------------------------------------------------------
-- Propósito : Sacar de fábrica (PTF) los 14 «91 COVER PINK PRINCESS 14GRM»
--             que entraron con el conteo del 16/11 (20261116140000). La lista
--             decía «#91 natural: 14»: el nombre era el del rosado natural
--             (81), no el del 91. Naza confirma que en fábrica no hay Princess.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditados). Pedido del codirector técnico del
--             2026-11-25.
-- Fecha     : 2026-11-25
-- ---------------------------------------------------------------------------
--
-- El 81 no se toca: el 18/11 entraron 14 a PTF como devolución y salieron a
-- Berna, que son esos mismos 14 del conteo. El 91 no tiene otro movimiento en
-- PTF (consultado el 2026-11-25): la salida es de los 14 sin lote.
--
-- A nombre de Administración, como 20261116140000.

do $$
declare
  v_adm   uuid;
  v_ptf   uuid;
  v_prod  uuid;
  v_saldo numeric;
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
  select id into v_prod from gmp.productos where codigo_interno = '91';
  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt where deposito_id = v_ptf and producto_id = v_prod;
  if v_saldo <> 14 then
    raise exception 'El 91 tiene % en PTF y se esperaban 14: revisar antes de aplicar.', v_saldo;
  end if;

  perform set_config('comercial.lote_pt_asignado', '1', true);
  insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
  values (v_prod, v_ptf, 'SALIDA_AJUSTE', -14,
          'Conteo de fábrica del 16/11/2026: el renglón «#91 natural: 14» era el rosado natural (81), no '
          'el 91 Princess, que no hay en fábrica (confirmado por Naza). Cargado por Claude a pedido del '
          'codirector técnico, 2026-11-25.',
          'CONTEO_PT');
  perform set_config('comercial.lote_pt_asignado', '', true);
end;
$$;

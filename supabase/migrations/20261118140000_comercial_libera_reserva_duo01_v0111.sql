-- ---------------------------------------------------------------------------
-- Propósito : Liberar la reserva de 11 DUO01 en fábrica (PTF) del pedido
--             V-0111. Se hizo el 16/11 después del conteo, contra stock que
--             no existía (20261118130000 llevó DUO01 de PTF a 0). El renglón
--             del pedido queda, sin reserva: no hay stock.
-- Reglas    : RN-54 (la reserva no se borra: se libera con motivo), RN-50
--             (auditado). Pedido y autorización del codirector técnico del
--             2026-11-18.
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------

do $$
declare
  v_adm uuid;
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

  update comercial.reservas_pt r
     set liberada = true, liberada_en = now(), liberada_por = v_adm,
         motivo_liberacion = 'Sin stock: DUO01 en fábrica era 0 en el conteo del 16/11/2026 y la reserva se hizo después. '
                             'Liberada por Claude a pedido del codirector técnico, 2026-11-18.'
    from comercial.pedidos pe, gmp.productos p, gmp.depositos d
   where r.id = '7bf24862-ea7a-4a67-a563-6b058af19659'
     and pe.id = r.pedido_id and pe.numero = 'V-0111'
     and p.id = r.producto_id and p.codigo_interno = 'DUO01'
     and d.id = r.deposito_id and d.numero = 'PTF'
     and not r.liberada and r.consumido = 0;
  if not found then
    raise exception 'La reserva de DUO01 del V-0111 en PTF ya no está vigente o cambió.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Propósito : El removedor de 120 ml (192) pedía el granel dos veces al
--             cargar una tanda: por la fórmula (192REM «csp», más aloe y
--             enmascarante en %) y por la lista de qué lleva cada unidad
--             (120 ml de 192REM, 0,146 g de aloe, 0,136 g de enmascarante,
--             importados de la planilla de costos C.V.D.). Con 2200 unidades
--             pedía 536.973 ml en vez de ~273.000. Se quitan de la lista
--             los tres insumos que ya están en la fórmula vigente.
-- Reglas    : RN-50 (queda en core.auditoria), 20260930130000 (quitar =
--             activo false, sin DELETE).
-- Fecha     : 2026-11-05
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico (2026-11-05). Es el único producto con un
-- material repetido en su fórmula vigente (consultado ese día). Guarda: si no
-- son exactamente esas tres filas, no se toca nada.

do $$
declare
  v_dt uuid;
  v_n  integer;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com).';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  update gmp.materiales_acondicionamiento m
     set activo = false
    from gmp.productos p, gmp.insumos_catalogo i
   where p.id = m.producto_id and i.id = m.insumo_id
     and p.codigo_interno = '192'
     and i.codigo_interno in ('192REM', '192ALOE', '192ENM')
     and m.activo;
  get diagnostics v_n = row_count;
  if v_n <> 3 then
    raise exception 'Se esperaban 3 materiales repetidos del removedor 120 ml y hay %: revisar antes de aplicar.', v_n;
  end if;
end;
$$;

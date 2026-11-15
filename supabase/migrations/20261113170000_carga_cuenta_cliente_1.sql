-- ---------------------------------------------------------------------------
-- Propósito : Habilitar mdalonso310502@gmail.com como segunda cuenta de
--             demostración del portal de clientes, «Cliente 1». La cuenta se
--             dio de alta con el registro común el 2026-11-13.
-- Reglas    : RN-49, D-portal-clientes-1 (provisorio).
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- Igual que 20261112130100: rol CLIENTE, activa y es_ejemplo. El hook la emite
-- con es_demo y el portal le muestra pedidos de ejemplo que no se guardan. No
-- se vincula a ningún cliente, así que no puede escribir pedidos. El cambio
-- queda a nombre de la cuenta de verificación (Administrador del sistema).

do $$
declare
  v_sis uuid;
  v_n   integer;
begin
  select id into v_sis
    from core.usuarios
   where email = 'verificacion@nailshow.com.ar' and rol = 'ADMINISTRADOR_SISTEMA' and activo;
  if v_sis is null then
    raise exception 'No está activa la cuenta de verificación (ADMINISTRADOR_SISTEMA), a cuyo nombre va el cambio.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_sis::text, 'rol', 'ADMINISTRADOR_SISTEMA',
                      'roles', json_build_array('ADMINISTRADOR_SISTEMA'))::text,
    true
  );

  update core.usuarios
     set rol = 'CLIENTE', roles_adicionales = '{}', activo = true, fecha_baja = null,
         es_ejemplo = true, nombre_completo = 'Cliente 1'
   where email = 'mdalonso310502@gmail.com';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'No está dada de alta la cuenta mdalonso310502@gmail.com (registrarla primero).';
  end if;
end;
$$;

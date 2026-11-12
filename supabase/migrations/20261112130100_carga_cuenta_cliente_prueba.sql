-- ---------------------------------------------------------------------------
-- Propósito : Habilitar la cuenta de demostración del portal de clientes
--             (cliente.prueba@nailshow.com.ar), dada de alta por el registro
--             común el 2026-11-12.
-- Reglas    : RN-49, D-portal-clientes-1 (provisorio).
-- Fecha     : 2026-11-12
-- ---------------------------------------------------------------------------
--
-- Rol CLIENTE, activa y marcada es_ejemplo: el hook la emite con es_demo y el
-- portal le muestra pedidos de ejemplo que no se guardan (20261112130000).
-- No se vincula a ningún cliente: no puede escribir pedidos. A nombre de la
-- cuenta de verificación (Administrador del sistema), que es quien habilita
-- cuentas. La contraseña no está acá: se entregó aparte.

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
         es_ejemplo = true, nombre_completo = 'Cliente de prueba'
   where email = 'cliente.prueba@nailshow.com.ar';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'No está dada de alta la cuenta cliente.prueba@nailshow.com.ar (registrarla primero).';
  end if;
end;
$$;

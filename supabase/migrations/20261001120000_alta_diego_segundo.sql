-- ---------------------------------------------------------------------------
-- Propósito : Habilitar la cuenta de Diego Segundo con rol ADMINISTRACION,
--             creada el 2026-10-01 por el registro de Supabase Auth. Queda en
--             el repositorio para que la asignación de permisos tenga
--             historial, como 20260911190000 y 20260924120000.
-- Reglas    : §3.3 (matriz de permisos). RN-49 / invariante 9: el usuario no se
--             borra, se desactiva; acá se hace lo inverso, se activa.
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------
--
-- El registro abierto da de alta como OPERARIO desactivado
-- (core.fn_alta_usuario_auth); en el alta eligió sector DEPOSITO, que no es el
-- suyo. ADMINISTRACION le da el inicio de Administración, tesorería, cuentas
-- corrientes, pagos, cobros y facturas; no ve auditoría ni la nómina completa.
--
-- Por email y sin RAISE: en una base reconstruida desde cero la cuenta no
-- existe y la migración no hace nada, igual que la de Nazarena.

update core.usuarios
   set rol        = 'ADMINISTRACION',
       sector     = 'ADMINISTRACION',
       activo     = true,
       fecha_baja = null
 where email = 'nailshowargentina@hotmail.com';

-- ---------------------------------------------------------------------------
-- Propósito : Habilitar las cuentas de Agustina Sierra (VENTAS, igual que
--             Mati) y Stefania Silveira (ENCARGADA_STOCK), creadas por el
--             registro de Supabase Auth el 2026-10-15 y el 2026-10-20 y que
--             quedaron como OPERARIO inactivo. Con esos roles cargan producto
--             terminado en Calle 5 («Contar» y «Entró»): la política
--             movimientos_pt_insert_stock ya los incluye (20260929140100).
-- Reglas    : §3.3 (matriz de permisos). RN-49 / invariante 9: el usuario no
--             se borra, se desactiva; acá se activa. Pedido del 2026-10-22.
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- Por email y sin RAISE, como 20261014200000: en una base reconstruida desde
-- cero las cuentas no existen y esto no hace nada.

update core.usuarios
   set rol        = 'VENTAS',
       sector     = 'ADMINISTRACION',
       activo     = true,
       fecha_baja = null
 where email = 'administracion@nailshow.com.ar';

update core.usuarios
   set rol        = 'ENCARGADA_STOCK',
       sector     = 'DEPOSITO',
       activo     = true,
       fecha_baja = null
 where email = 'stefaniasilveira94@gmail.com';

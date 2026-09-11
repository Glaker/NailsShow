-- ---------------------------------------------------------------------------
-- Propósito : Asignar rol y sector a la cuenta de Nazarena, gerenta de
--             producción, creada el 2026-09-11 por el registro de Supabase
--             Auth. Queda en el repositorio para que la asignación de permisos
--             tenga historial: quién recibió qué rol y cuándo.
-- Reglas    : §3.3 (matriz de permisos). RN-49 / invariante 9: el usuario no se
--             borra, se desactiva; acá se hace lo inverso, se activa.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- El registro abierto da de alta como OPERARIO desactivado (ver
-- core.fn_alta_usuario_auth): el rol nunca se lee de los metadatos del alta,
-- porque con registro abierto eso sería dejar que cada uno elija su permiso.
-- La promoción es un acto administrativo aparte, y este archivo es ese acto.
--
-- GERENCIA_PRODUCCION es el rol pedido: maneja el stock. §3.3 ya se lo da —
-- alta y edición de artículos, y registro de movimientos de stock
-- (`movimientos_stock_insert_stock`)— y también alta de proveedor y maestros
-- técnicos junto a Dirección Técnica. Lo que NO le da, y era la otra mitad del
-- pedido:
--
--   - `core.auditoria`: `auditoria_select_supervision` la limita a DT, GERENCIA
--     y ADMINISTRADOR_SISTEMA. GERENCIA_PRODUCCION no está. Ya era así.
--   - `core.usuarios`: hasta hoy la nómina era legible por cualquier rol con
--     sesión. La migración 20260911180000 la cerró a DT, GERENCIA y SYS, más la
--     ficha propia de cada uno. Los nombres de autor que las pantallas
--     necesitan se resuelven por `core.v_nomina`, que no expone la ficha.
--
-- Se identifica por email y no por uuid: el uuid lo generó Auth en el proyecto
-- alojado y no existiría en una base reconstruida desde cero. Si la fila no
-- está, el UPDATE no afecta ninguna y la migración es un no-op, que es el
-- comportamiento correcto para una base sin esa cuenta.

update core.usuarios
   set rol        = 'GERENCIA_PRODUCCION',
       sector     = 'PRODUCCION',
       activo     = true,
       fecha_baja = null
 where email = 'naza@nailshow.com';

-- La contraseña de esta cuenta se transmitió por chat, igual que la de
-- `verificacion@nailshow.com.ar`. **Hay que rotarla** en el primer ingreso:
-- una credencial que quedó en un transcript no es una credencial.

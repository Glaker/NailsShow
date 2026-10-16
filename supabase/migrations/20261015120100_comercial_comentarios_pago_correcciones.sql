-- ---------------------------------------------------------------------------
-- Propósito : Correcciones de la revisión de 20261015120000 (comentarios en
--             solicitudes de pago):
--             1. El Administrador del sistema ve todas las solicitudes, pero
--                su acceso es de lectura (§3.5): no comenta.
--             2. Índice sobre la clave foránea `autor`.
--             3. La función de trigger no se ejecuta desde PUBLIC ni anon.
-- Reglas    : §2.2 del documento de Administración, §3.5 (lectura del
--             Administrador del sistema), RN-50. Decisiones D-sesion-15-oct-1
--             y D-sesion-15-oct-2.
-- Fecha     : 2026-10-15
-- ---------------------------------------------------------------------------

comment on policy solicitudes_pago_select_propias on comercial.solicitudes_pago is
  '§2.2: cada uno ve las suyas; Administración, Gerencia y Gerencia de Producción todas (pedido del 2026-10-15); '
  'el Administrador del sistema todas, en lectura (§3.5).';

-- 1. Comenta quien ve la solicitud por ser su solicitante o por su rol de
--    gestión; no el Administrador del sistema, que solo lee.
alter policy comentarios_solicitud_pago_insert_quien_ve on comercial.comentarios_solicitud_pago
  with check (autor = core.usuario_actual()
              and exists (select 1 from comercial.solicitudes_pago s
                           where s.id = solicitud_id
                             and (s.solicitante = core.usuario_actual()
                                  or core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION'))));

comment on policy comentarios_solicitud_pago_insert_quien_ve on comercial.comentarios_solicitud_pago is
  'Comenta, a su nombre, el solicitante o Administración, Gerencia y Gerencia de Producción (§2.2, RN-50). '
  'El Administrador del sistema ve la solicitud pero no comenta: su acceso es de lectura (§3.5).';

-- 2. Índice de la clave foránea.
create index comentarios_solicitud_pago_autor_idx
  on comercial.comentarios_solicitud_pago (autor);

-- 3. Como las demás funciones de trigger del esquema.
revoke execute on function comercial.fn_comentario_solicitud_sello() from public, anon;

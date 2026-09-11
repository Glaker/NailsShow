-- ---------------------------------------------------------------------------
-- Propósito : Que la nómina de usuarios deje de ser legible por cualquier rol,
--             sin perder la resolución del nombre del autor que la
--             trazabilidad exige en cada registro.
-- Reglas    : §3.3 (la administración de usuarios es de SYS; la supervisión, de
--             DT y GERENCIA). RN-50 y §5.1: todo registro muestra quién lo
--             firmó. Invariante 9 / RN-49 no se tocan.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- LA POLÍTICA QUE SE REEMPLAZA Y POR QUÉ EXISTÍA.
-- `usuarios_select_authenticated` daba SELECT sobre `core.usuarios` a todo
-- usuario con sesión. El comentario que la acompañaba explica el motivo, y es
-- bueno: «cada registro del sistema muestra quién lo firmó, y sin poder
-- resolver el nombre del autor la pantalla muestra un uuid». O sea que la
-- apertura no se puso por descuido: se puso para sostener la trazabilidad.
--
-- El problema es que paga ese precio de más. Para poner «Nazarena Gómez» al pie
-- de un movimiento de stock hacen falta tres columnas —id, nombre y rol—, y la
-- política entregaba la ficha entera: documento, email, sector, fecha de baja,
-- si es DT titular, y la nómina completa de la empresa a cualquiera que sepa
-- pedirla por la API. Eso es «ver usuarios», y §3.3 no se lo da a todos.
--
-- LA SEPARACIÓN.
--   - `core.v_nomina`: id, nombre y rol. Es lo que la trazabilidad necesita
--     para no mostrar un uuid. La lee cualquier usuario con sesión.
--   - `core.usuarios`: la ficha. La leen DT, GERENCIA y SYS —los mismos que
--     §3.3 habilita a administrar y supervisar— y, además, cada uno la suya.
--
-- POR QUÉ `v_nomina` NO LLEVA `security_invoker`.
-- Sin esa opción la vista corre con los privilegios de su dueño y no aplica el
-- RLS de la tabla base, que es exactamente lo que se busca: es una ventana
-- angosta y deliberada, con tres columnas elegidas a mano. Si llevara
-- `security_invoker = true` volvería a depender de la política de
-- `core.usuarios` y no resolvería nada. No es un atajo de privilegio del tipo
-- que vigila CLAUDE.md §5: no hay `service_role` involucrado, no escribe, y lo
-- que expone —quién es quién— es lo que el sistema está obligado a mostrar.

create view core.v_nomina as
  select
    u.id,
    u.nombre_completo,
    u.rol,
    u.activo
  from core.usuarios u;

comment on view core.v_nomina is
  'Nómina mínima para resolver el autor de un registro: id, nombre, rol y si está activo. '
  'Deliberadamente sin security_invoker: es la ventana angosta que reemplaza el SELECT abierto sobre core.usuarios.';

grant select on core.v_nomina to authenticated;

-- ===========================================================================
-- La ficha completa deja de ser pública
-- ===========================================================================

drop policy usuarios_select_authenticated on core.usuarios;

-- CLAUDE.md §7: no se consulta core.usuarios dentro de una política de
-- core.usuarios. El rol sale del JWT y la identidad, de auth.uid().
create policy usuarios_select_administracion on core.usuarios
  for select to authenticated
  using (
    core.es_rol('DIRECCION_TECNICA', 'GERENCIA', 'ADMINISTRADOR_SISTEMA')
    or auth_user_id = (select auth.uid())
  );
comment on policy usuarios_select_administracion on core.usuarios is
  '§3.3: la ficha del personal la ven quienes administran (SYS) y supervisan (DT, GERENCIA). '
  'Cada usuario ve además la propia. El resto resuelve nombres por core.v_nomina, que no expone la ficha.';

-- ===========================================================================
-- Las vistas de trazabilidad pasan a resolver por la nómina
-- ===========================================================================
-- Las tres corren con security_invoker, así que hasta ahora heredaban el SELECT
-- abierto. Apuntadas a core.usuarios se quedarían sin nombre de autor para todo
-- rol que no sea DT, GERENCIA o SYS, que es justo lo contrario de lo que se
-- busca: el operario tiene que ver quién firmó, lo que no tiene que poder es
-- listar el personal.

-- gmp.v_muestreos: definición vigente traída de pg_get_viewdef, con el único
-- cambio de resolver el autor por core.v_nomina.
create or replace view gmp.v_muestreos with (security_invoker = true) as
 SELECT m.id,
    m.numero,
    m.entidad_tipo,
    m.entidad_id,
    m.categoria,
    m.cantidad_calculada,
    m.cantidad_tomada,
    m.unidad,
    m.justificacion_cantidad,
    m.contenedor_integro,
    m.contenedor_limpio,
    m.rotulado_correcto,
    m.lote_coincide_certificado,
    m.cantidad_contenedores_verificada,
    m.circunstancia_inusual,
    m.signos_no_conformidad,
    m.destino_sobrante,
    m.area_muestreo,
    m.fecha_hora,
    u.nombre_completo AS realizado_por_nombre,
    l.numero_registro_interno,
    l.lote_proveedor,
    i.nombre AS insumo_nombre,
    i.codigo_interno,
    p.razon_social AS proveedor,
    r.id AS rotulo_id
   FROM gmp.muestreos m
     JOIN core.v_nomina u ON u.id = m.realizado_por
     LEFT JOIN gmp.lotes_insumo l ON l.id = m.entidad_id AND m.entidad_tipo = 'lote_insumo'::text
     LEFT JOIN gmp.insumos_catalogo i ON i.id = l.insumo_id
     LEFT JOIN gmp.recepciones re ON re.id = l.recepcion_id
     LEFT JOIN gmp.proveedores p ON p.id = re.proveedor_id
     LEFT JOIN gmp.rotulos r ON r.entidad_tipo = 'muestreo'::text AND r.entidad_id = m.id;

-- gmp.v_bloqueos_lote: definición vigente traída de pg_get_viewdef, con el único
-- cambio de resolver el autor por core.v_nomina.
create or replace view gmp.v_bloqueos_lote with (security_invoker = true) as
 SELECT b.id,
    b.lote_insumo_id,
    l.numero_registro_interno,
    b.motivo,
    b.detalle,
    b.origen,
    b.origen_id,
    b.bloqueado_por,
    ub.nombre_completo AS bloqueado_por_nombre,
    b.bloqueado_en,
    b.levantado,
    b.levantado_motivo,
    b.levantado_por,
    ul.nombre_completo AS levantado_por_nombre,
    b.levantado_en
   FROM gmp.bloqueos_lote b
     JOIN gmp.lotes_insumo l ON l.id = b.lote_insumo_id
     JOIN core.v_nomina ub ON ub.id = b.bloqueado_por
     LEFT JOIN core.v_nomina ul ON ul.id = b.levantado_por;

-- comercial.v_kardex: definición vigente traída de pg_get_viewdef, con el único
-- cambio de resolver el autor por core.v_nomina.
create or replace view comercial.v_kardex with (security_invoker = true) as
 SELECT m.id,
    m.orden,
    m.ocurrido_en,
    m.articulo_id,
    a.sku,
    i.codigo_interno,
    i.nombre AS insumo_nombre,
    m.lote_insumo_id,
    l.numero_registro_interno,
    l.lote_proveedor,
    m.deposito_id,
    d.numero AS deposito_numero,
    d.nombre AS deposito_nombre,
    m.tipo,
    m.cantidad,
    m.unidad,
    sum(m.cantidad) OVER (PARTITION BY m.articulo_id, m.lote_insumo_id, m.deposito_id ORDER BY m.orden ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_posterior,
    m.motivo,
    m.transferencia_id,
    m.anula_a_movimiento_id,
    (EXISTS ( SELECT 1
           FROM comercial.movimientos_stock x
          WHERE x.anula_a_movimiento_id = m.id)) AS anulado,
    m.periodo,
    m.registrado_por,
    u.nombre_completo AS registrado_por_nombre
   FROM comercial.movimientos_stock m
     JOIN comercial.articulos a ON a.id = m.articulo_id
     JOIN gmp.insumos_catalogo i ON i.id = a.insumo_id
     JOIN gmp.lotes_insumo l ON l.id = m.lote_insumo_id
     JOIN gmp.depositos d ON d.id = m.deposito_id
     JOIN core.v_nomina u ON u.id = m.registrado_por;

-- ---------------------------------------------------------------------------
-- Propósito : Marcar como SOLO EJEMPLO el lote de ACEITE AMOR MATERIA PRIMA
--             recibido el 2026-10-14 (recepción 00001/2026), cargado para
--             probar el circuito. No se borra: se bloquea con motivo EJEMPLO.
-- Reglas    : Invariante 1 (no se borra un registro firmado: el lote está
--             APROBADO y tiene auditoría), RN-52. Pedido del codirector
--             técnico, 2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- QUÉ QUEDA PENDIENTE A MANO. La recepción tiene una Factura A de $557 a
-- nombre del proveedor, que suma deuda y crédito fiscal. Un comprobante se
-- anula con el usuario que lo anula (trigger de inmutabilidad): lo hace
-- Administración desde Cuentas de proveedores › «Anular», con motivo «carga de
-- prueba». Una migración no puede firmar esa anulación por nadie.
--
-- AUTOR. bloqueado_por es NOT NULL y una migración no tiene usuario: queda a
-- nombre del codirector técnico, que lo pidió. core.auditoria registra el rol
-- de base que escribió.
--
-- Por id y sin RAISE: en una base reconstruida desde cero el lote no existe y
-- no se hace nada.

insert into gmp.bloqueos_lote (lote_insumo_id, motivo, detalle, bloqueado_por)
select l.id, 'EJEMPLO',
       'SOLO EJEMPLO — NO VÁLIDO ANMAT. Lote cargado para probar el sistema; no corresponde a material real.',
       u.id
  from gmp.lotes_insumo l
  join core.usuarios u on u.email = 'salta.agustin@gmail.com'
 where l.id = '4e444811-9996-4d9e-9a83-f0ab4589e05d';

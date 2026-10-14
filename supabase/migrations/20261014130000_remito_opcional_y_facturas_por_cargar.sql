-- ---------------------------------------------------------------------------
-- Propósito : 1) El número de remito del proveedor pasa a ser opcional en la
--                recepción. 2) Vista de recepciones sin comprobante vigente,
--                para que Administración vea qué facturas faltan cargar.
-- Reglas    : RN-65 (recepción física y fiscal separadas: la fiscal puede
--             llegar después), I.20.1. Pedido del codirector técnico,
--             2026-10-14.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- REMITO OPCIONAL. Hay proveedores que entregan sin remito. Si viene, se
-- registra igual que antes; si no, la columna queda en NULL, no en texto
-- vacío ni «Sin remito». La inmutabilidad de la recepción no cambia
-- (fn de 20260904170000 compara con IS DISTINCT FROM, que trata bien el NULL).
--
-- FACTURAS POR CARGAR. Desde esta fecha el comprobante en la recepción es
-- opcional (no se le muestra a Dirección Técnica, y Gerencia de Producción
-- puede no cargarlo). Lo que no se cargó en la recepción lo tiene que cargar
-- Administración: esta vista es su lista de pendientes. Quedan afuera las
-- recepciones de tercerizados (el proveedor es el genérico del tercero: no hay
-- compra ni factura de Nail Show).

alter table gmp.recepciones alter column numero_remito drop not null;
alter table gmp.recepciones drop constraint recepciones_numero_remito_check;
alter table gmp.recepciones add constraint recepciones_numero_remito_check
  check (numero_remito is null or length(btrim(numero_remito)) > 0);

comment on column gmp.recepciones.numero_remito is
  'Número de remito del proveedor. Opcional desde 20261014130000: NULL si llegó sin remito.';

create view comercial.v_recepciones_sin_comprobante
with (security_invoker = true) as
select r.id as recepcion_id, r.numero, r.fecha_hora, r.numero_remito,
       r.proveedor_id, p.razon_social as proveedor,
       u.nombre_completo as registrada_por
  from gmp.recepciones r
  join gmp.proveedores p on p.id = r.proveedor_id
  left join core.usuarios u on u.id = r.registrado_por
 where p.tercero_id is null
   and not exists (
     select 1 from comercial.comprobantes_proveedor c
      where c.recepcion_id = r.id and c.anulado_en is null
   );

comment on view comercial.v_recepciones_sin_comprobante is
  'RN-65: recepciones sin comprobante vigente (ni factura ni «sin factura»), excluidos tercerizados. '
  'Pendientes de Administración en su inicio.';

grant select on comercial.v_recepciones_sin_comprobante to authenticated;

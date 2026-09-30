-- ---------------------------------------------------------------------------
-- Propósito : Trazabilidad completa de un lote producido: hacia atrás, qué
--             lotes de insumo se consumieron, de qué recepción y de qué
--             proveedor; hacia adelante, a qué cliente y cuándo se despachó.
-- Reglas    : §8.4 del alcance (trazabilidad bidireccional), PG.60.4 (un
--             retiro tiene que poder decir dónde está la mercadería),
--             invariante 7 (la vista vive en comercial y lee gmp). Ítem 12 de
--             la cola del 2026-09-24, que esperaba D-04 (R-08).
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- El vínculo entre la orden (gmp) y lo consumido y despachado (comercial) es
-- el pedido: comercial.pedido_ordenes (20260930110000). Una orden sin pedido
-- no tiene consumos registrados todavía («Terminado» es del pedido).

create view comercial.v_trazabilidad_orden
with (security_invoker = true) as
-- Hacia atrás: insumos consumidos, lote por lote.
select po.orden_id,
       'INSUMO'::text                  as sentido,
       m.ocurrido_en                   as momento,
       i.codigo_interno,
       i.nombre                        as articulo,
       -m.cantidad                     as cantidad,
       l.unidad,
       l.numero_registro_interno       as lote_interno,
       l.lote_proveedor,
       r.numero                        as recepcion,
       coalesce(pr.razon_social, 'Saldo de apertura') as contraparte,
       p.numero                        as pedido
  from comercial.pedido_ordenes po
  join comercial.pedidos p            on p.id = po.pedido_id
  join comercial.pedido_consumos c    on c.pedido_id = p.id
  join comercial.movimientos_stock m  on m.documento_tipo = 'PEDIDO_CONSUMO' and m.documento_id = c.id
                                      and m.anula_a_movimiento_id is null
                                      and not exists (select 1 from comercial.movimientos_stock x
                                                       where x.anula_a_movimiento_id = m.id)
  join gmp.lotes_insumo l             on l.id = m.lote_insumo_id
  join gmp.insumos_catalogo i         on i.id = l.insumo_id
  -- El saldo de apertura no tiene recepción (20260916130000).
  left join gmp.recepciones r         on r.id = l.recepcion_id
  left join gmp.proveedores pr        on pr.id = r.proveedor_id
union all
-- Hacia adelante: despachos del pedido al cliente.
select po.orden_id,
       'DESPACHO',
       m.ocurrido_en,
       pd.codigo_interno,
       pd.nombre,
       -m.cantidad,
       'u',
       null, null,
       dep.numero,
       p.cliente,
       p.numero
  from comercial.pedido_ordenes po
  join comercial.pedidos p         on p.id = po.pedido_id
  join comercial.movimientos_pt m  on m.documento_tipo = 'PEDIDO' and m.documento_id = p.id and m.tipo = 'SALIDA_VENTA'
  join gmp.productos pd            on pd.id = m.producto_id
  join gmp.depositos dep           on dep.id = m.deposito_id;

comment on view comercial.v_trazabilidad_orden is
  'Trazabilidad de un lote producido (§8.4): insumos consumidos con lote, recepción y proveedor, y despachos a '
  'clientes, a través del pedido de la orden.';

grant select on comercial.v_trazabilidad_orden to authenticated;

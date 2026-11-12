/**
 * Cuenta de demostración del portal (20261112130000): pedidos de ejemplo, uno
 * por estado, armados con productos reales de la lista. Viven en memoria: no
 * se guardan ni le llegan a Ventas.
 */
import type {
  EnvioPedido,
  EstadoCliente,
  PedidoCliente,
  ProductoCliente,
} from '@/lib/consultasCliente';

const DIA = 86_400_000;

function renglones(lista: ProductoCliente[], desde: number, cuantos: number) {
  return lista.slice(desde, desde + cuantos).map((p, i) => ({
    producto_id: p.producto_id,
    producto: p.producto,
    codigo: p.codigo,
    cantidad: p.pack ?? (i + 1) * 6,
  }));
}

function ejemplo(
  numero: string,
  estado_cliente: EstadoCliente,
  haceDias: number,
  r: PedidoCliente['renglones'],
  entregaEnDias: number | null,
): PedidoCliente {
  const ahora = Date.now();
  return {
    id: `demo-${numero}`,
    numero,
    estado: estado_cliente === 'PENDIENTE' ? 'BORRADOR' : estado_cliente,
    estado_cliente,
    enviado_en: new Date(ahora - haceDias * DIA).toISOString(),
    fecha_entrega:
      entregaEnDias === null
        ? null
        : new Date(ahora + entregaEnDias * DIA).toISOString().slice(0, 10),
    editable: estado_cliente === 'PENDIENTE',
    cancelado: estado_cliente === 'CANCELADO',
    observaciones: null,
    renglones: r,
  };
}

export function pedidosDeEjemplo(lista: ProductoCliente[]): PedidoCliente[] {
  if (lista.length < 12) return [];
  return [
    ejemplo('V-DEMO-5', 'PENDIENTE', 0, renglones(lista, 0, 3), null),
    ejemplo('V-DEMO-4', 'EN_PRODUCCION', 3, renglones(lista, 3, 2), 6),
    ejemplo('V-DEMO-3', 'EN_CAMINO', 7, renglones(lista, 5, 3), 1),
    ejemplo('V-DEMO-2', 'FINALIZADO', 20, renglones(lista, 8, 2), -12),
    ejemplo('V-DEMO-1', 'CANCELADO', 30, renglones(lista, 10, 2), null),
  ];
}

/** Lo que haría el envío de verdad, sobre la lista en memoria. */
export function aplicarEnvioDemo(
  pedidos: PedidoCliente[],
  e: EnvioPedido,
  lista: ProductoCliente[],
): PedidoCliente[] {
  const porId = new Map(lista.map((p) => [p.producto_id, p]));
  const r = e.renglones.map((x) => ({
    producto_id: x.producto_id,
    cantidad: x.cantidad,
    producto: porId.get(x.producto_id)?.producto ?? '',
    codigo: porId.get(x.producto_id)?.codigo ?? '',
  }));
  if (e.id) {
    return pedidos.map((p) =>
      p.id === e.id
        ? {
            ...p,
            renglones: r,
            observaciones: e.observaciones || null,
            enviado_en: new Date().toISOString(),
          }
        : p,
    );
  }
  const n = pedidos.filter((p) => p.numero.startsWith('V-DEMO-')).length + 1;
  return [
    {
      ...ejemplo(`V-DEMO-${n}`, 'PENDIENTE', 0, r, null),
      observaciones: e.observaciones || null,
    },
    ...pedidos,
  ];
}

import { Badge } from '@mantine/core';
import { diasHasta, fecha } from '@/lib/formato';
import type { EstadoAviso, EstadoPedido } from '@/lib/consultasComercial';

const COLOR_ESTADO: Record<EstadoPedido, string> = {
  BORRADOR: 'gray',
  ESPERANDO_FECHA: 'orange',
  FECHA_PROPUESTA: 'teal',
  CONFIRMADO: 'estadoEnAnalisis',
  EN_PRODUCCION: 'azul',
  CUMPLIDO: 'estadoAprobado',
  CANCELADO: 'estadoRechazado',
};

/**
 * `CONFIRMADO` se muestra como «Enviado a producción»: es el momento en que el
 * pedido pasa de quien lo carga a quien lo fabrica.
 */
const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  BORRADOR: 'Borrador',
  ESPERANDO_FECHA: 'Esperando fecha',
  FECHA_PROPUESTA: 'Fecha propuesta',
  CONFIRMADO: 'Enviado a producción',
  EN_PRODUCCION: 'En producción',
  CUMPLIDO: 'Terminado',
  CANCELADO: 'Cancelado',
};

/**
 * En un pedido de venta, CONFIRMADO es «Aprobado»: Ventas aprobó la fecha que
 * comprometió Producción (D-ventas-pedidos-13).
 */
export function BadgeEstadoPedido({
  estado,
  esVenta = false,
}: {
  estado: EstadoPedido;
  esVenta?: boolean;
}) {
  return (
    <Badge color={COLOR_ESTADO[estado]} variant="light" radius="sm">
      {esVenta && estado === 'CONFIRMADO' ? 'Aprobado' : ETIQUETA_ESTADO[estado]}
    </Badge>
  );
}

/**
 * Fecha de entrega con cuánto falta. Solo alarma en pedidos abiertos: un pedido
 * cumplido con fecha pasada no está atrasado, está entregado.
 */
export function BadgeEntrega({
  fechaEntrega,
  abierto,
}: {
  fechaEntrega: string | null;
  abierto: boolean;
}) {
  if (!fechaEntrega) {
    return (
      <Badge color="gray" variant="outline" radius="sm">
        Sin fecha
      </Badge>
    );
  }
  const dias = diasHasta(fechaEntrega);
  const texto = fecha(`${fechaEntrega}T12:00:00`);
  if (!abierto || dias === null) {
    return (
      <Badge color="gray" variant="light" radius="sm">
        {texto}
      </Badge>
    );
  }
  const color = dias < 0 ? 'estadoRechazado' : dias <= 7 ? 'estadoEnAnalisis' : 'gray';
  const detalle =
    dias < 0
      ? `atrasado ${-dias} d`
      : dias === 0
        ? 'hoy'
        : dias === 1
          ? 'mañana'
          : `en ${dias} d`;
  return (
    <Badge color={color} variant="light" radius="sm">
      {texto} · {detalle}
    </Badge>
  );
}

const COLOR_AVISO: Record<EstadoAviso, string> = {
  PENDIENTE: 'estadoEnAnalisis',
  EN_COMPRA: 'azul',
  RESUELTO: 'estadoAprobado',
  DESCARTADO: 'gray',
};

const ETIQUETA_AVISO: Record<EstadoAviso, string> = {
  PENDIENTE: 'Por comprar',
  EN_COMPRA: 'Pedido al proveedor',
  RESUELTO: 'Resuelto',
  DESCARTADO: 'Descartado',
};

export function BadgeEstadoAviso({ estado }: { estado: EstadoAviso }) {
  return (
    <Badge color={COLOR_AVISO[estado]} variant="light" radius="sm">
      {ETIQUETA_AVISO[estado]}
    </Badge>
  );
}

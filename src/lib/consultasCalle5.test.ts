import { describe, expect, it } from 'vitest';
import {
  agruparPorPedido,
  disponiblePara,
  type FilaCalle5,
  type PendienteDespacho,
  type ReservaPtRow,
} from './consultasCalle5';

const pendiente = (o: Partial<PendienteDespacho>): PendienteDespacho => ({
  pedido_id: 'p1',
  numero: 'P-1',
  cliente: 'Ana',
  cliente_id: 'cA',
  fecha_entrega: null,
  estado: 'CONFIRMADO',
  producto_id: 'x',
  codigo_interno: 'X',
  producto: 'X',
  cantidad: 10,
  despachado: 0,
  pendiente: 10,
  en_fabrica_para_pedido: 0,
  reservado_para_pedido: 0,
  ...o,
});

const reserva = (o: Partial<ReservaPtRow>): ReservaPtRow => ({
  id: 'r',
  producto_id: 'x',
  deposito_id: 'c5',
  cliente_id: null,
  pedido_id: null,
  cantidad: 5,
  consumido: 0,
  observacion: null,
  liberada: false,
  liberada_en: null,
  motivo_liberacion: null,
  liberada_por: null,
  creado_por: 'u',
  creado_en: '2026-09-29',
  ...o,
});

describe('agruparPorPedido', () => {
  it('suma lo pendiente, descarta lo completo y ordena por entrega', () => {
    const g = agruparPorPedido([
      pendiente({ pedido_id: 'p2', numero: 'P-2', fecha_entrega: '2026-10-05' }),
      pendiente({ pedido_id: 'p1', fecha_entrega: '2026-10-01', producto_id: 'x' }),
      pendiente({
        pedido_id: 'p1',
        fecha_entrega: '2026-10-01',
        producto_id: 'y',
        pendiente: 3,
      }),
      pendiente({ pedido_id: 'p3', numero: 'P-3', pendiente: 0 }),
    ]);
    expect(g.map((p) => p.numero)).toEqual(['P-1', 'P-2']);
    expect(g[0]?.pendiente).toBe(13);
  });
});

describe('disponiblePara', () => {
  const calle5 = [{ producto_id: 'x', libre: 10 } as FilaCalle5];
  it('libre más lo reservado para el pedido y para su cliente, no lo de otros', () => {
    const reservas = [
      reserva({ id: '1', pedido_id: 'p1', cantidad: 4 }),
      reserva({ id: '2', cliente_id: 'cA', cantidad: 3, consumido: 1 }),
      reserva({ id: '3', cliente_id: 'cB', cantidad: 50 }),
      reserva({ id: '4', pedido_id: 'p1', cantidad: 9, liberada: true }),
    ];
    expect(disponiblePara('x', 'p1', 'cA', calle5, reservas)).toBe(10 + 4 + 2);
  });
  it('un libre negativo (reservas sin respaldo) no resta', () => {
    expect(
      disponiblePara(
        'x',
        'p1',
        null,
        [{ producto_id: 'x', libre: -3 } as FilaCalle5],
        [],
      ),
    ).toBe(0);
  });
});

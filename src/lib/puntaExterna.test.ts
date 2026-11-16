import { describe, expect, it } from 'vitest';
import { puntaExterna, type MovimientoPtRow } from './consultasComercial';

const base: MovimientoPtRow = {
  id: 'm1',
  producto_id: 'p',
  deposito_id: 'PTF',
  tipo: 'SALIDA_VENTA',
  cantidad: -3,
  lote_texto: null,
  motivo: null,
  ocurrido_en: '2026-11-16T10:00:00Z',
  registrado_por: 'u',
  orden_id: 'o1',
  documento_tipo: null,
  documento_id: null,
  producto: null,
};
const nombre = (id: string) => ({ PTF: 'Fábrica', C5: 'Calle 5' })[id] ?? id;
const refs = {
  ordenes: new Map([['o1', { id: 'o1', numero: 'OP-2026-0008', numero_lote: 'L8' }]]),
  pedidos: new Map([['pe1', { id: 'pe1', numero: 'PV-12', cliente: 'Perfumería Sol' }]]),
};

describe('puntaExterna', () => {
  it('una transferencia encuentra el depósito de la otra punta', () => {
    const sale = { ...base, tipo: 'TRANSFERENCIA_ENTRE_DEPOSITOS', cantidad: -5 };
    const entra = { ...sale, id: 'm2', deposito_id: 'C5', cantidad: 5 };
    const todas = [sale, entra];
    expect(puntaExterna(sale, todas, refs, nombre)).toBe('Calle 5');
    expect(puntaExterna(entra, todas, refs, nombre)).toBe('Fábrica');
  });

  it('no empareja transferencias de otro lote', () => {
    const sale = { ...base, tipo: 'TRANSFERENCIA_ENTRE_DEPOSITOS', cantidad: -5 };
    const otra = { ...sale, id: 'm2', deposito_id: 'C5', cantidad: 5, orden_id: 'o2' };
    expect(puntaExterna(sale, [sale, otra], refs, nombre)).toBe('otro depósito');
  });

  it('el ingreso de producción dice la orden', () => {
    const m = { ...base, tipo: 'ENTRADA_PRODUCCION', cantidad: 10 };
    expect(puntaExterna(m, [m], refs, nombre)).toBe('Producción, orden OP-2026-0008');
  });

  it('la venta dice pedido y cliente, por documento o por despacho', () => {
    const porDoc = { ...base, documento_tipo: 'PEDIDO', documento_id: 'pe1' };
    const porDespacho = { ...base, despacho: { pedido_id: 'pe1' } };
    expect(puntaExterna(porDoc, [], refs, nombre)).toBe('Pedido PV-12 — Perfumería Sol');
    expect(puntaExterna(porDespacho, [], refs, nombre)).toBe(
      'Pedido PV-12 — Perfumería Sol',
    );
    expect(puntaExterna(base, [], refs, nombre)).toBe('Venta sin pedido (mostrador)');
  });

  it('armado y conteo', () => {
    const armado = {
      ...base,
      tipo: 'SALIDA_CONSUMO_PRODUCCION',
      documento_tipo: 'ARMADO',
    };
    const conteo = {
      ...base,
      tipo: 'ENTRADA_AJUSTE',
      cantidad: 2,
      documento_tipo: 'CONTEO_PT',
    };
    expect(puntaExterna(armado, [], refs, nombre)).toBe('Armado de packs');
    expect(puntaExterna(conteo, [], refs, nombre)).toBe('Conteo de inventario');
  });
});

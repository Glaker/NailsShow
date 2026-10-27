import { describe, expect, it } from 'vitest';
import { saleDeFabrica } from './consultasVentas';

describe('de qué depósito sale por defecto (D-pedidos-por-deposito-1)', () => {
  it('los cinco clientes de la lista, escritos como sea, salen de fábrica', () => {
    for (const c of [
      'BELLA CENTRAL',
      'bella central',
      'Bella Central (Depósito)',
      'BELLA CENTRAL (LOCAL MITRE)',
      'CESAR CUEVA ( TAURO )',
      'Cesar Cueva (Tauro)',
      'Yessica Franchesca Contreras Duque',
    ])
      expect(saleDeFabrica(c), c).toBe(true);
  });
  it('el resto sale de Berna', () => {
    for (const c of ['Bella', 'VICTOR CUEVA', 'Kiosco Pepe', ''])
      expect(saleDeFabrica(c), c).toBe(false);
  });
});

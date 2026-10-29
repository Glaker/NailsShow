import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';
import type { FotoCotizacion } from '@/lib/consultasCotizador';
import { CotizacionPdf } from './CotizacionPdf';
import { DetalleCostosPdf } from './DetalleCostosPdf';

// Una foto completa, como la guarda emitir_cotizacion: con costos y márgenes
// AFUERA del bloque pdf. Nada de eso puede aparecer en la hoja.
const foto = {
  costo_unitario: 456.81,
  precio_unitario: 653,
  margen_sobre_precio: 0.3004,
  recargo_sobre_costo: 0.4295,
  mano_de_obra: 200,
  costo_materiales: 256.81,
  costo_hora: 6000,
  minutos_por_unidad: 2,
  lineas: [
    {
      orden: 1,
      tipo: 'NUEVO',
      nombre: 'Óxido de zinc (ZnO)',
      cantidad: 6,
      unidad: 'g',
      precio_base: 19.8347,
      unidad_base: 'g',
      merma: 0,
      subtotal: 119.01,
    },
  ],
  pdf: {
    numero: 7,
    anio: 2026,
    fecha: '2026-10-09',
    vence_el: '2026-10-16',
    destino: 'POTENCIAL' as const,
    cliente: { razon_social: 'Spa del Bosque', contacto: 'Laura' },
    titulo: 'Protector solar para manos 60 g',
    contenido_cantidad: 60,
    contenido_unidad: 'g',
    cantidad: 500,
    precio_unitario: 653,
    total: 326500,
    leyenda_iva: 'MAS_IVA' as const,
    alicuota_iva: 21,
    observaciones: 'Entrega a 15 días.',
    emitida_por: 'Nazarena Bakás',
  },
} as FotoCotizacion;

const hoja = (marcaPractica = false) =>
  render(
    <MantineProvider theme={theme}>
      <CotizacionPdf datos={foto.pdf} marcaPractica={marcaPractica} />
    </MantineProvider>,
  ).container.textContent ?? '';

describe('PDF de la cotización', () => {
  it('lleva precio, cantidad, total, vigencia, IVA y quién emitió', () => {
    const t = hoja();
    for (const v of [
      '7/2026',
      'Spa del Bosque',
      'Protector solar',
      '60 g',
      '500',
      '653,00',
      '326.500,00',
      'más IVA',
      'Nazarena Bakás',
      'Válida hasta',
    ])
      expect(t).toContain(v);
  });
  it('nunca lleva costos, márgenes ni composición', () => {
    const t = hoja();
    for (const v of [
      '456',
      'Costo',
      'costo',
      'margen',
      'Margen',
      'recargo',
      'ZnO',
      'zinc',
      '119,01',
      'Mano de obra',
    ])
      expect(t).not.toContain(v);
  });
  it('en la base de práctica lleva la marca PRÁCTICA', () => {
    expect(hoja(true)).toContain('PRÁCTICA');
  });
});

describe('PDF interno de la cotización (con costos)', () => {
  const interna = () =>
    render(
      <MantineProvider theme={theme}>
        <CotizacionPdf datos={foto.pdf} marcaPractica={false} interna />
        <DetalleCostosPdf foto={foto} />
      </MantineProvider>,
    ).container.textContent ?? '';
  it('lleva la marca USO INTERNO y el detalle de costos', () => {
    const t = interna();
    for (const v of [
      'USO INTERNO',
      'Detalle de costos',
      'Óxido de zinc (ZnO)',
      '119,01',
      'Mano de obra',
      '456,81',
      '30,0 %',
    ])
      expect(t).toContain(v);
  });
});

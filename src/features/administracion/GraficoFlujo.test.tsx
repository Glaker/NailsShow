import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';
import type { DetalleDia, DiaFlujo } from '@/lib/consultasFlujo';
import { GraficoFlujo } from './GraficoFlujo';

const dias: DiaFlujo[] = [
  {
    fecha: '2026-09-28',
    ingresos: 0,
    egresos: 45_200,
    neto: -45_200,
    saldo_bancos: 2_340_000,
    saldo_efectivo: 80_000,
  },
  {
    fecha: '2026-09-29',
    ingresos: 120_000,
    egresos: 20_000,
    neto: 100_000,
    saldo_bancos: 2_440_000,
    saldo_efectivo: 80_000,
  },
];
const detalle: DetalleDia = {
  fecha: '2026-09-29',
  cuentas: [],
  movimientos: [
    {
      id: 'm1',
      orden: 1,
      importe: 120_000,
      tipo: 'INGRESO',
      concepto: 'Cobro a Ana',
      contraparte: 'Ana',
      comprobante: null,
      es_anulacion: false,
      cuenta: 'Galicia CC',
      cuenta_tipo: 'BANCO',
      titular: null,
      registrado_por: 'Diego',
      pago: null,
      cobro: {
        cliente: 'Ana',
        medio: 'TRANSFERENCIA',
        referencia: null,
        facturas: [
          {
            comprobante: 'B 0001-00000001',
            imputado: 120_000,
            a_nombre_de: 'Nail Show SRL',
            pedido: 'P-7',
            vendedor: 'Mati',
            productos: [{ producto: 'PREP 8ml', cantidad: 40, importe: 120_000 }],
          },
        ],
      },
    },
  ],
};

vi.mock('@/lib/consultasFlujo', () => ({
  useFlujoDiario: () => ({ isLoading: false, isError: false, data: dias }),
  useDetalleDia: () => ({ isLoading: false, isError: false, data: detalle }),
}));

// jsdom no trae la Web Animations API.
Element.prototype.animate = vi.fn(() => ({ onfinish: null }) as unknown as Animation);

function montar() {
  render(
    <MantineProvider theme={theme}>
      <GraficoFlujo />
    </MantineProvider>,
  );
}

describe('GraficoFlujo', () => {
  it('una barra por día, con el resultado en formato corto', () => {
    montar();
    expect(
      screen.getByRole('button', { name: /28 de septiembre: resultado −\$45k/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /29 de septiembre: resultado \+\$100k/ }),
    ).toBeInTheDocument();
  });

  it('al pasar por la barra: entró, salió y resultado', () => {
    montar();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /29 de septiembre/ }));
    expect(screen.getByText('Entró $120k')).toBeInTheDocument();
    expect(screen.getByText('Resultado +$100k')).toBeInTheDocument();
  });

  it('al tocarla se abre el día: quién pagó, a nombre de quién, quién vendió y qué', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /29 de septiembre/ }));
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveTextContent('Ana');
    expect(panel).toHaveTextContent('Nail Show SRL');
    expect(panel).toHaveTextContent('vendió Mati');
    expect(panel).toHaveTextContent('40 × PREP 8ml');
  });
});

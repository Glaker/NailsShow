import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';
import { GraficoLineas } from './GraficoLineas';
import { GraficoBarrasPareadas } from './GraficoBarrasPareadas';

const conTema = (ui: React.ReactNode) =>
  render(<MantineProvider theme={theme}>{ui}</MantineProvider>);
const pesos = (v: number) => `$ ${Math.round(v)}`;

describe('GraficoLineas', () => {
  it('un hueco parte la línea en dos tramos y la tabla lo dice', () => {
    const { container } = conTema(
      <GraficoLineas
        titulo="Costo y precios"
        etiquetas={['ene', 'feb', 'mar', 'abr']}
        formato={pesos}
        series={[
          { nombre: 'Costo', color: 1, valores: [100, null, 120, 130] },
          {
            nombre: 'Consumidor final',
            color: 2,
            punteada: true,
            valores: [300, 300, 320, 320],
          },
        ]}
      />,
    );
    const costo = container.querySelectorAll('path')[0]!.getAttribute('d')!;
    expect(costo.match(/M /g)).toHaveLength(2); // dos tramos: no inventa febrero
    expect(screen.getByRole('img', { name: 'Costo y precios' })).toBeTruthy();
    expect(screen.getAllByText('sin dato')).toHaveLength(1);
    expect(screen.getAllByText('Consumidor final').length).toBeGreaterThan(0); // leyenda y etiqueta
  });

  it('sin valores muestra el estado vacío', () => {
    conTema(
      <GraficoLineas
        titulo="x"
        etiquetas={['ene']}
        formato={pesos}
        series={[{ nombre: 'Costo', color: 1, valores: [null] }]}
      />,
    );
    expect(screen.getByText('Sin datos para el período.')).toBeTruthy();
  });
});

describe('GraficoBarrasPareadas', () => {
  it('dibuja una barra por valor, con su monto y la nota de margen', () => {
    const { container } = conTema(
      <GraficoBarrasPareadas
        titulo="Costo contra precio"
        formato={pesos}
        grupos={[
          {
            etiqueta: 'Mayorista',
            nota: 'margen 30,0 %',
            valores: [
              { nombre: 'Costo', valor: 70, color: 1 },
              { nombre: 'Precio neto', valor: 100, color: 3 },
            ],
          },
        ]}
      />,
    );
    expect(container.querySelectorAll('svg path')).toHaveLength(2);
    expect(screen.getAllByText('margen 30,0 %').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$ 100').length).toBeGreaterThan(0);
  });
});

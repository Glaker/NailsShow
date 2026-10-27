import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';

vi.mock('@/lib/consultasTareasProduccion', async (original) => ({
  ...(await original<typeof import('@/lib/consultasTareasProduccion')>()),
  useUbicacionInsumos: () => ({
    isLoading: false,
    data: [
      {
        insumo_id: 'a',
        codigo: 'MP-1',
        insumo: 'Alcohol',
        para: 'Fórmula',
        lote: 'RI-1',
        deposito: 'Materia prima — aprobada',
        estiba: 'B-12',
        saldo: 1000,
        unidad: 'g',
        vence: '2027-03-31',
      },
      {
        insumo_id: 'a',
        codigo: 'MP-1',
        insumo: 'Alcohol',
        para: 'Fórmula',
        lote: 'RI-2',
        deposito: 'Materia prima — aprobada',
        estiba: null,
        saldo: 3000,
        unidad: 'g',
        vence: '2027-12-31',
      },
      {
        insumo_id: 'b',
        codigo: 'ENV-1',
        insumo: 'Frasco 125',
        para: 'Acondicionamiento',
        lote: null,
        deposito: null,
        estiba: null,
        saldo: null,
        unidad: null,
        vence: null,
      },
    ],
  }),
}));

const { UbicacionInsumos } = await import('./MisTareas');

describe('dónde está cada insumo (D-ubicacion-insumos-1)', () => {
  it('muestra depósito y estiba por lote, y avisa lo que no tiene stock', () => {
    render(
      <MantineProvider theme={theme}>
        <UbicacionInsumos productoId="p" producto="Sanitizante" onCerrar={() => {}} />
      </MantineProvider>,
    );
    expect(screen.getAllByText('Alcohol')).toHaveLength(1);
    expect(screen.getByText('B-12')).toBeTruthy();
    expect(screen.getByText('RI-2')).toBeTruthy();
    expect(screen.getByText('Sin stock aprobado')).toBeTruthy();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';

vi.mock('@/lib/consultas', async (original) => ({
  ...(await original<typeof import('@/lib/consultas')>()),
  useDepositos: () => ({ data: [] }),
  useDepositoPorDefecto: () => ({ data: new Map(), isLoading: false }),
}));

const { CargarAStock } = await import('./PaginaRecepciones');

describe('estiba en «Cargar a stock»', () => {
  it('se escribe sin romper la página y pasa en mayúscula al confirmar', async () => {
    const confirmar = vi.fn();
    render(
      <MantineProvider theme={theme}>
        <CargarAStock
          recepcion={
            {
              id: 'r',
              numero: '00007/2026',
              lotes: [
                {
                  id: 'l1',
                  numero_registro_interno: 'RI-00008/2026',
                  insumo_id: 'i',
                  deposito_actual_id: 'd',
                  estado: 'CUARENTENA',
                  insumo: { nombre: 'LYON', tipo: 'MATERIA_PRIMA' },
                },
              ],
            } as never
          }
          controlaEnvases={false}
          enCurso={false}
          onCancelar={() => {}}
          onConfirmar={confirmar}
        />
      </MantineProvider>,
    );
    const campo = screen.getByPlaceholderText('A-1');
    // Tecla por tecla, como en planta: así se rompía (currentTarget en el updater).
    await userEvent.type(campo, 'b-12');
    expect((campo as HTMLInputElement).value).toBe('B-12');
    await userEvent.click(screen.getByRole('button', { name: 'Cargar a stock' }));
    expect(confirmar).toHaveBeenCalledWith({}, [], { l1: 'B-12' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';

const asignar = vi.fn();

// Devuelve lo ADICIONAL: la caja ya tiene 1 de Amor asignada.
vi.mock('@/lib/consultasVentas', () => ({
  TEXTO_OPCION: {},
  usePedidoCajas: () => ({ data: [] }),
  useSurtidoDisponible: () => ({
    data: { amor: 2, paz: 4, aire: 1 },
    isLoading: false,
    isError: false,
  }),
  useAsignarSurtido: () => ({ mutate: asignar, isPending: false }),
}));

const { AsignarSurtido } = await import('./CajasPortal');

const caja = {
  id: 'pc1',
  grupo: 'Esmaltes 10 ml',
  opcion: 'SURTIDO' as const,
  cajas: 6,
  unidades_caja: 12,
  asignado: { amor: 1, paz: 0, aire: 0 },
  asignado_por: null,
  asignado_en: null,
};

describe('AsignarSurtido', () => {
  it('suma lo ya asignado al máximo y exige que el reparto dé las cajas', async () => {
    const u = userEvent.setup();
    render(
      <MantineProvider theme={theme}>
        <AsignarSurtido caja={caja} onCerrar={() => {}} />
      </MantineProvider>,
    );
    // Amor: 2 adicionales + 1 ya asignada = 3.
    expect(screen.getByText('Se pueden armar hasta 3 cajas')).toBeTruthy();
    expect(screen.getByText('Se pueden armar hasta 4 cajas')).toBeTruthy();
    expect(screen.getByTestId('surtido-resumen').textContent).toBe('Faltan 5');
    const guardar = screen.getByRole('button', { name: 'Guardar reparto' });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);

    const paz = screen.getByLabelText('Paz');
    await u.clear(paz);
    await u.type(paz, '4');
    await u.clear(screen.getByLabelText('Amor'));
    await u.type(screen.getByLabelText('Amor'), '2');
    expect(screen.getByTestId('surtido-resumen').textContent).toBe('Suman 6: listo');
    expect((guardar as HTMLButtonElement).disabled).toBe(false);

    await u.click(guardar);
    expect(asignar).toHaveBeenCalledWith(
      { pedidoCajaId: 'pc1', amor: 2, paz: 4, aire: 0 },
      expect.anything(),
    );
  });
});

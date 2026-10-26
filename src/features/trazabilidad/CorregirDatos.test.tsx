import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';

// jsdom no lo trae y el desplegable de Mantine lo usa al abrirse.
Element.prototype.scrollIntoView = () => {};

const mutate = vi.fn();
vi.mock('@/lib/consultas', async (original) => ({
  ...(await original<typeof import('@/lib/consultas')>()),
  useCorregirDatoLote: () => ({ mutate, isPending: false }),
  useRemitoRecepcion: () => ({ data: '0001-0001' }),
  useProveedores: () => ({ data: [] }),
}));

const { CorregirDatos } = await import('./PaginaLote');

describe('corregir datos del lote', () => {
  it('pide motivo, y con «Otro» el detalle, antes de corregir', async () => {
    render(
      <MantineProvider theme={theme}>
        <CorregirDatos
          lote={{
            id: 'l',
            recepcion_id: 'r',
            proveedor_id: 'p',
            lote_proveedor: 'L-1',
            plazo_validez: '2027-01-31',
          }}
          onCerrar={() => {}}
        />
      </MantineProvider>,
    );
    const corregir = screen.getByRole('button', { name: 'Corregir' });
    await userEvent.clear(screen.getByLabelText('Lote del proveedor correcto'));
    await userEvent.type(screen.getByLabelText('Lote del proveedor correcto'), 'L-2');
    expect(corregir).toHaveProperty('disabled', true); // falta el motivo

    await userEvent.click(screen.getByPlaceholderText('Elegí el motivo'));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Otro (especificar)', hidden: true }),
    );
    expect(corregir).toHaveProperty('disabled', true); // falta el detalle
    await userEvent.type(screen.getByLabelText(/¿Cuál\?/), 'Lo cargó mal el depósito');
    await userEvent.click(corregir);
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      loteId: 'l',
      campo: 'lote_proveedor',
      valor: 'L-2',
      motivo: 'OTRO',
      detalle: 'Lo cargó mal el depósito',
    });
  });
});

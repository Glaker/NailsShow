import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/app/theme';

// jsdom no lo trae y el desplegable de Mantine lo usa al abrirse.
Element.prototype.scrollIntoView = () => {};

const DEPOSITOS = [
  { id: 'e1', numero: 'ENV-APR', nombre: 'Depósito de envases 1' },
  { id: 'e2', numero: 'ENV-2', nombre: 'Depósito de envases 2' },
].map((d) => ({
  ...d,
  activo: true,
  tipo_contenido: 'ENVASE_EMPAQUE',
  estado_admitido: 'APROBADO',
}));

vi.mock('@/lib/consultas', async (original) => ({
  ...(await original<typeof import('@/lib/consultas')>()),
  useDepositos: () => ({ data: DEPOSITOS }),
  useDepositoPorDefecto: () => ({ data: new Map(), isLoading: false }),
}));

const { CargarAStock } = await import('./PaginaRecepciones');

const lote = (id: string, tipo: string) => ({
  id,
  numero_registro_interno: `RI-${id}`,
  insumo_id: 'i',
  deposito_actual_id: 'd',
  estado: 'CUARENTENA',
  insumo: { nombre: id, tipo, requiere_protocolo: false },
});

const armar = (lotes: ReturnType<typeof lote>[], confirmar = vi.fn()) => {
  render(
    <MantineProvider theme={theme}>
      <CargarAStock
        recepcion={{ id: 'r', numero: '00007/2026', lotes } as never}
        controlaEnvases
        enCurso={false}
        onCancelar={() => {}}
        onConfirmar={confirmar}
      />
    </MantineProvider>,
  );
  return confirmar;
};

describe('estiba en «Cargar a stock»', () => {
  it('se escribe sin romper la página y pasa en mayúscula al confirmar', async () => {
    const confirmar = armar([lote('crema', 'MATERIA_PRIMA')]);
    const campo = screen.getByPlaceholderText('A-1');
    // Tecla por tecla, como en planta: así se rompía (currentTarget en el updater).
    await userEvent.type(campo, 'b-12');
    expect((campo as HTMLInputElement).value).toBe('B-12');
    await userEvent.click(screen.getByRole('button', { name: 'Cargar a stock' }));
    expect(confirmar).toHaveBeenCalledWith({}, [], { crema: 'B-12' }, {});
  });

  it('un envase aprobado elige depósito 1 o 2, y solo en el 1 pide estiba', async () => {
    const confirmar = armar([lote('frasco', 'MATERIAL_ENVASE')]);
    // Por defecto, el 1, con estiba.
    await userEvent.type(screen.getByPlaceholderText('A-1'), 'c-3');
    await userEvent.click(screen.getByDisplayValue('Depósito de envases 1'));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Depósito de envases 2', hidden: true }),
    );
    expect(screen.queryByPlaceholderText('A-1')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cargar a stock' }));
    // En el 2 no hay estibas: la que se había escrito no viaja.
    expect(confirmar).toHaveBeenCalledWith({}, ['frasco'], {}, { frasco: 'e2' });
  });

  it('es optativa: vacía (o escrita y borrada) carga igual, sin estiba', async () => {
    const confirmar = armar([
      lote('crema', 'MATERIA_PRIMA'),
      lote('alcohol', 'MATERIA_PRIMA'),
    ]);
    const [primera] = screen.getAllByPlaceholderText('A-1');
    await userEvent.type(primera!, 'x');
    await userEvent.clear(primera!);
    const boton = screen.getByRole('button', { name: 'Cargar a stock' });
    expect(boton).toBeEnabled();
    await userEvent.click(boton);
    expect(confirmar).toHaveBeenCalledWith({}, [], {}, {});
  });

  it('mal escrita no deja cargar hasta corregirla o borrarla', async () => {
    armar([lote('crema', 'MATERIA_PRIMA')]);
    await userEvent.type(screen.getByPlaceholderText('A-1'), '12');
    expect(screen.getByRole('button', { name: 'Cargar a stock' })).toBeDisabled();
  });

  it('un envase ya aprobado al recibirlo también pide estiba (salvo en el depósito 2)', async () => {
    const aprobado = (id: string, dep: string) => ({
      ...lote(id, 'MATERIAL_ENVASE'),
      estado: 'APROBADO',
      deposito_actual_id: dep,
    });
    const confirmar = armar([aprobado('bomba', 'e1'), aprobado('tapa', 'e2')]);
    const campos = screen.getAllByPlaceholderText('A-1');
    expect(campos).toHaveLength(1);
    await userEvent.type(campos[0]!, 'd-4');
    await userEvent.click(screen.getByRole('button', { name: 'Cargar a stock' }));
    expect(confirmar).toHaveBeenCalledWith({}, [], { bomba: 'D-4' }, {});
  });
});

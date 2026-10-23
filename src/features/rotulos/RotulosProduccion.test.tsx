import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import QRCode from 'qrcode';
import { theme } from '@/app/theme';
import { RotuloProduccion } from './RotulosProduccion';

describe('rótulo de producto terminado', () => {
  it('lleva los datos, el contado y un QR de texto sin cuenta', () => {
    const qr = vi
      .spyOn(QRCode, 'toDataURL')
      .mockResolvedValue('data:image/png;base64,' as never);
    render(
      <MantineProvider theme={theme}>
        <RotuloProduccion
          impreso="23/10/26"
          r={{
            clave: 1,
            ordenId: 'o',
            codigo: '101',
            producto: 'Liquido acrilico',
            lote: '23102026',
            cantidad: '120 unidades',
            cliente: 'Nail Show',
            estado: 'POR_REPROCESAR',
            color: '#c2185b',
            copias: 1,
            vence: 'P1 10/29',
          }}
        />
      </MantineProvider>,
    );
    for (const t of [
      'POR REPROCESAR',
      'Liquido acrilico',
      '101',
      '23102026',
      '120 unidades',
      'Nail Show',
      'Sí',
      'No',
    ])
      expect(screen.getByText(t)).toBeTruthy();
    expect(qr.mock.calls[0]?.[0]).toBe(
      'Producido en Nail Show\nLote: 23102026\nVence: P1 10/29\nCódigo: 101',
    );
  });
});

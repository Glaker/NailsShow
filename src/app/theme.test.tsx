import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider, NumberInput } from '@mantine/core';
import { theme } from './theme';

/**
 * Coma decimal en los campos numéricos. Antes, «1,2» en la densidad de una
 * fórmula quedaba en «1»: Mantine usa el punto por defecto y descartaba la coma.
 */
function campo(onChange: (v: number | string) => void) {
  render(
    <MantineProvider theme={theme}>
      <NumberInput label="Densidad" onChange={onChange} />
    </MantineProvider>,
  );
  return screen.getByLabelText('Densidad');
}

describe('NumberInput con el tema de la app', () => {
  it('acepta coma decimal: «1,2» es 1,2', async () => {
    const onChange = vi.fn();
    await userEvent.type(campo(onChange), '1,2');
    expect(onChange).toHaveBeenLastCalledWith(1.2);
  });

  it('acepta también punto, el del teclado numérico: «0.8074» es 0,8074', async () => {
    const onChange = vi.fn();
    await userEvent.type(campo(onChange), '0.8074');
    expect(onChange).toHaveBeenLastCalledWith(0.8074);
  });
});

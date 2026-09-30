import { describe, expect, it } from 'vitest';
import { itemsVisibles, ve } from './navegacion';
import type { VisibilidadRow } from '@/lib/consultasVisibilidad';

const excepcion = (
  pantalla: string,
  rol: VisibilidadRow['rol'],
  visible: boolean,
): VisibilidadRow => ({
  pantalla,
  rol,
  visible,
  motivo: null,
  cambiado_en: '2026-09-30',
});

describe('visibilidad de pantallas', () => {
  it('sin excepciones rige el código', () => {
    expect(ve('/usuarios', ['ADMINISTRADOR_SISTEMA'], ['VENTAS'], [])).toBe(false);
    expect(ve('/stock', undefined, ['VENTAS'], [])).toBe(true);
  });
  it('una excepción oculta una pantalla a un rol, no a los demás', () => {
    const ex = [excepcion('/stock?vista=insumos', 'VENTAS', false)];
    expect(ve('/stock?vista=insumos', undefined, ['VENTAS'], ex)).toBe(false);
    expect(ve('/stock?vista=insumos', undefined, ['GERENCIA_PRODUCCION'], ex)).toBe(true);
  });
  it('con varios roles alcanza con que uno la vea', () => {
    const ex = [excepcion('/stock', 'VENTAS', false)];
    expect(ve('/stock', undefined, ['VENTAS', 'ADMINISTRACION'], ex)).toBe(true);
  });
  it('una excepción puede mostrar lo que el código oculta', () => {
    expect(
      ve(
        '/usuarios',
        ['ADMINISTRADOR_SISTEMA'],
        ['GERENCIA'],
        [excepcion('/usuarios', 'GERENCIA', true)],
      ),
    ).toBe(true);
  });
  it('el administrador del sistema ve todo', () => {
    const ex = [excepcion('/reportes', 'ADMINISTRADOR_SISTEMA', false)];
    expect(
      itemsVisibles(['ADMINISTRADOR_SISTEMA'], ex).some((i) => i.ruta === '/reportes'),
    ).toBe(true);
  });
});

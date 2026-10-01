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

describe('reparto por rol del 2026-10-01', () => {
  const rutas = (rol: Parameters<typeof itemsVisibles>[0][number]) =>
    itemsVisibles([rol]).map((i) => i.ruta);

  it('la encargada de stock ve solo su tablero y los pedidos a armar', () => {
    expect(rutas('ENCARGADA_STOCK')).toEqual(['/', '/armado']);
  });
  it('Dirección Técnica no ve clientes, facturas, pedidos ni producción', () => {
    const r = rutas('DIRECCION_TECNICA');
    for (const fuera of [
      '/clientes',
      '/facturas',
      '/pedidos',
      '/ordenes',
      '/planificacion',
    ])
      expect(r).not.toContain(fuera);
    for (const dentro of ['/formulas', '/lotes', '/liberacion', '/stock'])
      expect(r).toContain(dentro);
  });
  it('Administración no ve fórmulas, insumos, planificación ni tercerizados', () => {
    const r = rutas('ADMINISTRACION');
    for (const fuera of ['/formulas', '/lotes', '/planificacion', '/tercerizados'])
      expect(r).not.toContain(fuera);
    expect(r).toContain('/punto-venta');
  });
  it('Ventas tiene su sección y no la lista de pedidos de producción', () => {
    const r = rutas('VENTAS');
    expect(r).toContain('/ventas');
    expect(r).not.toContain('/pedidos');
  });
  it('catálogos, calculadora y lista de materiales no son secciones', () => {
    const todas = itemsVisibles(['ADMINISTRADOR_SISTEMA']).map((i) => i.ruta);
    for (const r of [
      '/insumos',
      '/productos',
      '/proveedores',
      '/depositos',
      '/calculadora-lote',
      '/lista-materiales',
    ])
      expect(todas).not.toContain(r);
  });
});

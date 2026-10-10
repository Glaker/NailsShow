import { describe, expect, it } from 'vitest';
import { PLANTILLA_COSTOS_MP, fechaDeExcel, filasDePlantilla, leerPlantilla, type ContextoCostos } from './importacion';

const ctx: ContextoCostos = {
  insumos: new Map([
    ['101ESE', { unidad: 'ml', tieneManual: true }],
    ['080ENV', { unidad: 'UNIDAD', tieneManual: false }],
  ]),
};
const enc = PLANTILLA_COSTOS_MP.columnas.map((c) => c.clave);

describe('importación estricta', () => {
  it('la plantilla de ejemplo se lee sin errores', () => {
    const r = leerPlantilla(filasDePlantilla(PLANTILLA_COSTOS_MP), PLANTILLA_COSTOS_MP, {
      insumos: new Map([['101ESE', { unidad: 'g', tieneManual: false }]]),
    });
    expect(r.ok && r.renglones[0]!.accion).toBe('crear');
  });
  it('rechaza una planilla con columnas que no son las de la plantilla, sin adivinar', () => {
    const r = leerPlantilla([['codigo', 'precio'], ['101ESE', 1]], PLANTILLA_COSTOS_MP, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/faltan las columnas codigo_insumo.*sobran codigo, precio/);
  });
  it('el orden de las columnas da igual', () => {
    const al = [...enc].reverse();
    const fila = al.map((c) => ({ codigo_insumo: '080ENV', importe: '1.234,5', incluye_iva: null, alicuota: null, cantidad: 1, unidad: 'unidad', moneda: 'ARS', tipo_cambio: null, vigente_desde: null, motivo: null })[c as 'motivo'] ?? null);
    const r = leerPlantilla([al, fila], PLANTILLA_COSTOS_MP, ctx);
    expect(r.ok && r.renglones[0]).toMatchObject({ accion: 'crear', datos: { importe: 1234.5, unidad: 'UNIDAD' } });
  });
  it('marca crear, actualizar y error con el motivo', () => {
    const r = leerPlantilla(
      [
        enc,
        ['101ESE', 18000, null, null, 1, 'l', 'ARS', null, 46296, null],
        ['080ENV', 0.35, null, null, 1, 'UNIDAD', 'USD', null, null, null],
        ['NOEXISTE', 'mucho', null, null, 1, 'kg', 'ARS', null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
      ],
      PLANTILLA_COSTOS_MP,
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.renglones).toHaveLength(3); // el renglón en blanco no cuenta
    expect(r.renglones[0]).toMatchObject({ numero: 2, accion: 'actualizar', datos: { vigente_desde: '2026-10-01' } });
    expect(r.renglones[1]!.errores).toContain('en dólares hace falta el tipo de cambio');
    expect(r.renglones[2]!.errores.join(' ')).toMatch(/importe no es un número/);
  });
  it('unidad que no se convierte a la del catálogo', () => {
    const r = leerPlantilla([enc, ['080ENV', 1, null, null, 1, 'kg', 'ARS', null, null, null]], PLANTILLA_COSTOS_MP, ctx);
    expect(r.ok && r.renglones[0]!.errores.join(' ')).toMatch(/no se puede pasar kg/);
  });
  it('IVA incluido: SI con alícuota, NO sin alícuota', () => {
    const r = leerPlantilla(
      [
        enc,
        ['080ENV', 121, 'si', 21, 1, 'UNIDAD', 'ARS', null, null, null],
        ['080ENV', 121, 'SI', null, 1, 'UNIDAD', 'ARS', null, null, null],
        ['080ENV', 100, null, 21, 1, 'UNIDAD', 'ARS', null, null, null],
      ],
      PLANTILLA_COSTOS_MP,
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.renglones[0]).toMatchObject({ accion: 'crear', datos: { incluye_iva: 'SI', alicuota: 21 } });
    expect(r.renglones[1]!.errores.join(' ')).toMatch(/va la alícuota/);
    expect(r.renglones[2]!.errores.join(' ')).toMatch(/sólo si incluye_iva es SI/);
  });
  it('fechas de Excel y escritas a mano', () => {
    expect(fechaDeExcel(46296)).toBe('2026-10-01');
    expect(fechaDeExcel('5/9/2026')).toBe('2026-09-05');
    expect(fechaDeExcel('mañana')).toBeNull();
  });
});

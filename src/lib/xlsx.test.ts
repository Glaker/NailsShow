import { describe, expect, it } from 'vitest';
import { escribirXlsx, leerXlsx, leerZip, sha256 } from './xlsx';

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** Un zip con DEFLATE, como los que guarda Excel (el nuestro escribe sin comprimir). */
async function zipComprimido(nombre: string, texto: string): Promise<ArrayBuffer> {
  const plano = new TextEncoder().encode(texto);
  const flujo = new Response(plano).body!.pipeThrough(new CompressionStream('deflate-raw'));
  const comp = new Uint8Array(await new Response(flujo).arrayBuffer());
  // Rearmar con método 8: encabezado local + datos comprimidos + directorio central.
  const n = new TextEncoder().encode(nombre);
  const l = new DataView(new ArrayBuffer(30));
  l.setUint32(0, 0x04034b50, true);
  l.setUint16(8, 8, true);
  l.setUint32(18, comp.length, true);
  l.setUint32(22, plano.length, true);
  l.setUint16(26, n.length, true);
  const c = new DataView(new ArrayBuffer(46));
  c.setUint32(0, 0x02014b50, true);
  c.setUint16(10, 8, true);
  c.setUint32(20, comp.length, true);
  c.setUint32(24, plano.length, true);
  c.setUint16(28, n.length, true);
  const f = new DataView(new ArrayBuffer(22));
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(10, 1, true);
  f.setUint32(12, 46 + n.length, true);
  f.setUint32(16, 30 + n.length + comp.length, true);
  const partes = [new Uint8Array(l.buffer), n, comp, new Uint8Array(c.buffer), n, new Uint8Array(f.buffer)];
  const out = new Uint8Array(partes.reduce((a, x) => a + x.length, 0));
  let o = 0;
  for (const x of partes) { out.set(x, o); o += x.length; }
  return out.buffer;
}

describe('xlsx propio', () => {
  it('ida y vuelta: textos con acentos y signos, números, vacíos y booleanos', async () => {
    const filas = [
      ['codigo_insumo', 'importe', 'unidad', 'motivo'],
      ['101ESE', 17700.5, 'l', 'Cotización «Aromática» & cía'],
      ['135FRA1', 54870, 'kg', null],
      [null, true, 'g', 'ñandú'],
    ];
    expect(await leerXlsx(buf(escribirXlsx(filas)))).toEqual(filas);
  });
  it('lee entradas comprimidas con DEFLATE', async () => {
    const z = await leerZip(await zipComprimido('a.txt', 'hola hola hola hola, Nail Show'));
    expect(new TextDecoder().decode(z.get('a.txt'))).toBe('hola hola hola hola, Nail Show');
  });
  it('rechaza lo que no es un zip', async () => {
    await expect(leerXlsx(new TextEncoder().encode('no soy un excel').buffer)).rejects.toThrow(/no es un .xlsx/);
  });
  it('sha256 conocido', async () => {
    expect(await sha256(new TextEncoder().encode('abc').buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

/**
 * Lector y escritor mínimo de .xlsx, sin dependencias (CLAUDE.md §7).
 *
 * Un .xlsx es un zip con XML adentro. Para leer se recorre el directorio
 * central del zip (no los encabezados locales, que Excel a veces deja sin
 * tamaños) y se descomprime con DecompressionStream('deflate-raw'), que traen
 * el navegador y Node. Para escribir se arma un zip sin compresión.
 *
 * Alcance deliberado: la PRIMERA hoja, valores (números, textos compartidos y
 * en línea, booleanos). No lee fórmulas ni formatos: las plantillas de
 * importación son fijas y simples. ponytail: si algún día hace falta leer
 * archivos arbitrarios (zip64, varias hojas, estilos), ahí se justifica una
 * biblioteca.
 */

export type Celda = string | number | boolean | null;

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Response(datos as BodyInit).body!.pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/** Archivos del zip: nombre → contenido descomprimido. */
export async function leerZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  const b = new Uint8Array(buf);
  // Fin del directorio central: firma 0x06054b50, buscando desde el final.
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('El archivo no es un .xlsx válido (no es un zip).');
  const cantidad = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const salida = new Map<string, Uint8Array>();
  for (let i = 0; i < cantidad; i++) {
    if (v.getUint32(p, true) !== 0x02014b50)
      throw new Error('El .xlsx está dañado (directorio central).');
    const metodo = v.getUint16(p + 10, true);
    const comprimido = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + largoNombre));
    const inicio =
      local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = b.subarray(inicio, inicio + comprimido);
    if (metodo === 0) salida.set(nombre, datos.slice());
    else if (metodo === 8) salida.set(nombre, await inflar(datos));
    else throw new Error(`El .xlsx usa una compresión que no se lee (${metodo}).`);
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return salida;
}

/** Zip sin compresión (método 0). */
export function escribirZip(
  archivos: { nombre: string; datos: Uint8Array }[],
): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // nombres en UTF-8
    l.setUint32(14, crc, true);
    l.setUint32(18, a.datos.length, true);
    l.setUint32(22, a.datos.length, true);
    l.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(l.buffer), nombre, a.datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(c.buffer), nombre);
    desplazamiento += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of todo) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hoja
// ---------------------------------------------------------------------------

const desescapar = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
const escapar = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Texto de un nodo <si> o <is>: todos sus <t> (los textos con formato vienen partidos). */
const textoDe = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => desescapar(m[1] ?? ''))
    .join('');

/** «AB12» → columna 27 (base 0), fila 11 (base 0). */
function posicion(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return [0, 0];
  let col = 0;
  for (const ch of m[1]!) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [col - 1, Number(m[2]) - 1];
}

const letra = (col: number) => {
  let s = '';
  for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26))
    s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
};

/** Filas de la primera hoja, como matriz de celdas (huecos en null). */
export async function leerXlsx(buf: ArrayBuffer): Promise<Celda[][]> {
  const zip = await leerZip(buf);
  const dec = new TextDecoder();
  const texto = (n: string) => {
    const d = zip.get(n);
    return d ? dec.decode(d) : null;
  };
  const libro = texto('xl/workbook.xml');
  const rels = texto('xl/_rels/workbook.xml.rels');
  let rutaHoja = 'xl/worksheets/sheet1.xml';
  const primera = libro ? /<sheet\b[^>]*r:id="([^"]+)"/.exec(libro) : null;
  if (primera && rels) {
    const rel =
      new RegExp(`<Relationship\\b[^>]*Id="${primera[1]}"[^>]*Target="([^"]+)"`).exec(
        rels,
      ) ??
      new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${primera[1]}"`).exec(
        rels,
      );
    if (rel) rutaHoja = rel[1]!.startsWith('/') ? rel[1]!.slice(1) : `xl/${rel[1]}`;
  }
  const hoja = texto(rutaHoja);
  if (!hoja) throw new Error('El .xlsx no tiene hojas.');
  const compartidos = [
    ...(texto('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) => textoDe(m[1] ?? ''));

  const filas: Celda[][] = [];
  for (const c of hoja.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[1] ?? '';
    const cuerpo = c[2] ?? '';
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!ref) continue;
    const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
    const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
    let valor: Celda = null;
    if (tipo === 's' && v !== undefined) valor = compartidos[Number(v)] ?? null;
    else if (tipo === 'inlineStr') valor = textoDe(cuerpo);
    else if (tipo === 'str' && v !== undefined) valor = desescapar(v);
    else if (tipo === 'b' && v !== undefined) valor = v === '1';
    else if (v !== undefined && v !== '') valor = Number(v);
    const [col, fila] = posicion(ref);
    (filas[fila] ??= [])[col] = valor;
  }
  // Huecos explícitos, filas vacías del medio y todas del mismo ancho.
  const ancho = Math.max(0, ...filas.map((f) => (f ?? []).length));
  return Array.from({ length: filas.length }, (_, i) =>
    Array.from({ length: ancho }, (_, j) => filas[i]?.[j] ?? null),
  );
}

/** Un .xlsx de una hoja con estas filas (textos en línea, números como número). */
export function escribirXlsx(filas: Celda[][], nombreHoja = 'Hoja1'): Uint8Array {
  const enc = new TextEncoder();
  const hoja = filas
    .map(
      (f, i) =>
        `<row r="${i + 1}">${f
          .map((v, j) => {
            const ref = `${letra(j)}${i + 1}`;
            if (v === null || v === '') return '';
            if (typeof v === 'number' && Number.isFinite(v))
              return `<c r="${ref}"><v>${v}</v></c>`;
            if (typeof v === 'boolean')
              return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapar(String(v))}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  const x = (s: string) =>
    enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  return escribirZip([
    {
      nombre: '[Content_Types].xml',
      datos: x(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ),
    },
    {
      nombre: '_rels/.rels',
      datos: x(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      nombre: 'xl/workbook.xml',
      datos: x(
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapar(nombreHoja.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: x(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
    },
    {
      nombre: 'xl/worksheets/sheet1.xml',
      datos: x(
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${hoja}</sheetData></worksheet>`,
      ),
    },
  ]);
}

/** Descarga un .xlsx en el navegador. */
export function descargarXlsx(filas: Celda[][], archivo: string, nombreHoja?: string) {
  const datos = escribirXlsx(filas, nombreHoja);
  const url = URL.createObjectURL(
    new Blob([datos as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.endsWith('.xlsx') ? archivo : `${archivo}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** SHA-256 en hexadecimal: la huella del archivo que se importó. */
export async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

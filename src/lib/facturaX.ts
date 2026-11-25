/**
 * Lectura de la factura X (D-factura-x-1): el PDF del sistema de facturación
 * se lee en el navegador y no se guarda (pedido del 2026-11-18). La base
 * recibe los renglones con comercial.cargar_factura_x.
 *
 * El PDF trae ORIGINAL y DUPLICADO: se leen solo las páginas ORIGINAL. Las
 * columnas tienen posición fija; un renglón es un código a la izquierda con
 * una cantidad en la columna «Cantidad» a la misma altura.
 */

export interface ItemTexto {
  x: number;
  y: number;
  str: string;
}

export interface RenglonFacturaX {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number | null;
  bonificacion_pct: number | null;
  subtotal: number | null;
}

export interface FacturaX {
  numero: string;
  /** Letra del comprobante: X, J, B, C… */
  tipo: string;
  /** CUIT del emisor: Virginia Arleo y Athene del Plata pueden repetir número. */
  emisor_cuit: string;
  fecha: string | null; // ISO
  cliente: string | null;
  total: number | null;
  renglones: RenglonFacturaX[];
  /** SHA-256 de los bytes del PDF: la base no deja cargarlo dos veces (20261125140000). */
  pdf_sha256?: string;
}

/** SHA-256 en hexadecimal de los bytes del archivo. */
export async function huellaPdf(archivo: File): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** «1.234,560» → 1234.56. */
export const numeroAr = (s: string): number | null => {
  const t = s.trim().replace(/\$/g, '').trim();
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

type Col = readonly [number, number];
interface Columnas {
  codigo: Col;
  descripcion: Col;
  cantidad: Col;
  precio: Col;
  bonificacion: Col;
  subtotal: Col;
}
// Factura X mayorista (con «U. Medida»), si no se encuentra el encabezado.
const COL_X: Columnas = {
  codigo: [0, 70],
  descripcion: [70, 280],
  cantidad: [280, 322],
  precio: [395, 462],
  bonificacion: [462, 500],
  subtotal: [540, 1000],
};
const en = (it: ItemTexto, [a, b]: Col) => it.x >= a && it.x < b;
const misma = (a: number, b: number) => Math.abs(a - b) <= 2.5;

/**
 * Las columnas salen de los títulos del encabezado: la factura X mayorista y
 * la B traen «U. Medida», la J y la X de mostrador no, y todo se corre. Un
 * valor pertenece al último título que empieza antes que él (los números van
 * alineados a la derecha y pueden empezar unos puntos antes que su título).
 */
function columnasDe(items: ItemTexto[]): Columnas | null {
  const t = (re: RegExp) => items.find((i) => re.test(i.str.trim()))?.x;
  const cantidad = t(/^Cantidad$/);
  const precio = t(/^Precio Unitario$/);
  const bonif = t(/^% Bonif\.?$/);
  const iva = t(/^% IVA$/);
  const subtotal = t(/^Subtotal$/);
  if ([cantidad, precio, bonif, iva, subtotal].some((x) => x === undefined)) return null;
  const medida = t(/^U\. Medida$/);
  const M = 8;
  return {
    codigo: [0, 70],
    descripcion: [70, cantidad! - M],
    cantidad: [cantidad! - M, (medida ?? precio!) - M],
    precio: [precio! - M, bonif! - M],
    bonificacion: [bonif! - M, iva! - M],
    subtotal: [subtotal! - M, 10000],
  };
}

export function parsearFacturaX(paginas: ItemTexto[][]): FacturaX {
  const originales = paginas.filter((p) => !p.some((i) => i.str.trim() === 'DUPLICADO'));
  const todas = originales.flat();
  const buscar = (re: RegExp) => {
    for (const i of todas) {
      const m = re.exec(i.str);
      if (m) return m;
    }
    return null;
  };
  const numero = buscar(/N[º°o]\s*:\s*(\d{4,5}-\d{6,8})/)?.[1] ?? '';
  const tipo = buscar(/^FACT(?:URA|\.\s*ELECT\.)\s+([A-Z])$/)?.[1] ?? 'X';
  const alLado = (etiqueta: RegExp, desdeX = 0) => {
    const e = todas.find((i) => etiqueta.test(i.str.trim()));
    if (!e) return null;
    return (
      todas
        .filter((i) => misma(i.y, e.y) && i.x > Math.max(e.x, desdeX) && i.str.trim())
        .sort((a, b) => a.x - b.x)[0]
        ?.str.trim() ?? null
    );
  };
  // La fecha es la de «Fecha:», no la de «Inicio Actividades» (factura B de Athene).
  const f =
    /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(alLado(/^Fecha:$/) ?? '') ??
    buscar(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const fecha = f ? `${f[3]}-${f[2]}-${f[1]}` : null;
  const cliente = alLado(/^Señor\/res:$/, 60);
  const emisor_cuit = alLado(/^CUIT:$/) ?? '';
  const totalTxt = (() => {
    const e = todas.find((i) => i.str.trim() === 'TOTAL:');
    if (!e) return null;
    return (
      todas
        .filter((i) => misma(i.y, e.y) && i.x > e.x && numeroAr(i.str) !== null)
        .sort((a, b) => b.x - a.x)[0]?.str ?? null
    );
  })();

  // Las hojas de continuación no repiten el encabezado: valen las columnas de la primera.
  const COL = originales.map(columnasDe).find((c) => c !== null) ?? COL_X;
  const renglones: RenglonFacturaX[] = [];
  for (const pagina of originales) {
    const codigos = pagina
      .filter((i) => en(i, COL.codigo) && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(i.str.trim()))
      .sort((a, b) => b.y - a.y);
    for (const c of codigos) {
      const fila = pagina.filter((i) => misma(i.y, c.y));
      const cel = (col: Col) =>
        fila
          .filter((i) => en(i, col))
          .map((i) => i.str.trim())
          .filter(Boolean)
          .join(' ');
      // Celda numérica: el primer número de la columna («Otras Unidades» no cuenta).
      const num = (col: Col) =>
        fila
          .filter((i) => en(i, col))
          .map((i) => numeroAr(i.str))
          .find((n) => n !== null) ?? null;
      const cantidad = num(COL.cantidad);
      if (cantidad === null) continue; // «Son PESOS», observaciones, etc.
      renglones.push({
        codigo: c.str.trim(),
        descripcion: cel(COL.descripcion),
        cantidad,
        precio_unitario: num(COL.precio),
        bonificacion_pct: num(COL.bonificacion),
        subtotal: num(COL.subtotal),
      });
    }
  }

  return {
    numero,
    tipo,
    emisor_cuit,
    fecha,
    cliente,
    total: totalTxt === null ? null : numeroAr(totalTxt),
    renglones,
  };
}

/** Lo facturado por código (un código puede venir en dos renglones: bonificado). */
export const facturadoPorCodigo = (f: FacturaX) => {
  const m = new Map<string, number>();
  for (const r of f.renglones)
    m.set(r.codigo.toUpperCase(), (m.get(r.codigo.toUpperCase()) ?? 0) + r.cantidad);
  return m;
};

/** Lee el PDF en el navegador. pdf.js se carga recién acá (no pesa en el resto de la app). */
export async function leerPdfFacturaX(archivo: File): Promise<FacturaX> {
  const pdfjs = await import('pdfjs-dist');
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await archivo.arrayBuffer()),
  }).promise;
  const paginas: ItemTexto[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent();
    paginas.push(
      contenido.items.flatMap((i) =>
        'str' in i
          ? [{ x: i.transform[4] as number, y: i.transform[5] as number, str: i.str }]
          : [],
      ),
    );
  }
  await doc.destroy();
  return parsearFacturaX(paginas);
}

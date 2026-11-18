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
  fecha: string | null; // ISO
  cliente: string | null;
  total: number | null;
  renglones: RenglonFacturaX[];
}

/** «1.234,560» → 1234.56. */
export const numeroAr = (s: string): number | null => {
  const t = s.trim().replace(/\$/g, '').trim();
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Columnas de la factura (x en puntos PDF).
const COL = {
  codigo: [0, 70],
  descripcion: [70, 280],
  cantidad: [280, 322],
  precio: [395, 462],
  bonificacion: [462, 500],
  subtotal: [540, 1000],
} as const;
const en = (it: ItemTexto, [a, b]: readonly [number, number]) => it.x >= a && it.x < b;
const misma = (a: number, b: number) => Math.abs(a - b) <= 2.5;

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
  const f = buscar(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const fecha = f ? `${f[3]}-${f[2]}-${f[1]}` : null;
  const alLado = (etiqueta: RegExp, desdeX = 0) => {
    const e = todas.find((i) => etiqueta.test(i.str.trim()));
    if (!e) return null;
    return (
      todas
        .filter((i) => misma(i.y, e.y) && i.x > Math.max(e.x, desdeX) && i.str.trim())
        .sort((a, b) => a.x - b.x)[0]?.str.trim() ?? null
    );
  };
  const cliente = alLado(/^Señor\/res:$/, 60);
  const totalTxt = (() => {
    const e = todas.find((i) => i.str.trim() === 'TOTAL:');
    if (!e) return null;
    return (
      todas
        .filter((i) => misma(i.y, e.y) && i.x > e.x && numeroAr(i.str) !== null)
        .sort((a, b) => b.x - a.x)[0]?.str ?? null
    );
  })();

  const renglones: RenglonFacturaX[] = [];
  for (const pagina of originales) {
    const codigos = pagina
      .filter((i) => en(i, COL.codigo) && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(i.str.trim()))
      .sort((a, b) => b.y - a.y);
    for (const c of codigos) {
      const fila = pagina.filter((i) => misma(i.y, c.y));
      const cel = (col: readonly [number, number]) =>
        fila
          .filter((i) => en(i, col))
          .map((i) => i.str.trim())
          .filter(Boolean)
          .join(' ');
      const cantidad = numeroAr(cel(COL.cantidad));
      if (cantidad === null) continue; // «Son PESOS», observaciones, etc.
      renglones.push({
        codigo: c.str.trim(),
        descripcion: cel(COL.descripcion),
        cantidad,
        precio_unitario: numeroAr(cel(COL.precio)),
        bonificacion_pct: numeroAr(cel(COL.bonificacion)),
        subtotal: numeroAr(cel(COL.subtotal)),
      });
    }
  }

  return {
    numero,
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
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) })
    .promise;
  const paginas: ItemTexto[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent();
    paginas.push(
      contenido.items.flatMap((i) =>
        'str' in i ? [{ x: i.transform[4] as number, y: i.transform[5] as number, str: i.str }] : [],
      ),
    );
  }
  await doc.destroy();
  return parsearFacturaX(paginas);
}

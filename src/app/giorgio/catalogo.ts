import { NAVEGACION, PESTANIAS } from '@/app/navegacion';
import { AYUDA_PRODUCCION } from '@/app/ayuda/produccion';
import { AYUDA_COMERCIAL } from '@/app/ayuda/comercial';
import { AYUDA_COSTOS } from '@/app/ayuda/costos';
import type { MapaAyuda } from '@/app/ayuda/tipos';
import type {
  Catalogo,
  PantallaCatalogo,
  SubrutaCatalogo,
} from '../../../supabase/functions/_shared/giorgio';

const AYUDA: MapaAyuda = { ...AYUDA_PRODUCCION, ...AYUDA_COMERCIAL, ...AYUDA_COSTOS };

/**
 * Páginas de detalle a las que Giorgio puede llevar con un id. Cada una
 * depende de su pantalla: si el usuario no la ve, Giorgio no ofrece el botón.
 */
export const SUBRUTAS: SubrutaCatalogo[] = [
  { patron: '/lotes/:id', etiqueta: 'Detalle de un lote de insumo', de: '/lotes' },
  {
    patron: '/ordenes/:id',
    etiqueta: 'Detalle de una orden de producción',
    de: '/ordenes',
  },
  {
    patron: '/ordenes/:id/batch-record',
    etiqueta: 'Batch record de una orden',
    de: '/ordenes',
  },
  { patron: '/formulas/:id', etiqueta: 'Detalle de una fórmula', de: '/formulas' },
  { patron: '/pedidos/:id', etiqueta: 'Detalle de un pedido', de: '/pedidos' },
  {
    patron: '/costos/producto/:id',
    etiqueta: 'Panel de costo de un producto',
    de: '/costos',
  },
  {
    patron: '/cotizaciones/:id',
    etiqueta: 'Detalle de una cotización',
    de: '/cotizaciones',
  },
  { patron: '/tercerizados/:id', etiqueta: 'Detalle de un tercero', de: '/tercerizados' },
  { patron: '/ventas/:id', etiqueta: 'Detalle de una venta', de: '/ventas' },
];

/** Rutas con parámetro que Giorgio no ofrece: la vista de impresión. */
export const SUBRUTAS_EXCLUIDAS = ['/cotizaciones/:id/pdf'];

const pantalla = (
  ruta: string,
  etiqueta: string,
  roles?: string[],
): PantallaCatalogo => ({
  ruta,
  etiqueta,
  roles: roles ?? null,
  queEs: AYUDA[ruta]?.queEs ?? null,
});

/**
 * Catálogo que usa la Edge Function `giorgio`: el menú, las pestañas y los
 * catálogos, con la descripción de la ayuda. La función no puede importar
 * navegacion.ts (trae React), así que lee el JSON que genera la prueba.
 */
export function armarCatalogo(): Catalogo {
  return {
    pantallas: [
      ...NAVEGACION.map((i) => pantalla(i.ruta, i.etiqueta, i.roles)),
      ...PESTANIAS.map((p) => pantalla(p.ruta, p.etiqueta, p.roles)),
    ],
    subrutas: SUBRUTAS,
  };
}

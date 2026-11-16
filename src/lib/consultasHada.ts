/**
 * Frente de la Edge Function `hada` (P6, docs/disenos/P6-hada.md §1.8). La
 * función arma un BORRADOR a partir de texto libre; el cliente lo revisa y lo
 * confirma con el SlideCommit de siempre. Nada de lo que vuelve acá dispara
 * una acción: es texto para mostrar y datos para sumar al carrito.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { OPCIONES_CAJA } from './consultasCliente';

export const MAX_MENSAJE_HADA = 500;

/** Texto fijo del frente cuando no se puede leer ninguna respuesta del servidor. */
export const TEXTO_HADA_NO_DISPONIBLE =
  'Ahora no puedo ayudarte. Probá en un rato o armá el pedido desde la lista.';

export interface TurnoHada {
  rol: 'cliente' | 'hada';
  texto: string;
  /** En los turnos de Hada: qué respondió (el servidor cuenta las preguntas seguidas). */
  tipo?: RespuestaHada['tipo'];
}

export interface BorradorHada {
  renglones: { producto_id: string; cantidad: number }[];
  cajas: { caja_id: string; opcion: string; cajas: number }[];
}

export interface RespuestaHada {
  tipo: 'borrador' | 'pregunta' | 'ubicacion' | 'aviso';
  textos: string[];
  borrador?: BorradorHada;
  rechazados?: { motivo: string; texto: string }[];
  destino?: string;
}

const TIPOS = ['borrador', 'pregunta', 'ubicacion', 'aviso'];
const textos = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string') : [];

/** Acepta solo lo que el contrato describe; lo demás se descarta. */
function leer(x: unknown): RespuestaHada | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const tipo = TIPOS.find((t) => t === o['tipo']) as RespuestaHada['tipo'] | undefined;
  if (!tipo) return null;
  const r: RespuestaHada = { tipo, textos: textos(o['textos']) };
  const b = o['borrador'] as Partial<BorradorHada> | undefined;
  if (tipo === 'borrador' && b && typeof b === 'object') {
    r.borrador = {
      renglones: (Array.isArray(b.renglones) ? b.renglones : []).filter(
        (l) =>
          typeof l?.producto_id === 'string' &&
          Number.isInteger(l.cantidad) &&
          l.cantidad > 0,
      ),
      cajas: (Array.isArray(b.cajas) ? b.cajas : []).filter(
        (c) =>
          typeof c?.caja_id === 'string' &&
          // Solo las 8 opciones de P3; cualquier otra se descarta.
          OPCIONES_CAJA.some((o) => o.valor === c.opcion) &&
          Number.isInteger(c.cajas) &&
          c.cajas > 0,
      ),
    };
  }
  if (Array.isArray(o['rechazados'])) {
    r.rechazados = (o['rechazados'] as unknown[]).flatMap((z) => {
      const t = (z as { texto?: unknown } | null)?.texto;
      return typeof t === 'string' ? [{ motivo: '', texto: t }] : [];
    });
  }
  if (typeof o['destino'] === 'string') r.destino = o['destino'];
  return r;
}

/**
 * Le habla a Hada. Los 400/429/503 llegan como FunctionsHttpError: se lee igual
 * el cuerpo, que trae sus `textos` fijos. Si no hay nada legible, texto fijo.
 */
export async function preguntarHada(
  mensaje: string,
  historial: TurnoHada[],
  borradorActual: BorradorHada | null,
): Promise<RespuestaHada> {
  const { data, error } = (await supabase.functions.invoke('hada', {
    body: {
      mensaje,
      historial: historial.slice(-6),
      ...(borradorActual ? { borrador_actual: borradorActual } : {}),
    },
  })) as { data: unknown; error: unknown };
  let cuerpo: unknown = data;
  if (error instanceof FunctionsHttpError) {
    cuerpo = await (error.context as Response).json().catch(() => null);
  }
  const r = error && !(error instanceof FunctionsHttpError) ? null : leer(cuerpo);
  if (r && (r.textos.length > 0 || r.borrador)) return r;
  return { tipo: 'aviso', textos: [TEXTO_HADA_NO_DISPONIBLE] };
}

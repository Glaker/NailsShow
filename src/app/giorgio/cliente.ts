import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Evento, Turno } from '../../../supabase/functions/_shared/giorgio';

export type { Evento, Turno };

const AVISO_ERROR = 'Ahora no puedo responder, probá de nuevo en un rato.';

/**
 * Le pregunta a Giorgio y entrega cada evento a medida que llega (la función
 * responde una línea JSON por evento). Se usa `fetch` y no
 * `functions.invoke`, que espera la respuesta entera.
 */
export async function preguntar(
  historial: Turno[],
  ruta: string,
  ids: Record<string, string>,
  alEvento: (e: Evento) => void,
  signal: AbortSignal,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return alEvento({ t: 'aviso', v: 'Tu sesión venció. Volvé a ingresar.' });

  let r: Response;
  try {
    r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/giorgio`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ historial, ruta, ids }),
      signal,
    });
  } catch {
    if (!signal.aborted) alEvento({ t: 'aviso', v: AVISO_ERROR });
    return;
  }

  if (!r.ok || !r.body) {
    const j = (await r.json().catch(() => ({}))) as { aviso?: string };
    return alEvento({ t: 'aviso', v: j.aviso ?? AVISO_ERROR });
  }

  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let resto = '';
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += value;
      const lineas = resto.split('\n');
      resto = lineas.pop() ?? '';
      for (const l of lineas) if (l.trim()) alEvento(JSON.parse(l) as Evento);
    }
  } catch {
    if (!signal.aborted) alEvento({ t: 'aviso', v: AVISO_ERROR });
  }
}

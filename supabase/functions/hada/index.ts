/**
 * Edge Function `hada`: arma el borrador de un pedido a partir de lo que
 * escribe el cliente en el portal (P6, docs/disenos/P6-hada.md).
 *
 * POST { "mensaje": "…", "historial": [{ "rol", "texto", "tipo"? }], "borrador_actual"?: {…} }
 * con el Authorization del cliente. Responde un único JSON (ver CuerpoHada en
 * _shared/hada.ts). Todo lo que importa vive en `atender`; esto es el
 * adaptador: lee el pedido HTTP, crea los clientes y les pasa las dependencias.
 *
 * Privilegios (CLAUDE.md §5): el cliente de Supabase se crea con el token del
 * CLIENTE, así que cliente_lista, cliente_cajas y los límites salen de
 * funciones que leen su JWT y RLS aplica igual que en la app. Sin clave de
 * servicio. El gateway verifica el JWT (verify_jwt, no apagarlo).
 *
 * Secretos: ANTHROPIC_API_KEY (compartida con Giorgio), HADA_CLAVE (la base
 * guarda su hash en comercial.hada_config.clave_sha256), HADA_MODEL (sin valor
 * por defecto; tiene que empezar con claude-haiku-5-5), HADA_MODELO_EXPERTO
 * (opcional; sin él Hada no escala; si está, exactamente claude-sonnet-5-5) y HADA_ORIGENES (orígenes
 * permitidos separados por coma, por ejemplo https://pedidos.nailshow.com.ar).
 *
 * Orden de despliegue: migraciones, esta función y por último el frente.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { limpiarClaveApi, type RespuestaModelo } from '../_shared/giorgio.ts';
import { atender, MAX_BYTES_CUERPO, MENSAJES, type NombreRpc } from '../_shared/hada.ts';

const MAX_BYTES = MAX_BYTES_CUERPO;

function cabeceras(origen: string | null, origenes: string[]): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
  // Nunca `*`: solo el origen pedido, y solo si está en la lista.
  if (origen && origenes.includes(origen)) h['Access-Control-Allow-Origin'] = origen;
  return h;
}

Deno.serve(async (req) => {
  const origenes = (Deno.env.get('HADA_ORIGENES') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origen = req.headers.get('Origin');
  const cors = cabeceras(origen, origenes);

  if (req.method === 'OPTIONS')
    return new Response(null, {
      status: cors['Access-Control-Allow-Origin'] ? 204 : 403,
      headers: cors,
    });

  try {
    return await responder(req, origen, origenes, cors);
  } catch (e) {
    // Solo el nombre del error: nunca el mensaje, el cuerpo ni datos del cliente.
    console.error('hada:', e instanceof Error ? e.name : 'ERROR');
    return new Response(JSON.stringify({ tipo: 'aviso', textos: [MENSAJES.ERROR] }), {
      status: 500,
      headers: cors,
    });
  }
});

/** Lee hasta MAX_BYTES + 1 bytes aunque no haya Content-Length; de más, corta. */
async function leerCuerpo(req: Request): Promise<string> {
  if (!req.body) return '';
  const lector = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total <= MAX_BYTES) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    total += value.length;
  }
  await lector.cancel().catch(() => {});
  // Pasado el tope devuelve algo más largo que MAX_BYTES: `atender` lo rechaza.
  if (total > MAX_BYTES) return 'x'.repeat(MAX_BYTES + 1);
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    todo.set(p, pos);
    pos += p.length;
  }
  return new TextDecoder().decode(todo);
}

async function responder(
  req: Request,
  origen: string | null,
  origenes: string[],
  cors: Record<string, string>,
): Promise<Response> {
  const cuerpo = await leerCuerpo(req);

  const authorization = req.headers.get('Authorization');
  const { clave: apiKey, problema } = limpiarClaveApi(Deno.env.get('ANTHROPIC_API_KEY'));
  if (problema) console.error('hada: clave de API inválida');

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization ?? '' } },
      auth: { persistSession: false },
      db: { schema: 'comercial' },
    },
  );
  const anthropic = new Anthropic({
    apiKey: apiKey || 'sin-clave',
    timeout: 20_000,
    maxRetries: 0,
  });

  const salida = await atender(
    { metodo: req.method, origen, authorization, cuerpo },
    {
      origenes,
      claveHada: Deno.env.get('HADA_CLAVE') || undefined,
      modelo: Deno.env.get('HADA_MODEL') || undefined,
      modeloExperto: Deno.env.get('HADA_MODELO_EXPERTO') || undefined,
      apiKeyOk: !problema,
      rpc: async (nombre: NombreRpc, args?: Record<string, unknown>) => {
        const r = await db.rpc(nombre, args);
        return {
          data: r.data,
          error: r.error ? { message: r.error.message, code: r.error.code } : null,
        };
      },
      llamar: async (params) =>
        (await anthropic.messages.create(
          params as unknown as Anthropic.MessageCreateParamsNonStreaming,
          {
            signal: req.signal,
          },
        )) as unknown as RespuestaModelo,
      // Solo códigos: nunca el cuerpo, el mensaje del cliente ni el de la base.
      registrarError: (codigo) => console.error('hada:', codigo),
    },
  );

  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.status,
    headers: cors,
  });
}

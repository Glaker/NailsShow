/**
 * Edge Function `giorgio`: el asistente de ayuda de la app (D-57).
 *
 * POST { "historial": [{ "rol": "usuario" | "giorgio", "texto": "…" }],
 *        "ruta": "/costos", "ids": { "producto": "<uuid>" } }
 * con el Authorization del usuario. Responde en streaming, una línea JSON por
 * evento (ver `Evento` en _shared/giorgio.ts).
 *
 * Privilegios (CLAUDE.md §5):
 * - El cliente de Supabase se crea con el token del USUARIO: los límites, la
 *   lista de pantallas y el registro salen de funciones que leen su JWT, y RLS
 *   aplica igual que en la app. Sin clave de servicio.
 * - La clave de Anthropic sale del secreto ANTHROPIC_API_KEY y nunca vuelve al
 *   navegador. Los modelos se configuran sin desplegar: GIORGIO_MODELO (por
 *   defecto claude-haiku-5-5) responde primero; GIORGIO_MODELO_EXPERTO (por
 *   defecto claude-sonnet-5-5; vacío o «no» lo apaga) atiende las preguntas
 *   que el primero escala (D-61).
 * - GIORGIO_CLAVE_REGISTRO es la clave que exige core.giorgio_registrar; la
 *   base guarda solo su hash (D-59). Así un usuario no puede cargar consultas
 *   inventadas llamando a la función de la base con su propio token.
 *
 * Qué decide quién:
 * - La base (core.giorgio_estado) decide si la persona puede preguntar:
 *   interruptor, topes diario y mensual, límite diario por usuario (D-60).
 * - La función arma el prompt con las pantallas del usuario, corre el bucle de
 *   herramientas (máximo 4 llamadas por modelo) y registra la consulta con
 *   core.giorgio_registrar. ir_a valida la ruta contra la lista cerrada del
 *   usuario y ofrece un botón: no navega ni escribe nada. consultar_experto
 *   no se ejecuta: hace que la pregunta se repita con el experto.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import catalogoJson from './catalogo.json' with { type: 'json' };
import {
  AVISOS,
  HERRAMIENTA_EXPERTO,
  HERRAMIENTA_IR_A,
  MAX_TOKENS_SALIDA,
  armarMensajes,
  armarSistema,
  comoDatos,
  contextoPantalla,
  irA,
  pantallasPermitidas,
  parametrosModelo,
  responder,
  sanearHistorial,
  sanearIds,
  type Catalogo,
  type Evento,
  type Excepcion,
  type ResultadoBucle,
  type RespuestaModelo,
} from '../_shared/giorgio.ts';

const catalogo = catalogoJson as Catalogo;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Usá POST.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ aviso: AVISOS.SIN_SESION }, 401);

  let entrada: { historial?: unknown; ruta?: unknown; ids?: unknown } = {};
  try {
    entrada = (await req.json()) ?? {};
  } catch {
    /* cuerpo inválido */
  }
  const historial = sanearHistorial(entrada.historial);
  if (!historial) return json({ error: 'Falta la pregunta.' }, 400);
  const ruta = typeof entrada.ruta === 'string' ? entrada.ruta : '';
  const ids = sanearIds(entrada.ids);

  // Cliente con el token del usuario: RLS y límites a su nombre.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
      db: { schema: 'core' },
    },
  );

  const estado = await db.rpc('giorgio_estado');
  if (estado.error) {
    console.error('giorgio_estado:', estado.error.message);
    return json({ aviso: AVISOS.ERROR }, 500);
  }
  const e = estado.data as {
    permitido: boolean;
    motivo: string | null;
    roles?: string[];
  };
  if (!e.permitido)
    return json({ aviso: AVISOS[e.motivo ?? 'ERROR'] ?? AVISOS.ERROR }, 429);

  const vis = await db.from('visibilidad_pantallas').select('pantalla, rol, visible');
  if (vis.error) {
    console.error('visibilidad_pantallas:', vis.error.message);
    return json({ aviso: AVISOS.ERROR }, 500);
  }
  const permitidas = pantallasPermitidas(
    catalogo,
    e.roles ?? [],
    vis.data as Excepcion[],
  );

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  // Sin ella la base rechaza el registro (D-59): mejor no gastar en la respuesta.
  const claveRegistro = Deno.env.get('GIORGIO_CLAVE_REGISTRO');
  if (!apiKey || !claveRegistro) {
    console.error('Falta el secreto ANTHROPIC_API_KEY o GIORGIO_CLAVE_REGISTRO.');
    return json({ aviso: AVISOS.SIN_CONFIGURAR }, 503);
  }
  const experto = Deno.env.get('GIORGIO_MODELO_EXPERTO');
  const modelos = {
    base: Deno.env.get('GIORGIO_MODELO') || 'claude-haiku-5-5',
    experto:
      experto === undefined
        ? 'claude-sonnet-5-5'
        : ['', 'no'].includes(experto)
          ? null
          : experto,
  };
  const anthropic = new Anthropic({ apiKey, maxRetries: 1 });
  // Un prompt por modelo: solo el base sabe que puede escalar. Cada uno es
  // fijo para un mismo conjunto de pantallas, así que cachea.
  const sistemaBase = armarSistema(
    permitidas,
    catalogo.subrutas,
    modelos.experto !== null,
  );
  const sistemaExperto = armarSistema(permitidas, catalogo.subrutas);
  const mensajes = armarMensajes(historial, contextoPantalla(ruta, ids));

  const { readable, writable } = new TransformStream<Uint8Array>();
  const escritor = writable.getWriter();
  const codificador = new TextEncoder();
  const emitir = (ev: Evento) =>
    escritor.write(codificador.encode(JSON.stringify(ev) + '\n')).catch(() => {
      /* el navegador cortó («Detener»): no hay a quién escribirle */
    });

  const atender = async () => {
    const inicio = Date.now();
    let modeloUsado = modelos.base;
    let resultado: ResultadoBucle | null = null;
    let error: string | null = null;
    try {
      resultado = await responder(
        mensajes,
        modelos,
        async (modelo, conversacion, conHerramientas) => {
          const esBase = modelo === modelos.base;
          const params = {
            model: modelo,
            max_tokens: MAX_TOKENS_SALIDA,
            // Herramientas y sistema son fijos por modelo: la marca de caché
            // cubre ambos (orden tools → system).
            system: [
              {
                type: 'text',
                text: esBase ? sistemaBase : sistemaExperto,
                cache_control: { type: 'ephemeral' },
              },
            ],
            tools:
              esBase && modelos.experto
                ? [HERRAMIENTA_IR_A, HERRAMIENTA_EXPERTO]
                : [HERRAMIENTA_IR_A],
            tool_choice: { type: conHerramientas ? 'auto' : 'none' },
            messages: conversacion,
            ...parametrosModelo(modelo),
          } as unknown as Anthropic.MessageStreamParams;
          const s = anthropic.messages.stream(params, { signal: req.signal });
          s.on('text', (delta) => void emitir({ t: 'texto', v: delta }));
          return (await s.finalMessage()) as unknown as RespuestaModelo;
        },
        (nombre, entradaHerramienta) => {
          if (nombre !== 'ir_a')
            return {
              contenido: comoDatos({ error: 'Herramienta desconocida.' }),
              error: true,
            };
          const r = irA(entradaHerramienta, permitidas, catalogo.subrutas);
          if (r.boton) void emitir({ t: 'boton', ...r.boton });
          return r;
        },
        () => {
          modeloUsado = modelos.experto ?? modelos.base;
          void emitir({ t: 'escalado' });
        },
      );
      if (resultado.rechazo) await emitir({ t: 'aviso', v: AVISOS.RECHAZO });
    } catch (err) {
      error =
        err instanceof Anthropic.APIError
          ? `API ${err.status ?? '?'}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      if (!req.signal.aborted) await emitir({ t: 'aviso', v: AVISOS.ERROR });
    } finally {
      // Con escalado, todo el uso se registra al precio del experto.
      const reg = await db.rpc('giorgio_registrar', {
        p_clave: claveRegistro,
        p_ruta: ruta,
        p_pregunta: historial.at(-1)!.texto,
        p_respuesta: resultado?.texto ?? null,
        p_modelo: modeloUsado,
        p_tokens_entrada: resultado?.uso.entrada ?? 0,
        p_tokens_salida: resultado?.uso.salida ?? 0,
        p_tokens_cache_lectura: resultado?.uso.cacheLectura ?? 0,
        p_tokens_cache_escritura: resultado?.uso.cacheEscritura ?? 0,
        p_herramientas: resultado?.herramientas ?? [],
        p_iteraciones: resultado?.iteraciones ?? 0,
        p_latencia_ms: Date.now() - inicio,
        p_error: error,
      });
      if (reg.error) console.error('giorgio_registrar:', reg.error.message);
      await emitir({ t: 'fin' });
      await escritor.close().catch(() => {});
    }
  };
  void atender();

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
});

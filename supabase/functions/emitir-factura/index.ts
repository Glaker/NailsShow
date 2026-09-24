/**
 * Edge Function `emitir-factura`: emite la factura electrónica ARCA de un
 * pedido a través de Afip SDK.
 *
 * POST { "pedido_id": "<uuid>" }  con el Authorization del usuario.
 *
 * Privilegios (CLAUDE.md §5, RN-66):
 * - El cliente de Supabase se crea con el token del USUARIO, no con la clave de
 *   servicio: la función corre como `authenticated`, respeta RLS, y cada
 *   escritura queda en la auditoría a nombre de quien apretó «Emitir».
 * - El token de Afip SDK sale del secreto AFIP_SDK_ACCESS_TOKEN y nunca vuelve
 *   al navegador. En producción, el certificado y la clave también van como
 *   secretos (AFIP_CERT, AFIP_KEY); en homologación no hacen falta.
 *
 * Qué decide la base y qué la función:
 * - La base (comercial.preparar_factura) valida el pedido, elige A o B (RN-57),
 *   calcula importes y deja la factura PENDIENTE.
 * - La función pide el número a ARCA, lo fija, envía, y le pasa la respuesta
 *   cruda a comercial.registrar_resultado_factura, que la interpreta.
 * - Si ARCA rechaza: la factura queda RECHAZADA con el motivo. Si la función no
 *   llega a enviar: RECHAZADA con «No se envió a ARCA: …». Si se envió y no se
 *   sabe qué pasó (se cortó la red): queda PENDIENTE, y el reintento consulta
 *   en ARCA antes de pedir otro número. Nunca en silencio.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  AFIP_SDK_BASE,
  cuerpoAuth,
  cuerpoConsultar,
  cuerpoSolicitar,
  cuerpoUltimoAutorizado,
  leerUltimoAutorizado,
  respuestaDesdeConsulta,
  sinAuth,
  type AuthArca,
  type FacturaParaArca,
} from '../_shared/arca.ts';

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

/** Llamada a Afip SDK. Devuelve el JSON aunque el HTTP no sea 200. */
async function afipSdk(ruta: string, cuerpo: unknown, token: string) {
  const r = await fetch(`${AFIP_SDK_BASE}/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { texto };
  }
  return { status: r.status, datos };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Usá POST.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Falta la sesión del usuario.' }, 401);

  let pedidoId: string | undefined;
  try {
    pedidoId = (await req.json())?.pedido_id;
  } catch {
    /* cuerpo inválido */
  }
  if (!pedidoId) return json({ error: 'Falta pedido_id.' }, 400);

  // Cliente con el token del usuario: RLS y auditoría a su nombre.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
      db: { schema: 'comercial' },
    },
  );

  // 1. La base prepara (o devuelve la pendiente, si es un reintento).
  const prep = await db.rpc('preparar_factura', { p_pedido_id: pedidoId });
  if (prep.error) return json({ error: prep.error.message }, 422);
  const f = prep.data as FacturaParaArca;

  const registrar = async (
    solicitud: unknown,
    respuesta: unknown,
    errorEnvio: string | null,
  ) => {
    const r = await db.rpc('registrar_resultado_factura', {
      p_factura_id: f.factura_id,
      p_solicitud: solicitud,
      p_respuesta: respuesta,
      p_error_envio: errorEnvio,
    });
    if (r.error)
      return json(
        {
          error: `No se pudo registrar el resultado: ${r.error.message}`,
          factura_id: f.factura_id,
        },
        500,
      );
    return json(r.data);
  };

  // 2. Credenciales, del almacén de secretos.
  const tokenSdk = Deno.env.get('AFIP_SDK_ACCESS_TOKEN');
  if (!tokenSdk) return registrar(null, null, 'falta el secreto AFIP_SDK_ACCESS_TOKEN.');
  const cuerpoA: Record<string, unknown> = cuerpoAuth(f);
  if (f.ambiente === 'PRODUCCION') {
    const cert = Deno.env.get('AFIP_CERT');
    const key = Deno.env.get('AFIP_KEY');
    if (!cert || !key)
      return registrar(
        null,
        null,
        'en producción faltan los secretos AFIP_CERT y AFIP_KEY.',
      );
    cuerpoA.cert = cert;
    cuerpoA.key = key;
  }

  // 3. Ticket de acceso de ARCA.
  const a = await afipSdk('auth', cuerpoA, tokenSdk);
  const ta = a.datos as { token?: string; sign?: string; message?: string };
  if (a.status !== 200 || !ta.token || !ta.sign) {
    return registrar(
      null,
      a.datos,
      `la autorización de ARCA falló (HTTP ${a.status}): ${ta.message ?? 'sin detalle'}.`,
    );
  }
  const auth: AuthArca = { Token: ta.token, Sign: ta.sign, Cuit: Number(f.cuit_emisor) };

  // 4. Número: último autorizado + 1 (RN-55). En un reintento, si el último
  //    autorizado ES el número que ya habíamos fijado, la emisión anterior
  //    llegó a ARCA: se recupera su CAE en vez de emitir otra.
  const u = await afipSdk('requests', cuerpoUltimoAutorizado(f, auth), tokenSdk);
  const ult = leerUltimoAutorizado(u.datos);
  if ('errores' in ult) {
    return registrar(
      null,
      u.datos,
      `no se pudo leer el último comprobante: ${ult.errores.map((e) => `${e.Code}: ${e.Msg}`).join(' | ')}.`,
    );
  }

  if (f.numero !== null && ult.numero === f.numero) {
    const c = await afipSdk('requests', cuerpoConsultar(f, auth, f.numero), tokenSdk);
    const recuperada = respuestaDesdeConsulta(c.datos);
    if (recuperada)
      return registrar(sinAuth(cuerpoConsultar(f, auth, f.numero)), recuperada, null);
  }
  const numero = f.numero !== null && ult.numero < f.numero ? f.numero : ult.numero + 1;

  const fijar = await db.rpc('fijar_numero_factura', {
    p_factura_id: f.factura_id,
    p_numero: numero,
  });
  if (fijar.error) return registrar(null, null, fijar.error.message);

  // 5. Solicitud del CAE.
  const cuerpo = cuerpoSolicitar(f, auth, numero);
  let s: { status: number; datos: unknown };
  try {
    s = await afipSdk('requests', cuerpo, tokenSdk);
  } catch (e) {
    // Se envió y no hay respuesta: no se sabe si ARCA lo autorizó. La factura
    // queda PENDIENTE con su número; el reintento lo consulta.
    return json(
      {
        factura_id: f.factura_id,
        estado: 'PENDIENTE',
        numero,
        motivo: `Sin respuesta de ARCA (${String(e)}). Reintentá: se va a consultar si el comprobante ${numero} quedó autorizado.`,
      },
      502,
    );
  }

  if (s.status >= 500) {
    // Falla del lado de Afip SDK / ARCA: puede haber llegado a procesarse.
    // Igual que sin respuesta: PENDIENTE, y el reintento consulta.
    return json(
      {
        factura_id: f.factura_id,
        estado: 'PENDIENTE',
        numero,
        motivo: `Afip SDK respondió HTTP ${s.status}. Reintentá: se va a consultar si el comprobante ${numero} quedó autorizado.`,
        respuesta: s.datos,
      },
      502,
    );
  }
  if (s.status !== 200) {
    // 4xx: Afip SDK rechazó la llamada antes de ARCA (token, formato): no se emitió.
    return registrar(
      sinAuth(cuerpo),
      s.datos,
      `Afip SDK respondió HTTP ${s.status}: ${(s.datos as { message?: string })?.message ?? 'sin detalle'}.`,
    );
  }

  // 6. La base interpreta la respuesta: AUTORIZADA o RECHAZADA con motivo.
  return registrar(sinAuth(cuerpo), s.datos, null);
});

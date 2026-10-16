/**
 * Edge Function `series-oficiales`: trae el tipo de cambio A3500 del BCRA y el
 * IPC del INDEC y completa comercial.series_macro (pedido del 2026-10-15: que
 * Finanzas no los cargue a mano).
 *
 * POST sin cuerpo, con el Authorization del usuario.
 *
 * Fuentes, sólo oficiales:
 * - BCRA, planilla de la Comunicación «A» 3500 (com3500.xls). La API de
 *   estadísticas del BCRA respondía 500 a toda consulta al escribir esto; la
 *   planilla es la publicación de origen y se actualiza cada día hábil.
 * - INDEC, IPC nacional base dic-2016, por la API de series de datos.gob.ar
 *   (el portal de datos del Estado; el INDEC no tiene API propia).
 *
 * Privilegios (CLAUDE.md §5): el cliente se crea con el token del USUARIO. Las
 * políticas de series_macro dejan escribir sólo a Finanzas, y cada fila queda
 * en core.auditoria a nombre de quien la trajo. Sin clave de servicio.
 *
 * Qué escribe: ver planDeCarga en _shared/series_oficiales.ts. Un valor
 * definitivo no se pisa nunca.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
// SheetJS 0.20.3, copiado de su distribución oficial
// (https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs): la de npm quedó en
// 0.18.5, con vulnerabilidades conocidas, y el empaquetador de Supabase no
// importa desde cdn.sheetjs.com. Ver _shared/vendor/README.md. Sólo se le da
// la planilla del BCRA.
import * as XLSX from '../_shared/vendor/xlsx-0.20.3.mjs';
import {
  URL_A3500,
  URL_IPC,
  planDeCarga,
  puntosA3500,
  puntosIpc,
  type FilaExistente,
  type PuntoSerie,
} from '../_shared/series_oficiales.ts';

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

async function bajar(url: string): Promise<Response> {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} respondió ${r.status}`);
  return r;
}

async function traerA3500(hoy: string): Promise<PuntoSerie[]> {
  const libro = XLSX.read(new Uint8Array(await (await bajar(URL_A3500)).arrayBuffer()), {
    type: 'array',
  });
  const hoja = (i: number) => {
    const h = libro.Sheets[libro.SheetNames[i] ?? ''];
    if (!h) throw new Error('La planilla del BCRA cambió de formato.');
    return XLSX.utils.sheet_to_json<unknown[]>(h, { header: 1, raw: true });
  };
  const puntos = puntosA3500(hoja(0), hoja(1), hoy);
  if (puntos.length === 0) throw new Error('La planilla del BCRA no trajo cotizaciones.');
  return puntos;
}

async function traerIpc(): Promise<PuntoSerie[]> {
  return puntosIpc(await (await bajar(URL_IPC)).json());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Usá POST.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Falta la sesión del usuario.' }, 401);

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

  // Fecha de Buenos Aires, no la del servidor (UTC).
  const hoy = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

  // Cada fuente por su lado: si una no responde, la otra se carga igual.
  const [a3500, ipc] = await Promise.allSettled([traerA3500(hoy), traerIpc()]);
  const errores: string[] = [];
  const nuevos: PuntoSerie[] = [];
  if (a3500.status === 'fulfilled') nuevos.push(...a3500.value);
  else errores.push(`Dólar (BCRA): ${String(a3500.reason?.message ?? a3500.reason)}`);
  if (ipc.status === 'fulfilled') nuevos.push(...ipc.value);
  else errores.push(`Inflación (INDEC): ${String(ipc.reason?.message ?? ipc.reason)}`);

  const existentes = await db
    .from('series_macro')
    .select('id, serie, mes, valor, es_provisorio');
  if (existentes.error) return json({ error: existentes.error.message, errores }, 403);

  const { insertar, actualizar } = planDeCarga(
    existentes.data as FilaExistente[],
    nuevos,
  );

  if (insertar.length > 0) {
    const r = await db.from('series_macro').insert(insertar);
    if (r.error) return json({ error: r.error.message, errores }, 403);
  }
  for (const p of actualizar) {
    const r = await db
      .from('series_macro')
      .update({ valor: p.valor, fuente: p.fuente, es_provisorio: p.es_provisorio })
      .eq('id', p.id);
    if (r.error) return json({ error: r.error.message, errores }, 403);
  }

  const ultimo = (s: string) =>
    nuevos.filter((p) => p.serie === s).sort((a, b) => b.mes.localeCompare(a.mes))[0] ??
    null;

  return json({
    insertados: insertar.length,
    actualizados: actualizar.length,
    dolar: ultimo('TC_A3500_CIERRE'),
    ipc: ultimo('IPC'),
    errores,
  });
});

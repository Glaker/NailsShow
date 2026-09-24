/**
 * Armado de pedidos a Afip SDK / ARCA (WSFE) y lectura de sus respuestas.
 *
 * Sin dependencias de Deno ni de red: la Edge Function hace las llamadas y
 * esto arma y lee los cuerpos, así se puede probar con Vitest.
 *
 * Formas verificadas contra la API de Afip SDK en homologación el 2026-09-24,
 * no supuestas: documentación en docs.afipsdk.com (integración vía API y
 * factura electrónica) y respuestas reales de FECompUltimoAutorizado,
 * FECAESolicitar, FECompConsultar y FEParamGetCondicionIvaReceptor.
 *
 *   POST https://app.afipsdk.com/api/v1/afip/auth
 *        Authorization: Bearer <access token>
 *        { environment, tax_id, wsid }                 → { token, sign, expiration }
 *   POST https://app.afipsdk.com/api/v1/afip/requests
 *        { environment, method, wsid, params: { Auth: { Token, Sign, Cuit }, … } }
 *
 * ARCA contesta HTTP 200 aunque rechace: el resultado está en `Resultado`
 * ('A' aprobado, 'R' rechazado) y los motivos en Observaciones.Obs[] y
 * Errors.Err[] ({ Code, Msg }).
 */

export const AFIP_SDK_BASE = 'https://app.afipsdk.com/api/v1/afip';

/** Lo que devuelve `comercial.preparar_factura()`. */
export interface FacturaParaArca {
  factura_id: string;
  pedido_numero: string;
  ambiente: 'HOMOLOGACION' | 'PRODUCCION';
  cuit_emisor: string;
  punto_venta: number;
  tipo: 'A' | 'B';
  codigo_arca: number;
  numero: number | null;
  /** YYYYMMDD */
  fecha: string;
  doc_tipo: number;
  doc_numero: string;
  condicion_iva: number;
  importe_neto: number;
  importe_iva: number;
  importe_total: number;
  alicuotas: { Id: number; BaseImp: number; Importe: number; alicuota: number }[];
}

export interface AuthArca {
  Token: string;
  Sign: string;
  Cuit: number;
}

export interface ErrorArca {
  Code: number;
  Msg: string;
}

/** `environment` de Afip SDK según el ambiente de la configuración fiscal. */
export function entorno(ambiente: FacturaParaArca['ambiente']): 'dev' | 'prod' {
  return ambiente === 'PRODUCCION' ? 'prod' : 'dev';
}

export function cuerpoAuth(f: FacturaParaArca) {
  return { environment: entorno(f.ambiente), tax_id: f.cuit_emisor, wsid: 'wsfe' };
}

export function cuerpoUltimoAutorizado(f: FacturaParaArca, auth: AuthArca) {
  return {
    environment: entorno(f.ambiente),
    method: 'FECompUltimoAutorizado',
    wsid: 'wsfe',
    params: { Auth: auth, PtoVta: f.punto_venta, CbteTipo: f.codigo_arca },
  };
}

export function cuerpoConsultar(f: FacturaParaArca, auth: AuthArca, numero: number) {
  return {
    environment: entorno(f.ambiente),
    method: 'FECompConsultar',
    wsid: 'wsfe',
    params: {
      Auth: auth,
      FeCompConsReq: { CbteTipo: f.codigo_arca, CbteNro: numero, PtoVta: f.punto_venta },
    },
  };
}

/**
 * FECAESolicitar de un comprobante. Concepto 1 (productos), en pesos. Los
 * importes vienen calculados de la base (`preparar_factura`), no se recalculan
 * acá: la cuenta es una sola.
 */
export function cuerpoSolicitar(f: FacturaParaArca, auth: AuthArca, numero: number) {
  return {
    environment: entorno(f.ambiente),
    method: 'FECAESolicitar',
    wsid: 'wsfe',
    params: {
      Auth: auth,
      FeCAEReq: {
        FeCabReq: { CantReg: 1, PtoVta: f.punto_venta, CbteTipo: f.codigo_arca },
        FeDetReq: {
          FECAEDetRequest: {
            Concepto: 1,
            DocTipo: f.doc_tipo,
            DocNro: Number(f.doc_numero),
            CbteDesde: numero,
            CbteHasta: numero,
            CbteFch: Number(f.fecha),
            ImpTotal: Number(f.importe_total),
            ImpTotConc: 0,
            ImpNeto: Number(f.importe_neto),
            ImpOpEx: 0,
            ImpIVA: Number(f.importe_iva),
            ImpTrib: 0,
            MonId: 'PES',
            MonCotiz: 1,
            CondicionIVAReceptorId: f.condicion_iva,
            Iva: {
              AlicIva: f.alicuotas.map((a) => ({
                Id: a.Id,
                BaseImp: Number(a.BaseImp),
                Importe: Number(a.Importe),
              })),
            },
          },
        },
      },
    },
  };
}

/** El cuerpo sin `Auth`: es lo que se guarda en la factura (token y firma, no). */
export function sinAuth<T extends { params: Record<string, unknown> }>(cuerpo: T) {
  const params = Object.fromEntries(
    Object.entries(cuerpo.params).filter(([clave]) => clave !== 'Auth'),
  );
  return { ...cuerpo, params };
}

/** Número del último comprobante autorizado, o el error de ARCA. */
export function leerUltimoAutorizado(
  resp: unknown,
): { numero: number } | { errores: ErrorArca[] } {
  const r = (resp as { FECompUltimoAutorizadoResult?: Record<string, unknown> })
    ?.FECompUltimoAutorizadoResult;
  const errores = (r?.Errors as { Err?: ErrorArca[] } | undefined)?.Err ?? [];
  if (errores.length > 0 || typeof r?.CbteNro !== 'number') {
    return {
      errores: errores.length ? errores : [{ Code: 0, Msg: 'Respuesta sin CbteNro.' }],
    };
  }
  return { numero: r.CbteNro };
}

/**
 * Si el comprobante ya está autorizado en ARCA (reintento después de una caída
 * con la factura en vuelo), arma una respuesta con la forma de FECAESolicitar
 * a partir de FECompConsultar, para registrarla igual que una emisión. Se
 * marca de dónde salió, para que la auditoría no la confunda con la original.
 */
export function respuestaDesdeConsulta(resp: unknown): Record<string, unknown> | null {
  const g = (resp as { FECompConsultarResult?: { ResultGet?: Record<string, unknown> } })
    ?.FECompConsultarResult?.ResultGet;
  if (!g || g.Resultado !== 'A' || !g.CodAutorizacion) return null;
  // ARCA los devuelve como texto o número según el campo: se normalizan a texto.
  const cae = g.CodAutorizacion as string | number;
  const vto = g.FchVto as string | number;
  return {
    recuperada_por: 'FECompConsultar',
    consulta: resp,
    FECAESolicitarResult: {
      FeCabResp: { Resultado: 'A', PtoVta: g.PtoVta, CbteTipo: g.CbteTipo },
      FeDetResp: {
        FECAEDetResponse: [
          {
            Resultado: 'A',
            CbteDesde: g.CbteDesde,
            CbteHasta: g.CbteHasta,
            CAE: String(cae),
            CAEFchVto: String(vto),
          },
        ],
      },
    },
  };
}

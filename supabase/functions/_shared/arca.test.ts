import { describe, expect, it } from 'vitest';
import {
  cuerpoAuth,
  cuerpoSolicitar,
  entorno,
  leerUltimoAutorizado,
  respuestaDesdeConsulta,
  sinAuth,
  type FacturaParaArca,
} from './arca';

/*
 * Las respuestas de ARCA de estas pruebas son reales: se capturaron de Afip
 * SDK en homologación el 2026-09-24 (CUIT de demostración 20409378472).
 */

const AUTH = { Token: 'tok', Sign: 'firma', Cuit: 20409378472 };

function factura(extra: Partial<FacturaParaArca> = {}): FacturaParaArca {
  return {
    factura_id: 'f1',
    pedido_numero: 'P-0001',
    ambiente: 'HOMOLOGACION',
    cuit_emisor: '20409378472',
    punto_venta: 1,
    tipo: 'B',
    codigo_arca: 6,
    numero: null,
    fecha: '20260924',
    doc_tipo: 99,
    doc_numero: '0',
    condicion_iva: 5,
    importe_neto: 100,
    importe_iva: 21,
    importe_total: 121,
    alicuotas: [{ Id: 5, BaseImp: 100, Importe: 21, alicuota: 21 }],
    ...extra,
  };
}

describe('ambiente', () => {
  it('homologación es «dev» y producción es «prod»', () => {
    expect(entorno('HOMOLOGACION')).toBe('dev');
    expect(entorno('PRODUCCION')).toBe('prod');
  });

  it('el auth lleva tax_id y wsid, como pide la referencia de la API', () => {
    expect(cuerpoAuth(factura())).toEqual({
      environment: 'dev',
      tax_id: '20409378472',
      wsid: 'wsfe',
    });
  });
});

describe('FECAESolicitar', () => {
  it('arma el comprobante con la forma de la documentación de Afip SDK', () => {
    const c = cuerpoSolicitar(factura(), AUTH, 41693);
    expect(c.method).toBe('FECAESolicitar');
    expect(c.wsid).toBe('wsfe');
    const det = c.params.FeCAEReq.FeDetReq.FECAEDetRequest;
    expect(c.params.FeCAEReq.FeCabReq).toEqual({ CantReg: 1, PtoVta: 1, CbteTipo: 6 });
    expect(det).toMatchObject({
      Concepto: 1,
      DocTipo: 99,
      DocNro: 0,
      CbteDesde: 41693,
      CbteHasta: 41693,
      CbteFch: 20260924,
      ImpTotal: 121,
      ImpNeto: 100,
      ImpIVA: 21,
      MonId: 'PES',
      MonCotiz: 1,
      CondicionIVAReceptorId: 5,
    });
    // `alicuota` es un dato interno: no viaja a ARCA.
    expect(det.Iva.AlicIva).toEqual([{ Id: 5, BaseImp: 100, Importe: 21 }]);
  });

  it('el total cierra con neto + IVA, que es lo que valida ARCA (10048)', () => {
    const det = cuerpoSolicitar(factura(), AUTH, 1).params.FeCAEReq.FeDetReq
      .FECAEDetRequest;
    expect(det.ImpTotal).toBe(
      det.ImpNeto + det.ImpIVA + det.ImpTotConc + det.ImpOpEx + det.ImpTrib,
    );
  });

  it('una factura A identifica al receptor por CUIT numérico', () => {
    const det = cuerpoSolicitar(
      factura({
        tipo: 'A',
        codigo_arca: 1,
        doc_tipo: 80,
        doc_numero: '33693450239',
        condicion_iva: 1,
      }),
      AUTH,
      15541,
    ).params.FeCAEReq.FeDetReq.FECAEDetRequest;
    expect(det.DocTipo).toBe(80);
    expect(det.DocNro).toBe(33693450239);
  });

  it('lo que se guarda en la factura no lleva token ni firma', () => {
    const guardado = sinAuth(cuerpoSolicitar(factura(), AUTH, 1));
    expect(JSON.stringify(guardado)).not.toContain('tok');
    expect(JSON.stringify(guardado)).not.toContain('firma');
    expect(guardado.params).toHaveProperty('FeCAEReq');
  });
});

describe('lectura de respuestas reales', () => {
  it('último autorizado', () => {
    const r = {
      FECompUltimoAutorizadoResult: { PtoVta: 1, CbteTipo: 6, CbteNro: 41692 },
    };
    expect(leerUltimoAutorizado(r)).toEqual({ numero: 41692 });
  });

  it('último autorizado con error de ARCA', () => {
    const r = {
      FECompUltimoAutorizadoResult: {
        PtoVta: 1,
        CbteTipo: 9999,
        CbteNro: 0,
        Errors: {
          Err: [
            { Code: 11001, Msg: 'Campo CbteTipo, no es un tipo de comprobante valido.' },
          ],
        },
      },
    };
    expect(leerUltimoAutorizado(r)).toEqual({
      errores: [
        { Code: 11001, Msg: 'Campo CbteTipo, no es un tipo de comprobante valido.' },
      ],
    });
  });

  it('recupera un comprobante ya autorizado desde FECompConsultar', () => {
    const consulta = {
      FECompConsultarResult: {
        ResultGet: {
          CbteDesde: 41693,
          CbteHasta: 41693,
          Resultado: 'A',
          CodAutorizacion: '86390925863442',
          FchVto: '20261004',
          PtoVta: 1,
          CbteTipo: 6,
        },
      },
    };
    const r = respuestaDesdeConsulta(consulta) as {
      recuperada_por: string;
      FECAESolicitarResult: {
        FeDetResp: { FECAEDetResponse: { CAE: string; CAEFchVto: string }[] };
      };
    };
    expect(r.recuperada_por).toBe('FECompConsultar');
    expect(r.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0]).toMatchObject({
      CAE: '86390925863442',
      CAEFchVto: '20261004',
    });
  });

  it('si el comprobante no existe en ARCA, no inventa una respuesta', () => {
    const consulta = {
      FECompConsultarResult: {
        Errors: {
          Err: [
            {
              Code: 602,
              Msg: 'No existen datos en nuestros registros para los parametros ingresados.',
            },
          ],
        },
      },
    };
    expect(respuestaDesdeConsulta(consulta)).toBeNull();
  });
});

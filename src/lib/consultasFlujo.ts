/**
 * Flujo de caja y volúmenes por contraparte para el inicio de Administración
 * (20260930180000/180100).
 *
 * PUENTE DE TIPOS: las funciones no están en `database.types.ts` hasta aplicar
 * la migración y correr `npm run db:types`. Después, tipar desde
 * `Database['comercial']['Functions']` y borrar las interfaces de fila.
 */

import { useQuery } from '@tanstack/react-query';
import { rpcComercial } from './consultasComercial';

export interface DiaFlujo {
  fecha: string;
  ingresos: number;
  egresos: number;
  neto: number;
  saldo_bancos: number;
  saldo_efectivo: number;
}

export interface ProductoVendido {
  producto: string;
  cantidad: number;
  importe: number;
}

export interface MovimientoDia {
  id: string;
  orden: number;
  importe: number;
  tipo: 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA' | 'AJUSTE';
  concepto: string;
  contraparte: string | null;
  comprobante: string | null;
  es_anulacion: boolean;
  cuenta: string;
  cuenta_tipo: 'CAJA' | 'BANCO' | 'BILLETERA';
  titular: string | null;
  registrado_por: string | null;
  cobro: {
    cliente: string;
    medio: string;
    referencia: string | null;
    facturas: {
      comprobante: string;
      imputado: number;
      a_nombre_de: string;
      pedido: string;
      vendedor: string | null;
      productos: ProductoVendido[];
    }[];
  } | null;
  pago: {
    proveedor: string;
    medio: string;
    referencia: string | null;
    comprobantes: {
      comprobante: string;
      imputado: number;
      recepcion: string | null;
      insumos: { insumo: string; cantidad: number | null; unidad: string | null }[];
    }[];
  } | null;
}

export interface CuentaDia {
  cuenta: string;
  tipo: 'CAJA' | 'BANCO' | 'BILLETERA';
  banco: string | null;
  titular: string | null;
  de_tercero: boolean;
  saldo: number;
  entro: number;
  salio: number;
}

export interface DetalleDia {
  fecha: string;
  movimientos: MovimientoDia[];
  cuentas: CuentaDia[];
}

export interface Volumen {
  lado: 'VENTA' | 'COMPRA';
  contraparte: string;
  ambiente: 'PRODUCCION' | 'HOMOLOGACION';
  total: number;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcComercial<T>(fn, args);
  if (error) throw error;
  return data as T;
}

export function useFlujoDiario(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['flujo-diario', desde, hasta],
    queryFn: async () =>
      (
        await rpc<DiaFlujo[]>('flujo_caja_diario', { p_desde: desde, p_hasta: hasta })
      ).map((d) => ({
        ...d,
        ingresos: Number(d.ingresos),
        egresos: Number(d.egresos),
        neto: Number(d.neto),
        saldo_bancos: Number(d.saldo_bancos),
        saldo_efectivo: Number(d.saldo_efectivo),
      })),
  });
}

export function useDetalleDia(fecha: string | null) {
  return useQuery({
    queryKey: ['flujo-dia', fecha],
    enabled: Boolean(fecha),
    queryFn: () => rpc<DetalleDia>('flujo_caja_dia', { p_fecha: fecha }),
  });
}

export function useVolumenes(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['volumenes', desde, hasta],
    queryFn: async () =>
      (
        await rpc<Volumen[]>('volumenes_por_contraparte', {
          p_desde: desde,
          p_hasta: hasta,
        })
      ).map((v) => ({ ...v, total: Number(v.total) })),
  });
}

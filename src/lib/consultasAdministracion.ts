/**
 * Módulo de Administración (20260929120000/130000): tesorería, cuentas
 * corrientes de proveedores y clientes, pagos, cobros, solicitudes de pago,
 * IVA y reportes.
 *
 * PUENTE DE TIPOS: las migraciones no están aplicadas en el proyecto alojado.
 * Los tipos de fila de acá se borran al correr `npm run db:types` después del
 * `db push`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avisarError, avisarExito } from './consultas';
import { rpcComercial, tablaComercial } from './consultasComercial';

export const ROLES_ADMINISTRACION = ['ADMINISTRACION', 'GERENCIA'] as const;

export type MedioPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'TARJETA' | 'OTRO';
export const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'TARJETA', label: 'Tarjeta' },
  { value: 'OTRO', label: 'Otro' },
];

export type TipoCuentaFondos = 'CAJA' | 'BANCO' | 'BILLETERA';

export interface SaldoFondos {
  cuenta_id: string;
  nombre: string;
  tipo: TipoCuentaFondos;
  banco: string | null;
  numero: string | null;
  de_tercero: boolean;
  titular: string | null;
  moneda: string;
  activo: boolean;
  saldo: number;
  ultimo_movimiento: string | null;
  ultima_conciliacion: string | null;
}

export interface MovimientoFondos {
  id: string;
  cuenta_id: string;
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA' | 'AJUSTE';
  importe: number;
  concepto: string;
  comprobante: string | null;
  contraparte: string | null;
  pago_id: string | null;
  cobro_id: string | null;
  solicitud_id: string | null;
  anula_a_id: string | null;
  registrado_en: string;
}

export interface SaldoProveedor {
  proveedor_id: string;
  razon_social: string;
  cuit: string | null;
  debe: number;
  haber: number;
  saldo: number;
  vencido: number;
  proximo_vencimiento: string | null;
  conciliado_al: string | null;
  saldo_informado: number | null;
  diferencia_conciliacion: number | null;
}

export interface MovimientoCuentaCorriente {
  fecha: string;
  momento: string;
  movimiento: string;
  detalle_tipo: string;
  referencia: string;
  debe: number;
  haber: number;
  comprobante_id?: string | null;
  pago_id?: string | null;
  factura_id?: string | null;
  cobro_id?: string | null;
  vencimiento_pago?: string | null;
  ambiente?: string | null;
}

export interface ComprobantePendiente {
  comprobante_id: string;
  proveedor_id: string;
  tipo: string;
  punto_venta: number | null;
  numero: number | null;
  fecha: string;
  vencimiento_pago: string | null;
  importe_total: number;
  pendiente: number;
}

export interface SaldoCliente {
  cliente_id: string;
  razon_social: string;
  facturado: number;
  cobrado: number;
  saldo: number;
  facturas_pendientes: number;
  cobrado_sin_imputar: number;
  a_30: number;
  a_60: number;
  a_90: number;
  mas_90: number;
  pendiente_homologacion: number;
}

export interface FacturaPendiente {
  factura_id: string;
  cliente_id: string;
  ambiente: string;
  tipo: string;
  punto_venta: number;
  numero: number | null;
  fecha: string;
  importe_total: number;
  cobrado: number;
  pendiente: number;
  dias: number;
}

export type EstadoSolicitud =
  'PENDIENTE' | 'APROBADA' | 'PAGADA' | 'RECHAZADA' | 'ANULADA';

export interface SolicitudPago {
  id: string;
  solicitante: string;
  area: string;
  concepto: string;
  destinatario: string;
  proveedor_id: string | null;
  comprobante_id: string | null;
  importe: number;
  vencimiento: string | null;
  medio_pago: MedioPago | null;
  estado: EstadoSolicitud;
  resuelto_por: string | null;
  resuelto_en: string | null;
  motivo: string | null;
  creado_en: string;
}

export interface IvaMensual {
  periodo: string;
  debito_fiscal: number;
  credito_fiscal: number;
  posicion: number;
  neto_ventas: number;
  neto_compras_a: number;
  compras_sin_iva_discriminado: number;
  compras_sin_factura: number;
  debito_homologacion: number;
}

export interface CashFlowReal {
  periodo: string;
  cuenta_id: string;
  cuenta: string;
  de_tercero: boolean;
  ingresos: number | null;
  egresos: number | null;
  neto: number | null;
}

export interface CashFlowProyectado {
  fecha: string | null;
  tipo: 'PAGO_PROVEEDOR' | 'SOLICITUD_PAGO' | 'COBRANZA';
  detalle: string;
  importe: number;
  origen_id: string;
}

export interface VentaMensual {
  periodo: string;
  cliente_id: string;
  cliente: string;
  ambiente: string;
  facturas: number;
  neto: number;
  iva: number;
  total: number;
}

export interface ResultadoMensual {
  periodo: string;
  ventas_netas: number;
  compras: number;
  otros_egresos: number;
  resultado: number;
}

export interface CompraTrazada {
  aviso_id: string | null;
  estado: string | null;
  codigo_interno: string | null;
  insumo: string | null;
  cantidad: number | null;
  unidad: string | null;
  pedida_en: string | null;
  proveedor: string | null;
  recepcion_numero: string | null;
  recibida_en: string | null;
  comprobante_tipo: string | null;
  importe_total: number | null;
  pendiente: number | null;
  situacion:
    | 'DESCARTADA'
    | 'SIN_RECIBIR'
    | 'SIN_COMPROBANTE'
    | 'IMPAGA'
    | 'CERRADA'
    | 'SIN_COMPRA';
}

/** Pesos argentinos, sin centavos si son cero. */
export const pesos = (v: number | string | null | undefined) =>
  `$ ${Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** «2026-09-01» → «septiembre 2026». */
export const mes = (periodo: string) =>
  new Date(`${periodo.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });

function lista<T>(
  clave: unknown[],
  tabla: string,
  orden?: { col: string; asc?: boolean },
) {
  return {
    queryKey: clave,
    queryFn: async () => {
      let c = tablaComercial<T[]>(tabla).select('*');
      if (orden) c = c.order(orden.col, { ascending: orden.asc ?? false });
      const { data, error } = await c;
      if (error) throw error;
      return data ?? [];
    },
  };
}

const CLAVES = [
  'saldos-fondos',
  'movimientos-fondos',
  'saldos-proveedores',
  'cc-proveedor',
  'comprobantes-pendientes',
  'saldos-clientes',
  'cc-cliente',
  'facturas-pendientes',
  'solicitudes-pago',
  'iva-mensual',
  'cash-flow',
  'comprobantes-proveedor',
  'compras-trazadas',
];

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  for (const k of CLAVES) void qc.invalidateQueries({ queryKey: [k] });
}

function useMutacion<V>(
  fn: (v: V) => Promise<unknown>,
  exito: string | ((v: V) => string),
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: V) => {
      await fn(v);
    },
    onSuccess: (_d, v) => {
      invalidar(qc);
      avisarExito(typeof exito === 'string' ? exito : exito(v));
    },
    onError: avisarError,
  });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await rpcComercial(fn, args);
  if (error) throw error;
}

async function insertar(tabla: string, fila: Record<string, unknown>) {
  const { error } = await tablaComercial(tabla).insert(fila);
  if (error) throw error;
}

/* ------------------------------ Tesorería ------------------------------- */

export const useSaldosFondos = () =>
  useQuery(
    lista<SaldoFondos>(['saldos-fondos'], 'v_saldos_fondos', {
      col: 'nombre',
      asc: true,
    }),
  );

export function useMovimientosFondos(cuentaId: string | null) {
  return useQuery({
    queryKey: ['movimientos-fondos', cuentaId],
    enabled: Boolean(cuentaId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<MovimientoFondos[]>(
        'movimientos_fondos',
      )
        .select('*')
        .eq('cuenta_id', cuentaId!)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const useCrearCuentaFondos = () =>
  useMutacion(
    (c: {
      nombre: string;
      tipo: TipoCuentaFondos;
      banco: string | null;
      numero: string | null;
      de_tercero: boolean;
      titular: string | null;
    }) => insertar('cuentas_fondos', c),
    'Cuenta creada.',
  );

export const useRegistrarMovimientoFondos = () =>
  useMutacion(
    (m: {
      cuenta_id: string;
      tipo: 'INGRESO' | 'EGRESO' | 'AJUSTE';
      importe: number;
      concepto: string;
      comprobante: string | null;
      contraparte: string | null;
      fecha: string | null;
    }) =>
      insertar('movimientos_fondos', {
        cuenta_id: m.cuenta_id,
        tipo: m.tipo,
        // El signo lo pone el tipo: acá nadie escribe negativos.
        importe: m.tipo === 'EGRESO' ? -Math.abs(m.importe) : m.importe,
        concepto: m.concepto,
        comprobante: m.comprobante,
        contraparte: m.contraparte,
        ...(m.fecha ? { fecha: m.fecha } : {}),
      }),
    'Movimiento registrado.',
  );

export const useTransferirFondos = () =>
  useMutacion(
    (t: { origen: string; destino: string; importe: number; concepto: string }) =>
      rpc('transferir_fondos', {
        p_origen: t.origen,
        p_destino: t.destino,
        p_importe: t.importe,
        p_concepto: t.concepto,
      }),
    'Transferencia registrada.',
  );

export const useAnularMovimientoFondos = () =>
  useMutacion(
    (a: { id: string; motivo: string }) =>
      rpc('anular_movimiento_fondos', { p_id: a.id, p_motivo: a.motivo }),
    'Movimiento anulado con su inverso.',
  );

export const useConciliarFondos = () =>
  useMutacion(
    (c: {
      cuenta_id: string;
      fecha: string;
      saldo_real: number;
      observacion: string | null;
    }) =>
      // saldo_sistema lo pone la base (trigger); el 0 solo cumple el NOT NULL.
      insertar('conciliaciones_fondos', { ...c, saldo_sistema: 0 }),
    'Conciliación registrada.',
  );

/* ------------------------- Proveedores y pagos -------------------------- */

export const useSaldosProveedores = () =>
  useQuery(
    lista<SaldoProveedor>(['saldos-proveedores'], 'v_saldos_proveedores', {
      col: 'saldo',
    }),
  );

export function useCuentaCorrienteProveedor(proveedorId: string | null) {
  return useQuery({
    queryKey: ['cc-proveedor', proveedorId],
    enabled: Boolean(proveedorId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<MovimientoCuentaCorriente[]>(
        'v_cuenta_corriente_proveedores',
      )
        .select('*')
        .eq('proveedor_id', proveedorId!)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useComprobantesPendientes(proveedorId: string | null) {
  return useQuery({
    queryKey: ['comprobantes-pendientes', proveedorId],
    enabled: Boolean(proveedorId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<ComprobantePendiente[]>(
        'v_comprobantes_proveedor_pendientes',
      )
        .select('*')
        .eq('proveedor_id', proveedorId!)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((c) => Number(c.pendiente) > 0);
    },
  });
}

export const useRegistrarPagoProveedor = () =>
  useMutacion(
    (p: {
      proveedorId: string;
      cuentaId: string;
      importe: number;
      medio: MedioPago;
      imputaciones: { comprobanteId: string; importe: number }[];
      referencia: string | null;
      solicitudId: string | null;
    }) =>
      rpc('registrar_pago_proveedor', {
        p_proveedor_id: p.proveedorId,
        p_cuenta_id: p.cuentaId,
        p_importe: p.importe,
        p_medio: p.medio,
        p_imputaciones: p.imputaciones.map((i) => ({
          comprobante_id: i.comprobanteId,
          importe: i.importe,
        })),
        p_referencia: p.referencia,
        p_solicitud_id: p.solicitudId,
      }),
    'Pago registrado. El egreso quedó en la cuenta elegida.',
  );

export const useConciliarProveedor = () =>
  useMutacion(
    (c: {
      proveedor_id: string;
      fecha: string;
      saldo_informado: number;
      observacion: string | null;
    }) => insertar('conciliaciones_proveedor', { ...c, saldo_sistema: 0 }),
    'Conciliación registrada.',
  );

/* --------------------------- Clientes y cobros -------------------------- */

export const useSaldosClientes = () =>
  useQuery(
    lista<SaldoCliente>(['saldos-clientes'], 'v_saldos_clientes', { col: 'saldo' }),
  );

export function useFacturasPendientes(clienteId: string | null) {
  return useQuery({
    queryKey: ['facturas-pendientes', clienteId],
    enabled: Boolean(clienteId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<FacturaPendiente[]>(
        'v_facturas_pendientes_cobro',
      )
        .select('*')
        .eq('cliente_id', clienteId!)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((f) => Number(f.pendiente) > 0);
    },
  });
}

export function useCuentaCorrienteCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ['cc-cliente', clienteId],
    enabled: Boolean(clienteId),
    queryFn: async () => {
      const { data, error } = await tablaComercial<MovimientoCuentaCorriente[]>(
        'v_cuenta_corriente_clientes',
      )
        .select('*')
        .eq('cliente_id', clienteId!)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const useRegistrarCobro = () =>
  useMutacion(
    (c: {
      clienteId: string;
      cuentaId: string;
      importe: number;
      medio: MedioPago;
      imputaciones: { facturaId: string; importe: number }[];
      referencia: string | null;
    }) =>
      rpc('registrar_cobro_cliente', {
        p_cliente_id: c.clienteId,
        p_cuenta_id: c.cuentaId,
        p_importe: c.importe,
        p_medio: c.medio,
        p_imputaciones: c.imputaciones.map((i) => ({
          factura_id: i.facturaId,
          importe: i.importe,
        })),
        p_referencia: c.referencia,
      }),
    'Cobro registrado. El ingreso quedó en la cuenta elegida.',
  );

/* ------------------------- Solicitudes de pago -------------------------- */

export const useSolicitudesPago = () =>
  useQuery(
    lista<SolicitudPago>(['solicitudes-pago'], 'solicitudes_pago', { col: 'creado_en' }),
  );

export const useCrearSolicitudPago = () =>
  useMutacion(
    (s: {
      area: string;
      concepto: string;
      destinatario: string;
      proveedor_id: string | null;
      importe: number;
      vencimiento: string | null;
      medio_pago: MedioPago | null;
    }) => insertar('solicitudes_pago', s),
    'Solicitud enviada a Administración.',
  );

export const useResolverSolicitud = () =>
  useMutacion(
    async (r: {
      id: string;
      estado: 'APROBADA' | 'RECHAZADA' | 'ANULADA';
      motivo: string | null;
    }) => {
      const { data, error } = await tablaComercial<{ id: string }[]>('solicitudes_pago')
        .update({ estado: r.estado, motivo: r.motivo })
        .eq('id', r.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error('No se pudo actualizar la solicitud.');
    },
    (r) =>
      r.estado === 'APROBADA'
        ? 'Solicitud aprobada.'
        : r.estado === 'RECHAZADA'
          ? 'Solicitud rechazada.'
          : 'Solicitud anulada.',
  );

export const usePagarSolicitudConEgreso = () =>
  useMutacion(
    (p: { solicitudId: string; cuentaId: string; comprobante: string | null }) =>
      rpc('pagar_solicitud_con_egreso', {
        p_solicitud_id: p.solicitudId,
        p_cuenta_id: p.cuentaId,
        p_comprobante: p.comprobante,
      }),
    'Solicitud pagada. El egreso quedó en la cuenta elegida.',
  );

/* ------------------------------- Reportes ------------------------------- */

export const useIvaMensual = () =>
  useQuery(lista<IvaMensual>(['iva-mensual'], 'v_iva_mensual', { col: 'periodo' }));
export const useCashFlowReal = () =>
  useQuery(
    lista<CashFlowReal>(['cash-flow', 'real'], 'v_cash_flow_real', { col: 'periodo' }),
  );
export const useCashFlowProyectado = () =>
  useQuery(
    lista<CashFlowProyectado>(['cash-flow', 'proyectado'], 'v_cash_flow_proyectado', {
      col: 'fecha',
      asc: true,
    }),
  );
export const useVentasMensuales = () =>
  useQuery(
    lista<VentaMensual>(['ventas-mensuales'], 'v_ventas_mensuales', { col: 'periodo' }),
  );
export const useResultadoMensual = () =>
  useQuery(
    lista<ResultadoMensual>(['resultado-mensual'], 'v_resultado_mensual', {
      col: 'periodo',
    }),
  );
export const useComprasTrazadas = () =>
  useQuery(
    lista<CompraTrazada>(['compras-trazadas'], 'v_compras_trazadas', {
      col: 'pedida_en',
    }),
  );

/** Cuenta corriente con el saldo acumulado renglón por renglón. */
export function saldoCorrido<T extends { debe: number; haber: number }>(movs: T[]) {
  return movs.reduce<(T & { saldo: number })[]>((acc, m) => {
    const previo = acc.at(-1)?.saldo ?? 0;
    acc.push({ ...m, saldo: previo + Number(m.debe) - Number(m.haber) });
    return acc;
  }, []);
}

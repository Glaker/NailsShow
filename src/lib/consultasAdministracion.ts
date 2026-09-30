/**
 * Módulo de Administración (20260929120000/130000): tesorería, cuentas
 * corrientes de proveedores y clientes, pagos, cobros, solicitudes de pago,
 * IVA y reportes.
 *
 * Tipado desde los tipos generados (CLAUDE.md §6).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { avisarError, avisarExito } from './consultas';
import { comercial } from './supabase';

type Vistas = Database['comercial']['Views'];
type Tablas = Database['comercial']['Tables'];

export const ROLES_ADMINISTRACION = ['ADMINISTRACION', 'GERENCIA'] as const;

export type MedioPago = Database['comercial']['Enums']['medio_pago_enum'];
export const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'TARJETA', label: 'Tarjeta' },
  { value: 'OTRO', label: 'Otro' },
];

export type TipoCuentaFondos = Database['comercial']['Enums']['tipo_cuenta_fondos_enum'];

export type SaldoFondos = Vistas['v_saldos_fondos']['Row'];

export type MovimientoFondos = Tablas['movimientos_fondos']['Row'];

export type SaldoProveedor = Vistas['v_saldos_proveedores']['Row'];

export type MovimientoCuentaCorrienteProveedor =
  Vistas['v_cuenta_corriente_proveedores']['Row'];
export type MovimientoCuentaCorrienteCliente =
  Vistas['v_cuenta_corriente_clientes']['Row'];
export type MovimientoCuentaCorriente =
  MovimientoCuentaCorrienteProveedor | MovimientoCuentaCorrienteCliente;

export type ComprobantePendiente = Vistas['v_comprobantes_proveedor_pendientes']['Row'];

export type SaldoCliente = Vistas['v_saldos_clientes']['Row'];

export type FacturaPendiente = Vistas['v_facturas_pendientes_cobro']['Row'];

export type EstadoSolicitud =
  Database['comercial']['Enums']['estado_solicitud_pago_enum'];

export type SolicitudPago = Tablas['solicitudes_pago']['Row'];

export type IvaMensual = Vistas['v_iva_mensual']['Row'];

export type CashFlowReal = Vistas['v_cash_flow_real']['Row'];

export type CashFlowProyectado = Vistas['v_cash_flow_proyectado']['Row'];

export type VentaMensual = Vistas['v_ventas_mensuales']['Row'];

export type ResultadoMensual = Vistas['v_resultado_mensual']['Row'];

export type CompraTrazada = Vistas['v_compras_trazadas']['Row'];

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
  consulta: () => PromiseLike<{ data: T[] | null; error: Error | null }>,
) {
  return {
    queryKey: clave,
    queryFn: async () => {
      const { data, error } = await consulta();
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

async function avisarSiFalla(pendiente: PromiseLike<{ error: Error | null }>) {
  const { error } = await pendiente;
  if (error) throw error;
}

/* ------------------------------ Tesorería ------------------------------- */

export const useSaldosFondos = () =>
  useQuery(
    lista(['saldos-fondos'], () =>
      comercial()
        .from('v_saldos_fondos')
        .select('*')
        .order('nombre', { ascending: true }),
    ),
  );

export function useMovimientosFondos(cuentaId: string | null) {
  return useQuery({
    queryKey: ['movimientos-fondos', cuentaId],
    enabled: Boolean(cuentaId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('movimientos_fondos')
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
    }) => avisarSiFalla(comercial().from('cuentas_fondos').insert(c)),
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
      avisarSiFalla(
        comercial()
          .from('movimientos_fondos')
          .insert({
            cuenta_id: m.cuenta_id,
            tipo: m.tipo,
            // El signo lo pone el tipo: acá nadie escribe negativos.
            importe: m.tipo === 'EGRESO' ? -Math.abs(m.importe) : m.importe,
            concepto: m.concepto,
            comprobante: m.comprobante,
            contraparte: m.contraparte,
            ...(m.fecha ? { fecha: m.fecha } : {}),
          }),
      ),
    'Movimiento registrado.',
  );

export const useTransferirFondos = () =>
  useMutacion(
    (t: { origen: string; destino: string; importe: number; concepto: string }) =>
      avisarSiFalla(
        comercial().rpc('transferir_fondos', {
          p_origen: t.origen,
          p_destino: t.destino,
          p_importe: t.importe,
          p_concepto: t.concepto,
        }),
      ),
    'Transferencia registrada.',
  );

export const useAnularMovimientoFondos = () =>
  useMutacion(
    (a: { id: string; motivo: string }) =>
      avisarSiFalla(
        comercial().rpc('anular_movimiento_fondos', { p_id: a.id, p_motivo: a.motivo }),
      ),
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
      avisarSiFalla(
        comercial()
          .from('conciliaciones_fondos')
          .insert({ ...c, saldo_sistema: 0 }),
      ),
    'Conciliación registrada.',
  );

/* ------------------------- Proveedores y pagos -------------------------- */

export const useSaldosProveedores = () =>
  useQuery(
    lista(['saldos-proveedores'], () =>
      comercial()
        .from('v_saldos_proveedores')
        .select('*')
        .order('saldo', { ascending: false }),
    ),
  );

export function useCuentaCorrienteProveedor(proveedorId: string | null) {
  return useQuery({
    queryKey: ['cc-proveedor', proveedorId],
    enabled: Boolean(proveedorId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_cuenta_corriente_proveedores')
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
      const { data, error } = await comercial()
        .from('v_comprobantes_proveedor_pendientes')
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
      avisarSiFalla(
        comercial().rpc('registrar_pago_proveedor', {
          p_proveedor_id: p.proveedorId,
          p_cuenta_id: p.cuentaId,
          p_importe: p.importe,
          p_medio: p.medio,
          p_imputaciones: p.imputaciones.map((i) => ({
            comprobante_id: i.comprobanteId,
            importe: i.importe,
          })),
          ...(p.referencia === null ? {} : { p_referencia: p.referencia }),
          ...(p.solicitudId === null ? {} : { p_solicitud_id: p.solicitudId }),
        }),
      ),
    'Pago registrado. El egreso quedó en la cuenta elegida.',
  );

export const useConciliarProveedor = () =>
  useMutacion(
    (c: {
      proveedor_id: string;
      fecha: string;
      saldo_informado: number;
      observacion: string | null;
    }) =>
      avisarSiFalla(
        comercial()
          .from('conciliaciones_proveedor')
          .insert({ ...c, saldo_sistema: 0 }),
      ),
    'Conciliación registrada.',
  );

/* --------------------------- Clientes y cobros -------------------------- */

export const useSaldosClientes = () =>
  useQuery(
    lista(['saldos-clientes'], () =>
      comercial()
        .from('v_saldos_clientes')
        .select('*')
        .order('saldo', { ascending: false }),
    ),
  );

export function useFacturasPendientes(clienteId: string | null) {
  return useQuery({
    queryKey: ['facturas-pendientes', clienteId],
    enabled: Boolean(clienteId),
    queryFn: async () => {
      const { data, error } = await comercial()
        .from('v_facturas_pendientes_cobro')
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
      const { data, error } = await comercial()
        .from('v_cuenta_corriente_clientes')
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
      avisarSiFalla(
        comercial().rpc('registrar_cobro_cliente', {
          p_cliente_id: c.clienteId,
          p_cuenta_id: c.cuentaId,
          p_importe: c.importe,
          p_medio: c.medio,
          p_imputaciones: c.imputaciones.map((i) => ({
            factura_id: i.facturaId,
            importe: i.importe,
          })),
          ...(c.referencia === null ? {} : { p_referencia: c.referencia }),
        }),
      ),
    'Cobro registrado. El ingreso quedó en la cuenta elegida.',
  );

/* ------------------------- Solicitudes de pago -------------------------- */

export const useSolicitudesPago = () =>
  useQuery(
    lista(['solicitudes-pago'], () =>
      comercial()
        .from('solicitudes_pago')
        .select('*')
        .order('creado_en', { ascending: false }),
    ),
  );

export const useCrearSolicitudPago = () =>
  useMutacion(
    (s: {
      area: SolicitudPago['area'];
      concepto: string;
      destinatario: string;
      proveedor_id: string | null;
      importe: number;
      vencimiento: string | null;
      medio_pago: MedioPago | null;
    }) => avisarSiFalla(comercial().from('solicitudes_pago').insert(s)),
    'Solicitud enviada a Administración.',
  );

export const useResolverSolicitud = () =>
  useMutacion(
    async (r: {
      id: string;
      estado: 'APROBADA' | 'RECHAZADA' | 'ANULADA';
      motivo: string | null;
    }) => {
      const { data, error } = await comercial()
        .from('solicitudes_pago')
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
      avisarSiFalla(
        comercial().rpc('pagar_solicitud_con_egreso', {
          p_solicitud_id: p.solicitudId,
          p_cuenta_id: p.cuentaId,
          ...(p.comprobante === null ? {} : { p_comprobante: p.comprobante }),
        }),
      ),
    'Solicitud pagada. El egreso quedó en la cuenta elegida.',
  );

/* ------------------------------- Reportes ------------------------------- */

export const useIvaMensual = () =>
  useQuery(
    lista(['iva-mensual'], () =>
      comercial()
        .from('v_iva_mensual')
        .select('*')
        .order('periodo', { ascending: false }),
    ),
  );
export const useCashFlowReal = () =>
  useQuery(
    lista(['cash-flow', 'real'], () =>
      comercial()
        .from('v_cash_flow_real')
        .select('*')
        .order('periodo', { ascending: false }),
    ),
  );
export const useCashFlowProyectado = () =>
  useQuery(
    lista(['cash-flow', 'proyectado'], () =>
      comercial()
        .from('v_cash_flow_proyectado')
        .select('*')
        .order('fecha', { ascending: true }),
    ),
  );
export const useVentasMensuales = () =>
  useQuery(
    lista(['ventas-mensuales'], () =>
      comercial()
        .from('v_ventas_mensuales')
        .select('*')
        .order('periodo', { ascending: false }),
    ),
  );
export const useResultadoMensual = () =>
  useQuery(
    lista(['resultado-mensual'], () =>
      comercial()
        .from('v_resultado_mensual')
        .select('*')
        .order('periodo', { ascending: false }),
    ),
  );
export const useComprasTrazadas = () =>
  useQuery(
    lista(['compras-trazadas'], () =>
      comercial()
        .from('v_compras_trazadas')
        .select('*')
        .order('pedida_en', { ascending: false }),
    ),
  );

/** Cuenta corriente con el saldo acumulado renglón por renglón. */
export function saldoCorrido<T extends { debe: number | null; haber: number | null }>(
  movs: T[],
) {
  return movs.reduce<(T & { saldo: number })[]>((acc, m) => {
    const previo = acc.at(-1)?.saldo ?? 0;
    acc.push({ ...m, saldo: previo + Number(m.debe) - Number(m.haber) });
    return acc;
  }, []);
}

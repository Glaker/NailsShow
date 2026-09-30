import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import dayjs from 'dayjs';
import {
  IconAlertTriangle,
  IconBuildingBank,
  IconCalendarDue,
  IconFileInvoice,
  IconInfoCircle,
  IconReceipt,
  IconReceiptTax,
  IconScale,
  IconUsers,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { diasHasta } from '@/lib/formato';
import { useVolumenes } from '@/lib/consultasFlujo';
import { GraficoFlujo } from './GraficoFlujo';
import { GraficoTorta } from './GraficoTorta';
import {
  pesos,
  useCashFlowProyectado,
  useComprasTrazadas,
  useIvaMensual,
  useSaldosClientes,
  useSaldosFondos,
  useSaldosProveedores,
  useSolicitudesPago,
} from '@/lib/consultasAdministracion';

/**
 * Inicio de Administración (§6 del documento): pendientes primero, no una
 * pantalla cargada de datos sin prioridad. Cada indicador lleva a la pantalla
 * donde se resuelve.
 */
export function PaginaAdministracion() {
  const proveedores = useSaldosProveedores();
  const clientes = useSaldosClientes();
  const fondos = useSaldosFondos();
  const solicitudes = useSolicitudesPago();
  const iva = useIvaMensual();
  const proyectado = useCashFlowProyectado();
  const compras = useComprasTrazadas();

  const cargando = [
    proveedores,
    clientes,
    fondos,
    solicitudes,
    iva,
    proyectado,
    compras,
  ].some((q) => q.isLoading);
  if (cargando) return <Skeleton h={320} />;

  const vencido = (proveedores.data ?? []).reduce((a, p) => a + Number(p.vencido), 0);
  const proximos = (proyectado.data ?? []).filter((f) => {
    const d = diasHasta(f.fecha);
    return f.tipo !== 'COBRANZA' && d !== null && d >= 0 && d <= 7;
  });
  const pendientes = (solicitudes.data ?? []).filter((s) => s.estado === 'PENDIENTE');
  const sinFactura = (compras.data ?? []).filter(
    (c) => c.situacion === 'SIN_COMPROBANTE',
  );
  const diferencias = (proveedores.data ?? []).filter(
    (p) => p.diferencia_conciliacion !== null && Number(p.diferencia_conciliacion) !== 0,
  );
  const propias = (fondos.data ?? []).filter((c) => !c.de_tercero && c.activo);
  const sinConciliar = (fondos.data ?? []).filter(
    (c) => c.activo && (diasHasta(c.ultima_conciliacion) ?? -999) < -30,
  );
  const mesActual = (iva.data ?? [])[0];
  const aCobrar = (clientes.data ?? []).reduce(
    (a, c) => a + Number(c.facturas_pendientes),
    0,
  );
  const sinImputar = (clientes.data ?? []).reduce(
    (a, c) => a + Number(c.cobrado_sin_imputar),
    0,
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Administración"
        descripcion="Lo que hay que resolver hoy: pagos, comprobantes, diferencias y posición del mes."
      />
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <TarjetaIndicador
            etiqueta="Pagos vencidos"
            valor={pesos(vencido)}
            icono={IconAlertTriangle}
            {...(vencido > 0 ? { color: 'estadoRechazado' } : {})}
            detalle={`${proximos.length} vencen en los próximos 7 días`}
            a="/cuentas-proveedores"
          />
          <TarjetaIndicador
            etiqueta="Solicitudes por aprobar"
            valor={String(pendientes.length)}
            icono={IconReceipt}
            {...(pendientes.length > 0 ? { color: 'estadoEnAnalisis' } : {})}
            detalle={pesos(pendientes.reduce((a, s) => a + Number(s.importe), 0))}
            a="/solicitudes-pago"
          />
          <TarjetaIndicador
            etiqueta="Recepciones sin factura cargada"
            valor={String(sinFactura.length)}
            icono={IconFileInvoice}
            {...(sinFactura.length > 0 ? { color: 'estadoEnAnalisis' } : {})}
            detalle="Compras recibidas que todavía no tienen comprobante"
            a="/reportes"
          />
          <TarjetaIndicador
            etiqueta="Diferencias con proveedores"
            valor={String(diferencias.length)}
            icono={IconScale}
            {...(diferencias.length > 0 ? { color: 'estadoEnAnalisis' } : {})}
            detalle="Según la última conciliación de cada uno"
            a="/cuentas-proveedores"
          />
          <TarjetaIndicador
            etiqueta="Cajas y bancos propios"
            valor={pesos(propias.reduce((a, c) => a + Number(c.saldo), 0))}
            icono={IconBuildingBank}
            detalle={`${sinConciliar.length} sin conciliar hace más de 30 días`}
            a="/tesoreria"
          />
          <TarjetaIndicador
            etiqueta="IVA del mes"
            valor={mesActual ? pesos(mesActual.posicion) : pesos(0)}
            icono={IconReceiptTax}
            detalle={
              mesActual
                ? `Débito ${pesos(mesActual.debito_fiscal)} · crédito ${pesos(mesActual.credito_fiscal)}`
                : 'Sin movimientos este mes'
            }
            a="/reportes"
          />
          <TarjetaIndicador
            etiqueta="A cobrar"
            valor={pesos(aCobrar)}
            icono={IconUsers}
            detalle={
              sinImputar > 0
                ? `${pesos(sinImputar)} cobrados sin imputar a una factura`
                : 'Todo lo cobrado está imputado'
            }
            a="/cuentas-clientes"
          />
          <TarjetaIndicador
            etiqueta="Próximos 7 días"
            valor={pesos(-proximos.reduce((a, f) => a + Number(f.importe), 0))}
            icono={IconCalendarDue}
            detalle="Vencimientos de proveedores y solicitudes"
            a="/reportes"
          />
        </SimpleGrid>

        <GraficoFlujo />
        <Volumenes />

        <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
          <Text size="sm">
            Stock valorizado: el sistema todavía no tiene el costo de cada insumo (D-36).
            Monotributos, sueldos y COMEX esperan la definición del alcance (D-34).
          </Text>
        </Alert>

        <Group gap="sm">
          {(
            [
              ['/cuentas-proveedores', 'Proveedores'],
              ['/cuentas-clientes', 'Clientes'],
              ['/tesoreria', 'Tesorería'],
              ['/solicitudes-pago', 'Pagos'],
              ['/compras', 'Compras'],
              ['/facturas', 'Facturas'],
              ['/reportes', 'Reportes'],
            ] as const
          ).map(([ruta, texto]) => (
            <Button key={ruta} component={Link} to={ruta} variant="default" size="md">
              {texto}
            </Button>
          ))}
        </Group>
      </Stack>
    </>
  );
}

/**
 * Tortas de ventas por cliente y compras por proveedor. Mientras se factura en
 * homologación, las ventas de prueba se muestran marcadas: sin eso la torta
 * de ventas quedaría vacía hasta pasar a producción.
 */
function Volumenes() {
  const [periodo, setPeriodo] = useState('90');
  const hasta = dayjs().format('YYYY-MM-DD');
  const desde = dayjs()
    .subtract(Number(periodo) - 1, 'day')
    .format('YYYY-MM-DD');
  const vol = useVolumenes(desde, hasta);
  const filas = vol.data ?? [];
  const ventasProd = filas.filter(
    (v) => v.lado === 'VENTA' && v.ambiente === 'PRODUCCION',
  );
  const ventas = ventasProd.length
    ? ventasProd
    : filas.filter((v) => v.lado === 'VENTA' && v.ambiente === 'HOMOLOGACION');
  const compras = filas.filter((v) => v.lado === 'COMPRA');
  const porcion = (v: { contraparte: string; total: number }) => ({
    nombre: v.contraparte,
    valor: v.total,
  });

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={700}>Volúmenes por cliente y proveedor</Text>
        <SegmentedControl
          value={periodo}
          onChange={setPeriodo}
          data={[
            { value: '30', label: '30 días' },
            { value: '90', label: '90 días' },
            { value: '365', label: '12 meses' },
          ]}
        />
      </Group>
      {vol.isLoading ? (
        <Skeleton h={220} radius="lg" />
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <GraficoTorta
            titulo="Ventas por cliente"
            datos={ventas.map(porcion)}
            aviso={
              !ventasProd.length && ventas.length ? 'Homologación · no fiscal' : undefined
            }
          />
          <GraficoTorta titulo="Compras por proveedor" datos={compras.map(porcion)} />
        </SimpleGrid>
      )}
    </Stack>
  );
}

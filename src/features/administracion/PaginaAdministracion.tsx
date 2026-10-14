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
  Table,
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
import { diasHasta, fecha } from '@/lib/formato';
import { useRecepcionesSinComprobante } from '@/lib/consultasCompras';
import { ModalComprobante } from './PaginaCuentasProveedores';
import { useVolumenes } from '@/lib/consultasFlujo';
import { GraficoFlujo } from './GraficoFlujo';
import { GraficoTorta } from './GraficoTorta';
import {
  pesos,
  useCashFlowProyectado,
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
  const sinComprobante = useRecepcionesSinComprobante();

  const cargando = [
    proveedores,
    clientes,
    fondos,
    solicitudes,
    iva,
    proyectado,
    sinComprobante,
  ].some((q) => q.isLoading);
  if (cargando) return <Skeleton h={320} />;

  const vencido = (proveedores.data ?? []).reduce((a, p) => a + Number(p.vencido), 0);
  const proximos = (proyectado.data ?? []).filter((f) => {
    const d = diasHasta(f.fecha);
    return f.tipo !== 'COBRANZA' && d !== null && d >= 0 && d <= 7;
  });
  const pendientes = (solicitudes.data ?? []).filter((s) => s.estado === 'PENDIENTE');
  const sinFactura = sinComprobante.data ?? [];
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
            etiqueta="Facturas por cargar"
            valor={String(sinFactura.length)}
            icono={IconFileInvoice}
            {...(sinFactura.length > 0 ? { color: 'estadoRechazado' } : {})}
            detalle="Recepciones que llegaron sin comprobante cargado"
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

        <FacturasPorCargar filas={sinFactura} />

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
 * Recepciones que quedaron sin comprobante (en la recepción es opcional, y
 * Dirección Técnica ni lo ve). Sin la factura no hay crédito fiscal ni deuda
 * en la cuenta corriente: le salta a Administración hasta que la carga.
 */
function FacturasPorCargar({
  filas,
}: {
  filas: NonNullable<ReturnType<typeof useRecepcionesSinComprobante>['data']>;
}) {
  const [cargando, setCargando] = useState<(typeof filas)[number] | null>(null);
  if (filas.length === 0) return null;
  return (
    <Alert
      color="estadoRechazado"
      variant="light"
      icon={<IconFileInvoice size={18} />}
      title={`Tenés ${filas.length} ${filas.length === 1 ? 'factura' : 'facturas'} por cargar`}
    >
      <Text size="sm" mb="sm">
        Estas recepciones entraron sin comprobante. Cargalo para que quede el IVA
        crédito y la deuda con el proveedor. Si de verdad vino sin factura, cargalo
        como «Sin factura».
      </Text>
      <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing="xs">
          <Table.Tbody>
            {filas.map((r) => (
              <Table.Tr key={r.recepcion_id}>
                <Table.Td>{fecha(r.fecha_hora)}</Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {r.proveedor}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Recepción {r.numero} · remito {r.numero_remito ?? 'no informado'}
                    {r.registrada_por ? ` · la recibió ${r.registrada_por}` : ''}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Button size="sm" onClick={() => setCargando(r)}>
                    Cargar factura
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {cargando?.proveedor_id ? (
        <ModalComprobante
          key={cargando.recepcion_id}
          proveedorId={cargando.proveedor_id}
          recepcionId={cargando.recepcion_id}
          abierto
          onCerrar={() => setCargando(null)}
        />
      ) : null}
    </Alert>
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

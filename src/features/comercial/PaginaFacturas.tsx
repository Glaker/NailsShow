import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconFileInvoice,
  IconInfoCircle,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { fecha, numero } from '@/lib/formato';
import {
  numeroComprobante,
  useFacturas,
  type EstadoFactura,
} from '@/lib/consultasFacturacion';
import { BadgeAmbiente, BadgeEstadoFactura } from './FacturacionPedido';

const pesos = (n: number) => `$ ${numero(n, 2)}`;

/**
 * Facturas emitidas desde los pedidos. Las de homologación se marcan: son
 * pruebas contra ARCA, no comprobantes fiscales.
 */
export function PaginaFacturas() {
  const facturas = useFacturas();
  const [vista, setVista] = useState<'todas' | EstadoFactura>('todas');

  const todas = facturas.data ?? [];
  const filas = vista === 'todas' ? todas : todas.filter((f) => f.estado === vista);
  const autorizadas = todas.filter((f) => f.estado === 'AUTORIZADA');
  const hayHomologacion = todas.some((f) => f.ambiente === 'HOMOLOGACION');

  return (
    <>
      <EncabezadoPagina
        titulo="Facturas"
        descripcion="Emitidas desde cada pedido. Una factura autorizada no se modifica: se corrige con nota de crédito."
      />

      <Stack gap="md">
        {hayHomologacion ? (
          <Alert
            color="gray"
            variant="light"
            radius="md"
            icon={<IconInfoCircle size={18} />}
          >
            Se está facturando en <b>homologación</b> de ARCA, con el CUIT de
            demostración: estos comprobantes son pruebas y no tienen validez fiscal.
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <TarjetaIndicador
            etiqueta="Autorizadas"
            valor={String(autorizadas.length)}
            icono={IconCircleCheck}
            detalle={`Total ${pesos(autorizadas.reduce((a, f) => a + Number(f.importe_total), 0))}`}
          />
          <TarjetaIndicador
            etiqueta="Rechazadas"
            valor={String(todas.filter((f) => f.estado === 'RECHAZADA').length)}
            icono={IconAlertTriangle}
            color="estadoRechazado"
            detalle="Con el motivo que dio ARCA."
          />
          <TarjetaIndicador
            etiqueta="Pendientes"
            valor={String(todas.filter((f) => f.estado === 'PENDIENTE').length)}
            icono={IconFileInvoice}
            color="estadoEnAnalisis"
            detalle="En curso o sin respuesta: se reintentan desde el pedido."
          />
        </SimpleGrid>

        <SegmentedControl
          size="md"
          value={vista}
          onChange={(v) => setVista(v as typeof vista)}
          data={[
            { value: 'todas', label: 'Todas' },
            { value: 'AUTORIZADA', label: 'Autorizadas' },
            { value: 'RECHAZADA', label: 'Rechazadas' },
            { value: 'PENDIENTE', label: 'Pendientes' },
          ]}
          style={{ alignSelf: 'flex-start' }}
        />

        {facturas.isLoading ? (
          <Skeleton h={240} />
        ) : filas.length === 0 ? (
          <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
            <Vacio
              icono={IconFileInvoice}
              titulo="No hay facturas"
              descripcion="Se emiten desde la ficha de cada pedido."
            />
          </Paper>
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Comprobante</Table.Th>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th>Pedido</Table.Th>
                    <Table.Th ta="right">Neto</Table.Th>
                    <Table.Th ta="right">IVA</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th>CAE / motivo</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f) => (
                    <Table.Tr key={f.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {f.tipo} {numeroComprobante(f)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {fecha(`${f.fecha}T12:00:00`)}
                        </Text>
                        <BadgeAmbiente ambiente={f.ambiente} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{f.cliente_ref?.razon_social ?? '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        {f.pedido ? (
                          <Text
                            component={Link}
                            to={`/pedidos/${f.pedido_id}`}
                            size="sm"
                            c="violeta"
                            fw={600}
                          >
                            {f.pedido.numero}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" c="dimmed">
                          {pesos(Number(f.importe_neto))}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" c="dimmed">
                          {pesos(Number(f.importe_iva))}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" fw={600}>
                          {pesos(Number(f.importe_total))}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <BadgeEstadoFactura estado={f.estado} />
                      </Table.Td>
                      <Table.Td>
                        {f.estado === 'AUTORIZADA' ? (
                          <Text size="sm" ff="monospace">
                            {f.cae}
                          </Text>
                        ) : (
                          <Text
                            size="sm"
                            c={f.estado === 'RECHAZADA' ? 'estadoRechazado.7' : 'dimmed'}
                            maw={320}
                          >
                            {f.motivo_rechazo ?? 'En curso'}
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>
    </>
  );
}

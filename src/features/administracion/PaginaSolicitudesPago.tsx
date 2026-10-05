import { useState } from 'react';
import {
  Badge,
  Button,
  Chip,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconPlus, IconReceipt } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useSesion, useTieneRol } from '@/features/auth/sesion';
import { useProveedores } from '@/lib/consultas';
import { fecha, fechaISO } from '@/lib/formato';
import { useNomina } from '@/lib/consultasComercial';
import {
  MEDIOS_PAGO,
  ROLES_ADMINISTRACION,
  pesos,
  useCrearSolicitudPago,
  usePagarSolicitudConEgreso,
  useResolverSolicitud,
  useSolicitudesPago,
  type EstadoSolicitud,
  type MedioPago,
  type SolicitudPago,
} from '@/lib/consultasAdministracion';
import { MONEDA, ModalPagoProveedor, SelectCuenta, aNumero } from './compartidos';

const COLOR: Record<EstadoSolicitud, string> = {
  PENDIENTE: 'estadoCuarentena',
  APROBADA: 'azul',
  PAGADA: 'estadoAprobado',
  RECHAZADA: 'red',
  ANULADA: 'gray',
};

/**
 * Solicitudes de pago de todas las áreas (§2.2 del documento de
 * Administración): quién pide, qué, a quién, cuánto, cuándo vence y en qué
 * estado está. Cualquiera pide; Administración aprueba, rechaza y paga.
 */
export function PaginaSolicitudesPago() {
  const solicitudes = useSolicitudesPago();
  const esAdmin = useTieneRol(...ROLES_ADMINISTRACION);
  const nomina = useNomina();
  const { claims } = useSesion();
  const [vista, setVista] = useState<'abiertas' | 'todas'>('abiertas');
  const [nueva, setNueva] = useState(false);
  const [resolviendo, setResolviendo] = useState<{
    s: SolicitudPago;
    a: 'RECHAZADA' | 'ANULADA';
  } | null>(null);
  const [pagando, setPagando] = useState<SolicitudPago | null>(null);
  const resolver = useResolverSolicitud();
  const proveedores = useProveedores();
  const todas = solicitudes.data ?? [];
  const filas =
    vista === 'abiertas'
      ? todas.filter((s) => s.estado === 'PENDIENTE' || s.estado === 'APROBADA')
      : todas;

  return (
    <>
      <EncabezadoPagina
        titulo="Solicitudes de pago"
        descripcion="Cualquier área pide un pago; Administración lo aprueba y lo paga. Queda quién pidió, quién resolvió y cuándo."
        acciones={
          <Button leftSection={<IconPlus size={18} />} onClick={() => setNueva(true)}>
            Pedir un pago
          </Button>
        }
      />
      <Stack gap="md">
        <Group gap="xs">
          <Chip
            checked={vista === 'abiertas'}
            onChange={() => setVista('abiertas')}
            variant="light"
          >
            Pendientes y aprobadas
          </Chip>
          <Chip
            checked={vista === 'todas'}
            onChange={() => setVista('todas')}
            variant="light"
          >
            Todas
          </Chip>
        </Group>
        {solicitudes.isLoading ? (
          <Skeleton h={200} />
        ) : filas.length === 0 ? (
          <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
            <Vacio
              icono={IconReceipt}
              titulo="No hay solicitudes"
              descripcion="Las que cargue cualquier área aparecen acá."
            />
          </Paper>
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Concepto</Table.Th>
                    <Table.Th>A quién</Table.Th>
                    <Table.Th>Pidió</Table.Th>
                    <Table.Th>Vence</Table.Th>
                    <Table.Th ta="right">Importe</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((s) => {
                    const propia = s.solicitante === claims?.usuario_id;
                    return (
                      <Table.Tr key={s.id}>
                        <Table.Td>
                          <Text size="sm" fw={600}>
                            {s.concepto}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {s.area.toLowerCase().replace(/_/g, ' ')}
                            {s.motivo ? ` · ${s.motivo}` : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td>{s.destinatario}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{nomina.data?.get(s.solicitante) ?? '—'}</Text>
                          <Text size="xs" c="dimmed">
                            {fecha(s.creado_en)}
                          </Text>
                        </Table.Td>
                        <Table.Td>{fecha(s.vencimiento)}</Table.Td>
                        <Table.Td ta="right" ff="monospace" fw={700}>
                          {pesos(s.importe)}
                        </Table.Td>
                        <Table.Td>
                          <Badge color={COLOR[s.estado]} variant="light">
                            {s.estado.toLowerCase()}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            {esAdmin && s.estado === 'PENDIENTE' ? (
                              <>
                                <Button
                                  size="compact-sm"
                                  loading={
                                    resolver.isPending && resolver.variables?.id === s.id
                                  }
                                  onClick={() =>
                                    resolver.mutate({
                                      id: s.id,
                                      estado: 'APROBADA',
                                      motivo: null,
                                    })
                                  }
                                >
                                  Aprobar
                                </Button>
                                <Button
                                  size="compact-sm"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => setResolviendo({ s, a: 'RECHAZADA' })}
                                >
                                  Rechazar
                                </Button>
                              </>
                            ) : null}
                            {esAdmin && s.estado === 'APROBADA' ? (
                              <Button
                                size="compact-sm"
                                color="estadoAprobado"
                                onClick={() => setPagando(s)}
                              >
                                Pagar
                              </Button>
                            ) : null}
                            {(propia && s.estado === 'PENDIENTE') ||
                            (esAdmin && s.estado === 'APROBADA') ? (
                              <Button
                                size="compact-sm"
                                variant="subtle"
                                color="gray"
                                onClick={() => setResolviendo({ s, a: 'ANULADA' })}
                              >
                                Anular
                              </Button>
                            ) : null}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>

      <ModalNuevaSolicitud abierto={nueva} onCerrar={() => setNueva(false)} />
      <ModalMotivo
        abierto={resolviendo !== null}
        titulo={
          resolviendo?.a === 'RECHAZADA' ? 'Rechazar la solicitud' : 'Anular la solicitud'
        }
        cargando={resolver.isPending}
        onCerrar={() => setResolviendo(null)}
        onConfirmar={(motivo) =>
          resolviendo &&
          resolver.mutate(
            { id: resolviendo.s.id, estado: resolviendo.a, motivo },
            { onSuccess: () => setResolviendo(null) },
          )
        }
      />
      {pagando?.proveedor_id ? (
        <ModalPagoProveedor
          abierto
          proveedorId={pagando.proveedor_id}
          proveedor={
            (proveedores.data ?? []).find((p) => p.id === pagando.proveedor_id)
              ?.razon_social ?? pagando.destinatario
          }
          solicitud={{
            id: pagando.id,
            importe: Number(pagando.importe),
            comprobanteId: pagando.comprobante_id,
          }}
          onCerrar={() => setPagando(null)}
        />
      ) : (
        <ModalPagoEgreso solicitud={pagando} onCerrar={() => setPagando(null)} />
      )}
    </>
  );
}

function ModalNuevaSolicitud({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const crear = useCrearSolicitudPago();
  const proveedores = useProveedores();
  const { claims } = useSesion();
  const [concepto, setConcepto] = useState('');
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [destinatario, setDestinatario] = useState('');
  const [importe, setImporte] = useState<number | string>('');
  const [vence, setVence] = useState<Date | null>(null);
  const [medio, setMedio] = useState<MedioPago | null>(null);
  const nombreProveedor = (proveedores.data ?? []).find(
    (p) => p.id === proveedor,
  )?.razon_social;
  const a = nombreProveedor ?? destinatario.trim();
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Pedir un pago" centered>
      <Stack gap="md">
        <TextInput
          label="Qué se paga"
          withAsterisk
          placeholder="Service de la balanza, flete, envases del pedido P-3…"
          value={concepto}
          onChange={(e) => setConcepto(e.currentTarget.value)}
        />
        <Select
          label="Proveedor"
          description="Si es un proveedor cargado, el pago baja su cuenta corriente."
          searchable
          clearable
          data={(proveedores.data ?? [])
            .filter((p) => p.activo)
            .map((p) => ({ value: p.id, label: p.razon_social }))}
          value={proveedor}
          onChange={setProveedor}
        />
        {proveedor ? null : (
          <TextInput
            label="A quién"
            withAsterisk
            value={destinatario}
            onChange={(e) => setDestinatario(e.currentTarget.value)}
          />
        )}
        <Group grow>
          <NumberInput
            label="Importe"
            withAsterisk
            {...MONEDA}
            value={importe}
            onChange={setImporte}
          />
          <DateInput
            label="Vence"
            valueFormat="DD/MM/YYYY"
            clearable
            value={vence}
            onChange={(v) => setVence(v ? new Date(v) : null)}
          />
        </Group>
        <Select
          label="Medio sugerido"
          clearable
          data={MEDIOS_PAGO}
          value={medio}
          onChange={(v) => setMedio(v as MedioPago | null)}
        />
        <Group justify="flex-end">
          <Button
            loading={crear.isPending}
            disabled={!concepto.trim() || !a || aNumero(importe) <= 0 || !claims?.sector}
            onClick={() =>
              claims?.sector &&
              crear.mutate(
                {
                  area: claims.sector,
                  concepto: concepto.trim(),
                  destinatario: a,
                  proveedor_id: proveedor,
                  importe: aNumero(importe),
                  vencimiento: fechaISO(vence),
                  medio_pago: medio,
                },
                {
                  onSuccess: () => {
                    setConcepto('');
                    setImporte('');
                    onCerrar();
                  },
                },
              )
            }
          >
            Enviar a Administración
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalPagoEgreso({
  solicitud,
  onCerrar,
}: {
  solicitud: SolicitudPago | null;
  onCerrar: () => void;
}) {
  const pagar = usePagarSolicitudConEgreso();
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState('');
  return (
    <Modal
      opened={solicitud !== null}
      onClose={onCerrar}
      title="Pagar la solicitud"
      centered
    >
      {solicitud ? (
        <Stack gap="md">
          <Text size="sm">
            {solicitud.concepto} · {solicitud.destinatario} ·{' '}
            <b>{pesos(solicitud.importe)}</b>
          </Text>
          <SelectCuenta value={cuenta} onChange={setCuenta} label="Sale de" />
          <TextInput
            label="Comprobante"
            value={comprobante}
            onChange={(e) => setComprobante(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              loading={pagar.isPending}
              disabled={!cuenta}
              onClick={() =>
                cuenta &&
                pagar.mutate(
                  {
                    solicitudId: solicitud.id,
                    cuentaId: cuenta,
                    comprobante: comprobante.trim() || null,
                  },
                  { onSuccess: onCerrar },
                )
              }
            >
              Pagar
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}

function ModalMotivo({
  abierto,
  titulo,
  cargando,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean;
  titulo: string;
  cargando: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <Modal opened={abierto} onClose={onCerrar} title={titulo} centered>
      <Stack gap="md">
        <TextInput
          label="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            loading={cargando}
            disabled={motivo.trim().length < 3}
            onClick={() => onConfirmar(motivo.trim())}
          >
            Confirmar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

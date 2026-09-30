import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
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
import { IconCash, IconInfoCircle, IconUsers } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { fecha } from '@/lib/formato';
import { useClientes } from '@/lib/consultasFacturacion';
import {
  MEDIOS_PAGO,
  pesos,
  saldoCorrido,
  useCuentaCorrienteCliente,
  useFacturasPendientes,
  useRegistrarCobro,
  useSaldosClientes,
  type MedioPago,
} from '@/lib/consultasAdministracion';
import { MONEDA, SelectCuenta, aNumero } from './compartidos';

/**
 * Cuenta corriente de clientes (§3 del documento de Administración):
 * facturación, cobranzas, deuda y antigüedad de saldos. Los cobros se imputan
 * a facturas; lo cobrado sin imputar queda a la vista como «cobrado sin
 * facturar» (§2.3).
 */
export function PaginaCuentasClientes() {
  const saldos = useSaldosClientes();
  const clientes = useClientes();
  const [elegido, setElegido] = useState<string | null>(null);
  const filas = saldos.data ?? [];
  const homologacion = filas.some((f) => Number(f.pendiente_homologacion) > 0);
  const nombre = (id: string | null) =>
    (clientes.data ?? []).find((c) => c.id === id)?.razon_social ?? '';

  return (
    <>
      <EncabezadoPagina
        titulo="Cuentas corrientes de clientes"
        descripcion="Lo facturado, lo cobrado, lo que deben y hace cuánto."
        acciones={
          <Select
            placeholder="Ir a un cliente"
            searchable
            w={280}
            data={(clientes.data ?? []).map((c) => ({
              value: c.id,
              label: c.razon_social,
            }))}
            value={elegido}
            onChange={setElegido}
          />
        }
      />
      <Stack gap="md">
        {homologacion ? (
          <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
            Las facturas de homologación no son fiscales: no cuentan en los saldos.
          </Alert>
        ) : null}
        {saldos.isLoading ? (
          <Skeleton h={200} />
        ) : filas.length === 0 ? (
          <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
            <Vacio
              icono={IconUsers}
              titulo="Sin facturas ni cobros"
              descripcion="La cuenta de cada cliente se arma sola con las facturas autorizadas y los cobros."
            />
          </Paper>
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={860}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th ta="right">Saldo</Table.Th>
                    <Table.Th ta="right">Hasta 30 días</Table.Th>
                    <Table.Th ta="right">31 a 60</Table.Th>
                    <Table.Th ta="right">61 a 90</Table.Th>
                    <Table.Th ta="right">Más de 90</Table.Th>
                    <Table.Th ta="right">Cobrado sin imputar</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f) => (
                    <Table.Tr
                      key={f.cliente_id}
                      onClick={() => setElegido(f.cliente_id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Table.Td fw={600}>{f.razon_social}</Table.Td>
                      <Table.Td ta="right" ff="monospace" fw={700}>
                        {pesos(f.saldo)}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {pesos(f.a_30)}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {pesos(f.a_60)}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {pesos(f.a_90)}
                      </Table.Td>
                      <Table.Td ta="right">
                        {Number(f.mas_90) > 0 ? (
                          <Badge color="red" variant="light" size="lg">
                            {pesos(f.mas_90)}
                          </Badge>
                        ) : (
                          pesos(0)
                        )}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {Number(f.cobrado_sin_imputar) > 0
                          ? pesos(f.cobrado_sin_imputar)
                          : '—'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>
      <Modal
        opened={elegido !== null}
        onClose={() => setElegido(null)}
        title={nombre(elegido)}
        size="xl"
        centered
      >
        {elegido ? <FichaCliente clienteId={elegido} nombre={nombre(elegido)} /> : null}
      </Modal>
    </>
  );
}

function FichaCliente({ clienteId, nombre }: { clienteId: string; nombre: string }) {
  const cc = useCuentaCorrienteCliente(clienteId);
  const [cobrando, setCobrando] = useState(false);
  const filas = saldoCorrido(
    (cc.data ?? []).filter((m) => m.ambiente !== 'HOMOLOGACION'),
  );
  return (
    <Stack gap="md">
      <Group>
        <Button leftSection={<IconCash size={18} />} onClick={() => setCobrando(true)}>
          Registrar cobro
        </Button>
      </Group>
      {cc.isLoading ? (
        <Skeleton h={160} />
      ) : filas.length === 0 ? (
        <Text size="sm" c="dimmed">
          Sin movimientos.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Movimiento</Table.Th>
                <Table.Th ta="right">Debe</Table.Th>
                <Table.Th ta="right">Haber</Table.Th>
                <Table.Th ta="right">Saldo</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((m, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{fecha(m.fecha)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {m.movimiento === 'FACTURA'
                        ? `Factura ${m.detalle_tipo}`
                        : `Cobro · ${(m.detalle_tipo ?? '').toLowerCase()}`}
                    </Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {m.referencia}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" ff="monospace">
                    {Number(m.debe) ? pesos(m.debe) : ''}
                  </Table.Td>
                  <Table.Td ta="right" ff="monospace">
                    {Number(m.haber) ? pesos(m.haber) : ''}
                  </Table.Td>
                  <Table.Td ta="right" ff="monospace" fw={600}>
                    {pesos(m.saldo)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <ModalCobro
        clienteId={clienteId}
        cliente={nombre}
        abierto={cobrando}
        onCerrar={() => setCobrando(false)}
      />
    </Stack>
  );
}

function ModalCobro({
  clienteId,
  cliente,
  abierto,
  onCerrar,
}: {
  clienteId: string;
  cliente: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const facturas = useFacturasPendientes(abierto ? clienteId : null);
  const cobrar = useRegistrarCobro();
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [medio, setMedio] = useState<MedioPago>('TRANSFERENCIA');
  const [importe, setImporte] = useState<number | string>('');
  const [referencia, setReferencia] = useState('');
  const [imputar, setImputar] = useState<Record<string, number | string>>({});
  const filas = (facturas.data ?? []).filter((f) => f.ambiente === 'PRODUCCION');
  const total = aNumero(importe);
  const imputado = Object.values(imputar).reduce<number>((a, v) => a + aNumero(v), 0);
  const excedido = filas.some(
    (f) => aNumero(imputar[f.factura_id ?? ''] ?? 0) > Number(f.pendiente),
  );

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={`Cobro a ${cliente}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Group grow>
          <SelectCuenta value={cuenta} onChange={setCuenta} label="Entra a" />
          <Select
            label="Medio"
            data={MEDIOS_PAGO}
            value={medio}
            onChange={(v) => v && setMedio(v as MedioPago)}
          />
        </Group>
        <Group grow>
          <NumberInput
            label="Importe"
            withAsterisk
            {...MONEDA}
            value={importe}
            onChange={setImporte}
          />
          <TextInput
            label="Referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.currentTarget.value)}
          />
        </Group>
        {filas.length > 0 ? (
          <Stack gap={4}>
            <Text fw={600} size="sm">
              ¿Qué facturas cancela?
            </Text>
            <Table verticalSpacing={4}>
              <Table.Tbody>
                {filas.map((f) => (
                  <Table.Tr key={f.factura_id}>
                    <Table.Td>
                      <Text size="sm">
                        Factura {f.tipo} {String(f.punto_venta).padStart(4, '0')}-
                        {String(f.numero ?? 0).padStart(8, '0')}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {fecha(f.fecha)} · hace {f.dias} días · debe {pesos(f.pendiente)}
                      </Text>
                    </Table.Td>
                    <Table.Td w={160}>
                      <NumberInput
                        aria-label="Importe imputado"
                        {...MONEDA}
                        max={Number(f.pendiente)}
                        value={imputar[f.factura_id ?? ''] ?? ''}
                        onChange={(v) =>
                          setImputar({ ...imputar, [f.factura_id ?? '']: v })
                        }
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            No hay facturas pendientes: el cobro queda sin imputar (cobrado sin facturar).
          </Text>
        )}
        {imputado > total ? (
          <Alert color="red" variant="light">
            Imputás {pesos(imputado)} y el cobro es de {pesos(total)}.
          </Alert>
        ) : null}
        <Group justify="flex-end">
          <Button
            loading={cobrar.isPending}
            disabled={!cuenta || total <= 0 || imputado > total || excedido}
            onClick={() =>
              cuenta &&
              cobrar.mutate(
                {
                  clienteId,
                  cuentaId: cuenta,
                  importe: total,
                  medio,
                  imputaciones: Object.entries(imputar)
                    .map(([facturaId, v]) => ({ facturaId, importe: aNumero(v) }))
                    .filter((i) => i.importe > 0),
                  referencia: referencia.trim() || null,
                },
                {
                  onSuccess: () => {
                    setImputar({});
                    setImporte('');
                    onCerrar();
                  },
                },
              )
            }
          >
            Registrar cobro
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

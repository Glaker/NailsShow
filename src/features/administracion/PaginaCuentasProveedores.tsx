import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconCash,
  IconFileInvoice,
  IconScale,
  IconUsersGroup,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useProveedores } from '@/lib/consultas';
import { fecha, fechaISO } from '@/lib/formato';
import {
  discriminaIva,
  useComprobantesProveedor,
  useRegistrarComprobanteProveedor,
  type TipoComprobanteProveedor,
} from '@/lib/consultasCompras';
import {
  pesos,
  saldoCorrido,
  useConciliarProveedor,
  useCuentaCorrienteProveedor,
  useSaldosProveedores,
} from '@/lib/consultasAdministracion';
import { MONEDA, ModalPagoProveedor, aNumero } from './compartidos';

/**
 * Cuenta corriente de proveedores (§2.2 del documento de Administración):
 * facturas, notas de crédito, pagos, vencimientos y saldo, y la conciliación
 * contra el saldo que informa cada proveedor.
 */
export function PaginaCuentasProveedores() {
  const saldos = useSaldosProveedores();
  const proveedores = useProveedores();
  const [elegido, setElegido] = useState<string | null>(null);
  const filas = saldos.data ?? [];
  const nombre = (id: string | null) =>
    (proveedores.data ?? []).find((p) => p.id === id)?.razon_social ?? '';

  return (
    <>
      <EncabezadoPagina
        titulo="Cuentas corrientes de proveedores"
        descripcion="Lo que se debe a cada proveedor, qué vence y si coincide con lo que ellos informan."
        acciones={
          <Select
            placeholder="Ir a un proveedor"
            searchable
            w={280}
            data={(proveedores.data ?? [])
              .filter((p) => p.activo)
              .map((p) => ({ value: p.id, label: p.razon_social }))}
            value={elegido}
            onChange={setElegido}
          />
        }
      />
      <Stack gap="lg">
        {saldos.isLoading ? (
          <Skeleton h={200} />
        ) : filas.length === 0 ? (
          <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
            <Vacio
              icono={IconUsersGroup}
              titulo="Sin movimientos con proveedores"
              descripcion="Las facturas entran con la recepción o desde acá. Elegí un proveedor arriba para cargar una."
            />
          </Paper>
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Proveedor</Table.Th>
                    <Table.Th ta="right">Saldo</Table.Th>
                    <Table.Th ta="right">Vencido</Table.Th>
                    <Table.Th>Próximo vencimiento</Table.Th>
                    <Table.Th>Conciliación</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f) => (
                    <Table.Tr
                      key={f.proveedor_id}
                      onClick={() => setElegido(f.proveedor_id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Table.Td fw={600}>{f.razon_social}</Table.Td>
                      <Table.Td ta="right" ff="monospace" fw={700}>
                        {pesos(f.saldo)}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {Number(f.vencido) > 0 ? (
                          <Badge color="red" variant="light" size="lg">
                            {pesos(f.vencido)}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </Table.Td>
                      <Table.Td>{fecha(f.proximo_vencimiento)}</Table.Td>
                      <Table.Td>
                        {f.conciliado_al ? (
                          Number(f.diferencia_conciliacion) === 0 ? (
                            <Text size="sm">Coincide al {fecha(f.conciliado_al)}</Text>
                          ) : (
                            <Badge color="estadoCuarentena" variant="light">
                              Diferencia {pesos(f.diferencia_conciliacion)}
                            </Badge>
                          )
                        ) : (
                          <Text size="sm" c="dimmed">
                            sin conciliar
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

      <Modal
        opened={elegido !== null}
        onClose={() => setElegido(null)}
        title={nombre(elegido)}
        size="xl"
        centered
      >
        {elegido ? (
          <FichaProveedor proveedorId={elegido} nombre={nombre(elegido)} />
        ) : null}
      </Modal>
    </>
  );
}

function FichaProveedor({
  proveedorId,
  nombre,
}: {
  proveedorId: string;
  nombre: string;
}) {
  const cc = useCuentaCorrienteProveedor(proveedorId);
  const [modal, setModal] = useState<'pago' | 'comprobante' | 'conciliar' | null>(null);
  const filas = saldoCorrido(cc.data ?? []);
  const saldo = filas.at(-1)?.saldo ?? 0;

  return (
    <Stack gap="md">
      <Group gap="sm">
        <Button leftSection={<IconCash size={18} />} onClick={() => setModal('pago')}>
          Registrar pago
        </Button>
        <Button
          variant="default"
          leftSection={<IconFileInvoice size={18} />}
          onClick={() => setModal('comprobante')}
        >
          Cargar comprobante
        </Button>
        <Button
          variant="default"
          leftSection={<IconScale size={18} />}
          onClick={() => setModal('conciliar')}
        >
          Conciliar
        </Button>
      </Group>

      {cc.isLoading ? (
        <Skeleton h={160} />
      ) : filas.length === 0 ? (
        <Text size="sm" c="dimmed">
          Sin movimientos.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={680}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Movimiento</Table.Th>
                <Table.Th>Vence</Table.Th>
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
                      {m.detalle_tipo.replace(/_/g, ' ').toLowerCase()}
                    </Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {m.referencia}
                    </Text>
                  </Table.Td>
                  <Table.Td>{fecha(m.vencimiento_pago)}</Table.Td>
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

      <ModalPagoProveedor
        proveedorId={proveedorId}
        proveedor={nombre}
        abierto={modal === 'pago'}
        onCerrar={() => setModal(null)}
      />
      <ModalComprobante
        proveedorId={proveedorId}
        abierto={modal === 'comprobante'}
        onCerrar={() => setModal(null)}
      />
      <ModalConciliarProveedor
        proveedorId={proveedorId}
        saldo={saldo}
        abierto={modal === 'conciliar'}
        onCerrar={() => setModal(null)}
      />
    </Stack>
  );
}

const TIPOS: { value: TipoComprobanteProveedor; label: string }[] = [
  { value: 'FACTURA_A', label: 'Factura A' },
  { value: 'FACTURA_B', label: 'Factura B' },
  { value: 'FACTURA_C', label: 'Factura C' },
  { value: 'NOTA_CREDITO_A', label: 'NC A' },
  { value: 'NOTA_CREDITO_B', label: 'NC B' },
  { value: 'NOTA_CREDITO_C', label: 'NC C' },
  { value: 'SIN_FACTURA', label: 'Sin factura' },
];

/** Comprobante que llega aparte de la recepción: servicio, factura tardía, NC. */
function ModalComprobante({
  proveedorId,
  abierto,
  onCerrar,
}: {
  proveedorId: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const registrar = useRegistrarComprobanteProveedor();
  const comprobantes = useComprobantesProveedor({ proveedorId });
  const [tipo, setTipo] = useState<TipoComprobanteProveedor>('FACTURA_A');
  const [pv, setPv] = useState<number | string>('');
  const [num, setNum] = useState<number | string>('');
  const [dia, setDia] = useState<Date | null>(new Date());
  const [vence, setVence] = useState<Date | null>(null);
  const [neto, setNeto] = useState<number | string>('');
  const [iva, setIva] = useState<number | string>('');
  const [otros, setOtros] = useState<number | string>('');
  const [total, setTotal] = useState<number | string>('');
  const [asociada, setAsociada] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const conIva = discriminaIva(tipo);
  const esNc = tipo.startsWith('NOTA_CREDITO');
  const sinFactura = tipo === 'SIN_FACTURA';
  const importe = conIva ? aNumero(neto) + aNumero(iva) + aNumero(otros) : aNumero(total);
  const facturasMismaClase = (comprobantes.data ?? []).filter(
    (c) => !c.anulado_en && c.tipo === `FACTURA_${tipo.slice(-1)}`,
  );
  const valido =
    (sinFactura || (aNumero(pv) > 0 && aNumero(num) > 0 && importe > 0)) &&
    (!conIva || (neto !== '' && iva !== '')) &&
    (!esNc || asociada !== null);

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Cargar comprobante"
      size="lg"
      centered
    >
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          value={tipo}
          onChange={(v) => setTipo(v as TipoComprobanteProveedor)}
          data={TIPOS}
        />
        {sinFactura ? null : (
          <Group grow>
            <NumberInput
              label="Punto de venta"
              min={1}
              allowDecimal={false}
              value={pv}
              onChange={setPv}
            />
            <NumberInput
              label="Número"
              min={1}
              allowDecimal={false}
              value={num}
              onChange={setNum}
            />
          </Group>
        )}
        <Group grow>
          <DateInput
            label="Fecha"
            valueFormat="DD/MM/YYYY"
            value={dia}
            onChange={(v) => setDia(v ? new Date(v) : null)}
          />
          <DateInput
            label="Vence el pago"
            valueFormat="DD/MM/YYYY"
            clearable
            value={vence}
            onChange={(v) => setVence(v ? new Date(v) : null)}
          />
        </Group>
        {conIva ? (
          <Group grow>
            <NumberInput
              label="Neto gravado"
              {...MONEDA}
              value={neto}
              onChange={setNeto}
            />
            <NumberInput label="IVA" {...MONEDA} value={iva} onChange={setIva} />
            <NumberInput label="Otros" {...MONEDA} value={otros} onChange={setOtros} />
          </Group>
        ) : (
          <NumberInput label="Total" {...MONEDA} value={total} onChange={setTotal} />
        )}
        {esNc ? (
          <Select
            label="Corrige la factura"
            withAsterisk
            data={facturasMismaClase.map((c) => ({
              value: c.id,
              label: `${c.punto_venta}-${c.numero} · ${fecha(c.fecha)} · ${pesos(c.importe_total)}`,
            }))}
            value={asociada}
            onChange={setAsociada}
          />
        ) : null}
        <TextInput
          label="Observación"
          value={obs}
          onChange={(e) => setObs(e.currentTarget.value)}
        />
        <Group justify="space-between">
          <Text fw={600}>Total {pesos(importe)}</Text>
          <Button
            loading={registrar.isPending}
            disabled={!valido}
            onClick={() => {
              const f = fechaISO(dia);
              const v = fechaISO(vence);
              registrar.mutate(
                {
                  proveedor_id: proveedorId,
                  tipo,
                  punto_venta: sinFactura ? null : aNumero(pv),
                  numero: sinFactura ? null : aNumero(num),
                  ...(f ? { fecha: f } : {}),
                  vencimiento_pago: v,
                  importe_neto: conIva ? aNumero(neto) : null,
                  importe_iva: conIva ? aNumero(iva) : null,
                  importe_otros: conIva ? aNumero(otros) : null,
                  importe_total: total === '' && !conIva ? null : importe,
                  comprobante_asociado_id: esNc ? asociada : null,
                  observacion: obs.trim() || null,
                },
                { onSuccess: onCerrar },
              );
            }}
          >
            Cargar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalConciliarProveedor({
  proveedorId,
  saldo,
  abierto,
  onCerrar,
}: {
  proveedorId: string;
  saldo: number;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const conciliar = useConciliarProveedor();
  const [dia, setDia] = useState<Date | null>(new Date());
  const [informado, setInformado] = useState<number | string>('');
  const [obs, setObs] = useState('');
  const dif = aNumero(informado) - saldo;
  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Conciliar con el proveedor"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          Poné el saldo que te informa el proveedor. Hoy la cuenta corriente dice{' '}
          <b>{pesos(saldo)}</b>.
        </Text>
        <Group grow>
          <DateInput
            label="Al día"
            valueFormat="DD/MM/YYYY"
            value={dia}
            onChange={(v) => setDia(v ? new Date(v) : null)}
          />
          <NumberInput
            label="Saldo informado"
            {...MONEDA}
            value={informado}
            onChange={setInformado}
          />
        </Group>
        {informado !== '' && dif !== 0 ? (
          <Text size="sm" c="red.7">
            Diferencia {pesos(dif)}: explicala.
          </Text>
        ) : null}
        <TextInput
          label="Explicación"
          value={obs}
          onChange={(e) => setObs(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            loading={conciliar.isPending}
            disabled={!dia || informado === '' || (dif !== 0 && !obs.trim())}
            onClick={() =>
              dia &&
              conciliar.mutate(
                {
                  proveedor_id: proveedorId,
                  fecha: fechaISO(dia)!,
                  saldo_informado: aNumero(informado),
                  observacion: obs.trim() || null,
                },
                { onSuccess: onCerrar },
              )
            }
          >
            Registrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

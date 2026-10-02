import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconArrowsExchange,
  IconBuildingBank,
  IconPlus,
  IconScale,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { diasHasta, fecha, fechaISO } from '@/lib/formato';
import {
  pesos,
  useAnularMovimientoFondos,
  useEditarCuentaFondos,
  useAnularTransferencia,
  useConciliarFondos,
  useCrearCuentaFondos,
  useMovimientosFondos,
  useRegistrarMovimientoFondos,
  useSaldosFondos,
  useTransferirFondos,
  type SaldoFondos,
  type TipoCuentaFondos,
} from '@/lib/consultasAdministracion';
import { MONEDA, SelectCuenta, aNumero, ModalAnular } from './compartidos';

type Modal_ = 'cuenta' | 'movimiento' | 'transferencia' | 'conciliar' | null;

/**
 * Cajas y bancos (§2.3 del documento de Administración): saldo de cada
 * cuenta, sus movimientos, transferencias y conciliación contra el saldo real.
 * Los pagos y cobros generan su movimiento solos: acá se carga lo demás.
 * Nada se edita: un movimiento mal cargado se anula con su inverso.
 */
export function PaginaTesoreria() {
  const cuentas = useSaldosFondos();
  const [elegida, setElegida] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal_>(null);
  const lista = cuentas.data ?? [];
  const actual = lista.find((c) => c.cuenta_id === elegida) ?? lista[0] ?? null;
  const propias = lista.filter((c) => !c.de_tercero);

  return (
    <>
      <EncabezadoPagina
        titulo="Tesorería"
        descripcion="Cajas, bancos y cuentas de terceros. Los pagos y cobros se registran solos; acá va lo demás."
        acciones={
          <Group gap="sm">
            <Button
              variant="default"
              leftSection={<IconPlus size={18} />}
              onClick={() => setModal('cuenta')}
            >
              Nueva cuenta
            </Button>
            <Button
              variant="default"
              leftSection={<IconArrowsExchange size={18} />}
              disabled={lista.length < 2}
              onClick={() => setModal('transferencia')}
            >
              Transferir
            </Button>
            <Button disabled={!actual} onClick={() => setModal('movimiento')}>
              Ingreso o egreso
            </Button>
          </Group>
        }
      />

      {cuentas.isLoading ? (
        <Skeleton h={200} />
      ) : lista.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconBuildingBank}
            titulo="Todavía no hay cajas ni cuentas"
            descripcion="Creá la caja de fábrica, las cuentas bancarias y las de terceros por las que pasa plata de Nail Show."
            accion={<Button onClick={() => setModal('cuenta')}>Nueva cuenta</Button>}
          />
        </Paper>
      ) : (
        <Stack gap="lg">
          <Text size="sm" c="dimmed">
            Total en cuentas propias:{' '}
            <b>{pesos(propias.reduce((a, c) => a + Number(c.saldo), 0))}</b>
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {lista.map((c) => (
              <TarjetaCuenta
                key={c.cuenta_id}
                cuenta={c}
                activa={actual?.cuenta_id === c.cuenta_id}
                onElegir={() => setElegida(c.cuenta_id)}
              />
            ))}
          </SimpleGrid>
          {actual ? (
            <Movimientos cuenta={actual} onConciliar={() => setModal('conciliar')} />
          ) : null}
        </Stack>
      )}

      <ModalCuenta abierto={modal === 'cuenta'} onCerrar={() => setModal(null)} />
      <ModalMovimiento
        abierto={modal === 'movimiento'}
        onCerrar={() => setModal(null)}
        cuentaInicial={actual?.cuenta_id ?? null}
      />
      <ModalTransferencia
        abierto={modal === 'transferencia'}
        onCerrar={() => setModal(null)}
      />
      {actual ? (
        <ModalConciliar
          abierto={modal === 'conciliar'}
          onCerrar={() => setModal(null)}
          cuenta={actual}
        />
      ) : null}
    </>
  );
}

function TarjetaCuenta({
  cuenta: c,
  activa,
  onElegir,
}: {
  cuenta: SaldoFondos;
  activa: boolean;
  onElegir: () => void;
}) {
  const sinConciliar =
    !c.ultima_conciliacion || (diasHasta(c.ultima_conciliacion) ?? 0) < -30;
  return (
    <UnstyledButton onClick={onElegir}>
      <Paper
        withBorder
        p="md"
        style={{
          borderColor: activa
            ? 'var(--mantine-color-violeta-5)'
            : 'var(--superficie-borde)',
          borderWidth: activa ? 2 : 1,
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} truncate>
            {c.nombre}
          </Text>
          <Badge
            size="sm"
            variant="light"
            color={c.de_tercero ? 'estadoCuarentena' : 'gray'}
          >
            {c.de_tercero ? `de ${c.titular}` : (c.tipo ?? '').toLowerCase()}
          </Badge>
        </Group>
        <Text
          fz={26}
          fw={700}
          ff="monospace"
          mt={4}
          c={Number(c.saldo) < 0 ? 'red.7' : 'ciruela.8'}
        >
          {pesos(c.saldo)}
        </Text>
        <Text size="xs" c={sinConciliar ? 'estadoCuarentena.8' : 'dimmed'}>
          {c.ultima_conciliacion
            ? `Conciliada al ${fecha(c.ultima_conciliacion)}`
            : 'Nunca conciliada'}
        </Text>
      </Paper>
    </UnstyledButton>
  );
}

function Movimientos({
  cuenta,
  onConciliar,
}: {
  cuenta: SaldoFondos;
  onConciliar: () => void;
}) {
  const movs = useMovimientosFondos(cuenta.cuenta_id);
  const anular = useAnularMovimientoFondos();
  const [editandoCuenta, setEditandoCuenta] = useState(false);
  const anularTransf = useAnularTransferencia();
  const [anulandoTransf, setAnulandoTransf] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const filas = movs.data ?? [];
  const anulados = new Set(filas.map((m) => m.anula_a_id).filter(Boolean));

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>Movimientos de {cuenta.nombre}</Text>
        <Group gap="xs">
          <Button
            size="compact-md"
            variant="default"
            onClick={() => setEditandoCuenta(true)}
          >
            Editar cuenta
          </Button>
          <Button
            size="compact-md"
            variant="light"
            leftSection={<IconScale size={16} />}
            onClick={onConciliar}
          >
            Conciliar
          </Button>
        </Group>
      </Group>
      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {movs.isLoading ? (
          <Skeleton h={160} />
        ) : filas.length === 0 ? (
          <Text p="md" size="sm" c="dimmed">
            Sin movimientos.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Concepto</Table.Th>
                  <Table.Th>Contraparte</Table.Th>
                  <Table.Th>Comprobante</Table.Th>
                  <Table.Th ta="right">Importe</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((m) => {
                  const automatico = m.pago_id || m.cobro_id || m.solicitud_id;
                  return (
                    <Table.Tr
                      key={m.id}
                      style={{ opacity: anulados.has(m.id) || m.anula_a_id ? 0.6 : 1 }}
                    >
                      <Table.Td>{fecha(m.fecha)}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{m.concepto}</Text>
                        <Text size="xs" c="dimmed">
                          {m.tipo.toLowerCase()}
                          {automatico ? ' · automático' : ''}
                          {anulados.has(m.id) ? ' · anulado' : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td>{m.contraparte ?? '—'}</Table.Td>
                      <Table.Td>{m.comprobante ?? '—'}</Table.Td>
                      <Table.Td
                        ta="right"
                        ff="monospace"
                        fw={600}
                        {...(Number(m.importe) > 0 ? { c: 'estadoAprobado.7' } : {})}
                      >
                        {pesos(m.importe)}
                      </Table.Td>
                      <Table.Td>
                        {m.transferencia_grupo && !m.anula_a_id && !anulados.has(m.id) ? (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => setAnulandoTransf(m.transferencia_grupo)}
                          >
                            Anular transferencia
                          </Button>
                        ) : !automatico && !m.anula_a_id && !anulados.has(m.id) ? (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => setAnulando(m.id)}
                          >
                            Anular
                          </Button>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
      {anulandoTransf === null ? null : (
        <ModalAnular
          abierto
          titulo="Anular la transferencia"
          explicacion="Se revierten las dos cuentas a la vez: la que mandó y la que recibió. Las dos patas originales quedan a la vista."
          cargando={anularTransf.isPending}
          onCerrar={() => setAnulandoTransf(null)}
          onAnular={(motivo) =>
            anularTransf.mutate(
              { grupo: anulandoTransf, motivo },
              { onSuccess: () => setAnulandoTransf(null) },
            )
          }
        />
      )}
      {editandoCuenta ? (
        <ModalEditarCuenta cuenta={cuenta} onCerrar={() => setEditandoCuenta(false)} />
      ) : null}
      <Modal
        opened={anulando !== null}
        onClose={() => setAnulando(null)}
        title="Anular movimiento"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Se registra el movimiento inverso. El original queda a la vista.
          </Text>
          <TextInput
            label="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              loading={anular.isPending}
              disabled={motivo.trim().length < 3}
              onClick={() =>
                anulando &&
                anular.mutate(
                  { id: anulando, motivo: motivo.trim() },
                  {
                    onSuccess: () => {
                      setAnulando(null);
                      setMotivo('');
                    },
                  },
                )
              }
            >
              Anular
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

/** #37: editar la caja o cuenta. Se precarga con lo que tiene; el tipo no se cambia. */
function ModalEditarCuenta({
  cuenta,
  onCerrar,
}: {
  cuenta: SaldoFondos;
  onCerrar: () => void;
}) {
  const editar = useEditarCuentaFondos();
  const [nombre, setNombre] = useState(cuenta.nombre ?? '');
  const [banco, setBanco] = useState(cuenta.banco ?? '');
  const [numero, setNumero] = useState(cuenta.numero ?? '');
  const [titular, setTitular] = useState(cuenta.titular ?? '');
  const [activo, setActivo] = useState(cuenta.activo ?? true);
  return (
    <Modal opened onClose={onCerrar} title={`Editar ${cuenta.nombre ?? ''}`} centered>
      <Stack gap="sm">
        <TextInput
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
        />
        {cuenta.tipo === 'BANCO' ? (
          <>
            <TextInput
              label="Banco"
              value={banco}
              onChange={(e) => setBanco(e.currentTarget.value)}
            />
            <TextInput
              label="Número / CBU"
              value={numero}
              onChange={(e) => setNumero(e.currentTarget.value)}
            />
          </>
        ) : null}
        {cuenta.de_tercero ? (
          <TextInput
            label="Titular"
            value={titular}
            onChange={(e) => setTitular(e.currentTarget.value)}
          />
        ) : null}
        <Checkbox
          label="Activa (si no, no aparece para pagar ni cobrar; su historia queda)"
          checked={activo}
          onChange={(e) => setActivo(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            loading={editar.isPending}
            disabled={!nombre.trim() || (Boolean(cuenta.de_tercero) && !titular.trim())}
            onClick={() =>
              editar.mutate(
                {
                  id: cuenta.cuenta_id ?? '',
                  nombre: nombre.trim(),
                  banco: banco.trim() || null,
                  numero: numero.trim() || null,
                  titular: titular.trim() || null,
                  activo,
                },
                { onSuccess: onCerrar },
              )
            }
          >
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalCuenta({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const crear = useCrearCuentaFondos();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoCuentaFondos>('CAJA');
  const [banco, setBanco] = useState('');
  const [numero, setNumero] = useState('');
  const [deTercero, setDeTercero] = useState(false);
  const [titular, setTitular] = useState('');
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Nueva caja o cuenta" centered>
      <Stack gap="md">
        <TextInput
          label="Nombre"
          withAsterisk
          placeholder="Caja fábrica, Galicia CC…"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
        />
        <SegmentedControl
          value={tipo}
          onChange={(v) => setTipo(v as TipoCuentaFondos)}
          data={[
            { value: 'CAJA', label: 'Caja' },
            { value: 'BANCO', label: 'Banco' },
            { value: 'BILLETERA', label: 'Billetera' },
          ]}
        />
        {tipo !== 'CAJA' ? (
          <Group grow>
            <TextInput
              label="Banco o billetera"
              value={banco}
              onChange={(e) => setBanco(e.currentTarget.value)}
            />
            <TextInput
              label="N° / CBU / alias"
              value={numero}
              onChange={(e) => setNumero(e.currentTarget.value)}
            />
          </Group>
        ) : null}
        <Checkbox
          label="Es de un tercero"
          description="Cuenta que no es de Nail Show pero por la que pasan operaciones suyas: queda identificada para auditarla."
          checked={deTercero}
          onChange={(e) => setDeTercero(e.currentTarget.checked)}
        />
        {deTercero ? (
          <TextInput
            label="Titular"
            withAsterisk
            value={titular}
            onChange={(e) => setTitular(e.currentTarget.value)}
          />
        ) : null}
        <Group justify="flex-end">
          <Button
            loading={crear.isPending}
            disabled={!nombre.trim() || (deTercero && !titular.trim())}
            onClick={() =>
              crear.mutate(
                {
                  nombre: nombre.trim(),
                  tipo,
                  banco: banco.trim() || null,
                  numero: numero.trim() || null,
                  de_tercero: deTercero,
                  titular: deTercero ? titular.trim() : null,
                },
                {
                  onSuccess: () => {
                    setNombre('');
                    onCerrar();
                  },
                },
              )
            }
          >
            Crear
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalMovimiento({
  abierto,
  onCerrar,
  cuentaInicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  cuentaInicial: string | null;
}) {
  const registrar = useRegistrarMovimientoFondos();
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO');
  const [importe, setImporte] = useState<number | string>('');
  const [concepto, setConcepto] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [dia, setDia] = useState<Date | null>(new Date());
  const cuentaId = cuenta ?? cuentaInicial;
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Ingreso o egreso" centered>
      <Stack gap="md">
        <SegmentedControl
          value={tipo}
          onChange={(v) => setTipo(v as 'INGRESO' | 'EGRESO')}
          data={[
            { value: 'EGRESO', label: 'Sale plata' },
            { value: 'INGRESO', label: 'Entra plata' },
          ]}
        />
        <SelectCuenta value={cuentaId} onChange={setCuenta} />
        <Group grow>
          <NumberInput
            label="Importe"
            withAsterisk
            {...MONEDA}
            value={importe}
            onChange={setImporte}
          />
          <DateInput
            label="Fecha"
            valueFormat="DD/MM/YYYY"
            value={dia}
            onChange={(v) => setDia(v ? new Date(v) : null)}
          />
        </Group>
        <TextInput
          label="Concepto"
          withAsterisk
          placeholder="Luz, flete, retiro…"
          value={concepto}
          onChange={(e) => setConcepto(e.currentTarget.value)}
        />
        <Group grow>
          <TextInput
            label={tipo === 'EGRESO' ? 'A quién' : 'De quién'}
            value={contraparte}
            onChange={(e) => setContraparte(e.currentTarget.value)}
          />
          <TextInput
            label="Comprobante"
            value={comprobante}
            onChange={(e) => setComprobante(e.currentTarget.value)}
          />
        </Group>
        <Text size="xs" c="dimmed">
          Un pago a proveedor o un cobro a cliente se cargan desde su cuenta corriente,
          para que bajen la deuda.
        </Text>
        <Group justify="flex-end">
          <Button
            loading={registrar.isPending}
            disabled={!cuentaId || aNumero(importe) <= 0 || !concepto.trim()}
            onClick={() =>
              cuentaId &&
              registrar.mutate(
                {
                  cuenta_id: cuentaId,
                  tipo,
                  importe: aNumero(importe),
                  concepto: concepto.trim(),
                  contraparte: contraparte.trim() || null,
                  comprobante: comprobante.trim() || null,
                  fecha: fechaISO(dia),
                },
                {
                  onSuccess: () => {
                    setImporte('');
                    setConcepto('');
                    onCerrar();
                  },
                },
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

function ModalTransferencia({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const transferir = useTransferirFondos();
  const cuentas = useSaldosFondos();
  const [origen, setOrigen] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [importe, setImporte] = useState<number | string>('');
  const [concepto, setConcepto] = useState('');
  const opciones = (cuentas.data ?? []).map((c) => ({
    value: c.cuenta_id ?? '',
    label: c.nombre ?? '',
  }));
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Transferir entre cuentas" centered>
      <Stack gap="md">
        <Group grow>
          <Select label="De" data={opciones} value={origen} onChange={setOrigen} />
          <Select
            label="A"
            data={opciones.filter((o) => o.value !== origen)}
            value={destino}
            onChange={setDestino}
          />
        </Group>
        <NumberInput
          label="Importe"
          withAsterisk
          {...MONEDA}
          value={importe}
          onChange={setImporte}
        />
        <TextInput
          label="Concepto"
          value={concepto}
          onChange={(e) => setConcepto(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            loading={transferir.isPending}
            disabled={!origen || !destino || aNumero(importe) <= 0}
            onClick={() =>
              origen &&
              destino &&
              transferir.mutate(
                { origen, destino, importe: aNumero(importe), concepto: concepto.trim() },
                {
                  onSuccess: () => {
                    setImporte('');
                    onCerrar();
                  },
                },
              )
            }
          >
            Transferir
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalConciliar({
  abierto,
  onCerrar,
  cuenta,
}: {
  abierto: boolean;
  onCerrar: () => void;
  cuenta: SaldoFondos;
}) {
  const conciliar = useConciliarFondos();
  const [dia, setDia] = useState<Date | null>(new Date());
  const [real, setReal] = useState<number | string>('');
  const [obs, setObs] = useState('');
  const diferencia = aNumero(real) - Number(cuenta.saldo);
  const hoy = fechaISO(dia) === fechaISO(new Date());
  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={`Conciliar ${cuenta.nombre}`}
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          Poné el saldo real (extracto del banco o arqueo de caja) a una fecha. El sistema
          compara con el suyo a esa misma fecha y deja la diferencia registrada.
        </Text>
        <Group grow>
          <DateInput
            label="Al día"
            valueFormat="DD/MM/YYYY"
            value={dia}
            onChange={(v) => setDia(v ? new Date(v) : null)}
          />
          <NumberInput
            label="Saldo real"
            {...MONEDA}
            min={-1e12}
            value={real}
            onChange={setReal}
          />
        </Group>
        {hoy && real !== '' ? (
          <Text size="sm">
            Sistema hoy: <b>{pesos(cuenta.saldo)}</b> · diferencia{' '}
            <b
              style={{
                color: diferencia === 0 ? undefined : 'var(--mantine-color-red-7)',
              }}
            >
              {pesos(diferencia)}
            </b>
          </Text>
        ) : null}
        <TextInput
          label="Explicación"
          description="Obligatoria si hay diferencia."
          value={obs}
          onChange={(e) => setObs(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            loading={conciliar.isPending}
            disabled={!dia || real === '' || (hoy && diferencia !== 0 && !obs.trim())}
            onClick={() =>
              dia &&
              conciliar.mutate(
                {
                  cuenta_id: cuenta.cuenta_id ?? '',
                  fecha: fechaISO(dia)!,
                  saldo_real: aNumero(real),
                  observacion: obs.trim() || null,
                },
                {
                  onSuccess: () => {
                    setReal('');
                    setObs('');
                    onCerrar();
                  },
                },
              )
            }
          >
            Registrar conciliación
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

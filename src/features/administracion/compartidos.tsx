import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { fecha, fechaISO } from '@/lib/formato';
import { numeroComprobante } from '@/lib/consultasCompras';
import { useAuditoriaDe } from '@/lib/consultas';
import {
  MEDIOS_PAGO,
  pesos,
  useComprobantesPendientes,
  useRegistrarPagoProveedor,
  useSaldosFondos,
  type MedioPago,
} from '@/lib/consultasAdministracion';

/** Montos: coma decimal, punto de miles, como se escribe acá. */
export const MONEDA = {
  min: 0,
  decimalScale: 2,
  thousandSeparator: '.',
  decimalSeparator: ',',
  prefix: '$ ',
} as const;

export const aNumero = (v: number | string) =>
  typeof v === 'number' ? v : Number(v || 0);

/** Cuentas activas para pagar o cobrar; las de terceros llevan la marca. */
export function SelectCuenta({
  value,
  onChange,
  label = 'Cuenta',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
}) {
  const cuentas = useSaldosFondos();
  return (
    <Select
      label={label}
      withAsterisk
      data={(cuentas.data ?? [])
        .filter((c) => c.activo)
        .map((c) => ({
          value: c.cuenta_id ?? '',
          label: `${c.nombre}${c.de_tercero ? ` (de ${c.titular ?? 'tercero'})` : ''} · ${pesos(c.saldo)}`,
        }))}
      value={value}
      onChange={onChange}
      nothingFoundMessage="Creá una caja o cuenta en Tesorería"
    />
  );
}

/**
 * Pago a proveedor con imputación a sus comprobantes pendientes. Lo que no se
 * imputa queda a cuenta. El egreso de la caja o el banco lo registra la base.
 */
export function ModalPagoProveedor({
  proveedorId,
  proveedor,
  abierto,
  onCerrar,
  solicitud,
}: {
  proveedorId: string | null;
  proveedor: string;
  abierto: boolean;
  onCerrar: () => void;
  /** Si el pago cancela una solicitud aprobada. */
  solicitud?: { id: string; importe: number; comprobanteId: string | null } | null;
}) {
  const pendientes = useComprobantesPendientes(abierto ? proveedorId : null);
  const pagar = useRegistrarPagoProveedor();
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [medio, setMedio] = useState<MedioPago>('TRANSFERENCIA');
  const [importe, setImporte] = useState<number | string>(solicitud?.importe ?? '');
  const [referencia, setReferencia] = useState('');
  const [imputar, setImputar] = useState<Record<string, number | string> | null>(null);

  const filas = pendientes.data ?? [];
  const valores: Record<string, number | string> =
    imputar ??
    (solicitud?.comprobanteId
      ? {
          [solicitud.comprobanteId]: Math.min(
            solicitud.importe,
            Number(
              filas.find((f) => f.comprobante_id === solicitud.comprobanteId)
                ?.pendiente ?? 0,
            ),
          ),
        }
      : {});
  const total = aNumero(importe);
  const imputado = Object.values(valores).reduce<number>((a, v) => a + aNumero(v), 0);
  const excedido = filas.some(
    (f) => aNumero(valores[f.comprobante_id ?? ''] ?? 0) > Number(f.pendiente),
  );

  function cerrar() {
    setImputar(null);
    setReferencia('');
    onCerrar();
  }

  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      title={`Pago a ${proveedor}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Group grow>
          <SelectCuenta value={cuenta} onChange={setCuenta} label="Sale de" />
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
            placeholder="N° de transferencia, cheque…"
            value={referencia}
            onChange={(e) => setReferencia(e.currentTarget.value)}
          />
        </Group>

        {filas.length > 0 ? (
          <Stack gap={4}>
            <Text fw={600} size="sm">
              ¿Qué cancela?
            </Text>
            <Table verticalSpacing={4}>
              <Table.Tbody>
                {filas.map((f) => (
                  <Table.Tr key={f.comprobante_id}>
                    <Table.Td>
                      <Text size="sm">
                        {(f.tipo ?? '').replace(/_/g, ' ').toLowerCase()}{' '}
                        {numeroComprobante(f)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {fecha(f.fecha)}
                        {f.vencimiento_pago
                          ? ` · vence ${fecha(f.vencimiento_pago)}`
                          : ''}{' '}
                        · debe {pesos(f.pendiente)}
                      </Text>
                    </Table.Td>
                    <Table.Td w={160}>
                      <NumberInput
                        aria-label="Importe imputado"
                        {...MONEDA}
                        max={Number(f.pendiente)}
                        value={valores[f.comprobante_id ?? ''] ?? ''}
                        onChange={(v) =>
                          setImputar({ ...valores, [f.comprobante_id ?? '']: v })
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
            No hay comprobantes pendientes: el pago queda a cuenta.
          </Text>
        )}

        {imputado > total ? (
          <Alert color="red" variant="light">
            Imputás {pesos(imputado)} y el pago es de {pesos(total)}.
          </Alert>
        ) : total > imputado && total > 0 ? (
          <Text size="xs" c="dimmed">
            {pesos(total - imputado)} quedan a cuenta.
          </Text>
        ) : null}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={cerrar}>
            Volver
          </Button>
          <Button
            loading={pagar.isPending}
            disabled={
              !proveedorId || !cuenta || total <= 0 || imputado > total || excedido
            }
            onClick={() =>
              proveedorId &&
              cuenta &&
              pagar.mutate(
                {
                  proveedorId,
                  cuentaId: cuenta,
                  importe: total,
                  medio,
                  imputaciones: Object.entries(valores)
                    .map(([comprobanteId, v]) => ({ comprobanteId, importe: aNumero(v) }))
                    .filter((i) => i.importe > 0),
                  referencia: referencia.trim() || null,
                  solicitudId: solicitud?.id ?? null,
                },
                { onSuccess: cerrar },
              )
            }
          >
            Registrar pago
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Anular con motivo (B4, docs/AUDITORIA_ADMIN.md): pagos, cobros, comprobantes
 * y transferencias. No se borra nada: la base registra la anulación o el
 * contramovimiento, con su motivo, y queda en la auditoría.
 */
export function ModalAnular({
  titulo,
  explicacion,
  abierto,
  cargando,
  onCerrar,
  onAnular,
}: {
  titulo: string;
  explicacion: string;
  abierto: boolean;
  cargando: boolean;
  onCerrar: () => void;
  onAnular: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const cerrar = () => {
    setMotivo('');
    onCerrar();
  };
  return (
    <Modal opened={abierto} onClose={cerrar} title={titulo} centered>
      <Stack gap="md">
        <Text size="sm">{explicacion}</Text>
        <TextInput
          label="Motivo"
          placeholder="Ej.: importe mal cargado"
          value={motivo}
          onChange={(e) => setMotivo(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={cerrar}>
            Volver
          </Button>
          <Button
            color="red"
            loading={cargando}
            disabled={motivo.trim().length < 3}
            onClick={() => {
              onAnular(motivo.trim());
              setMotivo('');
            }}
          >
            Anular
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Período de la cuenta corriente (#40): desde y hasta, el saldo de arrastre y
 * el saldo a la fecha. Sin fechas, la cuenta entera.
 */
export function FiltroPeriodo({
  desde,
  hasta,
  onDesde,
  onHasta,
  anterior,
  aFecha,
}: {
  desde: string | null;
  hasta: string | null;
  onDesde: (v: string | null) => void;
  onHasta: (v: string | null) => void;
  anterior: number;
  aFecha: number;
}) {
  const aFechaDe = (v: string | null) => (v ? new Date(`${v}T12:00:00`) : null);
  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      <DateInput
        label="Desde"
        valueFormat="DD/MM/YYYY"
        clearable
        w={150}
        value={aFechaDe(desde)}
        onChange={(v) => onDesde(v ? fechaISO(new Date(v)) : null)}
      />
      <DateInput
        label="Hasta"
        valueFormat="DD/MM/YYYY"
        clearable
        w={150}
        value={aFechaDe(hasta)}
        onChange={(v) => onHasta(v ? fechaISO(new Date(v)) : null)}
      />
      <Text size="sm" c="dimmed">
        {desde ? (
          <>
            Saldo anterior <b>{pesos(anterior)}</b> ·{' '}
          </>
        ) : null}
        Saldo {hasta ? `al ${fecha(hasta)}` : 'a hoy'} <b>{pesos(aFecha)}</b>
      </Text>
    </Group>
  );
}

/** Campos que cambiaron entre dos versiones de una fila auditada. */
function cambios(antes: unknown, despues: unknown) {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (despues ?? {}) as Record<string, unknown>;
  return Object.keys({ ...a, ...d }).filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]),
  );
}

/**
 * Historial de un comprobante, pago o cobro (#44): quién lo cargó, quién lo
 * cambió o anuló, cuándo y qué valores tenía antes y después.
 */
export function ModalHistorial({
  registroId,
  titulo,
  onCerrar,
}: {
  registroId: string | null;
  titulo: string;
  onCerrar: () => void;
}) {
  const historial = useAuditoriaDe(registroId);
  return (
    <Modal
      opened={registroId !== null}
      onClose={onCerrar}
      title={titulo}
      size="lg"
      centered
    >
      {historial.isLoading ? (
        <Text size="sm" c="dimmed">
          Cargando…
        </Text>
      ) : (historial.data ?? []).length === 0 ? (
        <Text size="sm" c="dimmed">
          Sin registros de auditoría para esta fila.
        </Text>
      ) : (
        <Stack gap="sm">
          {(historial.data ?? []).map((h) => {
            const campos =
              h.operacion === 'UPDATE' ? cambios(h.datos_antes, h.datos_despues) : [];
            const antes = (h.datos_antes ?? {}) as Record<string, unknown>;
            const despues = (h.datos_despues ?? {}) as Record<string, unknown>;
            const quien = (h.usuario as { nombre_completo?: string } | null)
              ?.nombre_completo;
            return (
              <Stack key={h.id} gap={2}>
                <Text size="sm" fw={600}>
                  {h.operacion === 'INSERT'
                    ? 'Alta'
                    : h.operacion === 'UPDATE'
                      ? 'Cambio'
                      : h.operacion}
                  {' · '}
                  {fecha(h.ocurrido_en)} · {quien ?? h.db_role}
                </Text>
                {campos.map((k) => (
                  <Text key={k} size="xs" ff="monospace" c="dimmed">
                    {k}: {JSON.stringify(antes[k]) ?? '—'} →{' '}
                    {JSON.stringify(despues[k]) ?? '—'}
                  </Text>
                ))}
              </Stack>
            );
          })}
        </Stack>
      )}
    </Modal>
  );
}

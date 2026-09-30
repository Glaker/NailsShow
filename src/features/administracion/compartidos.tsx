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
import { fecha } from '@/lib/formato';
import { numeroComprobante } from '@/lib/consultasCompras';
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

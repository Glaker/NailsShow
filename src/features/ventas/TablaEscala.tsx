import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconPencil, IconPlus, IconX } from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { fechaISO, numero } from '@/lib/formato';
import {
  descuentoPorMonto,
  useCargarEscala,
  useEscalaDescuento,
} from '@/lib/consultasVentas';

const pesos = (n: number) => `$${numero(n, 0)}`;

/**
 * Escala de descuento por monto del pedido mayorista (la de la planilla 46.14,
 * confirmada por la Gerencia el 2026-10-02). Se aplica sola al pedido entero.
 * Con `monto`, marca el escalón que le toca a ese pedido.
 */
export function TablaEscala({ monto }: { monto?: number }) {
  const escala = useEscalaDescuento();
  if (escala.isLoading) return <Skeleton h={160} />;
  const filas = [...(escala.data ?? [])].sort((a, b) => a.desde_monto - b.desde_monto);
  const actual = monto === undefined ? null : descuentoPorMonto(monto, filas);
  return (
    <Table fz="sm" verticalSpacing={6} withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Monto del pedido</Table.Th>
          <Table.Th ta="right">Descuento</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {filas.map((e, i) => {
          const hasta = filas[i + 1]?.desde_monto;
          const esta = actual !== null && actual === e.porcentaje;
          return (
            <Table.Tr
              key={e.desde_monto}
              style={esta ? { background: 'var(--mantine-color-azul-light)' } : undefined}
            >
              <Table.Td>
                <Text size="sm" fw={esta ? 700 : 400}>
                  {hasta === undefined
                    ? `${pesos(e.desde_monto)} o más`
                    : e.desde_monto === 0
                      ? `Menos de ${pesos(hasta)}`
                      : `De ${pesos(e.desde_monto)} a ${pesos(hasta - 1)}`}
                </Text>
              </Table.Td>
              <Table.Td ta="right">
                {esta ? (
                  <Badge color="indigo" variant="filled">
                    {numero(e.porcentaje)} % · este pedido
                  </Badge>
                ) : (
                  <Text size="sm" ff="monospace">
                    {numero(e.porcentaje)} %
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

/**
 * Cambiar los cortes (pedido del 2026-10-02): Ventas carga la escala entera
 * con la fecha desde la que rige. Arranca con la vigente; la anterior queda.
 * Lo que valida la base: empieza en $0, sin montos repetidos, % de 0 a 100.
 */
export function CambiarEscala() {
  const puede = useTieneRol('VENTAS', 'ADMINISTRACION', 'GERENCIA');
  const escala = useEscalaDescuento();
  const cargar = useCargarEscala();
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<{ desde: number | string; pct: number | string }[]>(
    [],
  );
  const [desde, setDesde] = useState<Date | null>(new Date());
  if (!puede) return null;

  const abrir = () => {
    setFilas(
      [...(escala.data ?? [])]
        .sort((a, b) => a.desde_monto - b.desde_monto)
        .map((e) => ({ desde: e.desde_monto, pct: e.porcentaje })),
    );
    setDesde(new Date());
    setAbierto(true);
  };
  const cambiar = (i: number, campo: 'desde' | 'pct', v: number | string) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));
  const valida =
    filas.length > 0 &&
    filas.some((f) => Number(f.desde) === 0) &&
    new Set(filas.map((f) => Number(f.desde))).size === filas.length &&
    filas.every((f) => Number(f.pct) >= 0 && Number(f.pct) <= 100);

  return (
    <>
      <Button
        variant="light"
        leftSection={<IconPencil size={16} />}
        onClick={abrir}
        mt="sm"
      >
        Cambiar los cortes
      </Button>
      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title="Escala nueva"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Desde qué monto del pedido rige cada descuento. El primero va en $0. La escala
            anterior queda guardada; los pedidos ya enviados no cambian.
          </Text>
          {filas.map((f, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <NumberInput
                label={i === 0 ? 'Desde (monto del pedido)' : undefined}
                prefix="$ "
                thousandSeparator="."
                decimalSeparator=","
                min={0}
                value={f.desde}
                onChange={(v) => cambiar(i, 'desde', v)}
                style={{ flex: 1 }}
              />
              <NumberInput
                label={i === 0 ? 'Descuento' : undefined}
                suffix=" %"
                min={0}
                max={100}
                w={110}
                value={f.pct}
                onChange={(v) => cambiar(i, 'pct', v)}
              />
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                aria-label="Quitar escalón"
                onClick={() => setFilas((x) => x.filter((_, j) => j !== i))}
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            variant="subtle"
            leftSection={<IconPlus size={16} />}
            onClick={() => setFilas((x) => [...x, { desde: '', pct: '' }])}
            style={{ alignSelf: 'flex-start' }}
          >
            Agregar escalón
          </Button>
          <DateInput
            label="Rige desde"
            valueFormat="DD/MM/YYYY"
            value={desde}
            onChange={(v) => setDesde(v ? new Date(v) : null)}
          />
          {!valida ? (
            <Text size="xs" c="orange.8">
              Tiene que haber un escalón en $0, sin montos repetidos y con porcentajes de
              0 a 100.
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierto(false)}>
              Volver
            </Button>
            <Button
              loading={cargar.isPending}
              disabled={!valida || !desde}
              onClick={() =>
                cargar.mutate(
                  {
                    escalones: filas.map((f) => ({
                      desde_monto: Number(f.desde),
                      porcentaje: Number(f.pct),
                    })),
                    vigenteDesde: fechaISO(desde) ?? '',
                  },
                  { onSuccess: () => setAbierto(false) },
                )
              }
            >
              Guardar escala
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

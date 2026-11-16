import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconPackage } from '@tabler/icons-react';
import { fechaHora, numero } from '@/lib/formato';
import {
  TEXTO_OPCION,
  useAsignarSurtido,
  usePedidoCajas,
  useSurtidoDisponible,
  type AromasSurtido,
  type PedidoCaja,
} from '@/lib/consultasVentas';

const AROMAS = [
  ['amor', 'Amor'],
  ['paz', 'Paz'],
  ['aire', 'Aire'],
] as const;

/**
 * Reparto de un surtido entre Amor, Paz y Aire (P3, comercial.asignar_surtido).
 * `surtido_disponible` devuelve lo ADICIONAL, así que el tope de cada aroma es
 * eso más lo que esta misma caja ya tiene asignado. La base valida de nuevo.
 */
export function AsignarSurtido({
  caja,
  onCerrar,
}: {
  caja: PedidoCaja | null;
  onCerrar: () => void;
}) {
  const disp = useSurtidoDisponible(caja?.id ?? null);
  const asignar = useAsignarSurtido();
  const [val, setVal] = useState<Partial<Record<keyof AromasSurtido, number | string>>>(
    {},
  );

  if (!caja) return null;
  const ya = caja.asignado;
  const tope = (k: keyof AromasSurtido) => (disp.data?.[k] ?? 0) + (ya?.[k] ?? 0);
  const valor = (k: keyof AromasSurtido) => Number(val[k] ?? ya?.[k] ?? 0);
  const suma = AROMAS.reduce((s, [k]) => s + valor(k), 0);
  const dif = caja.cajas - suma;
  const pasado = AROMAS.some(([k]) => valor(k) > tope(k));

  const cerrar = () => {
    setVal({});
    onCerrar();
  };

  return (
    <Modal
      opened
      onClose={cerrar}
      title={`Asignar surtido: ${caja.grupo}`}
      centered
      radius="md"
    >
      <Stack gap="md">
        <Text size="sm">
          El surtido es de {numero(caja.cajas)} cajas de {numero(caja.unidades_caja)}{' '}
          unidades. Repartilas entre los tres aromas, según lo que se puede armar en el
          depósito del pedido.
        </Text>
        {disp.isError ? (
          <Alert color="red" variant="light">
            {disp.error.message}
          </Alert>
        ) : null}
        {AROMAS.map(([k, nombre]) => (
          <NumberInput
            key={k}
            size="md"
            label={nombre}
            description={`Se pueden armar hasta ${numero(tope(k))} cajas`}
            min={0}
            max={tope(k)}
            allowDecimal={false}
            allowNegative={false}
            disabled={disp.isLoading}
            value={val[k] ?? ya?.[k] ?? 0}
            error={valor(k) > tope(k) ? `hasta ${numero(tope(k))}` : undefined}
            onChange={(x) => setVal((m) => ({ ...m, [k]: x }))}
          />
        ))}
        <Text
          fw={700}
          c={dif === 0 ? 'teal.8' : 'orange.8'}
          data-testid="surtido-resumen"
        >
          {dif === 0
            ? `Suman ${numero(caja.cajas)}: listo`
            : dif > 0
              ? `Faltan ${numero(dif)}`
              : `Sobran ${numero(-dif)}`}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            size="md"
            disabled={dif !== 0 || pasado || disp.isLoading}
            loading={asignar.isPending}
            onClick={() =>
              asignar.mutate(
                {
                  pedidoCajaId: caja.id,
                  amor: valor('amor'),
                  paz: valor('paz'),
                  aire: valor('aire'),
                },
                { onSuccess: cerrar },
              )
            }
          >
            Guardar reparto
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Cajas del portal del pedido (P3). Se asignan solo en BORRADOR y solo por
 * VENTAS o ADMINISTRACION; la autoridad es la base (RLS y asignar_surtido).
 */
export function CajasPortal({
  pedidoId,
  borrador,
  puedeAsignar,
  nombreDe,
}: {
  pedidoId: string;
  borrador: boolean;
  puedeAsignar: boolean;
  nombreDe: (id: string) => string | undefined;
}) {
  const cajas = usePedidoCajas(pedidoId);
  const [asignando, setAsignando] = useState<PedidoCaja | null>(null);
  if (!cajas.data?.length) return null;

  return (
    <Paper withBorder p="md" radius="lg" mb="md">
      <Group gap="xs" mb="xs">
        <IconPackage size={20} />
        <Text fw={700}>Cajas del portal</Text>
        {!borrador ? (
          <Text size="xs" c="dimmed">
            Solo lectura: el pedido ya salió de borrador.
          </Text>
        ) : null}
      </Group>
      <Table fz="sm" verticalSpacing={6}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Grupo</Table.Th>
            <Table.Th>Opción</Table.Th>
            <Table.Th ta="right">Cajas</Table.Th>
            <Table.Th ta="right">Uds. por caja</Table.Th>
            <Table.Th>Surtido</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {cajas.data.map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td>{c.grupo}</Table.Td>
              <Table.Td>{TEXTO_OPCION[c.opcion]}</Table.Td>
              <Table.Td ta="right" ff="monospace">
                {numero(c.cajas)}
              </Table.Td>
              <Table.Td ta="right" ff="monospace">
                {numero(c.unidades_caja)}
              </Table.Td>
              <Table.Td>
                {c.opcion !== 'SURTIDO' ? (
                  '—'
                ) : (
                  <Stack gap={4} align="flex-start">
                    {c.asignado ? (
                      <>
                        <Text size="sm" fw={600}>
                          Amor {numero(c.asignado.amor)} · Paz {numero(c.asignado.paz)} ·
                          Aire {numero(c.asignado.aire)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {c.asignado_por ? (nombreDe(c.asignado_por) ?? '—') : '—'}
                          {c.asignado_en ? `, ${fechaHora(c.asignado_en)}` : ''}
                        </Text>
                      </>
                    ) : (
                      <Badge color="orange" variant="light">
                        Pendiente de asignar
                      </Badge>
                    )}
                    {borrador && puedeAsignar ? (
                      <Button size="sm" variant="light" onClick={() => setAsignando(c)}>
                        {c.asignado ? 'Reasignar surtido' : 'Asignar surtido'}
                      </Button>
                    ) : null}
                  </Stack>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <AsignarSurtido
        key={asignando?.id ?? 'ninguna'}
        caja={asignando}
        onCerrar={() => setAsignando(null)}
      />
    </Paper>
  );
}

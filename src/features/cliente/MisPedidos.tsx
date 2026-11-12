import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  Collapse,
  Group,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronDown,
  IconPencil,
  IconPlus,
  IconRepeat,
  IconX,
} from '@tabler/icons-react';
import { fecha, fechaHora, numero } from '@/lib/formato';
import {
  useCancelarPedidoCliente,
  usePedidosCliente,
  type PedidoCliente,
} from '@/lib/consultasCliente';

/** El estado del pedido dicho como lo entiende el cliente. */
function estadoParaCliente(p: PedidoCliente): { texto: string; color: string } {
  if (p.cancelado) return { texto: 'Cancelado', color: 'gray' };
  switch (p.estado) {
    case 'BORRADOR':
      return { texto: 'Enviado · Ventas lo está revisando', color: 'grape' };
    case 'ESPERANDO_FECHA':
    case 'FECHA_PROPUESTA':
      return { texto: 'Estamos viendo la fecha de entrega', color: 'blue' };
    case 'CONFIRMADO':
      return { texto: 'Aprobado', color: 'teal' };
    case 'EN_PRODUCCION':
      return { texto: 'En preparación', color: 'teal' };
    case 'CUMPLIDO':
      return { texto: 'Entregado', color: 'green' };
    default:
      return { texto: p.estado, color: 'gray' };
  }
}

export function MisPedidos({
  onEditar,
  onRepetir,
  onNuevo,
}: {
  onEditar: (p: PedidoCliente) => void;
  onRepetir: (p: PedidoCliente) => void;
  onNuevo: () => void;
}) {
  const pedidos = usePedidosCliente();
  const cancelar = useCancelarPedidoCliente();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (pedidos.isLoading) {
    return (
      <Stack p="md" gap="sm">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} h={90} radius={18} />
        ))}
      </Stack>
    );
  }

  if (!pedidos.data?.length) {
    return (
      <Center py={70} px="md">
        <Stack align="center" gap="md" ta="center">
          <Text size="lg" fw={700}>
            Todavía no hiciste pedidos
          </Text>
          <Text c="dimmed">
            Armá el primero: buscá, sumá cantidades y deslizá para enviar.
          </Text>
          <Button
            size="lg"
            radius="xl"
            color="grape"
            leftSection={<IconPlus />}
            onClick={onNuevo}
          >
            Armar mi pedido
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap={10} p="md" pb={40}>
      {pedidos.data.map((p) => {
        const e = estadoParaCliente(p);
        const unidades = p.renglones.reduce((a, r) => a + r.cantidad, 0);
        const visto = abierto === p.id;
        return (
          <Box key={p.id} className="cli-tarjeta" p="md">
            <UnstyledButton
              w="100%"
              onClick={() => setAbierto(visto ? null : p.id)}
              aria-expanded={visto}
            >
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={800}>{p.numero}</Text>
                  <Text size="xs" c="dimmed">
                    {fechaHora(p.enviado_en)} · {p.renglones.length} productos ·{' '}
                    {numero(unidades, 0)} u
                  </Text>
                </div>
                <IconChevronDown
                  size={22}
                  style={{
                    transform: visto ? 'rotate(180deg)' : undefined,
                    transition: 'transform .2s',
                  }}
                />
              </Group>
              <Group gap={6} mt={8}>
                <Badge color={e.color} variant="light" size="lg" radius="sm">
                  {e.texto}
                </Badge>
                {p.fecha_entrega && !p.cancelado ? (
                  <Badge color="gray" variant="outline" size="lg" radius="sm">
                    Entrega {fecha(p.fecha_entrega)}
                  </Badge>
                ) : null}
              </Group>
            </UnstyledButton>

            <Collapse in={visto}>
              <Stack gap={4} mt="sm">
                {p.renglones.map((r) => (
                  <Group key={r.producto_id} justify="space-between" wrap="nowrap">
                    <Text size="sm" lineClamp={1}>
                      {r.producto}
                    </Text>
                    <Text size="sm" fw={700}>
                      {numero(r.cantidad, 0)}
                    </Text>
                  </Group>
                ))}
                {p.observaciones ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    «{p.observaciones}»
                  </Text>
                ) : null}
              </Stack>
            </Collapse>

            <Group mt="sm" gap="xs" grow>
              {p.editable ? (
                <Button
                  variant="light"
                  color="grape"
                  radius="xl"
                  size="md"
                  leftSection={<IconPencil size={18} />}
                  onClick={() => onEditar(p)}
                >
                  Editar
                </Button>
              ) : null}
              <Button
                variant="default"
                radius="xl"
                size="md"
                leftSection={<IconRepeat size={18} />}
                onClick={() => onRepetir(p)}
              >
                Repetir
              </Button>
              {p.editable ? (
                confirmando === p.id ? (
                  <Button
                    color="red"
                    radius="xl"
                    size="md"
                    loading={cancelar.isPending}
                    onClick={() =>
                      cancelar.mutate(p.id, { onSettled: () => setConfirmando(null) })
                    }
                  >
                    ¿Seguro? Cancelar
                  </Button>
                ) : (
                  <Button
                    variant="subtle"
                    color="red"
                    radius="xl"
                    size="md"
                    leftSection={<IconX size={18} />}
                    onClick={() => setConfirmando(p.id)}
                  >
                    Cancelar
                  </Button>
                )
              ) : null}
            </Group>
          </Box>
        );
      })}
    </Stack>
  );
}

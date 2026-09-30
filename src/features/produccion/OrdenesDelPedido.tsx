import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconClipboardText } from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { useOrdenes, useOrdenesDePedido } from '@/lib/consultasOrdenes';
import { COLOR_ESTADO_ORDEN } from './etapasOrden';
import { ModalAbrirOrden } from './PaginaOrdenes';

/** Las órdenes de producción abiertas para un pedido, y abrir otra. */
export function OrdenesDelPedido({
  pedidoId,
  productoId,
  abierto,
}: {
  pedidoId: string;
  productoId: string | undefined;
  abierto: boolean;
}) {
  const ids = useOrdenesDePedido(pedidoId);
  const ordenes = useOrdenes();
  const puede = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const [abriendo, setAbriendo] = useState(false);
  const deEste = (ordenes.data ?? []).filter((o) => (ids.data ?? []).includes(o.id));
  if (deEste.length === 0 && !(puede && abierto)) return null;
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb={deEste.length ? 'sm' : 0}>
        <Group gap="xs">
          <IconClipboardText size={20} />
          <Text fw={600}>Órdenes de producción</Text>
        </Group>
        {puede && abierto ? (
          <Button size="compact-md" variant="light" onClick={() => setAbriendo(true)}>
            Abrir orden
          </Button>
        ) : null}
      </Group>
      <Stack gap={4}>
        {deEste.map((o) => (
          <Group key={o.id} gap="sm">
            <Anchor component={Link} to={`/ordenes/${o.id}`} fw={600}>
              {o.numero}
            </Anchor>
            <Text size="sm" ff="monospace">
              lote {o.numero_lote} · {o.vencimiento_texto}
            </Text>
            <Badge color={COLOR_ESTADO_ORDEN[o.estado]} variant="light">
              {o.estado.toLowerCase()}
            </Badge>
          </Group>
        ))}
      </Stack>
      <ModalAbrirOrden
        abierto={abriendo}
        onCerrar={() => setAbriendo(false)}
        pedidoId={pedidoId}
        {...(productoId ? { productoInicial: productoId } : {})}
      />
    </Paper>
  );
}

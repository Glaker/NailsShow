import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Button, Group, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useProductos } from '@/lib/consultas';
import {
  useAsignarEspecificacionOrden,
  useEspecificaciones,
  useOrdenes,
} from '@/lib/consultasOrdenes';

/**
 * Órdenes abiertas sin especificación (D-orden-producto-1): Naza no la elige
 * y la fórmula no la traía. DT la asigna acá, una vez.
 */
export function OrdenesSinEspecificacion() {
  const ordenes = useOrdenes();
  const productos = useProductos();
  const especificaciones = useEspecificaciones();
  const asignar = useAsignarEspecificacionOrden();
  const [elegidas, setElegidas] = useState<Record<string, string | null>>({});
  const faltan = (ordenes.data ?? []).filter(
    (o) => !o.especificacion_id && (o.estado === 'ABIERTA' || o.estado === 'TERMINADA'),
  );
  if (faltan.length === 0) return null;
  const nombre = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const opciones = (especificaciones.data ?? [])
    .filter((e) => e.estado === 'VIGENTE' || e.estado === 'BORRADOR')
    .map((e) => ({
      value: e.id,
      label: `${e.codigo_poe} v${e.version} · ${e.denominacion}${e.estado === 'BORRADOR' ? ' (borrador)' : ''}`,
    }));

  return (
    <Paper
      withBorder
      p="lg"
      radius="lg"
      style={{ borderColor: 'var(--mantine-color-estadoCuarentena-5)' }}
    >
      <Group gap="sm" mb="sm">
        <IconAlertTriangle size={22} color="var(--mantine-color-estadoCuarentena-7)" />
        <Title order={3}>Órdenes sin especificación ({faltan.length})</Title>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Se abrieron sin especificación: asignales contra cuál se controla el producto
        terminado.
      </Text>
      <Stack gap="sm">
        {faltan.map((o) => (
          <Group key={o.id} align="flex-end" wrap="wrap" gap="sm">
            <Stack gap={0} miw={220}>
              <Anchor component={Link} to={`/ordenes/${o.id}`} fw={600}>
                {o.numero}
              </Anchor>
              <Text size="sm">
                {nombre(o.producto_id)} · lote {o.numero_lote}
              </Text>
            </Stack>
            <Select
              aria-label={`Especificación de ${o.numero}`}
              placeholder="Elegí la especificación"
              searchable
              data={opciones}
              value={elegidas[o.id] ?? null}
              onChange={(v) => setElegidas((m) => ({ ...m, [o.id]: v }))}
              style={{ flex: 1, minWidth: 240 }}
            />
            <Button
              disabled={!elegidas[o.id]}
              loading={asignar.isPending && asignar.variables?.ordenId === o.id}
              onClick={() =>
                asignar.mutate({ ordenId: o.id, especificacionId: elegidas[o.id]! })
              }
            >
              Asignar
            </Button>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

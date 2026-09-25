import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Badge,
  Box,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconCheck, IconEye, IconSettings } from '@tabler/icons-react';
import type { EstadoPedido, PedidoConConteoRow } from '@/lib/consultasComercial';
import { colorTercero, type Tercero } from '@/lib/consultasTercerizados';
import { BadgeEntrega } from './estadoPedido';

/** «Nail Show» o el nombre del tercerizado, con su color. */
export function BadgePara({ tercero }: { tercero: Tercero | null | undefined }) {
  return tercero ? (
    <Badge size="sm" radius="sm" variant="filled" color={colorTercero(tercero)}>
      {tercero.nombre}
    </Badge>
  ) : (
    <Badge size="sm" radius="sm" variant="light" color="violeta">
      Nail Show
    </Badge>
  );
}

const COLUMNAS: {
  estado: EstadoPedido;
  titulo: string;
  icono: typeof IconEye;
  color: string;
}[] = [
  { estado: 'CONFIRMADO', titulo: 'Para revisar', icono: IconEye, color: 'violeta' },
  {
    estado: 'EN_PRODUCCION',
    titulo: 'En producción',
    icono: IconSettings,
    color: 'indigo',
  },
  { estado: 'CUMPLIDO', titulo: 'Terminados (14 días)', icono: IconCheck, color: 'gray' },
];

/**
 * Tablero de pedidos para Producción: tres columnas, tarjetas grandes con el
 * color del cliente (violeta Nail Show, el suyo los tercerizados), lo más
 * urgente arriba. Pensado para dejarlo abierto en la tablet de planta.
 */
export function TableroPedidos({
  pedidos,
  terceros,
}: {
  pedidos: PedidoConConteoRow[];
  terceros: Map<string, Tercero>;
}) {
  const navigate = useNavigate();
  const desde = dayjs().subtract(14, 'day');

  const de = (estado: EstadoPedido) =>
    pedidos
      .filter(
        (p) =>
          p.estado === estado &&
          (estado !== 'CUMPLIDO' ||
            dayjs(p.creado_en).isAfter(desde) ||
            dayjs(p.fecha).isAfter(desde)),
      )
      .sort((a, b) =>
        estado === 'CUMPLIDO'
          ? b.fecha.localeCompare(a.fecha)
          : (a.fecha_entrega ?? '9999').localeCompare(b.fecha_entrega ?? '9999'),
      );

  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
      {COLUMNAS.map((c) => {
        const lista = de(c.estado);
        const Icono = c.icono;
        return (
          <Paper
            key={c.estado}
            withBorder
            p="sm"
            radius="lg"
            style={{
              borderColor: 'var(--superficie-borde)',
              background: 'var(--superficie-fondo)',
            }}
          >
            <Group gap="xs" mb="sm">
              <ThemeIcon variant="light" color={c.color} radius="md" size={34}>
                <Icono size={20} />
              </ThemeIcon>
              <Text fw={700}>{c.titulo}</Text>
              <Badge variant="filled" color={c.color} radius="xl">
                {lista.length}
              </Badge>
            </Group>
            <Stack gap="sm">
              {lista.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  Nada acá
                </Text>
              ) : (
                lista.map((p) => {
                  const t = p.tercero_id ? terceros.get(p.tercero_id) : null;
                  const color = t ? colorTercero(t) : 'violeta';
                  return (
                    <Paper
                      key={p.id}
                      withBorder
                      radius="md"
                      className="cuadrito-tercero"
                      onClick={() => void navigate(`/pedidos/${p.id}`)}
                      style={{
                        borderColor: 'var(--superficie-borde)',
                        overflow: 'hidden',
                        opacity: c.estado === 'CUMPLIDO' ? 0.75 : 1,
                      }}
                    >
                      <Group gap={0} wrap="nowrap" align="stretch">
                        <Box w={8} bg={`${color}.6`} />
                        <Stack gap={4} p="sm" style={{ flex: 1, minWidth: 0 }}>
                          <Group justify="space-between" wrap="nowrap">
                            <Text fw={800} fz={17}>
                              {p.numero}
                            </Text>
                            <BadgePara tercero={t} />
                          </Group>
                          <Text size="sm" truncate>
                            {p.cliente}
                          </Text>
                          <Group gap="xs">
                            <Text size="xs" c="dimmed">
                              {p.renglones[0]?.count ?? 0} productos
                            </Text>
                            {c.estado !== 'CUMPLIDO' ? (
                              <BadgeEntrega fechaEntrega={p.fecha_entrega} abierto />
                            ) : null}
                          </Group>
                        </Stack>
                      </Group>
                    </Paper>
                  );
                })
              )}
            </Stack>
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}

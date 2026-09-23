import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconCheck, IconShoppingCart } from '@tabler/icons-react';
import { numero } from '@/lib/formato';
import { useFaltantesEnCurso } from '@/lib/consultasComercial';

/**
 * Qué falta comprar sumando todos los pedidos enviados o en producción.
 *
 * El total sale de sumar primero lo que necesita cada pedido y recién después
 * comparar con el stock (`comercial.faltantes_en_curso`). Sumar los faltantes
 * de cada pedido daría otro número: cada pedido, solo, se compara contra el
 * stock entero. Debajo de cada insumo se ve cuánto aporta cada pedido, para
 * saber a qué corresponde lo que se compra.
 */
export function FaltantesConsolidados({ hayEnCurso }: { hayEnCurso: boolean }) {
  const faltantes = useFaltantesEnCurso();

  if (!hayEnCurso) return null;
  if (faltantes.isLoading) return <Skeleton h={120} />;

  const filas = faltantes.data ?? [];
  if (filas.length === 0) {
    return (
      <Alert
        color="estadoAprobado"
        variant="light"
        radius="md"
        icon={<IconCheck size={18} />}
      >
        Con el stock que hay alcanza para todos los pedidos enviados y en producción, al
        menos en lo que tienen cargado en su lista de materiales.
      </Alert>
    );
  }

  return (
    <Paper
      withBorder
      style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
    >
      <Stack gap={0}>
        <Group gap="xs" p="md" pb="xs">
          <IconShoppingCart size={18} />
          <Text fw={600}>
            Falta comprar para los pedidos en curso ({filas.length}{' '}
            {filas.length === 1 ? 'insumo' : 'insumos'})
          </Text>
        </Group>
        <Text size="xs" c="dimmed" px="md" pb="sm">
          Suma de todos los pedidos enviados y en producción. Debajo de cada insumo,
          cuánto pide cada pedido. Para anotarlo en compras, abrí el pedido.
        </Text>
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Insumo</Table.Th>
                <Table.Th ta="right">Hace falta</Table.Th>
                <Table.Th ta="right">Hay</Table.Th>
                <Table.Th ta="right">Comprar</Table.Th>
                <Table.Th>Proveedor sugerido</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f) => {
                const u = f.unidad === 'UNIDAD' ? 'u' : (f.unidad ?? '');
                const dec = u === 'u' ? 0 : 2;
                return (
                  <Table.Tr key={f.insumo_id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {f.insumo}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {f.codigo_interno}
                      </Text>
                      <Group gap={6} mt={4}>
                        {f.pedidos.map((p) => (
                          <Badge
                            key={p.pedido_id}
                            component={Link}
                            to={`/pedidos/${p.pedido_id}`}
                            variant="outline"
                            color="violeta"
                            radius="sm"
                            style={{ cursor: 'pointer', textTransform: 'none' }}
                          >
                            {p.numero} · {numero(p.necesario, dec)} {u}
                          </Badge>
                        ))}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {numero(f.necesario, dec)} {u}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" c="dimmed">
                        {numero(f.disponible, dec)} {u}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" fw={700} c="estadoRechazado.7">
                        {numero(f.faltante, dec)} {u}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={f.proveedor ? 'inherit' : 'dimmed'}>
                        {f.proveedor ?? 'Sin compra previa registrada'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="xs" c="dimmed" p="md" pt="xs">
          «Hay» cuenta los lotes aprobados y el saldo de apertura, sin los vencidos ni los
          bloqueados. Ver también{' '}
          <Anchor component={Link} to="/compras" size="xs">
            Compras pendientes
          </Anchor>
          .
        </Text>
      </Stack>
    </Paper>
  );
}

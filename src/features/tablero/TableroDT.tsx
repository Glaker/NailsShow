import { Link } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconFlask, IconRosetteDiscountCheck } from '@tabler/icons-react';
import { InsigniaEstado } from '@/components/InsigniaEstado';
import { Vacio } from '@/components/Vacio';
import { useSesion } from '@/features/auth/sesion';
import { useLotes, useProductos } from '@/lib/consultas';
import { useOrdenes } from '@/lib/consultasOrdenes';
import { fecha, numero } from '@/lib/formato';

/**
 * Tablero de Dirección Técnica (pedido del 2026-10-01): cuánto y qué espera su
 * aprobación, y nada más. Insumos en cuarentena o en análisis, y producto
 * terminado esperando liberación.
 */
export function TableroDT() {
  const { claims } = useSesion();
  const cuarentena = useLotes({ estado: 'CUARENTENA' });
  const analisis = useLotes({ estado: 'EN_ANALISIS' });
  const ordenes = useOrdenes();
  const productos = useProductos();
  const insumos = [...(cuarentena.data ?? []), ...(analisis.data ?? [])];
  const porLiberar = (ordenes.data ?? []).filter((o) => o.estado === 'TERMINADA');
  const nombreProducto = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const nombre = claims?.nombre?.split(' ')[0] ?? '';
  const cargando = cuarentena.isLoading || analisis.isLoading || ordenes.isLoading;

  return (
    <Stack gap="lg">
      <div className="saludo">
        <Title order={1}>Hola{nombre ? `, ${nombre}` : ''}</Title>
        <Text c="dimmed" size="lg">
          {cargando
            ? 'Mirando qué espera tu aprobación…'
            : insumos.length + porLiberar.length === 0
              ? 'No hay nada esperando tu aprobación.'
              : 'Esto es lo que espera tu aprobación.'}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper
          withBorder
          p="lg"
          radius="lg"
          className="contador"
          component={Link}
          to="/lotes?estado=CUARENTENA"
          style={{ borderColor: 'var(--superficie-borde)', '--i': 0 }}
        >
          <Group gap="sm" mb={6}>
            <IconFlask size={22} color="var(--mantine-color-estadoCuarentena-7)" />
            <Text fw={600}>Insumos sin aprobar</Text>
          </Group>
          <Text fz={40} lh={1} c="estadoCuarentena.8" className="cifra">
            {cargando ? '…' : insumos.length}
          </Text>
        </Paper>
        <Paper
          withBorder
          p="lg"
          radius="lg"
          className="contador"
          component={Link}
          to="/liberacion"
          style={{ borderColor: 'var(--superficie-borde)', '--i': 1 }}
        >
          <Group gap="sm" mb={6}>
            <IconRosetteDiscountCheck
              size={22}
              color="var(--mantine-color-estadoEnAnalisis-7)"
            />
            <Text fw={600}>Lotes de producto por liberar</Text>
          </Group>
          <Text fz={40} lh={1} c="estadoEnAnalisis" className="cifra">
            {cargando ? '…' : porLiberar.length}
          </Text>
        </Paper>
      </SimpleGrid>

      {cargando ? (
        <Skeleton h={260} radius="lg" />
      ) : (
        <>
          <Paper
            withBorder
            p="lg"
            radius="lg"
            className="entrada"
            style={{ borderColor: 'var(--superficie-borde)' }}
          >
            <Title order={3} mb="sm">
              Insumos en cuarentena o en análisis
            </Title>
            {insumos.length === 0 ? (
              <Vacio icono={IconFlask} titulo="Ningún insumo espera aprobación" />
            ) : (
              <Table.ScrollContainer minWidth={560}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Insumo</Table.Th>
                      <Table.Th ta="right">Cantidad</Table.Th>
                      <Table.Th>Proveedor</Table.Th>
                      <Table.Th>Recibido</Table.Th>
                      <Table.Th>Estado</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {insumos.map((l) => (
                      <Table.Tr key={l.id}>
                        <Table.Td>
                          <Anchor
                            component={Link}
                            to={`/lotes/${l.id}`}
                            fw={600}
                            size="sm"
                          >
                            {l.insumo_nombre}
                          </Anchor>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {l.numero_registro_interno} · lote {l.lote_proveedor}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {numero(Number(l.cantidad_unidades ?? 0), 2)} {l.unidad ?? ''}
                        </Table.Td>
                        <Table.Td>{l.proveedor}</Table.Td>
                        <Table.Td>{fecha(l.recepcion_fecha)}</Table.Td>
                        <Table.Td>
                          {l.estado ? (
                            <InsigniaEstado estado={l.estado} size="sm" />
                          ) : null}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>

          <Paper
            withBorder
            p="lg"
            radius="lg"
            className="entrada"
            style={{ borderColor: 'var(--superficie-borde)' }}
          >
            <Group justify="space-between" mb="sm">
              <Title order={3}>Producto terminado esperando liberación</Title>
              <Anchor component={Link} to="/liberacion" size="sm">
                Ir a liberación
              </Anchor>
            </Group>
            {porLiberar.length === 0 ? (
              <Vacio
                icono={IconRosetteDiscountCheck}
                titulo="Ningún lote espera liberación"
              />
            ) : (
              <Stack gap={0}>
                {porLiberar.map((o, i) => (
                  <Group
                    key={o.id}
                    justify="space-between"
                    wrap="nowrap"
                    className="fila-resumen"
                    style={{ '--i': i }}
                  >
                    <Text size="sm" truncate>
                      <Anchor
                        component={Link}
                        to={`/ordenes/${o.id}`}
                        fw={700}
                        ff="monospace"
                      >
                        {o.numero_lote}
                      </Anchor>{' '}
                      · {nombreProducto(o.producto_id)}
                    </Text>
                    <Badge variant="light" color="estadoEnAnalisis">
                      {numero(Number(o.cantidad_teorica), 0)} {o.unidad}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            )}
          </Paper>
        </>
      )}
    </Stack>
  );
}

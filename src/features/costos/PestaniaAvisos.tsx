import {
  Badge,
  Button,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { FINANZAS, useSesion, useTieneRol } from '@/features/auth/sesion';
import { fecha, numero } from '@/lib/formato';
import { useAvisosCosto, useMarcarAvisoVisto } from '@/lib/consultasCostos';
import { pesosUnitario, useReferenciaPorInsumo } from './comun';

const porcentaje = (v: number) => `${numero(v * 100, 1)} %`;

export function PestaniaAvisos() {
  const avisos = useAvisosCosto();
  const referencia = useReferenciaPorInsumo();
  const puede = useTieneRol(FINANZAS);
  const { claims } = useSesion();
  const visto = useMarcarAvisoVisto();

  if (avisos.isLoading) return <Skeleton h={300} />;
  const filas = avisos.data ?? [];

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        El último ingreso salió distinto de tu precio de referencia, descontada la inflación.
        Ninguno de los dos gana solo: decidí si actualizás la referencia.
      </Text>

      {filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconBell}
            titulo="Sin avisos"
            descripcion="Aparece uno cuando el precio de un lote se aparta de la referencia por encima del umbral."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={960}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th ta="right">Precio del lote</Table.Th>
                  <Table.Th ta="right">Tu referencia</Table.Th>
                  <Table.Th ta="right">Variación nominal</Table.Th>
                  <Table.Th ta="right">IPC acumulado</Table.Th>
                  <Table.Th ta="right">Variación real</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td>{fecha(a.creado_en)}</Table.Td>
                    <Table.Td fw={600}>
                      {referencia.get(a.insumo_id)?.nombre ?? '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {pesosUnitario(a.precio_lote_unitario)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {pesosUnitario(a.costo_referencia_unitario)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {porcentaje(a.variacion_nominal)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" {...(a.ipc_acumulado === null ? { c: 'dimmed' } : {})}>
                      {a.ipc_acumulado !== null ? porcentaje(a.ipc_acumulado) : 'sin IPC'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700} c="orange">
                      {porcentaje(a.variacion_real)}
                    </Table.Td>
                    <Table.Td>
                      {a.visto_en ? (
                        <Badge color="green" variant="light">
                          Visto
                        </Badge>
                      ) : puede ? (
                        <Button
                          size="sm"
                          variant="light"
                          disabled={!claims?.usuario_id}
                          loading={visto.isPending}
                          onClick={() =>
                            visto.mutate({ id: a.id, usuarioId: claims?.usuario_id ?? '' })
                          }
                        >
                          Marcar visto
                        </Button>
                      ) : (
                        <Badge color="gray" variant="light">
                          Pendiente
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}

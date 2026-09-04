import { Badge, Group, Paper, Skeleton, Table, Text } from '@mantine/core';
import { IconBuildingWarehouse } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { InsigniaEstado } from '@/components/InsigniaEstado';
import { useDepositos } from '@/lib/consultas';
import { etiquetaEnum } from '@/lib/formato';

/**
 * Depósitos.
 *
 * Se listan, no se editan desde acá: la configuración de maestros técnicos es
 * del administrador del sistema (§3.3) y los diez depósitos vienen sembrados
 * desde los POE. Lo que importa mostrar es la dedicación por estado, que es la
 * que materializa la segregación física de la cuarentena.
 */
export function PaginaDepositos() {
  const depositos = useDepositos();

  return (
    <>
      <EncabezadoPagina
        titulo="Depósitos"
        descripcion="Los diez depósitos identificados en los POE. La dedicación por estado es lo que sostiene la segregación del material."
      />

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {depositos.isLoading ? (
          <Skeleton h={240} />
        ) : (depositos.data ?? []).length === 0 ? (
          <Vacio icono={IconBuildingWarehouse} titulo="Sin depósitos cargados" />
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N°</Table.Th>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Contenido</Table.Th>
                  <Table.Th>Estado admitido</Table.Th>
                  <Table.Th>Ubicación</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(depositos.data ?? []).map((d) => (
                  <Table.Tr key={d.id}>
                    <Table.Td>
                      <Text size="sm" ff="monospace" fw={700}>
                        {d.numero}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{d.nombre}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{etiquetaEnum(d.tipo_contenido)}</Text>
                    </Table.Td>
                    <Table.Td>
                      {d.estado_admitido ? (
                        <InsigniaEstado estado={d.estado_admitido} size="sm" />
                      ) : (
                        <Text size="sm" c="dimmed">
                          Cualquiera
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Badge
                          variant="light"
                          radius="sm"
                          color={d.es_exterior ? 'rosa' : 'violeta'}
                        >
                          {d.es_exterior ? 'Exterior' : 'Planta'}
                        </Badge>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </>
  );
}

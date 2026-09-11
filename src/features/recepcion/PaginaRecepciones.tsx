import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconPackageImport,
  IconPlus,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { FormularioRecepcion } from './FormularioRecepcion';
import { modals } from '@mantine/modals';
import { useCargarRecepcionAStock, useRecepciones } from '@/lib/consultas';
import { fechaHora, numero } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';

/**
 * Recepciones (I.20.1).
 *
 * El listado es el índice del registro: número correlativo, remito, proveedor y
 * cuántos lotes entraron. El detalle de cada lote vive en la pantalla de lotes,
 * porque es ahí donde el material sigue su circuito.
 */
export function PaginaRecepciones() {
  const recepciones = useRecepciones();
  const cargar = useCargarRecepcionAStock();
  const [abierto, modal] = useDisclosure(false);
  /* §3.3 no tiene fila para la entrada por compra. Toma el conjunto de
     «Ajustar stock por diferencia de inventario», que es el mismo que ya puede
     completar la carga administrativa de la recepción (decisión abierta D-14). */
  const puedeCargarStock = useTieneRol(
    'DIRECCION_TECNICA',
    'ADMINISTRACION',
    'GERENCIA_PRODUCCION',
  );
  const puedeRegistrar = useTieneRol(
    'OPERARIO',
    'CONTROL_CALIDAD',
    'DIRECCION_TECNICA',
    'GERENCIA_PRODUCCION',
  );

  const filas = recepciones.data ?? [];

  /**
   * La carga a stock es un acto administrativo deliberado y posterior a la
   * recepción física, no un efecto automático de ella: Depósito recibe y
   * Administración concilia. Se confirma porque no tiene vuelta atrás por la
   * vía fácil —deshacerla exige anular movimiento por movimiento (RN-54)—.
   */
  const confirmarCarga = (id: string, numeroRecepcion: string, lotes: number) => {
    modals.openConfirmModal({
      title: <Text fw={700}>Cargar a stock la recepción {numeroRecepcion}</Text>,
      children: (
        <Text size="sm">
          Se registra una entrada por cada uno de los {numero(lotes)}{' '}
          {lotes === 1 ? 'lote' : 'lotes'} de la recepción, en el depósito que tiene
          asignado cada uno. Queda a tu nombre y no se deshace: un movimiento de stock no
          se borra, se anula con su inverso.
        </Text>
      ),
      labels: { confirm: 'Cargar a stock', cancel: 'Cancelar' },
      confirmProps: { color: 'violeta' },
      onConfirm: () => cargar.mutate(id),
    });
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Recepciones"
        descripcion="Ingreso de mercadería según I.20.1. Cada recepción agrupa los lotes que llegaron con un remito."
        acciones={
          puedeRegistrar ? (
            <Button
              leftSection={<IconPlus size={18} />}
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              onClick={modal.open}
            >
              Nueva recepción
            </Button>
          ) : null
        }
      />

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {recepciones.isLoading ? (
          <Skeleton h={260} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={IconTruckDelivery}
            titulo="Todavía no hay recepciones"
            descripcion="Registrá el primer ingreso de mercadería. Se numera solo y queda auditado con tu firma."
            accion={
              puedeRegistrar ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={modal.open}
                >
                  Nueva recepción
                </Button>
              ) : null
            }
          />
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N°</Table.Th>
                  <Table.Th>Fecha y hora</Table.Th>
                  <Table.Th>Proveedor</Table.Th>
                  <Table.Th>Remito</Table.Th>
                  <Table.Th>Lotes</Table.Th>
                  <Table.Th>Estado administrativo</Table.Th>
                  {puedeCargarStock ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((r) => {
                  const proveedor = r.proveedor as { razon_social: string } | null;
                  const lotes = (r.lotes as { id: string }[] | null) ?? [];
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Text ff="monospace" fw={600} size="sm">
                          {r.numero}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{fechaHora(r.fecha_hora)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">{proveedor?.razon_social ?? '—'}</Text>
                          {r.proveedor_nuevo ? (
                            <Badge size="xs" variant="light" color="rosa" radius="sm">
                              nuevo
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">{r.numero_remito}</Text>
                          {!r.coincide_con_pedido ? (
                            <Tooltip label="No coincide con lo pedido (I.20.1 paso 2)">
                              <IconAlertTriangle
                                size={15}
                                color="var(--mantine-color-estadoCuarentena-7)"
                              />
                            </Tooltip>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{numero(lotes.length)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          radius="sm"
                          color={r.cargado_a_stock ? 'violeta' : 'gray'}
                        >
                          {r.cargado_a_stock ? 'Cargada a stock' : 'Pendiente'}
                        </Badge>
                        {r.cargado_a_stock ? (
                          <Text size="xs" c="dimmed" mt={2}>
                            {fechaHora(r.cargado_en)}
                          </Text>
                        ) : null}
                      </Table.Td>
                      {puedeCargarStock ? (
                        <Table.Td>
                          {!r.cargado_a_stock ? (
                            <Button
                              size="compact-sm"
                              variant="light"
                              color="violeta"
                              leftSection={<IconPackageImport size={15} />}
                              loading={cargar.isPending && cargar.variables === r.id}
                              onClick={() => confirmarCarga(r.id, r.numero, lotes.length)}
                            >
                              Cargar a stock
                            </Button>
                          ) : null}
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal
        opened={abierto}
        onClose={modal.close}
        title={<Text fw={700}>Nueva recepción</Text>}
        size="xl"
      >
        <FormularioRecepcion onListo={modal.close} />
      </Modal>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconClipboardList, IconPlus } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useCrearPedido, usePedidos, type EstadoPedido } from '@/lib/consultasComercial';

const COLOR_ESTADO: Record<EstadoPedido, string> = {
  BORRADOR: 'gray',
  CONFIRMADO: 'estadoEnAnalisis',
  EN_PRODUCCION: 'violeta',
  CUMPLIDO: 'estadoAprobado',
  CANCELADO: 'estadoRechazado',
};

const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADO: 'Confirmado',
  EN_PRODUCCION: 'En producción',
  CUMPLIDO: 'Cumplido',
  CANCELADO: 'Cancelado',
};

export function BadgeEstadoPedido({ estado }: { estado: EstadoPedido }) {
  return (
    <Badge color={COLOR_ESTADO[estado]} variant="light" radius="sm">
      {ETIQUETA_ESTADO[estado]}
    </Badge>
  );
}

/**
 * Pedidos por realizar.
 *
 * El listado no calcula la cobertura de stock: eso es una explosión por pedido
 * contra el disponible, y correrla para todos los pedidos de la lista sería una
 * consulta por fila. La cobertura se ve al abrir el pedido.
 */
export function PaginaPedidos() {
  const pedidos = usePedidos();
  const crear = useCrearPedido();
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState('');
  const [cliente, setCliente] = useState('');
  const [entrega, setEntrega] = useState<Date | null>(null);
  const [observaciones, setObservaciones] = useState('');

  const enCurso = (pedidos.data ?? []).filter(
    (p) => p.estado !== 'CUMPLIDO' && p.estado !== 'CANCELADO',
  );
  const cerrados = (pedidos.data ?? []).filter(
    (p) => p.estado === 'CUMPLIDO' || p.estado === 'CANCELADO',
  );

  function guardar() {
    crear.mutate(
      {
        numero: numero.trim(),
        cliente: cliente.trim(),
        fechaEntrega: entrega ? entrega.toISOString().slice(0, 10) : null,
        observaciones: observaciones.trim() || null,
      },
      {
        onSuccess: () => {
          setAbierto(false);
          setNumero('');
          setCliente('');
          setEntrega(null);
          setObservaciones('');
        },
      },
    );
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Pedidos por realizar"
        descripcion="Cada pedido se abre para ver si se puede fabricar con el stock que hay y qué falta comprar."
        acciones={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAbierto(true)}>
            Nuevo pedido
          </Button>
        }
      />

      {pedidos.isLoading ? (
        <Skeleton h={220} />
      ) : (pedidos.data ?? []).length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconClipboardList}
            titulo="No hay pedidos cargados"
            descripcion="Cargá el primer pedido para ver qué hace falta comprar y qué se puede fabricar ya."
            accion={<Button onClick={() => setAbierto(true)}>Nuevo pedido</Button>}
          />
        </Paper>
      ) : (
        <Stack gap="lg">
          <TablaPedidos titulo="En curso" filas={enCurso} />
          {cerrados.length > 0 ? (
            <TablaPedidos titulo="Cerrados" filas={cerrados} />
          ) : null}
        </Stack>
      )}

      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title="Nuevo pedido"
        centered
        radius="md"
      >
        <Stack gap="md">
          <TextInput
            label="Número"
            withAsterisk
            placeholder="P-0001"
            value={numero}
            onChange={(e) => setNumero(e.currentTarget.value)}
          />
          <TextInput
            label="Cliente"
            withAsterisk
            value={cliente}
            onChange={(e) => setCliente(e.currentTarget.value)}
          />
          <DateInput
            label="Fecha de entrega comprometida"
            description="De acá se calcula hacia atrás la fecha límite de compra de cada faltante."
            valueFormat="DD/MM/YYYY"
            clearable
            value={entrega}
            onChange={(v) => setEntrega(v === null ? null : new Date(v))}
          />
          <Textarea
            label="Observaciones"
            autosize
            minRows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              loading={crear.isPending}
              disabled={!numero.trim() || !cliente.trim()}
            >
              Crear
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function TablaPedidos({
  titulo,
  filas,
}: {
  titulo: string;
  filas: ReturnType<typeof usePedidos>['data'];
}) {
  if (!filas || filas.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm" c="dimmed">
        {titulo}
      </Text>
      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Número</Table.Th>
                <Table.Th>Cliente</Table.Th>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Entrega</Table.Th>
                <Table.Th>Estado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td>
                    <Text
                      component={Link}
                      to={`/pedidos/${p.id}`}
                      fw={600}
                      size="sm"
                      c="violeta"
                    >
                      {p.numero}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{p.cliente}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {p.fecha}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {p.fecha_entrega ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <BadgeEstadoPedido estado={p.estado} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Stack>
  );
}

import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import {
  useAnularEtiquetado,
  useEtiquetadosAnulables,
  useFaltanEtiquetar,
  useRegistrarEtiquetado,
  type FaltaEtiquetar,
} from '@/lib/consultasEtiquetado';
import { fechaHora, numero } from '@/lib/formato';

/** Anular un etiquetado mal cargado que ningún pedido usó (RN-54). */
function Corregir({ f, onListo }: { f: FaltaEtiquetar; onListo: () => void }) {
  const anulables = useEtiquetadosAnulables(f.producto_id, true);
  const anular = useAnularEtiquetado();
  const [motivo, setMotivo] = useState('');
  const filas = anulables.data ?? [];
  return (
    <Stack gap="md">
      <Text size="sm">
        Se anula el registro y vuelven el envase y la etiqueta al stock. Lo que ya usó un
        pedido no se anula: eso se corrige con un ajuste de inventario.
      </Text>
      <TextInput
        label="Motivo"
        withAsterisk
        placeholder="Cargué de más, era otro producto…"
        value={motivo}
        onChange={(e) => setMotivo(e.currentTarget.value)}
      />
      {filas.length === 0 ? (
        <Text size="sm" c="dimmed">
          No hay etiquetados de este producto para anular.
        </Text>
      ) : (
        filas.map((e) => (
          <Group key={e.etiquetado_id} justify="space-between">
            <Text size="sm">
              {numero(e.cantidad)} el {fechaHora(e.registrado_en)}
            </Text>
            <Button
              color="estadoRechazado"
              variant="light"
              disabled={!motivo.trim()}
              loading={anular.isPending}
              onClick={() =>
                anular.mutate(
                  { etiquetadoId: e.etiquetado_id, motivo },
                  { onSuccess: onListo },
                )
              }
            >
              Anular
            </Button>
          </Group>
        ))
      )}
    </Stack>
  );
}

/** Una fila: cuánto falta y cuánto se etiquetó hoy, con la carga ahí mismo. */
function Fila({ f }: { f: FaltaEtiquetar }) {
  const registrar = useRegistrarEtiquetado();
  const [cantidad, setCantidad] = useState<number | string>('');
  const [corrigiendo, setCorrigiendo] = useState(false);
  const n = typeof cantidad === 'number' ? cantidad : 0;

  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={600}>
          {f.nombre}
        </Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {f.codigo_interno}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm">{numero(f.pendientes)}</Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm">{numero(f.en_stock)}</Text>
      </Table.Td>
      <Table.Td>
        {!f.definido ? (
          <Badge color="estadoCuarentena" variant="light" radius="sm">
            falta envase o etiqueta
          </Badge>
        ) : f.faltan > 0 ? (
          <Badge color="estadoRechazado" variant="light" radius="sm" size="lg">
            faltan {numero(f.faltan)}
          </Badge>
        ) : (
          <Badge color="estadoAprobado" variant="light" radius="sm">
            al día
          </Badge>
        )}
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm">{f.etiquetados_hoy ? numero(f.etiquetados_hoy) : '—'}</Text>
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <NumberInput
            size="md"
            w={110}
            min={1}
            allowDecimal={false}
            placeholder={f.faltan > 0 ? String(f.faltan) : 'cant.'}
            value={cantidad}
            onChange={setCantidad}
            disabled={!f.definido}
            aria-label={`Etiquetados hoy de ${f.nombre}`}
          />
          <Button
            size="md"
            disabled={!f.definido || n <= 0}
            loading={registrar.isPending}
            onClick={() =>
              registrar.mutate(
                { productoId: f.producto_id, cantidad: n },
                { onSuccess: () => setCantidad('') },
              )
            }
          >
            Cargar
          </Button>
          {f.etiquetados_hoy > 0 ? (
            <Button
              size="md"
              variant="subtle"
              color="gray"
              onClick={() => setCorrigiendo(true)}
            >
              Corregir
            </Button>
          ) : null}
        </Group>
        <Modal
          opened={corrigiendo}
          onClose={() => setCorrigiendo(false)}
          title={<Text fw={700}>Anular un etiquetado de {f.nombre}</Text>}
        >
          {corrigiendo ? <Corregir f={f} onListo={() => setCorrigiendo(false)} /> : null}
        </Modal>
      </Table.Td>
    </Table.Tr>
  );
}

/**
 * Envase + etiqueta = envase etiquetado (D-etiquetado-1). Por producto: lo que
 * piden los pedidos en curso, lo que ya está etiquetado y lo que falta. Al
 * cargar lo etiquetado hoy, la base descuenta envases y etiquetas.
 */
export function PanelEtiquetado() {
  const datos = useFaltanEtiquetar();
  const [todos, setTodos] = useState(false);
  const filas = datos.data ?? [];
  const conFalta = filas.filter((f) => f.faltan > 0);
  const visibles = todos
    ? filas
    : filas.filter((f) => f.faltan > 0 || f.etiquetados_hoy > 0);

  return (
    <Paper withBorder p="lg" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconTag size={22} />
          <Title order={3}>Envases etiquetados</Title>
          {conFalta.length > 0 ? (
            <Badge color="estadoRechazado" variant="filled" size="lg" radius="sm">
              Faltan etiquetar {conFalta.length}{' '}
              {conFalta.length === 1 ? 'producto' : 'productos'}
            </Badge>
          ) : datos.isSuccess ? (
            <Badge color="estadoAprobado" variant="light" size="lg" radius="sm">
              Todo etiquetado
            </Badge>
          ) : null}
        </Group>
        <Switch
          label="Ver también los que están al día"
          checked={todos}
          onChange={(e) => setTodos(e.currentTarget.checked)}
        />
      </Group>
      {datos.isLoading ? (
        <Skeleton h={120} />
      ) : visibles.length === 0 ? (
        <Text c="dimmed" size="sm">
          No hay pedidos en curso que pidan etiquetar.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th ta="right">En pedidos</Table.Th>
                <Table.Th ta="right">Etiquetados</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th ta="right">Hoy</Table.Th>
                <Table.Th>Etiqueté hoy</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibles.map((f) => (
                <Fila key={f.producto_id} f={f} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
}

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlertTriangle, IconChecks, IconPlus, IconTrash } from '@tabler/icons-react';
import { useInsumos } from '@/lib/consultas';
import { numero } from '@/lib/formato';
import {
  useFaltantesPedido,
  useNecesidadPedido,
  useTerminarPedido,
  type PedidoRow,
} from '@/lib/consultasComercial';

interface Renglon {
  insumoId: string;
  teorica: number;
  usada: number | string;
  motivo: string;
  agregado: boolean;
}

const aNumero = (v: number | string) => (typeof v === 'number' ? v : Number(v));

/**
 * «Terminado»: lo que se usó de cada insumo, arrancando de lo que dice la
 * receta.
 *
 * Cada cantidad se puede corregir —se rompió un envase, se usó un gramo de
 * más— y la corrección pide el motivo, porque es la diferencia la que hay que
 * poder explicar después. También se puede sumar un insumo que la receta no
 * tiene. Al confirmar, la base registra el consumo, descuenta el stock del
 * lote que vence primero y cierra el pedido, todo junto o nada.
 */
export function TerminarPedido({
  pedido,
  onListo,
}: {
  pedido: PedidoRow;
  onListo: () => void;
}) {
  const necesidad = useNecesidadPedido(pedido.id);
  const faltantes = useFaltantesPedido(pedido.id);
  const insumos = useInsumos();
  const terminar = useTerminarPedido();

  const insumoPorId = useMemo(
    () => new Map((insumos.data ?? []).map((i) => [i.id, i])),
    [insumos.data],
  );

  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [nuevoInsumo, setNuevoInsumo] = useState<string | null>(null);

  // Arranca de la receta la primera vez que llega; después es del usuario.
  const lista: Renglon[] =
    renglones ??
    (necesidad.data ?? []).map((n) => ({
      insumoId: n.insumo_id,
      teorica: Number(n.necesario),
      usada: Number(n.necesario),
      motivo: '',
      agregado: false,
    }));

  function cambiar(i: number, cambios: Partial<Renglon>) {
    setRenglones(lista.map((r, j) => (j === i ? { ...r, ...cambios } : r)));
  }

  const difiere = (r: Renglon) => aNumero(r.usada) !== r.teorica;
  const invalidos = lista.filter((r) => {
    const n = aNumero(r.usada);
    if (!Number.isFinite(n) || n < 0) return true;
    if (r.agregado) return n <= 0 || r.motivo.trim().length < 3;
    return difiere(r) && r.motivo.trim().length < 3;
  });
  const faltan = faltantes.data ?? [];

  function confirmar() {
    terminar.mutate(
      {
        pedidoId: pedido.id,
        correcciones: lista
          .filter((r) => difiere(r) || r.agregado)
          .map((r) => ({
            insumoId: r.insumoId,
            cantidad: aNumero(r.usada),
            motivo: r.motivo.trim() || null,
          })),
      },
      { onSuccess: onListo },
    );
  }

  if (necesidad.isLoading || insumos.isLoading) return <Skeleton h={240} />;

  const opcionesAgregar = (insumos.data ?? [])
    .filter((i) => i.activo && !lista.some((r) => r.insumoId === i.id))
    .map((i) => ({ value: i.id, label: `${i.codigo_interno} · ${i.nombre}` }));

  return (
    <Stack gap="md">
      <Text size="sm">
        Revisá cuánto se usó de cada cosa. Viene cargado lo que dice la receta; si se usó
        distinto, corregilo y escribí por qué. Al confirmar se descuenta del stock, del
        lote que vence primero, y el pedido queda terminado.
      </Text>

      {lista.length === 0 ? (
        <Alert
          color="estadoEnAnalisis"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
        >
          Ningún producto de este pedido tiene cargado qué lleva, así que no hay nada que
          descontar según receta. Podés agregar a mano lo que se usó.
        </Alert>
      ) : null}

      {faltan.length > 0 ? (
        <Alert
          color="estadoRechazado"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
          title="El sistema no tiene stock suficiente de todo"
        >
          Faltan {faltan.length === 1 ? 'un insumo' : `${faltan.length} insumos`} según lo
          registrado ({faltan.map((f) => f.codigo_interno ?? f.insumo).join(', ')}). Si se
          fabricó, el material estaba: falta registrar su entrada o un ajuste de
          inventario. Hasta entonces «Terminado» no va a poder descontar.
        </Alert>
      ) : null}

      {lista.length > 0 ? (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Insumo</Table.Th>
                <Table.Th ta="right">Receta</Table.Th>
                <Table.Th ta="right">Se usó</Table.Th>
                <Table.Th>Motivo de la diferencia</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.map((r, i) => {
                const ins = insumoPorId.get(r.insumoId);
                const unidad =
                  ins?.unidad_medida === 'UNIDAD' ? 'u' : (ins?.unidad_medida ?? '');
                return (
                  <Table.Tr key={r.insumoId}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {ins?.nombre ?? '(insumo)'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {ins?.codigo_interno}
                        {r.agregado ? ' · no está en la receta' : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" c="dimmed">
                        {numero(r.teorica, unidad === 'u' ? 0 : 2)} {unidad}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        aria-label={`Cantidad usada de ${ins?.nombre ?? 'insumo'}`}
                        min={0}
                        decimalScale={unidad === 'u' ? 0 : 4}
                        hideControls
                        w={130}
                        ml="auto"
                        rightSection={
                          <Text size="xs" c="dimmed">
                            {unidad}
                          </Text>
                        }
                        value={r.usada}
                        onChange={(v) => cambiar(i, { usada: v })}
                      />
                    </Table.Td>
                    <Table.Td>
                      {difiere(r) || r.agregado ? (
                        <TextInput
                          aria-label="Motivo"
                          placeholder="Por ejemplo: se rompió un envase"
                          value={r.motivo}
                          error={r.motivo.trim().length < 3 ? 'Obligatorio' : null}
                          onChange={(e) => cambiar(i, { motivo: e.currentTarget.value })}
                        />
                      ) : (
                        <Text size="xs" c="dimmed">
                          Igual a la receta
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {r.agregado ? (
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="lg"
                          aria-label="Quitar"
                          onClick={() => setRenglones(lista.filter((_, j) => j !== i))}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : null}

      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select
          label="¿Se usó algo que no está en la receta?"
          placeholder="Buscá el insumo"
          searchable
          limit={50}
          nothingFoundMessage="Sin coincidencias"
          style={{ flex: 1, minWidth: 240 }}
          data={opcionesAgregar}
          value={nuevoInsumo}
          onChange={setNuevoInsumo}
        />
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          disabled={!nuevoInsumo}
          onClick={() => {
            if (!nuevoInsumo) return;
            setRenglones([
              ...lista,
              {
                insumoId: nuevoInsumo,
                teorica: 0,
                usada: '',
                motivo: '',
                agregado: true,
              },
            ]);
            setNuevoInsumo(null);
          }}
        >
          Agregar
        </Button>
      </Group>

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Volver
        </Button>
        <Button
          size="md"
          leftSection={<IconChecks size={18} />}
          loading={terminar.isPending}
          disabled={invalidos.length > 0}
          onClick={confirmar}
        >
          Terminado: descontar stock
        </Button>
      </Group>
      {invalidos.length > 0 ? (
        <Text size="xs" c="dimmed" ta="right">
          Falta el motivo (o la cantidad) en{' '}
          {invalidos.length === 1 ? 'un renglón' : `${invalidos.length} renglones`}.
        </Text>
      ) : null}
    </Stack>
  );
}

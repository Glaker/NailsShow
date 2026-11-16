import { useState } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconBox } from '@tabler/icons-react';
import { useProductos } from '@/lib/consultas';
import { numero } from '@/lib/formato';
import { useArmarPack, usePackComponentes } from '@/lib/consultasComercial';

/**
 * Armar packs con otros productos terminados (D-armado-duo-1), por ejemplo el
 * DUO01 = 1 PREP 377 + 1 PRIMER 105. Se arma en el depósito de la pantalla:
 * salen los componentes de ahí, de lotes vendibles, y entra el pack ahí mismo.
 * Lo arman Gerencia de Producción y Ventas.
 * Lo que alcanza lo dice la base; acá se muestra para que no haya sorpresas.
 */
export function ArmarPack({
  depositoId,
  nombreDeposito,
  saldoDe,
}: {
  depositoId: string;
  nombreDeposito: string;
  saldoDe: (productoId: string) => number;
}) {
  const componentes = usePackComponentes();
  const productos = useProductos();
  const armar = useArmarPack();
  const [abierto, setAbierto] = useState(false);
  const [packId, setPackId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState<number | string>(1);
  const [obs, setObs] = useState('');

  const producto = new Map((productos.data ?? []).map((p) => [p.id, p]));
  const nombre = (id: string) => {
    const p = producto.get(id);
    return p ? `${p.codigo_interno} · ${p.nombre}` : '—';
  };
  const packs = [...new Set((componentes.data ?? []).map((c) => c.pack_id))];
  const elegido = packId ?? (packs.length === 1 ? packs[0]! : null);
  const lleva = (componentes.data ?? []).filter((c) => c.pack_id === elegido);
  const n = typeof cantidad === 'number' ? cantidad : 0;
  const falta = lleva.some((c) => c.cantidad * n > saldoDe(c.componente_id));

  if (packs.length === 0) return null;

  function cerrar() {
    setAbierto(false);
    setCantidad(1);
    setObs('');
  }

  return (
    <>
      <Button
        size="md"
        variant="light"
        color="grape"
        leftSection={<IconBox size={18} />}
        onClick={() => setAbierto(true)}
      >
        Armar pack
      </Button>
      <Modal
        opened={abierto}
        onClose={cerrar}
        title={`Armar pack en ${nombreDeposito}`}
        centered
        radius="md"
      >
        <Stack gap="md">
          {packs.length > 1 ? (
            <Select
              label="Pack"
              size="md"
              data={packs.map((id) => ({ value: id, label: nombre(id) }))}
              value={elegido}
              onChange={setPackId}
            />
          ) : (
            <Text fw={700}>{elegido ? nombre(elegido) : '—'}</Text>
          )}
          <NumberInput
            label="¿Cuántos packs armaste?"
            size="md"
            min={1}
            allowDecimal={false}
            value={cantidad}
            onChange={setCantidad}
          />
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Sale</Table.Th>
                <Table.Th ta="right">Usa</Table.Th>
                <Table.Th ta="right">Hay acá</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lleva.map((c) => {
                const usa = c.cantidad * n;
                const hay = saldoDe(c.componente_id);
                return (
                  <Table.Tr key={c.componente_id}>
                    <Table.Td>
                      <Text size="sm">{nombre(c.componente_id)}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm">{numero(usa)}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {usa > hay ? (
                        <Text size="sm" c="red" fw={700}>
                          {numero(hay)}
                        </Text>
                      ) : (
                        <Text size="sm">{numero(hay)}</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          {falta ? (
            <Text size="sm" c="red">
              No alcanza en este depósito: enviá los componentes desde otro o armá menos.
            </Text>
          ) : null}
          <TextInput
            label="Observaciones"
            size="md"
            value={obs}
            onChange={(e) => setObs(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              color="grape"
              loading={armar.isPending}
              disabled={!elegido || n < 1 || falta}
              onClick={() =>
                elegido &&
                armar.mutate(
                  {
                    packId: elegido,
                    depositoId,
                    cantidad: n,
                    observaciones: obs.trim() || null,
                  },
                  { onSuccess: cerrar },
                )
              }
            >
              Armar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

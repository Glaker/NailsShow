import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useProductos } from '@/lib/consultas';
import {
  hermanosDe,
  repartoDe,
  useDesvincularHermano,
  useRepartirLote,
  useStockFamilia,
  useVincularHermano,
  type ConFamilia,
  type DepositoHermanos,
} from '@/lib/consultasHermanos';
import { numero } from '@/lib/formato';

/* familia_granel entra en los tipos cuando se regeneren con 20261028130000. */
const conFamilia = (p: unknown[] | undefined) =>
  (p ?? []) as (ConFamilia & { activo: boolean })[];

/**
 * «Productos hermanos» de «Qué lleva cada producto» (D-hermanos-1): los que
 * se envasan del mismo granel, p. ej. el sanitizante de 1 L y el de 250 ml.
 */
export function ProductosHermanos({ productoId }: { productoId: string }) {
  const productos = conFamilia(useProductos().data);
  const vincular = useVincularHermano();
  const desvincular = useDesvincularHermano();
  const hermanos = hermanosDe(productos, productoId);
  const ya = new Set([productoId, ...hermanos.map((h) => h.id)]);
  return (
    <Stack gap="xs">
      {hermanos.length > 0 ? (
        <Group gap="xs">
          {hermanos.map((h) => (
            <Badge
              key={h.id}
              size="lg"
              variant="light"
              radius="sm"
              rightSection={
                <ActionIcon
                  size="sm"
                  variant="transparent"
                  aria-label={`Quitar ${h.nombre}`}
                  onClick={() => desvincular.mutate(h.id)}
                >
                  <IconX size={14} />
                </ActionIcon>
              }
            >
              {h.codigo_interno} · {h.nombre}
            </Badge>
          ))}
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          Sin hermanos. Si del mismo granel se envasa otro producto (otra presentación),
          agregalo: al terminar la orden vas a cargar cuántos salieron de cada uno.
        </Text>
      )}
      <Select
        size="md"
        placeholder="Agregar producto hermano"
        searchable
        limit={60}
        value={null}
        data={productos
          .filter((p) => p.activo && !ya.has(p.id))
          .map((p) => ({ value: p.id, label: `${p.codigo_interno} · ${p.nombre}` }))}
        onChange={(v) => v && vincular.mutate({ productoId, hermanoId: v })}
      />
    </Stack>
  );
}

/**
 * Unidades por hermano. Devuelve los campos; el total lo calcula quien lo usa
 * con `repartoDe`.
 */
export function CamposReparto({
  productos,
  valores,
  onCambio,
  actual,
}: {
  productos: ConFamilia[];
  valores: Record<string, number | string>;
  onCambio: (v: Record<string, number | string>) => void;
  /** Lo que hay hoy de cada uno, para mostrar al lado. */
  actual?: Record<string, number>;
}) {
  return (
    <Stack gap="xs">
      {productos.map((p) => (
        <NumberInput
          key={p.id}
          label={`${p.codigo_interno} · ${p.nombre}`}
          description={actual ? `Hoy hay: ${numero(actual[p.id] ?? 0)}` : undefined}
          allowDecimal={false}
          min={0}
          value={valores[p.id] ?? ''}
          onChange={(v) => onCambio({ ...valores, [p.id]: v })}
        />
      ))}
    </Stack>
  );
}

/**
 * Corregir de cuál hermano son las unidades de un lote (o las sin lote) en un
 * depósito: «salieron 300 de 100 ml y el resto de 200 ml». El total no cambia.
 */
export function CorregirReparto({
  ordenId,
  productoId,
  deposito = 'PTF',
  etiqueta = 'Corregir reparto entre hermanos',
}: {
  ordenId: string | null;
  productoId: string;
  deposito?: DepositoHermanos;
  etiqueta?: string;
}) {
  const productos = conFamilia(useProductos().data);
  const familia = [
    ...productos.filter((p) => p.id === productoId),
    ...hermanosDe(productos, productoId),
  ];
  const [abierto, setAbierto] = useState(false);
  const lote = useStockFamilia(
    deposito,
    ordenId,
    familia.map((p) => p.id),
    abierto,
  );
  const repartir = useRepartirLote();
  const [valores, setValores] = useState<Record<string, number | string> | null>(null);
  const [motivo, setMotivo] = useState('');
  if (familia.length < 2) return null;

  const actual = Object.fromEntries(
    (lote.data ?? []).map((r) => [r.producto_id, Number(r.saldo)]),
  );
  const total = Object.values(actual).reduce((a, b) => a + b, 0);
  const v = valores ?? actual;
  const suma = repartoDe(v).reduce((a, r) => a + r.unidades, 0);
  const listo = suma === total && motivo.trim().length >= 3;

  return (
    <>
      <Button variant="default" onClick={() => setAbierto(true)}>
        {etiqueta}
      </Button>
      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title="Corregir reparto entre hermanos"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Hay <b>{numero(total)}</b> {ordenId ? 'de este lote' : 'sin lote'} entre estos
            productos. Poné cuántas son de cada uno; el total no cambia. Queda registrado
            como ajuste, con el motivo.
          </Text>
          <CamposReparto
            productos={familia}
            valores={v}
            onCambio={setValores}
            actual={actual}
          />
          <Text size="sm" {...(suma === total ? {} : { c: 'red' })}>
            Suma {numero(suma)} de {numero(total)}
          </Text>
          <TextInput
            label="Motivo"
            placeholder="Conteo en planta, se cargó todo en uno…"
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              disabled={!listo}
              loading={repartir.isPending}
              onClick={() =>
                repartir.mutate(
                  { deposito, ordenId, reparto: repartoDe(v), motivo: motivo.trim() },
                  {
                    onSuccess: () => {
                      setAbierto(false);
                      setValores(null);
                      setMotivo('');
                    },
                  },
                )
              }
            >
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

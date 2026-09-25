import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useProductos } from '@/lib/consultas';
import { useAltaProductoTercero, type Tercero } from '@/lib/consultasTercerizados';

/**
 * Alta de producto del tercero. Dos casos (codirector técnico, 2026-09-24):
 * uno totalmente nuevo, o uno que Nail Show ya fabrica con otra etiqueta. En
 * el segundo la base copia la lista de materiales del producto de Nail Show,
 * para cambiarle después la etiqueta.
 */
export function FormularioProductoTercero({
  tercero,
  onListo,
}: {
  tercero: Tercero;
  onListo: (productoId: string | null) => void;
}) {
  const productos = useProductos();
  const alta = useAltaProductoTercero();
  const [modo, setModo] = useState<'NUEVO' | 'ETIQUETA'>('ETIQUETA');
  const [nombre, setNombre] = useState('');
  const [variedad, setVariedad] = useState('');
  const [baseId, setBaseId] = useState<string | null>(null);

  const base = (productos.data ?? []).find((p) => p.id === baseId);
  const valido = nombre.trim().length >= 2 && (modo === 'NUEVO' || Boolean(baseId));

  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        value={modo}
        onChange={(v) => setModo(v as typeof modo)}
        data={[
          { value: 'ETIQUETA', label: 'Producto Nail Show con otra etiqueta' },
          { value: 'NUEVO', label: 'Producto nuevo' },
        ]}
      />
      {modo === 'ETIQUETA' ? (
        <Select
          label="Producto de Nail Show"
          placeholder="Buscá por código o nombre"
          searchable
          limit={60}
          data={(productos.data ?? [])
            .filter((p) => p.activo && p.tercero_id === null)
            .map((p) => ({ value: p.id, label: `${p.codigo_interno} · ${p.nombre}` }))}
          value={baseId}
          onChange={(v) => {
            setBaseId(v);
            const p = (productos.data ?? []).find((x) => x.id === v);
            if (p && !nombre) setNombre(`${p.nombre} ${tercero.nombre}`);
          }}
        />
      ) : null}
      <TextInput
        label="Nombre para el cliente"
        withAsterisk
        value={nombre}
        onChange={(e) => setNombre(e.currentTarget.value)}
      />
      <TextInput
        label="Variedad"
        placeholder={base?.variedad ?? 'Color, línea, terminación'}
        value={variedad}
        onChange={(e) => setVariedad(e.currentTarget.value)}
      />
      <Alert
        color="indigo"
        variant="light"
        radius="md"
        icon={<IconInfoCircle size={18} />}
      >
        {modo === 'ETIQUETA'
          ? 'Se copia lo que lleva el producto de Nail Show (envase, tapa, etiqueta…). Después cambiale la etiqueta por la del cliente en «Qué lleva cada producto». El granel es el mismo: usa la fórmula del producto de Nail Show.'
          : 'Queda sin lista de materiales: cargala en «Qué lleva cada producto» para que el sistema sepa qué insumos usa.'}
      </Alert>
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={() => onListo(null)}>
          Cancelar
        </Button>
        <Button
          color="indigo"
          loading={alta.isPending}
          disabled={!valido}
          onClick={() =>
            alta.mutate(
              {
                terceroId: tercero.id,
                nombre: nombre.trim(),
                baseId: modo === 'ETIQUETA' ? baseId : null,
                variedad: variedad.trim() || null,
              },
              { onSuccess: (p) => onListo(p.id) },
            )
          }
        >
          Dar de alta
        </Button>
      </Group>
    </Stack>
  );
}

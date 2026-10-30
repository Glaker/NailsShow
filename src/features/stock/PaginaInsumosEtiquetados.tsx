import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { useTieneRol } from '@/features/auth/sesion';
import { useInsumos, useProductos, useStockPorArticulo } from '@/lib/consultas';
import { ROLES_CUENTAN } from '@/lib/consultasComercial';
import {
  useContarInsumosEtiquetados,
  useInsumosEtiquetados,
  type InsumoEtiquetado,
} from '@/lib/consultasEtiquetado';
import { fecha, numero } from '@/lib/formato';

const TIPOS_ETIQUETABLES = ['MATERIAL_ENVASE', 'MATERIAL_EMPAQUE'];

/**
 * Alta y corrección en el mismo formulario. Sin `actual` es un alta; con
 * `actual` se puede cambiar la cantidad, pasarlo a otro producto o sacarlo
 * (cantidad 0). Cada guardado es un conteo nuevo: lo anterior queda en el
 * historial, con autor y momento (D-insumos-etiquetados-1).
 */
function Formulario({
  actual,
  vigentes,
  onListo,
}: {
  actual: InsumoEtiquetado | null;
  vigentes: InsumoEtiquetado[];
  onListo: () => void;
}) {
  const insumos = useInsumos();
  const productos = useProductos();
  const contar = useContarInsumosEtiquetados();
  const [insumoId, setInsumoId] = useState<string | null>(actual?.insumo_id ?? null);
  const [productoId, setProductoId] = useState<string | null>(
    actual?.producto_id ?? null,
  );
  const [cantidad, setCantidad] = useState<number | string>(actual?.cantidad ?? '');
  const [observacion, setObservacion] = useState('');

  const n = typeof cantidad === 'number' ? cantidad : Number.NaN;
  const valido = !!insumoId && !!productoId && Number.isInteger(n) && n >= 0;
  /* Si el destino ya tenía un conteo, el nuevo lo reemplaza: avisarlo. */
  const yaHabia = vigentes.find(
    (v) =>
      v.insumo_id === insumoId &&
      v.producto_id === productoId &&
      v.producto_id !== actual?.producto_id,
  );

  const guardar = (cant: number) => {
    if (!insumoId || !productoId) return;
    const obs = observacion.trim() || null;
    const filas = [
      { insumo_id: insumoId, producto_id: productoId, cantidad: cant, observacion: obs },
    ];
    if (actual && actual.producto_id !== productoId)
      filas.unshift({
        insumo_id: actual.insumo_id,
        producto_id: actual.producto_id,
        cantidad: 0,
        observacion: obs ?? 'Pasado a otro producto',
      });
    contar.mutate(filas, { onSuccess: onListo });
  };

  return (
    <Stack gap="md">
      <Select
        label="Insumo"
        size="md"
        searchable
        withAsterisk
        disabled={!!actual}
        data={(insumos.data ?? [])
          .filter((i) => i.activo && TIPOS_ETIQUETABLES.includes(i.tipo))
          .map((i) => ({ value: i.id, label: `${i.codigo_interno} · ${i.nombre}` }))}
        value={insumoId}
        onChange={setInsumoId}
      />
      <Select
        label="Etiquetado para el producto"
        size="md"
        searchable
        withAsterisk
        data={(productos.data ?? [])
          .filter((p) => p.activo || p.id === actual?.producto_id)
          .map((p) => ({ value: p.id, label: `${p.codigo_interno} · ${p.nombre}` }))}
        value={productoId}
        onChange={setProductoId}
      />
      <NumberInput
        label="Cantidad etiquetada"
        size="md"
        withAsterisk
        min={0}
        allowDecimal={false}
        value={cantidad}
        onChange={setCantidad}
      />
      {yaHabia ? (
        <Text size="sm" c="estadoCuarentena.8">
          Ese producto ya tenía {numero(yaHabia.cantidad)}: queda en la cantidad de acá.
        </Text>
      ) : null}
      <TextInput
        label="Observación"
        size="md"
        placeholder="Recuento, se rompieron, era otro producto…"
        value={observacion}
        onChange={(e) => setObservacion(e.currentTarget.value)}
      />
      <Group justify="space-between">
        {actual ? (
          <Button
            size="md"
            color="estadoRechazado"
            variant="light"
            loading={contar.isPending}
            onClick={() => guardar(0)}
          >
            Ya no hay (sacar)
          </Button>
        ) : (
          <span />
        )}
        <Button
          size="md"
          disabled={!valido}
          loading={contar.isPending}
          onClick={() => guardar(n)}
        >
          Guardar
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Insumos etiquetados (D-insumos-etiquetados-1): de lo que hay en stock de un
 * envase, tapa, caja o bolsa, cuánto ya lleva la etiqueta de cada producto.
 * Es un desglose: cargarlo o corregirlo no mueve el saldo del insumo.
 */
export function PaginaInsumosEtiquetados() {
  const datos = useInsumosEtiquetados();
  const stock = useStockPorArticulo();
  const puede = useTieneRol(...ROLES_CUENTAN);
  const [busqueda, setBusqueda] = useState('');
  /* undefined = cerrado; null = alta; fila = corrección. */
  const [editando, setEditando] = useState<InsumoEtiquetado | null | undefined>(
    undefined,
  );

  const saldo = useMemo(
    () =>
      new Map(
        (stock.data ?? []).map((s) => [
          s.insumo_id as string,
          Number(s.saldo_total ?? 0),
        ]),
      ),
    [stock.data],
  );

  const vigentes = datos.data ?? [];
  const texto = busqueda.trim().toLowerCase();
  const filas = vigentes.filter(
    (f) =>
      !texto ||
      [f.insumo_codigo, f.insumo_nombre, f.producto_codigo, f.producto_nombre].some((s) =>
        s.toLowerCase().includes(texto),
      ),
  );
  const porInsumo = new Map<string, InsumoEtiquetado[]>();
  for (const f of filas)
    porInsumo.set(f.insumo_id, [...(porInsumo.get(f.insumo_id) ?? []), f]);
  const grupos = [...porInsumo.values()].flatMap((g) =>
    g[0] ? [{ insumo: g[0], g }] : [],
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Insumos etiquetados"
        descripcion="Envases, tapas, cajas y bolsas que ya tienen la etiqueta de un producto. Es parte del stock del insumo: cargarlo o corregirlo no mueve el saldo."
        acciones={
          puede ? (
            <Button
              size="md"
              leftSection={<IconPlus size={18} />}
              onClick={() => setEditando(null)}
            >
              Agregar
            </Button>
          ) : null
        }
      />
      <Stack gap="md">
        <TextInput
          size="md"
          placeholder="Buscar por insumo o producto"
          value={busqueda}
          onChange={(e) => setBusqueda(e.currentTarget.value)}
        />
        {datos.isLoading ? (
          <Skeleton h={300} />
        ) : grupos.length === 0 ? (
          <Text c="dimmed" size="sm">
            No hay insumos etiquetados cargados.
          </Text>
        ) : (
          grupos.map(({ insumo, g }) => {
            const total = g.reduce((s, f) => s + Number(f.cantidad), 0);
            const enStock = saldo.get(insumo.insumo_id) ?? 0;
            return (
              <Paper
                key={insumo.insumo_id}
                withBorder
                p="md"
                style={{ borderColor: 'var(--superficie-borde)' }}
              >
                <Group justify="space-between" mb="xs" wrap="wrap">
                  <div>
                    <Text fw={700}>{insumo.insumo_nombre}</Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {insumo.insumo_codigo}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Badge variant="light" color="azul" size="lg" radius="sm">
                      {numero(total)} etiquetados
                    </Badge>
                    <Badge
                      variant="light"
                      color={total > enStock ? 'estadoRechazado' : 'gray'}
                      size="lg"
                      radius="sm"
                    >
                      {numero(enStock)} en stock
                    </Badge>
                  </Group>
                </Group>
                <Table.ScrollContainer minWidth={640}>
                  <Table verticalSpacing="sm">
                    <Table.Tbody>
                      {g.map((f) => (
                        <Table.Tr key={f.id}>
                          <Table.Td>
                            <Text size="sm" fw={600}>
                              {f.producto_nombre}
                            </Text>
                            <Text size="xs" c="dimmed" ff="monospace">
                              {f.producto_codigo}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right" w={110}>
                            <Text size="lg" fw={700} ff="monospace">
                              {numero(f.cantidad)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {fecha(f.registrado_en)}
                              {f.registrado_por_nombre
                                ? ` · ${f.registrado_por_nombre}`
                                : ''}
                            </Text>
                            {f.observacion ? (
                              <Text size="xs" c="dimmed" lineClamp={2}>
                                {f.observacion}
                              </Text>
                            ) : null}
                          </Table.Td>
                          {puede ? (
                            <Table.Td w={120} ta="right">
                              <Button
                                size="md"
                                variant="light"
                                leftSection={<IconPencil size={16} />}
                                onClick={() => setEditando(f)}
                              >
                                Editar
                              </Button>
                            </Table.Td>
                          ) : null}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Paper>
            );
          })
        )}
      </Stack>
      <Modal
        opened={editando !== undefined}
        onClose={() => setEditando(undefined)}
        title={
          <Text fw={700}>
            {editando
              ? `${editando.insumo_codigo} → ${editando.producto_nombre}`
              : 'Agregar insumo etiquetado'}
          </Text>
        }
      >
        {editando !== undefined ? (
          <Formulario
            key={editando?.id ?? 'nuevo'}
            actual={editando}
            vigentes={vigentes}
            onListo={() => setEditando(undefined)}
          />
        ) : null}
      </Modal>
    </>
  );
}

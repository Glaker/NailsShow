import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconPackage, IconPlus, IconTrash } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useInsumos, useProductos } from '@/lib/consultas';
import { numero } from '@/lib/formato';
import {
  useAgregarMaterial,
  useMaterialesDeProducto,
  useQuitarMaterial,
} from '@/lib/consultasComercial';

/**
 * Lista de materiales de acondicionamiento.
 *
 * Qué lleva cada producto terminado **sin contar el granel**: envase, tapa,
 * guarnición, etiqueta, caja. La fórmula de fabricación cubre la otra mitad y
 * la carga Dirección Técnica; esto lo carga Gerencia de Producción.
 *
 * De acá sale la explosión de un pedido: `comercial.explotar_pedido()` multiplica
 * la cantidad pedida por `cantidad_por_unidad` y la divide por `(1 - merma)`.
 * Un producto sin lista cargada no genera faltantes, y eso se lee como «está
 * todo bien» cuando en realidad es «no sé»: por eso la pantalla lo avisa.
 */
export function PaginaListaMateriales() {
  const productos = useProductos();
  const insumos = useInsumos();
  // ?producto=<id>: se llega desde la ficha de un producto tercerizado.
  const [params] = useSearchParams();
  const [productoId, setProductoId] = useState<string | null>(params.get('producto'));
  const materiales = useMaterialesDeProducto(productoId ?? undefined);
  const agregar = useAgregarMaterial();
  const quitar = useQuitarMaterial();

  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [porUnidad, setPorUnidad] = useState<number | ''>(1);
  const [merma, setMerma] = useState<number | ''>(0);

  const filas = materiales.data ?? [];
  const yaCargados = new Set(filas.map((f) => f.insumo_id));

  return (
    <>
      <EncabezadoPagina
        titulo="Qué lleva cada producto"
        descripcion="Envase, tapa, etiqueta y demás por unidad de producto terminado. El granel va en la fórmula de fabricación, aparte."
      />

      <Stack gap="lg">
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Select
            label="Producto"
            withAsterisk
            searchable
            placeholder={
              productos.isLoading ? 'Cargando productos…' : 'Elegí un producto terminado'
            }
            nothingFoundMessage="Sin coincidencias"
            data={(productos.data ?? []).map((p) => ({ value: p.id, label: p.nombre }))}
            value={productoId}
            onChange={setProductoId}
          />
        </Paper>

        {!productoId ? (
          <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
            <Vacio
              icono={IconPackage}
              titulo="Elegí un producto"
              descripcion="Para cada uno se carga qué insumos de acondicionamiento lleva y cuántos por unidad."
            />
          </Paper>
        ) : materiales.isLoading ? (
          <Skeleton h={200} />
        ) : (
          <>
            {filas.length === 0 ? (
              <Alert
                color="estadoEnAnalisis"
                variant="light"
                radius="md"
                icon={<IconInfoCircle size={18} />}
                title="Este producto no tiene lista cargada"
              >
                Un pedido de este producto no va a mostrar ningún faltante de
                acondicionamiento —no porque alcance, sino porque el sistema no sabe qué
                lleva—. Cargala para que la explosión del pedido sirva.
              </Alert>
            ) : (
              <Paper
                withBorder
                style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
              >
                <Table.ScrollContainer minWidth={680}>
                  <Table verticalSpacing="sm" highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Insumo</Table.Th>
                        <Table.Th ta="right">Por unidad</Table.Th>
                        <Table.Th ta="right">Merma</Table.Th>
                        <Table.Th ta="right">Consumo real</Table.Th>
                        <Table.Th />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {filas.map((m) => (
                        <Table.Tr key={m.id}>
                          <Table.Td>
                            <Text size="sm" fw={600}>
                              {m.insumo?.nombre ?? '(insumo)'}
                            </Text>
                            {m.insumo?.codigo_interno ? (
                              <Text size="xs" c="dimmed">
                                {m.insumo.codigo_interno}
                              </Text>
                            ) : null}
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace">
                              {numero(m.cantidad_por_unidad, 4)}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace" c="dimmed">
                              {numero(m.merma * 100, 2)} %
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Tooltip label="cantidad por unidad ÷ (1 − merma)">
                              <Text size="sm" ff="monospace" fw={600}>
                                {numero(m.cantidad_por_unidad / (1 - m.merma), 4)}
                              </Text>
                            </Tooltip>
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon
                              variant="subtle"
                              color="estadoRechazado"
                              aria-label="Quitar material"
                              onClick={() => quitar.mutate({ id: m.id, productoId })}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Paper>
            )}

            <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
              <Stack gap="md">
                <Text fw={600}>Agregar insumo a la lista</Text>
                <Group align="flex-end" wrap="wrap" gap="sm">
                  <Select
                    label="Insumo"
                    placeholder="Envase, tapa, etiqueta…"
                    searchable
                    nothingFoundMessage="Sin coincidencias"
                    style={{ flex: 1, minWidth: 260 }}
                    data={(insumos.data ?? [])
                      .filter((i) => !yaCargados.has(i.id))
                      .map((i) => ({
                        value: i.id,
                        label: `${i.codigo_interno} — ${i.nombre}`,
                      }))}
                    value={insumoId}
                    onChange={setInsumoId}
                  />
                  <NumberInput
                    label="Cantidad por unidad"
                    description="Casi siempre 1"
                    min={0}
                    decimalScale={4}
                    hideControls
                    w={170}
                    value={porUnidad}
                    onChange={(v) => setPorUnidad(typeof v === 'number' ? v : '')}
                  />
                  <NumberInput
                    label="Merma (%)"
                    description="Lo que se rompe"
                    min={0}
                    max={99}
                    decimalScale={2}
                    hideControls
                    w={150}
                    value={merma}
                    onChange={(v) => setMerma(typeof v === 'number' ? v : '')}
                  />
                  <Button
                    leftSection={<IconPlus size={16} />}
                    loading={agregar.isPending}
                    disabled={
                      !insumoId || typeof porUnidad !== 'number' || porUnidad <= 0
                    }
                    onClick={() => {
                      if (!insumoId || typeof porUnidad !== 'number') return;
                      agregar.mutate(
                        {
                          productoId,
                          insumoId,
                          cantidadPorUnidad: porUnidad,
                          merma: typeof merma === 'number' ? merma / 100 : 0,
                        },
                        {
                          onSuccess: () => {
                            setInsumoId(null);
                            setPorUnidad(1);
                            setMerma(0);
                          },
                        },
                      );
                    }}
                  >
                    Agregar
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </>
  );
}

import { useMemo, useState } from 'react';
import {
  Autocomplete,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useDebouncedState } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconPackage, IconPlus, IconSearch } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { FlipCard } from '@/components/FlipCard';
import RubberSegment from '@/vendor/reactbits/RubberSegment';
import { MaterialesProducto } from '@/features/produccion/TareasCarga';
import { Vacio } from '@/components/Vacio';
import {
  useActualizarProducto,
  useCrearProducto,
  useProductos,
  type Producto,
} from '@/lib/consultas';
import { etiquetaEnum } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';
import { TiempoEnvasado } from '@/features/produccion/TiempoEnvasado';
import { ProductosHermanos } from '@/features/produccion/Hermanos';

const ORIGENES = ['FABRICADO', 'FRACCIONADO', 'IMPORTADO'] as const;

const esquema = z.object({
  codigo_interno: z.string().trim().min(1, 'Falta el código interno'),
  nombre: z.string().trim().min(2, 'Falta el nombre'),
  variedad: z.string().trim(),
  familia: z.string().trim(),
  variante: z.string().trim(),
  tipo: z.string().trim(),
  forma_cosmetica: z.string().trim(),
  /* Nullable: la lista cargada no traía el origen, y un 'FABRICADO' supuesto
     mandaría el producto al circuito de elaboración equivocado. */
  origen: z.enum(ORIGENES).nullable(),
  /* Nullable de verdad: un 0 sería un dato falso. Sin vida útil, el vencimiento
     del lote se completa después. */
  vida_util_meses: z.number().int().positive().nullable(),
  activo: z.boolean(),
});

type Valores = z.infer<typeof esquema>;

/**
 * Alta y edición de la ficha, en el mismo formulario. `producto` ausente =
 * alta; presente = edición de esa ficha. El tiempo de envasado y etiquetado
 * va aparte, con su propio guardar (TiempoEnvasado).
 */
export function FormularioProducto({
  producto,
  onListo,
}: {
  producto?: Producto | undefined;
  /** Con el id del producto dado de alta; sin nada al cancelar o editar. */
  onListo: (creadoId?: string) => void;
}) {
  const crear = useCrearProducto();
  const actualizar = useActualizarProducto();
  const editando = Boolean(producto);
  const cargaHermanos = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const productos = useProductos();
  const familias = [
    ...new Set((productos.data ?? []).map((p) => p.familia).filter((f) => f !== null)),
  ].sort();
  const form = useForm<Valores>({
    mode: 'controlled',
    initialValues: {
      codigo_interno: producto?.codigo_interno ?? '',
      nombre: producto?.nombre ?? '',
      variedad: producto?.variedad ?? '',
      familia: producto?.familia ?? '',
      variante: producto?.variante ?? '',
      tipo: producto?.tipo ?? '',
      forma_cosmetica: producto?.forma_cosmetica ?? '',
      origen: (producto?.origen as Valores['origen']) ?? (producto ? null : 'FABRICADO'),
      vida_util_meses: producto?.vida_util_meses ?? null,
      activo: producto?.activo ?? true,
    },
    validate: zod4Resolver(esquema),
  });

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        /* Los text vacíos van como null: un '' en la base no es un dato, es
           ruido que después hay que limpiar. */
        const campos = {
          codigo_interno: v.codigo_interno,
          nombre: v.nombre,
          variedad: v.variedad || null,
          familia: v.familia || null,
          /* La base no admite variante sin familia. */
          variante: (v.familia && v.variante.toUpperCase()) || null,
          tipo: v.tipo || null,
          forma_cosmetica: v.forma_cosmetica || null,
          origen: v.origen,
          vida_util_meses: v.vida_util_meses,
          activo: v.activo,
        };
        if (producto) {
          await actualizar.mutateAsync({ id: producto.id, cambios: campos });
          onListo();
        } else {
          onListo((await crear.mutateAsync(campos)).id);
        }
      })}
    >
      <Stack gap="md">
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Código interno"
              placeholder="PT-0001"
              {...form.getInputProps('codigo_interno')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput
              label="Nombre"
              placeholder="Esmalte semipermanente"
              {...form.getInputProps('nombre')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Variedad"
              placeholder="Color, terminación, línea"
              {...form.getInputProps('variedad')}
            />
          </Grid.Col>
          {/* D-familias-sku-1: misma familia y variante = presentaciones de una fórmula. */}
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Autocomplete
              label="Familia"
              placeholder="Exfoliante, Sanitizante…"
              data={familias}
              {...form.getInputProps('familia')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Fragancia o color"
              placeholder="AMOR, PAZ, CLEAR…"
              description="Las presentaciones de la misma familia y fragancia comparten fórmula."
              disabled={!form.getValues().familia.trim()}
              {...form.getInputProps('variante')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Origen"
              placeholder="Sin definir"
              description="Sin origen no se puede abrir una orden de producción."
              data={ORIGENES.map((o) => ({ value: o, label: etiquetaEnum(o) }))}
              clearable
              {...form.getInputProps('origen')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Tipo"
              placeholder="Esmalte, base, top…"
              {...form.getInputProps('tipo')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Forma cosmética"
              placeholder="Líquido, gel…"
              {...form.getInputProps('forma_cosmetica')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="Vida útil (meses)"
              placeholder="Opcional"
              min={1}
              hideControls
              {...form.getInputProps('vida_util_meses')}
            />
          </Grid.Col>
        </Grid>

        {producto ? (
          <TiempoEnvasado productoId={producto.id} cantidadSugerida={0} />
        ) : null}

        {/* D-hermanos-1: también desde el catálogo (pedido del 2026-10-28). Se
            guarda al elegirlo, sin «Guardar cambios». */}
        {producto && cargaHermanos ? (
          <Stack gap={4}>
            <Text fw={600}>Productos hermanos</Text>
            <ProductosHermanos productoId={producto.id} />
          </Stack>
        ) : null}

        {editando ? (
          <Switch
            label="Activo"
            description="Un producto no se borra, se desactiva."
            {...form.getInputProps('activo', { type: 'checkbox' })}
          />
        ) : null}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={() => onListo()}>
            Cancelar
          </Button>
          <Button type="submit" loading={crear.isPending || actualizar.isPending}>
            {editando ? 'Guardar cambios' : 'Agregar al catálogo'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * Catálogo de productos terminados (§4.7).
 *
 * Es el maestro contra el que se van a registrar las órdenes de producción. Por
 * ahora carga la lista; el tipo y la forma cosmética se guardan como texto
 * hasta que la lista real fije el vocabulario y se promuevan a enum, igual que
 * pasó con el tipo de insumo.
 */
/* Color de la familia (o del nombre), siempre el mismo para el mismo texto. */
const PALETA_FAMILIA = [
  'pink',
  'grape',
  'violet',
  'indigo',
  'cyan',
  'teal',
  'orange',
  'red',
];
function colorFamilia(texto: string) {
  const i = [...texto].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA_FAMILIA.length;
  return `var(--mantine-color-${PALETA_FAMILIA[i]}-6)`;
}

/**
 * Catálogo en tarjetas (2026-11-06): al frente el producto, al dorso sus
 * datos y el botón para editarlo. Se da vuelta con un toque.
 */
function TarjetasProductos({
  productos,
  puedeEditar,
  onEditar,
}: {
  productos: Producto[];
  puedeEditar: boolean;
  onEditar: (p: Producto) => void;
}) {
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 4 }} spacing="md" mb="md">
      {productos.map((p) => {
        const color = colorFamilia(p.familia ?? p.nombre);
        return (
          <FlipCard
            key={p.id}
            etiqueta={p.nombre}
            frente={
              <Stack h="100%" justify="space-between" p="md" gap="xs">
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: color,
                    marginBottom: 4,
                  }}
                />
                <div>
                  <Text size="xs" c="dimmed" ff="monospace">
                    {p.codigo_interno}
                  </Text>
                  <Text fw={700} size="lg" lh={1.25} lineClamp={3}>
                    {p.nombre}
                  </Text>
                </div>
                <Group gap={6}>
                  {p.familia ? (
                    <Badge variant="light" radius="sm" style={{ color }}>
                      {p.familia}
                    </Badge>
                  ) : null}
                  {p.variante ? (
                    <Badge variant="outline" radius="sm" color="gray">
                      {p.variante}
                    </Badge>
                  ) : null}
                  {!p.activo ? (
                    <Badge variant="light" radius="sm" color="gray">
                      Inactivo
                    </Badge>
                  ) : null}
                </Group>
                <Text size="xs" c="dimmed">
                  Tocá para ver el detalle
                </Text>
              </Stack>
            }
            dorso={
              <Stack h="100%" justify="space-between" p="md" gap={6}>
                <Stack gap={4}>
                  <Text fw={700} lineClamp={1}>
                    {p.nombre}
                  </Text>
                  <Dato etiqueta="Origen">
                    {p.origen ? etiquetaEnum(p.origen) : 'Sin definir'}
                  </Dato>
                  <Dato etiqueta="Vida útil">
                    {p.vida_util_meses ? `${p.vida_util_meses} meses` : 'Sin cargar'}
                  </Dato>
                  <Dato etiqueta="Tipo">{p.tipo ?? '—'}</Dato>
                  <Dato etiqueta="Forma cosmética">{p.forma_cosmetica ?? '—'}</Dato>
                </Stack>
                {puedeEditar ? (
                  <Button variant="light" size="md" onClick={() => onEditar(p)}>
                    Editar ficha
                  </Button>
                ) : null}
              </Stack>
            }
          />
        );
      })}
    </SimpleGrid>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {etiqueta}
      </Text>
      <Text size="sm" fw={600} ta="right" lineClamp={1}>
        {children}
      </Text>
    </Group>
  );
}

export function PaginaProductos() {
  const productos = useProductos();
  const [abierto, modal] = useDisclosure(false);
  const [enEdicion, setEnEdicion] = useState<Producto | undefined>();
  const [texto, setTexto] = useDebouncedState('', 250);
  const [vista, setVista] = useState<'tarjetas' | 'tabla'>('tarjetas');
  const puedeEditar = useTieneRol(
    'DIRECCION_TECNICA',
    'GERENCIA_PRODUCCION',
    'ADMINISTRADOR_SISTEMA',
  );

  const abrirAlta = () => {
    setEnEdicion(undefined);
    modal.open();
  };

  const abrirEdicion = (producto: Producto) => {
    if (!puedeEditar) return;
    setEnEdicion(producto);
    modal.open();
  };

  const filas = useMemo(() => {
    const b = texto.trim().toLowerCase();
    return (productos.data ?? []).filter(
      (p) =>
        !b ||
        (p.nombre ?? '').toLowerCase().includes(b) ||
        (p.codigo_interno ?? '').toLowerCase().includes(b) ||
        (p.variedad ?? '').toLowerCase().includes(b),
    );
  }, [productos.data, texto]);

  return (
    <>
      <EncabezadoPagina
        titulo="Catálogo de productos"
        descripcion="Los productos terminados que fabrica la planta. Base de las órdenes de producción."
        acciones={
          puedeEditar ? (
            <Button leftSection={<IconPlus size={18} />} onClick={abrirAlta}>
              Nuevo producto
            </Button>
          ) : null
        }
      />

      {(productos.data ?? []).length > 0 ? (
        <Paper
          withBorder
          p="md"
          mb="md"
          style={{ borderColor: 'var(--superficie-borde)' }}
        >
          <Group justify="space-between" gap="sm">
            <TextInput
              placeholder="Nombre, código o variedad"
              leftSection={<IconSearch size={17} />}
              defaultValue={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              w={{ base: '100%', sm: 360 }}
            />
            <RubberSegment
              aria-label="Cómo ver el catálogo"
              items={[
                { value: 'tarjetas', label: 'Tarjetas' },
                { value: 'tabla', label: 'Tabla' },
              ]}
              value={vista}
              onChange={(v) => setVista(v as 'tarjetas' | 'tabla')}
              size="lg"
              trackColor="var(--mantine-color-default-hover)"
              thumbColor="var(--mantine-color-body)"
              textColor="var(--mantine-color-text)"
              activeTextColor="var(--mantine-color-text)"
            />
          </Group>
        </Paper>
      ) : null}

      {vista === 'tarjetas' && !productos.isLoading ? (
        <TarjetasProductos
          productos={filas}
          puedeEditar={puedeEditar}
          onEditar={abrirEdicion}
        />
      ) : null}

      <Paper
        withBorder
        display={vista === 'tabla' || productos.isLoading ? undefined : 'none'}
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {productos.isLoading ? (
          <Skeleton h={260} />
        ) : (productos.data ?? []).length === 0 ? (
          <Vacio
            icono={IconPackage}
            titulo="El catálogo está vacío"
            descripcion="Cargá los productos terminados que fabrica la planta. Sin catálogo no se puede registrar una producción."
            accion={
              puedeEditar ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={abrirAlta}
                >
                  Nuevo producto
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Text size="sm" c="dimmed" px="md" pt="sm">
              {filas.length} de {(productos.data ?? []).length}{' '}
              {(productos.data ?? []).length === 1 ? 'producto' : 'productos'}
            </Text>
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Variedad</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Origen</Table.Th>
                    <Table.Th ta="right">Vida útil</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((p) => (
                    <Table.Tr
                      key={p.id}
                      onClick={() => abrirEdicion(p)}
                      style={puedeEditar ? { cursor: 'pointer' } : undefined}
                    >
                      <Table.Td>
                        <Text size="sm" ff="monospace" fw={600}>
                          {p.codigo_interno}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{p.nombre}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {p.variedad ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{p.tipo ? etiquetaEnum(p.tipo) : '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        {p.origen ? (
                          <Badge variant="light" radius="sm" color="azul">
                            {etiquetaEnum(p.origen)}
                          </Badge>
                        ) : (
                          <Tooltip label="Sin clasificar. La lista cargada no traía el origen; hace falta definirlo antes de abrir una orden de producción.">
                            <Text size="sm" c="dimmed">
                              sin definir
                            </Text>
                          </Tooltip>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm">
                          {p.vida_util_meses ? `${p.vida_util_meses} m` : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          radius="sm"
                          color={p.activo ? 'estadoAprobado' : 'gray'}
                        >
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        )}
      </Paper>

      <Modal
        opened={abierto}
        onClose={modal.close}
        title={
          <Text fw={700}>
            {enEdicion
              ? `${enEdicion.codigo_interno} — ${enEdicion.nombre}`
              : 'Nuevo producto'}
          </Text>
        }
        size={enEdicion ? 'xl' : 'lg'}
      >
        {/* `key` fuerza a remontar al cambiar de ficha: sin eso Mantine
            conserva los valores iniciales de la anterior. */}
        <FormularioProducto
          key={enEdicion?.id ?? 'alta'}
          producto={enEdicion}
          onListo={modal.close}
        />
        {enEdicion ? (
          <Stack gap="sm" mt="xl">
            <Text fw={700} size="lg">
              Qué lleva cada unidad
            </Text>
            <MaterialesProducto productoId={enEdicion.id} />
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}

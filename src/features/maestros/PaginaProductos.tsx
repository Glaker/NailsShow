import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
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
import { Vacio } from '@/components/Vacio';
import {
  useActualizarProducto,
  useCrearProducto,
  useProductos,
  type Producto,
} from '@/lib/consultas';
import { etiquetaEnum } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';

const ORIGENES = ['FABRICADO', 'FRACCIONADO', 'IMPORTADO'] as const;

const esquema = z.object({
  codigo_interno: z.string().trim().min(1, 'Falta el código interno'),
  nombre: z.string().trim().min(2, 'Falta el nombre'),
  variedad: z.string().trim(),
  tipo: z.string().trim(),
  forma_cosmetica: z.string().trim(),
  /* Nullable: la lista cargada no traía el origen, y un 'FABRICADO' supuesto
     mandaría el producto al circuito de elaboración equivocado. */
  origen: z.enum(ORIGENES).nullable(),
  /* Nullable de verdad: un 0 sería un dato falso. Sin vida útil, el vencimiento
     del lote se completa después. */
  vida_util_meses: z.number().int().positive().nullable(),
  /* D-tiempo-envasado-1: solo se edita; el '' del NumberInput vacío cuenta como null. */
  minutos_envasado_unidad: z.preprocess(
    (v) => (v === '' ? null : v),
    z.number().positive().nullable(),
  ),
  personas_envasado: z.number().int().min(1).max(50),
  margen_envasado_pct: z.number().min(0).max(100),
  activo: z.boolean(),
});

type Valores = z.infer<typeof esquema>;

/**
 * Alta y edición de la ficha, en el mismo formulario. `producto` ausente =
 * alta; presente = edición de esa ficha.
 */
function FormularioProducto({
  producto,
  onListo,
}: {
  producto?: Producto | undefined;
  onListo: () => void;
}) {
  const crear = useCrearProducto();
  const actualizar = useActualizarProducto();
  const editando = Boolean(producto);
  /* D-tiempo-envasado-1: columnas de gmp.productos aún no en database.types.ts. */
  const tiempo = producto as unknown as
    | {
        minutos_envasado_unidad?: number | string | null;
        margen_envasado_pct?: number | string | null;
        personas_envasado?: number | null;
      }
    | undefined;
  const form = useForm<Valores>({
    mode: 'controlled',
    initialValues: {
      codigo_interno: producto?.codigo_interno ?? '',
      nombre: producto?.nombre ?? '',
      variedad: producto?.variedad ?? '',
      tipo: producto?.tipo ?? '',
      forma_cosmetica: producto?.forma_cosmetica ?? '',
      origen: (producto?.origen as Valores['origen']) ?? (producto ? null : 'FABRICADO'),
      vida_util_meses: producto?.vida_util_meses ?? null,
      minutos_envasado_unidad: tiempo?.minutos_envasado_unidad
        ? Number(tiempo.minutos_envasado_unidad)
        : null,
      personas_envasado: tiempo?.personas_envasado ?? 1,
      margen_envasado_pct:
        tiempo?.margen_envasado_pct != null ? Number(tiempo.margen_envasado_pct) : 10,
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
          tipo: v.tipo || null,
          forma_cosmetica: v.forma_cosmetica || null,
          origen: v.origen,
          vida_util_meses: v.vida_util_meses,
          activo: v.activo,
        };
        if (producto) {
          /* D-tiempo-envasado-1: mismo update; el cast cubre columnas no tipadas. */
          const minutos =
            typeof v.minutos_envasado_unidad === 'number'
              ? v.minutos_envasado_unidad
              : null;
          const cambios = {
            ...campos,
            minutos_envasado_unidad: minutos,
            personas_envasado: v.personas_envasado,
            margen_envasado_pct: v.margen_envasado_pct,
          } as unknown as Parameters<typeof actualizar.mutateAsync>[0]['cambios'];
          await actualizar.mutateAsync({ id: producto.id, cambios });
        } else {
          await crear.mutateAsync(campos);
        }
        onListo();
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
          {editando ? (
            <>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <NumberInput
                  label="Minutos de envasado por unidad"
                  description="Lo que tarda una persona en envasar una unidad"
                  placeholder="Opcional"
                  min={0}
                  decimalScale={2}
                  hideControls
                  {...form.getInputProps('minutos_envasado_unidad')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <NumberInput
                  label="Personas que envasan"
                  min={1}
                  max={50}
                  allowDecimal={false}
                  {...form.getInputProps('personas_envasado')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <NumberInput
                  label="Margen de seguridad"
                  suffix=" %"
                  min={0}
                  max={100}
                  {...form.getInputProps('margen_envasado_pct')}
                />
              </Grid.Col>
            </>
          ) : null}
        </Grid>

        {editando ? (
          <Switch
            label="Activo"
            description="Un producto no se borra, se desactiva."
            {...form.getInputProps('activo', { type: 'checkbox' })}
          />
        ) : null}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onListo}>
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
export function PaginaProductos() {
  const productos = useProductos();
  const [abierto, modal] = useDisclosure(false);
  const [enEdicion, setEnEdicion] = useState<Producto | undefined>();
  const [texto, setTexto] = useDebouncedState('', 250);
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
          <TextInput
            placeholder="Nombre, código o variedad"
            leftSection={<IconSearch size={17} />}
            defaultValue={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            w={{ base: '100%', sm: 360 }}
          />
        </Paper>
      ) : null}

      <Paper
        withBorder
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
        size="lg"
      >
        {/* `key` fuerza a remontar al cambiar de ficha: sin eso Mantine
            conserva los valores iniciales de la anterior. */}
        <FormularioProducto
          key={enEdicion?.id ?? 'alta'}
          producto={enEdicion}
          onListo={modal.close}
        />
      </Modal>
    </>
  );
}

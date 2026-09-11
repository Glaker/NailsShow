import { useMemo } from 'react';
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
import { useCrearProducto, useProductos } from '@/lib/consultas';
import { etiquetaEnum } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';

const ORIGENES = ['FABRICADO', 'FRACCIONADO', 'IMPORTADO'] as const;

const esquema = z.object({
  codigo_interno: z.string().trim().min(1, 'Falta el código interno'),
  nombre: z.string().trim().min(2, 'Falta el nombre'),
  variedad: z.string().trim(),
  tipo: z.string().trim(),
  forma_cosmetica: z.string().trim(),
  origen: z.enum(ORIGENES),
  /* Nullable de verdad: un 0 sería un dato falso. Sin vida útil, el vencimiento
     del lote se completa después. */
  vida_util_meses: z.number().int().positive().nullable(),
});

type Valores = z.infer<typeof esquema>;

function FormularioProducto({ onListo }: { onListo: () => void }) {
  const crear = useCrearProducto();
  const form = useForm<Valores>({
    mode: 'controlled',
    initialValues: {
      codigo_interno: '',
      nombre: '',
      variedad: '',
      tipo: '',
      forma_cosmetica: '',
      origen: 'FABRICADO',
      vida_util_meses: null,
    },
    validate: zod4Resolver(esquema),
  });

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        /* Los text vacíos van como null: un '' en la base no es un dato, es
           ruido que después hay que limpiar. */
        await crear.mutateAsync({
          codigo_interno: v.codigo_interno,
          nombre: v.nombre,
          variedad: v.variedad || null,
          tipo: v.tipo || null,
          forma_cosmetica: v.forma_cosmetica || null,
          origen: v.origen,
          vida_util_meses: v.vida_util_meses,
        });
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
              data={ORIGENES.map((o) => ({ value: o, label: etiquetaEnum(o) }))}
              allowDeselect={false}
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

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onListo}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={crear.isPending}
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
          >
            Agregar al catálogo
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
  const [texto, setTexto] = useDebouncedState('', 250);
  const puedeEditar = useTieneRol(
    'DIRECCION_TECNICA',
    'GERENCIA_PRODUCCION',
    'ADMINISTRADOR_SISTEMA',
  );

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
            <Button
              leftSection={<IconPlus size={18} />}
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              onClick={modal.open}
            >
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
                  onClick={modal.open}
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
                    <Table.Tr key={p.id}>
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
                          <Badge variant="light" radius="sm" color="violeta">
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
        title={<Text fw={700}>Nuevo producto</Text>}
        size="lg"
      >
        <FormularioProducto onListo={modal.close} />
      </Modal>
    </>
  );
}

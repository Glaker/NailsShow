import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Grid,
  Group,
  Modal,
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
import { useDisclosure, useDebouncedState } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  IconFileCheck,
  IconFlame,
  IconFlask,
  IconPlus,
  IconScale,
  IconSearch,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import {
  useActualizarInsumo,
  useCrearInsumo,
  useDepositos,
  useInsumos,
  type Insumo,
} from '@/lib/consultas';
import { etiquetaEnum } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';

const TIPOS = [
  'MATERIA_PRIMA',
  'MATERIAL_ENVASE',
  'MATERIAL_EMPAQUE',
  'ETIQUETA',
  'SEMIELABORADO',
] as const;

const esquema = z.object({
  codigo_interno: z.string().trim().min(1, 'Falta el código interno'),
  nombre: z.string().trim().min(2, 'Falta el nombre'),
  tipo: z.enum(TIPOS),
  /* Puede quedar vacía: significa «pendiente de confirmación en planta», y
     mientras lo esté la base rechaza recepcionar este insumo. Un valor
     inventado sería peor que el hueco. */
  unidad_medida: z.string().trim(),
  es_inflamable: z.boolean(),
  requiere_protocolo: z.boolean(),
  requiere_pesada_recepcion: z.boolean(),
  deposito_cuarentena_id: z.string().nullable(),
  deposito_aprobado_id: z.string().nullable(),
  activo: z.boolean(),
});

type ValoresInsumo = z.infer<typeof esquema>;

/**
 * Alta y edición de la ficha, en el mismo formulario.
 *
 * `insumo` ausente = alta. Presente = edición de esa ficha. Son el mismo
 * conjunto de campos y las mismas reglas, así que separarlos en dos
 * componentes sería duplicar para que después se desincronicen.
 */
function FormularioInsumo({
  insumo,
  onListo,
}: {
  insumo?: Insumo | undefined;
  onListo: () => void;
}) {
  const crear = useCrearInsumo();
  const actualizar = useActualizarInsumo();
  const depositos = useDepositos();
  const editando = Boolean(insumo);

  const form = useForm<ValoresInsumo>({
    mode: 'controlled',
    initialValues: {
      codigo_interno: insumo?.codigo_interno ?? '',
      nombre: insumo?.nombre ?? '',
      tipo: insumo?.tipo ?? 'MATERIA_PRIMA',
      unidad_medida: insumo?.unidad_medida ?? (insumo ? '' : 'kg'),
      es_inflamable: insumo?.es_inflamable ?? false,
      /* I.20.1 paso 5 exige protocolo en materia prima: se propone marcado y se
         puede desmarcar, no al revés. */
      requiere_protocolo: insumo?.requiere_protocolo ?? true,
      requiere_pesada_recepcion: insumo?.requiere_pesada_recepcion ?? false,
      deposito_cuarentena_id: insumo?.deposito_cuarentena_id ?? null,
      deposito_aprobado_id: insumo?.deposito_aprobado_id ?? null,
      activo: insumo?.activo ?? true,
    },
    validate: zod4Resolver(esquema),
  });

  const opcionesDeposito = (depositos.data ?? []).map((d) => ({
    value: d.id,
    label: `${d.numero} — ${d.nombre}`,
  }));

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        /* La unidad vacía va como null: '' en la base no es «sin unidad»,
           es ruido que después hay que limpiar. */
        const campos = { ...v, unidad_medida: v.unidad_medida || null };
        if (insumo) {
          await actualizar.mutateAsync({ id: insumo.id, cambios: campos });
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
              placeholder="MP-0001"
              description={
                editando
                  ? 'Se congela en cuanto el insumo tenga lotes o stock.'
                  : undefined
              }
              {...form.getInputProps('codigo_interno')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput
              label="Nombre"
              placeholder="Nitrocelulosa E 1/2 s"
              {...form.getInputProps('nombre')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <Select
              label="Tipo"
              data={TIPOS.map((t) => ({ value: t, label: etiquetaEnum(t) }))}
              allowDeselect={false}
              {...form.getInputProps('tipo')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Unidad de medida"
              placeholder="g, kg, unidad…"
              description="Vacía = pendiente. Sin unidad no se puede recepcionar."
              {...form.getInputProps('unidad_medida')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Depósito de cuarentena"
              placeholder="Sin asignar"
              data={opcionesDeposito}
              clearable
              searchable
              {...form.getInputProps('deposito_cuarentena_id')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Depósito de aprobados"
              placeholder="Sin asignar"
              data={opcionesDeposito}
              clearable
              searchable
              {...form.getInputProps('deposito_aprobado_id')}
            />
          </Grid.Col>
        </Grid>

        <Stack gap="sm">
          <Switch
            label="Exige protocolo de análisis del fabricante"
            description="RN-01 · I.20.1 paso 5. Sin protocolo, la base rechaza la recepción."
            {...form.getInputProps('requiere_protocolo', { type: 'checkbox' })}
          />
          <Switch
            label="Se pesa durante la recepción"
            description="RN-03 · pigmentos y similares"
            {...form.getInputProps('requiere_pesada_recepcion', { type: 'checkbox' })}
          />
          <Switch
            label="Inflamable"
            description="RN-48 · va al depósito exterior certificado (I.20.6)"
            {...form.getInputProps('es_inflamable', { type: 'checkbox' })}
          />
          {editando ? (
            <Switch
              label="Activo"
              description="Un insumo no se borra, se desactiva. Los registros que lo citan quedan intactos."
              {...form.getInputProps('activo', { type: 'checkbox' })}
            />
          ) : null}
        </Stack>

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onListo}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={crear.isPending || actualizar.isPending}
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
          >
            {editando ? 'Guardar cambios' : 'Agregar al catálogo'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * Catálogo de insumos.
 *
 * Los tres interruptores de cada ficha —protocolo, pesada, inflamable— no son
 * atributos descriptivos: son los que activan RN-01, RN-03 y RN-48 en la
 * recepción. Por eso se muestran como distintivos en la tabla y no escondidos
 * en el detalle.
 */
export function PaginaInsumos() {
  const insumos = useInsumos();
  const [abierto, modal] = useDisclosure(false);
  /* `undefined` = el modal está dando de alta. Con una ficha = la está
     editando. Un solo estado para los dos casos, que son el mismo formulario. */
  const [enEdicion, setEnEdicion] = useState<Insumo | undefined>();
  const [busqueda, setBusqueda] = useDebouncedState('', 200);
  const puedeEditar = useTieneRol(
    'DIRECCION_TECNICA',
    'GERENCIA_PRODUCCION',
    'ADMINISTRADOR_SISTEMA',
  );

  const abrirAlta = () => {
    setEnEdicion(undefined);
    modal.open();
  };

  const abrirEdicion = (insumo: Insumo) => {
    if (!puedeEditar) return;
    setEnEdicion(insumo);
    modal.open();
  };

  /* El catálogo pasa los 300 ítems: sin buscador la tabla es una pared y la
     edición por fila queda inservible. */
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const todos = insumos.data ?? [];
    if (!q) return todos;
    return todos.filter(
      (i) =>
        i.nombre.toLowerCase().includes(q) || i.codigo_interno.toLowerCase().includes(q),
    );
  }, [insumos.data, busqueda]);

  return (
    <>
      <EncabezadoPagina
        titulo="Catálogo de insumos"
        descripcion="Cada ficha define el circuito del material: qué exige al recibirlo y a qué depósito va."
        acciones={
          puedeEditar ? (
            <Button
              leftSection={<IconPlus size={18} />}
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              onClick={abrirAlta}
            >
              Nuevo insumo
            </Button>
          ) : null
        }
      />

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {insumos.isLoading ? (
          <Skeleton h={260} />
        ) : (insumos.data ?? []).length === 0 ? (
          <Vacio
            icono={IconFlask}
            titulo="El catálogo está vacío"
            descripcion="Cargá los insumos que la planta recibe. Sin catálogo no se puede registrar una recepción."
            accion={
              puedeEditar ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={abrirAlta}
                >
                  Nuevo insumo
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <TextInput
              placeholder="Buscar por nombre o código"
              leftSection={<IconSearch size={16} />}
              defaultValue={busqueda}
              onChange={(e) => setBusqueda(e.currentTarget.value)}
              styles={{ input: { border: 'none' } }}
            />
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Unidad</Table.Th>
                    <Table.Th>Circuito</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filtrados.map((i) => (
                    <Table.Tr
                      key={i.id}
                      onClick={() => abrirEdicion(i)}
                      style={puedeEditar ? { cursor: 'pointer' } : undefined}
                    >
                      <Table.Td>
                        <Text size="sm" ff="monospace" fw={600}>
                          {i.codigo_interno}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{i.nombre}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{etiquetaEnum(i.tipo)}</Text>
                      </Table.Td>
                      <Table.Td>
                        {i.unidad_medida ? (
                          <Text size="sm">{i.unidad_medida}</Text>
                        ) : (
                          <Tooltip label="Pendiente de confirmación en planta. Sin unidad no se puede recepcionar este insumo.">
                            <Text size="sm" c="dimmed">
                              sin definir
                            </Text>
                          </Tooltip>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          {i.requiere_protocolo ? (
                            <Tooltip label="RN-01: exige protocolo de análisis">
                              <IconFileCheck
                                size={17}
                                color="var(--mantine-color-violeta-6)"
                              />
                            </Tooltip>
                          ) : null}
                          {i.requiere_pesada_recepcion ? (
                            <Tooltip label="RN-03: se pesa en la recepción">
                              <IconScale
                                size={17}
                                color="var(--mantine-color-violeta-6)"
                              />
                            </Tooltip>
                          ) : null}
                          {i.es_inflamable ? (
                            <Tooltip label="RN-48: depósito exterior de inflamables">
                              <IconFlame
                                size={17}
                                color="var(--mantine-color-estadoRechazado-6)"
                              />
                            </Tooltip>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          radius="sm"
                          color={i.activo ? 'estadoAprobado' : 'gray'}
                        >
                          {i.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {filtrados.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                Ningún insumo coincide con «{busqueda}».
              </Text>
            ) : null}
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
              : 'Nuevo insumo'}
          </Text>
        }
        size="lg"
      >
        {/* `key` fuerza a remontar el formulario al cambiar de ficha: sin eso
            Mantine conserva los valores iniciales de la ficha anterior. */}
        <FormularioInsumo
          key={enEdicion?.id ?? 'alta'}
          insumo={enEdicion}
          onListo={modal.close}
        />
      </Modal>
    </>
  );
}

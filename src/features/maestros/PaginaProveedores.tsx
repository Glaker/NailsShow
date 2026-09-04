import {
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  IconAddressBook,
  IconCircleCheck,
  IconCircleX,
  IconPlus,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import {
  useCrearProveedor,
  useDictaminarProveedor,
  useProveedores,
} from '@/lib/consultas';
import { fechaHora } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';

const esquema = z.object({
  razon_social: z.string().trim().min(2, 'Falta la razón social'),
  /* El CHECK de la base exige 11 dígitos exactos, sin guiones. */
  cuit: z
    .string()
    .trim()
    .regex(/^$|^[0-9]{11}$/, 'El CUIT son 11 dígitos, sin guiones'),
  contacto_nombre: z.string(),
  contacto_telefono: z.string(),
  contacto_email: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || z.string().email().safeParse(v).success,
      'Correo inválido',
    ),
  domicilio: z.string(),
});

const COLOR_ESTADO = {
  PENDIENTE: 'gray',
  APROBADO: 'estadoAprobado',
  RECHAZADO: 'estadoRechazado',
} as const;

function FormularioProveedor({ onListo }: { onListo: () => void }) {
  const crear = useCrearProveedor();
  const form = useForm({
    mode: 'controlled',
    initialValues: {
      razon_social: '',
      cuit: '',
      contacto_nombre: '',
      contacto_telefono: '',
      contacto_email: '',
      domicilio: '',
    },
    validate: zod4Resolver(esquema),
  });

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        await crear.mutateAsync({
          razon_social: v.razon_social.trim(),
          cuit: v.cuit.trim() || null,
          contacto_nombre: v.contacto_nombre.trim() || null,
          contacto_telefono: v.contacto_telefono.trim() || null,
          contacto_email: v.contacto_email.trim() || null,
          domicilio: v.domicilio.trim() || null,
        });
        onListo();
      })}
    >
      <Stack gap="md">
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput label="Razón social" {...form.getInputProps('razon_social')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="CUIT"
              placeholder="30712345678"
              {...form.getInputProps('cuit')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Contacto" {...form.getInputProps('contacto_nombre')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Teléfono" {...form.getInputProps('contacto_telefono')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Correo" {...form.getInputProps('contacto_email')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Domicilio" {...form.getInputProps('domicilio')} />
          </Grid.Col>
        </Grid>

        <Text size="xs" c="dimmed">
          El proveedor queda pendiente de aprobación. Solo Dirección Técnica puede
          aprobarlo o rechazarlo (§3.3).
        </Text>

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
            Dar de alta
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function PaginaProveedores() {
  const proveedores = useProveedores();
  const dictaminar = useDictaminarProveedor();
  const [abierto, modal] = useDisclosure(false);
  const puedeAlta = useTieneRol(
    'DIRECCION_TECNICA',
    'ADMINISTRACION',
    'GERENCIA_PRODUCCION',
  );
  const puedeDictaminar = useTieneRol('DIRECCION_TECNICA');

  const confirmar = (id: string, razon: string, estado: 'APROBADO' | 'RECHAZADO') => {
    let observaciones = '';
    modals.openConfirmModal({
      title: (
        <Text fw={700}>{estado === 'APROBADO' ? 'Aprobar' : 'Rechazar'} proveedor</Text>
      ),
      children: (
        <Stack gap="sm">
          <Text size="sm">
            {razon} queda {estado === 'APROBADO' ? 'aprobado' : 'rechazado'} con tu firma
            y la fecha de hoy.
          </Text>
          <Textarea
            label="Observaciones"
            placeholder="Fundamento del dictamen"
            autosize
            minRows={2}
            onChange={(e) => {
              observaciones = e.currentTarget.value;
            }}
          />
        </Stack>
      ),
      labels: {
        confirm: estado === 'APROBADO' ? 'Aprobar' : 'Rechazar',
        cancel: 'Cancelar',
      },
      confirmProps: { color: estado === 'APROBADO' ? 'violeta' : 'estadoRechazado' },
      onConfirm: () =>
        dictaminar.mutate({ id, estado, observaciones: observaciones || null }),
    });
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="Alta de proveedores y dictamen de aprobación. La aprobación es competencia exclusiva de Dirección Técnica."
        acciones={
          puedeAlta ? (
            <Button
              leftSection={<IconPlus size={18} />}
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              onClick={modal.open}
            >
              Nuevo proveedor
            </Button>
          ) : null
        }
      />

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {proveedores.isLoading ? (
          <Skeleton h={240} />
        ) : (proveedores.data ?? []).length === 0 ? (
          <Vacio
            icono={IconAddressBook}
            titulo="No hay proveedores cargados"
            descripcion="Una recepción necesita un proveedor. Empezá por acá."
            accion={
              puedeAlta ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={modal.open}
                >
                  Nuevo proveedor
                </Button>
              ) : null
            }
          />
        ) : (
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Razón social</Table.Th>
                  <Table.Th>CUIT</Table.Th>
                  <Table.Th>Contacto</Table.Th>
                  <Table.Th>Aprobación</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(proveedores.data ?? []).map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {p.razon_social}
                      </Text>
                      {p.domicilio ? (
                        <Text size="xs" c="dimmed">
                          {p.domicilio}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {p.cuit ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.contacto_nombre ?? '—'}</Text>
                      <Text size="xs" c="dimmed">
                        {p.contacto_telefono ?? p.contacto_email ?? ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        radius="sm"
                        color={COLOR_ESTADO[p.estado_aprobacion]}
                      >
                        {p.estado_aprobacion.toLowerCase()}
                      </Badge>
                      {p.aprobado_en ? (
                        <Text size="xs" c="dimmed">
                          {fechaHora(p.aprobado_en)}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {puedeDictaminar && p.estado_aprobacion === 'PENDIENTE' ? (
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            size="xs"
                            variant="light"
                            color="estadoAprobado"
                            leftSection={<IconCircleCheck size={15} />}
                            onClick={() => confirmar(p.id, p.razon_social, 'APROBADO')}
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="estadoRechazado"
                            leftSection={<IconCircleX size={15} />}
                            onClick={() => confirmar(p.id, p.razon_social, 'RECHAZADO')}
                          >
                            Rechazar
                          </Button>
                        </Group>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal
        opened={abierto}
        onClose={modal.close}
        title={<Text fw={700}>Nuevo proveedor</Text>}
        size="lg"
      >
        <FormularioProveedor onListo={modal.close} />
      </Modal>
    </>
  );
}

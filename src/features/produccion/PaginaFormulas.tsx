import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Anchor,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconFlask, IconPlus } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useCrearFormula, useFormulasFabricacion, useProductos } from '@/lib/consultas';
import { useTieneRol } from '@/features/auth/sesion';
import { BadgeEstadoFormula } from './estadoFormula';

const esquema = z.object({
  producto_id: z.string().min(1, 'Elegí un producto'),
  variedad: z.string().trim(),
  codigo_me: z.string().trim(),
  version: z.string().trim().min(1, 'Falta la versión'),
});

type Valores = z.infer<typeof esquema>;

/** Alta de una fórmula nueva: arranca siempre en BORRADOR (RN implícita del CHECK de la base). */
function FormularioNuevaFormula({ onListo }: { onListo: (id: string) => void }) {
  const productos = useProductos();
  const crear = useCrearFormula();
  const form = useForm<Valores>({
    initialValues: { producto_id: '', variedad: '', codigo_me: '', version: '1' },
    validate: zod4Resolver(esquema),
  });

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        const f = await crear.mutateAsync({
          productoId: v.producto_id,
          variedad: v.variedad || null,
          codigoMe: v.codigo_me || null,
          version: v.version,
        });
        onListo(f.id);
      })}
    >
      <Stack gap="md">
        <Select
          label="Producto"
          withAsterisk
          placeholder="Elegí el producto terminado"
          searchable
          data={(productos.data ?? []).map((p) => ({
            value: p.id,
            label: `${p.nombre}${p.variedad ? ` — ${p.variedad}` : ''} (${p.codigo_interno})`,
          }))}
          {...form.getInputProps('producto_id')}
        />
        <TextInput
          label="Variedad"
          placeholder="Opcional: color, terminación, línea"
          description="Distingue dos fórmulas del mismo producto base."
          {...form.getInputProps('variedad')}
        />
        <TextInput
          label="Código ME"
          placeholder="Opcional"
          description="Código interno de la fórmula maestra, si ya está asignado."
          {...form.getInputProps('codigo_me')}
        />
        <TextInput
          label="Versión"
          withAsterisk
          description="v1 para la primera fórmula de este producto y variedad. Una fórmula vigente no se edita: la corrección es una versión nueva."
          {...form.getInputProps('version')}
        />

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={() => form.reset()}>
            Limpiar
          </Button>
          <Button
            type="submit"
            loading={crear.isPending}
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
          >
            Crear en borrador
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * Listado de fórmulas de fabricación, agrupadas por producto (PG.60.8).
 *
 * Solo Dirección Técnica da de alta o edita: §3.3 reserva la fórmula maestra a
 * ese rol, y la política `formulas_escribe_dt` la hace cumplir en la base. El
 * resto de los roles ve la lista en modo lectura, que es lo que necesitan para
 * saber qué fórmula está vigente antes de pesar un lote.
 */
export function PaginaFormulas() {
  const formulas = useFormulasFabricacion();
  const [abierto, modal] = useDisclosure(false);
  const puedeEditar = useTieneRol('DIRECCION_TECNICA');
  const navegar = useNavigate();

  const alCrear = (id: string) => {
    modal.close();
    void navegar(`/formulas/${id}`);
  };

  const grupos = useMemo(() => {
    const filas = formulas.data ?? [];
    const mapa = new Map<string, { nombre: string; filas: typeof filas }>();
    for (const f of filas) {
      const clave = f.producto_id;
      const nombre = f.producto?.nombre ?? '(producto sin nombre)';
      if (!mapa.has(clave)) mapa.set(clave, { nombre, filas: [] });
      mapa.get(clave)!.filas.push(f);
    }
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [formulas.data]);

  return (
    <>
      <EncabezadoPagina
        titulo="Fórmulas de fabricación"
        descripcion="Fórmula maestra en %P/P (PG.60.8), por producto. La calculadora de lote explota la que elijas."
        acciones={
          puedeEditar ? (
            <Button
              leftSection={<IconPlus size={18} />}
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              onClick={modal.open}
            >
              Nueva fórmula
            </Button>
          ) : null
        }
      />

      {formulas.isLoading ? (
        <Skeleton h={260} />
      ) : grupos.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconFlask}
            titulo="Todavía no hay fórmulas cargadas"
            descripcion="Dirección Técnica carga acá la fórmula maestra de cada producto: el punto de partida de la calculadora de lote."
            accion={
              puedeEditar ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={modal.open}
                >
                  Nueva fórmula
                </Button>
              ) : null
            }
          />
        </Paper>
      ) : (
        <Stack gap="md">
          {grupos.map((g) => (
            <Paper
              key={g.nombre}
              withBorder
              style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
            >
              <Group px="md" pt="md" pb="xs">
                <Title order={3}>{g.nombre}</Title>
              </Group>
              <Table.ScrollContainer minWidth={640}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Variedad</Table.Th>
                      <Table.Th>Versión</Table.Th>
                      <Table.Th>Código ME</Table.Th>
                      <Table.Th>Estado</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {g.filas.map((f) => (
                      <Table.Tr key={f.id}>
                        <Table.Td>
                          <Anchor
                            component={Link}
                            to={`/formulas/${f.id}`}
                            size="sm"
                            fw={600}
                          >
                            {f.variedad ?? '(sin variedad)'}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" ff="monospace">
                            v{f.version}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {f.codigo_me ?? '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <BadgeEstadoFormula estado={f.estado} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          ))}
        </Stack>
      )}

      <Modal
        opened={abierto}
        onClose={modal.close}
        title={<Text fw={700}>Nueva fórmula</Text>}
      >
        <FormularioNuevaFormula onListo={alCrear} />
      </Modal>
    </>
  );
}

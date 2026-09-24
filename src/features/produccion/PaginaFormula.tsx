import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  NumberInput,
  Paper,
  Radio,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconArrowLeft, IconPlus, IconTrash } from '@tabler/icons-react';
import {
  useActualizarFormula,
  useCrearComponenteFormula,
  useDensidadesReferencia,
  useEliminarComponenteFormula,
  useFormulaCompleta,
  useInsumos,
  type FormulaComponenteRow,
  type FormulaFabricacionRow,
} from '@/lib/consultas';
import { numero } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';
import { BadgeEstadoFormula } from './estadoFormula';

const esquemaComponente = z
  .object({
    origen: z.enum(['CATALOGO', 'LIBRE']),
    insumo_id: z.string().nullable(),
    nombre_libre: z.string().trim(),
    es_csp: z.boolean(),
    porcentaje_pp: z.number().nullable(),
    se_mide_a_volumen: z.boolean(),
    densidad_id: z.string().nullable(),
    etapa: z.string().trim(),
  })
  .refine((v) => (v.origen === 'CATALOGO' ? Boolean(v.insumo_id) : v.nombre_libre.length > 0), {
    message: 'Elegí un insumo del catálogo o escribí un nombre',
    path: ['insumo_id'],
  })
  .refine((v) => v.es_csp || (v.porcentaje_pp !== null && v.porcentaje_pp > 0), {
    message: 'Falta el % P/P (o marcá que es el csp)',
    path: ['porcentaje_pp'],
  })
  .refine((v) => !v.se_mide_a_volumen || Boolean(v.densidad_id), {
    message: 'Se carga con probeta: elegí la densidad, sin ella no se puede calcular el volumen',
    path: ['densidad_id'],
  });

type ValoresComponente = z.infer<typeof esquemaComponente>;

/**
 * Alta de un componente, uno por vez.
 *
 * Sin validación de suma acá: la base solo exige que la suma cierre en 100 %
 * (con o sin csp) al pasar a VIGENTE (`gmp.fn_formula_coherente`), no en cada
 * INSERT. Mientras se carga, un borrador a medio completar es un estado
 * legítimo — el resumen de arriba es el que avisa si todavía no cierra.
 */
function FormularioComponente({
  formulaId,
  proximoOrden,
  hayCsp,
  onListo,
}: {
  formulaId: string;
  proximoOrden: number;
  hayCsp: boolean;
  onListo: () => void;
}) {
  const insumos = useInsumos();
  const densidades = useDensidadesReferencia();
  const crear = useCrearComponenteFormula();

  const form = useForm<ValoresComponente>({
    initialValues: {
      origen: 'CATALOGO',
      insumo_id: null,
      nombre_libre: '',
      es_csp: false,
      porcentaje_pp: null,
      se_mide_a_volumen: false,
      densidad_id: null,
      etapa: '',
    },
    validate: zod4Resolver(esquemaComponente),
  });

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        await crear.mutateAsync({
          formulaId,
          orden: proximoOrden,
          insumoId: v.origen === 'CATALOGO' ? v.insumo_id : null,
          nombreLibre: v.origen === 'LIBRE' ? v.nombre_libre : null,
          porcentajePP: v.es_csp ? null : v.porcentaje_pp,
          esCsp: v.es_csp,
          seMideAVolumen: v.se_mide_a_volumen,
          // La densidad se guarda aunque se pese: con ella la calculadora
          // informa el volumen de cada componente a la temperatura del lote.
          densidadId: v.densidad_id,
          etapa: v.etapa || null,
        });
        form.reset();
        onListo();
      })}
    >
      <Stack gap="sm">
        <Radio.Group
          label="Cómo se identifica"
          {...form.getInputProps('origen')}
        >
          <Group gap="lg" mt={4}>
            <Radio value="CATALOGO" label="Insumo del catálogo" />
            <Radio value="LIBRE" label="Nombre libre (todavía sin catalogar)" />
          </Group>
        </Radio.Group>

        {form.values.origen === 'CATALOGO' ? (
          <Select
            label="Insumo"
            withAsterisk
            searchable
            placeholder="Buscar por nombre o código"
            data={(insumos.data ?? []).map((i) => ({
              value: i.id,
              label: `${i.nombre} (${i.codigo_interno})`,
            }))}
            {...form.getInputProps('insumo_id')}
            onChange={(id) => {
              form.setFieldValue('insumo_id', id);
              // Precarga la densidad del insumo (alcohol isopropílico → IPA,
              // acetato de butilo → acetato de n-butilo). Se puede cambiar.
              const insumo = (insumos.data ?? []).find((i) => i.id === id);
              form.setFieldValue('densidad_id', insumo?.densidad_referencia_id ?? null);
            }}
          />
        ) : (
          <TextInput
            label="Nombre"
            withAsterisk
            placeholder="Nombre del componente"
            {...form.getInputProps('nombre_libre')}
          />
        )}

        <Grid gutter="sm" align="flex-end">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Checkbox
              label="Es el componente csp (completa al 100 %)"
              disabled={hayCsp}
              description={hayCsp ? 'Ya hay un csp cargado en esta fórmula.' : undefined}
              {...form.getInputProps('es_csp', { type: 'checkbox' })}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="% P/P"
              disabled={form.values.es_csp}
              placeholder={form.values.es_csp ? 'Se calcula por diferencia' : undefined}
              min={0}
              max={100}
              decimalScale={6}
              hideControls
              {...form.getInputProps('porcentaje_pp')}
            />
          </Grid.Col>
        </Grid>

        <Checkbox
          label="Se mide a volumen (probeta), no a masa"
          {...form.getInputProps('se_mide_a_volumen', { type: 'checkbox' })}
        />

        {/* Siempre visible: la densidad no es solo para lo que se mide con
            probeta, es la que convierte la masa de cada componente en su
            volumen a la temperatura del lote. */}
        {form.values.origen === 'CATALOGO' || form.values.se_mide_a_volumen ? (
          <Select
            label="Densidad del componente"
            description="Viene la del insumo, si tiene. Con ella la calculadora da el volumen de este componente a la temperatura del lote."
            withAsterisk={form.values.se_mide_a_volumen}
            searchable
            clearable
            placeholder="Sin densidad: se informa solo la masa"
            data={(densidades.data ?? []).map((d) => ({
              value: d.id,
              label: `${d.nombre} — ${numero(d.densidad_ref, 5)} g/mL a ${numero(d.temp_ref_c, 1)} °C${d.fuente === 'LITERATURA' ? ' (literatura)' : ''}`,
            }))}
            nothingFoundMessage="No hay densidades de referencia cargadas"
            {...form.getInputProps('densidad_id')}
          />
        ) : null}

        <TextInput
          label="Etapa"
          placeholder="Opcional: fase de carga, si corresponde"
          {...form.getInputProps('etapa')}
        />

        <Group justify="flex-end">
          <Button
            type="submit"
            loading={crear.isPending}
            leftSection={<IconPlus size={16} />}
            variant="light"
          >
            Agregar componente
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/** Resumen en vivo de cómo cierra la fórmula, antes de intentar guardar. */
function ResumenPorcentajes({ componentes }: { componentes: FormulaComponenteRow[] }) {
  const declarados = componentes.filter((c) => !c.es_csp);
  const suma = declarados.reduce((a, c) => a + (c.porcentaje_pp ?? 0), 0);
  const csp = componentes.find((c) => c.es_csp) ?? null;
  const restante = 100 - suma;

  return (
    <Paper withBorder p="sm" radius="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm">
          Declarado sin csp: <b>{numero(suma, 4)} %</b>
        </Text>
        {csp ? (
          <Text size="sm">
            csp «{csp.insumo?.nombre ?? csp.nombre_libre}»: le quedan{' '}
            <b>{numero(restante, 4)} %</b>
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Sin componente csp
          </Text>
        )}
      </Group>
      {csp && restante < 0 ? (
        <Text size="xs" c="estadoRechazado.7" mt={4}>
          Los demás componentes ya suman más de 100 %: al csp no le queda nada. La base va a
          rechazar el paso a vigente.
        </Text>
      ) : null}
      {!csp && Math.abs(suma - 100) > 1e-4 ? (
        <Text size="xs" c="estadoEnAnalisis.7" mt={4}>
          Sin csp, la suma tiene que dar exactamente 100 % para poder pasar a vigente.
        </Text>
      ) : null}
    </Paper>
  );
}

/**
 * Densidad del producto terminado y su temperatura de referencia.
 *
 * Componente propio, montado con `key={formula.id}`: así el estado local del
 * input arranca una sola vez desde el valor cargado, sin un `useEffect` de
 * sincronización ni un `setState` en medio del render.
 */
function PanelDensidadProducto({
  formula,
  editable,
}: {
  formula: FormulaFabricacionRow;
  editable: boolean;
}) {
  const actualizar = useActualizarFormula();
  const [densidadProducto, setDensidadProducto] = useState<number | ''>(
    formula.densidad_producto ?? '',
  );
  const [densidadTempC, setDensidadTempC] = useState<number | ''>(
    formula.densidad_temp_c ?? 20,
  );

  const cambio =
    densidadProducto !== (formula.densidad_producto ?? '') ||
    densidadTempC !== (formula.densidad_temp_c ?? 20);

  return (
    <Paper withBorder p="md" mb="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Title order={3} mb="sm">
        Densidad del producto terminado
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Es el único dato que convierte un volumen objetivo del lote en una masa (I.50.25).
        Obligatorio antes de poder marcar la fórmula como vigente.
      </Text>
      <Grid gutter="sm" align="flex-end">
        <Grid.Col span={{ base: 12, sm: 4 }}>
          {editable ? (
            <NumberInput
              label="Densidad (g/mL)"
              withAsterisk
              min={0}
              decimalScale={5}
              hideControls
              value={densidadProducto}
              onChange={(v) => setDensidadProducto(typeof v === 'number' ? v : '')}
            />
          ) : (
            <Stack gap={0}>
              <Text size="xs" c="dimmed" fw={500}>
                Densidad (g/mL)
              </Text>
              <Text size="sm" fw={600}>
                {formula.densidad_producto === null
                  ? '— sin cargar'
                  : numero(formula.densidad_producto, 5)}
              </Text>
            </Stack>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          {editable ? (
            <NumberInput
              label="Temperatura de referencia (°C)"
              decimalScale={1}
              hideControls
              value={densidadTempC}
              onChange={(v) => setDensidadTempC(typeof v === 'number' ? v : '')}
            />
          ) : (
            <Stack gap={0}>
              <Text size="xs" c="dimmed" fw={500}>
                Temperatura de referencia (°C)
              </Text>
              <Text size="sm" fw={600}>
                {numero(formula.densidad_temp_c ?? 20, 1)}
              </Text>
            </Stack>
          )}
        </Grid.Col>
        {editable ? (
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Button
              variant="light"
              disabled={!cambio}
              loading={actualizar.isPending}
              onClick={() =>
                actualizar.mutate({
                  id: formula.id,
                  cambios: {
                    densidad_producto: densidadProducto === '' ? null : densidadProducto,
                    densidad_temp_c: densidadTempC === '' ? null : densidadTempC,
                  },
                })
              }
            >
              Guardar
            </Button>
          </Grid.Col>
        ) : null}
      </Grid>
    </Paper>
  );
}

/**
 * Ficha de una fórmula de fabricación: datos generales, componentes, y el
 * paso a vigente.
 *
 * Solo Dirección Técnica escribe (§3.3, políticas `formulas_actualiza_dt` y
 * `componentes_escribe_dt`/`_borra_dt`). El resto de los roles ve la misma
 * pantalla sin ningún control de escritura, no una versión reducida: los
 * datos son los mismos, lo que cambia es si hay botón.
 */
export function PaginaFormula() {
  const { id } = useParams();
  const datos = useFormulaCompleta(id);
  const actualizar = useActualizarFormula();
  const eliminarComponente = useEliminarComponenteFormula();
  const puedeEditar = useTieneRol('DIRECCION_TECNICA');

  const f = datos.data?.formula;
  const componentes = useMemo(() => datos.data?.componentes ?? [], [datos.data]);

  if (datos.isLoading) {
    return <Skeleton h={420} radius="lg" />;
  }

  if (datos.isError || !f) {
    return (
      <Alert color="red" variant="light" radius="md">
        No se encontró la fórmula, o tu rol no tiene permiso para verla.
      </Alert>
    );
  }

  const formulaId = f.id;
  const editableBorrador = puedeEditar && f.estado === 'BORRADOR';
  const proximoOrden =
    componentes.length === 0 ? 1 : Math.max(...componentes.map((c) => c.orden)) + 1;
  const hayCsp = componentes.some((c) => c.es_csp);
  const puedeMarcarVigente = editableBorrador && f.densidad_producto !== null;

  const confirmarVigente = () => {
    modals.openConfirmModal({
      title: <Text fw={700}>Marcar como vigente</Text>,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            {f.producto?.nombre ?? '(producto sin nombre)'}
            {f.variedad ? ` — ${f.variedad}` : ''} · versión {f.version} va a quedar como la
            fórmula oficial para pesar lotes.
          </Text>
          <Alert color="estadoEnAnalisis" variant="light" radius="md">
            Una fórmula vigente no se puede editar: la corrección se hace emitiendo una versión
            nueva. Esta acción no se puede deshacer.
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Marcar como vigente', cancel: 'Cancelar' },
      confirmProps: { color: 'estadoAprobado' },
      onConfirm: () => actualizar.mutate({ id: formulaId, cambios: { estado: 'VIGENTE' } }),
    });
  };

  return (
    <>
      <Anchor component={Link} to="/formulas" size="sm" mb="sm">
        <Group gap={4}>
          <IconArrowLeft size={15} />
          Volver a fórmulas
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md" mb="lg">
        <Stack gap={4}>
          <Group gap="sm">
            <Title order={1}>
              {f.producto?.nombre ?? '(producto sin nombre)'}
              {f.variedad ? ` — ${f.variedad}` : ''}
            </Title>
            <BadgeEstadoFormula estado={f.estado} />
          </Group>
          <Text c="dimmed" size="sm">
            Versión {f.version}
            {f.codigo_me ? ` · código ME ${f.codigo_me}` : ''}
          </Text>
        </Stack>

        {editableBorrador ? (
          <Tooltip
            label="Cargá la densidad del producto terminado antes de pasar a vigente."
            disabled={puedeMarcarVigente}
          >
            <Button
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              disabled={!puedeMarcarVigente}
              onClick={confirmarVigente}
            >
              Marcar como vigente
            </Button>
          </Tooltip>
        ) : null}
      </Group>

      {!puedeEditar ? (
        <Alert color="violeta" variant="light" radius="md" mb="md">
          Estás viendo esta fórmula en modo lectura: solo Dirección Técnica la edita (§3.3).
        </Alert>
      ) : f.estado !== 'BORRADOR' ? (
        <Alert color="estadoEnAnalisis" variant="light" radius="md" mb="md">
          Esta fórmula está {f.estado === 'VIGENTE' ? 'vigente' : 'dada de baja'} y no se edita.
          Para corregirla, emitir una versión nueva desde «Nueva fórmula».
        </Alert>
      ) : null}

      <PanelDensidadProducto key={f.id} formula={f} editable={editableBorrador} />

      <ResumenPorcentajes componentes={componentes} />

      <Paper
        withBorder
        mt="md"
        mb={editableBorrador ? 0 : 'md'}
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Componente</Table.Th>
                <Table.Th ta="right">% P/P</Table.Th>
                <Table.Th>Se mide a</Table.Th>
                <Table.Th>Etapa</Table.Th>
                {editableBorrador ? <Table.Th w={48} /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {componentes.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={editableBorrador ? 5 : 4}>
                    <Text size="sm" c="dimmed" py="md" ta="center">
                      Todavía no se cargó ningún componente.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                componentes.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {c.insumo?.nombre ?? c.nombre_libre}
                      </Text>
                      {c.insumo?.codigo_interno ? (
                        <Text size="xs" c="dimmed">
                          {c.insumo.codigo_interno}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {c.es_csp ? 'csp' : numero(c.porcentaje_pp, 4)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {c.se_mide_a_volumen ? (
                        <Text size="sm">
                          volumen
                          {c.densidad ? (
                            <Text span c="dimmed">
                              {' '}
                              ({c.densidad.nombre})
                            </Text>
                          ) : null}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          masa
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {c.etapa ?? '—'}
                      </Text>
                    </Table.Td>
                    {editableBorrador ? (
                      <Table.Td>
                        <ActionIcon
                          variant="subtle"
                          color="estadoRechazado"
                          aria-label="Quitar componente"
                          onClick={() =>
                            eliminarComponente.mutate({ id: c.id, formulaId })
                          }
                        >
                          <IconTrash size={17} />
                        </ActionIcon>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {editableBorrador ? (
        <Paper withBorder p="md" mt="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Title order={3} mb="sm">
            Agregar componente
          </Title>
          <Divider mb="sm" />
          <FormularioComponente
            formulaId={formulaId}
            proximoOrden={proximoOrden}
            hayCsp={hayCsp}
            onListo={() => {}}
          />
        </Paper>
      ) : null}
    </>
  );
}

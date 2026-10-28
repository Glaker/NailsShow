import { useMemo, useState } from 'react';
import { MATERIAS_PRIMAS_COMUNES, normalizar } from './materiasPrimas';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
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
import { IconArrowLeft, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { FormularioInsumo } from '@/features/maestros/PaginaInsumos';
import {
  useActualizarFormula,
  useCrearComponenteFormula,
  useDensidadEstimadaFormula,
  useDensidadesReferencia,
  useEliminarComponenteFormula,
  useFormulaCompleta,
  useFormulasFabricacion,
  textoPorcentaje,
  useInsumos,
  type FormulaComponenteRow,
  type FormulaFabricacionRow,
} from '@/lib/consultas';
import { numero } from '@/lib/formato';
import { FINANZAS, useTieneRol } from '@/features/auth/sesion';
import { CostoAprox } from './TareasCarga';
import { BadgeEstadoFormula } from './estadoFormula';
import { PanelProcedimiento } from './PanelProcedimiento';
import {
  useCopiarComponentes,
  useNuevaVersionFormula,
} from '@/lib/consultasNuevoProducto';

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
  .refine(
    (v) => (v.origen === 'CATALOGO' ? Boolean(v.insumo_id) : v.nombre_libre.length > 0),
    {
      message: 'Elegí el insumo',
      path: ['insumo_id'],
    },
  )
  .refine((v) => v.es_csp || (v.porcentaje_pp !== null && v.porcentaje_pp > 0), {
    message: 'Falta el % P/P (o marcá que es el csp)',
    path: ['porcentaje_pp'],
  })
  .refine((v) => !v.se_mide_a_volumen || Boolean(v.densidad_id), {
    message:
      'Se carga con probeta: elegí la densidad, sin ella no se puede calcular el volumen',
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
  etiquetaPct,
  onListo,
}: {
  formulaId: string;
  proximoOrden: number;
  hayCsp: boolean;
  etiquetaPct: string;
  onListo: () => void;
}) {
  const insumos = useInsumos();
  const densidades = useDensidadesReferencia();
  const crear = useCrearComponenteFormula();
  /* Lo que se buscó y no está: se da de alta acá mismo y queda elegido
     (pedido del 2026-10-21). */
  const [buscado, setBuscado] = useState('');
  const [alta, setAlta] = useState(false);

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

  const catalogo = (insumos.data ?? []).filter(
    (i) => i.activo && (i.tipo === 'MATERIA_PRIMA' || i.tipo === 'SEMIELABORADO'),
  );
  const yaCargados = new Set(catalogo.map((i) => normalizar(i.nombre)));
  const opcionesInsumo = [
    {
      group: 'Del catálogo',
      items: catalogo.map((i) => ({
        value: i.id,
        label: `${i.nombre} (${i.codigo_interno})`,
      })),
    },
    {
      group: 'Sin catalogar',
      items: MATERIAS_PRIMAS_COMUNES.filter((n) => !yaCargados.has(normalizar(n))).map(
        (n) => ({
          value: `libre:${n}`,
          label: n,
        }),
      ),
    },
  ];

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
        {/* Un solo «Insumo» (pedido del 2026-10-23): las materias primas del
            catálogo y, debajo, las habituales que todavía no están cargadas,
            que entran como nombre libre. */}
        <Select
          label="Insumo"
          withAsterisk
          searchable
          placeholder="Buscar por nombre o código"
          data={opcionesInsumo}
          value={
            form.values.origen === 'LIBRE'
              ? form.values.nombre_libre
                ? `libre:${form.values.nombre_libre}`
                : null
              : form.values.insumo_id
          }
          error={form.errors.insumo_id}
          onSearchChange={setBuscado}
          nothingFoundMessage={
            <Stack gap={6}>
              <Button
                fullWidth
                size="md"
                variant="light"
                leftSection={<IconPlus size={18} />}
                onClick={() => setAlta(true)}
              >
                Nuevo insumo
              </Button>
              {buscado.trim() ? (
                <Button
                  fullWidth
                  size="md"
                  variant="subtle"
                  onClick={() => {
                    form.setFieldValue('origen', 'LIBRE');
                    form.setFieldValue('insumo_id', null);
                    form.setFieldValue('nombre_libre', buscado.trim());
                  }}
                >
                  Usar «{buscado.trim()}» sin catalogar
                </Button>
              ) : null}
            </Stack>
          }
          onChange={(v) => {
            if (v?.startsWith('libre:')) {
              form.setFieldValue('origen', 'LIBRE');
              form.setFieldValue('insumo_id', null);
              form.setFieldValue('nombre_libre', v.slice('libre:'.length));
              return;
            }
            form.setFieldValue('origen', 'CATALOGO');
            form.setFieldValue('nombre_libre', '');
            form.setFieldValue('insumo_id', v);
            // Precarga la densidad del insumo (alcohol isopropílico → IPA,
            // acetato de butilo → acetato de n-butilo). Se puede cambiar.
            const insumo = (insumos.data ?? []).find((i) => i.id === v);
            form.setFieldValue('densidad_id', insumo?.densidad_referencia_id ?? null);
          }}
        />

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
              label={etiquetaPct}
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
      <Modal
        opened={alta}
        onClose={() => setAlta(false)}
        title={<Text fw={700}>Nuevo insumo</Text>}
        size="lg"
      >
        <FormularioInsumo
          nombreInicial={buscado.trim()}
          onListo={(creado) => {
            if (creado) {
              form.setFieldValue('insumo_id', creado.id);
              form.setFieldValue('densidad_id', creado.densidad_referencia_id ?? null);
            }
            setAlta(false);
          }}
        />
      </Modal>
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
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
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
        <Text size="xs" c="estadoRechazado" mt={4}>
          Los demás componentes ya suman más de 100 %: al csp no le queda nada. La base va
          a rechazar el paso a vigente.
        </Text>
      ) : null}
      {!csp && Math.abs(suma - 100) > 1e-4 ? (
        <Text size="xs" c="estadoEnAnalisis" mt={4}>
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
  const estimada = useDensidadEstimadaFormula(
    formula.id,
    Number(formula.densidad_temp_c ?? 20),
  );
  /* Lo que devuelve el NumberInput tal cual: a mitad de escribir «0,» llega
     como texto («0.») y descartarlo borraba el campo. Se convierte al guardar. */
  const [densidadProducto, setDensidadProducto] = useState<number | string>(
    formula.densidad_producto ?? '',
  );
  const [densidadTempC, setDensidadTempC] = useState<number | string>(
    formula.densidad_temp_c ?? 20,
  );
  const aNumero = (v: number | string) => (v === '' ? null : Number(v));

  const cambio =
    aNumero(densidadProducto) !== formula.densidad_producto ||
    aNumero(densidadTempC) !== (formula.densidad_temp_c ?? 20);

  return (
    <Paper withBorder p="md" mb="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Title order={3} mb="sm">
        Densidad del producto terminado
      </Title>
      <Text size="sm" c="dimmed" mb="xs">
        Convierte un volumen objetivo del lote en una masa. Por defecto se usa la estimada
        por el modelo de mezcla; si la medís con el densitómetro (I.50.25), cargala acá y
        pasa a usarse esa. En una fórmula vigente es lo único que se puede cambiar.
      </Text>
      <Text size="sm" mb="sm">
        Estimada por el modelo:{' '}
        <b>
          {estimada.isLoading
            ? '…'
            : estimada.data?.densidad_real != null &&
                (estimada.data.sin_densidad ?? []).length === 0
              ? `${numero(estimada.data.densidad_real, 4)} g/mL a ${numero(formula.densidad_temp_c ?? 20, 1)} °C`
              : `no se puede estimar${
                  (estimada.data?.sin_densidad ?? []).length > 0
                    ? ` (faltan densidades de ${(estimada.data?.sin_densidad ?? []).join(', ')})`
                    : ''
                }`}
        </b>
        {formula.densidad_producto !== null
          ? ' · se está usando la medida'
          : ' · es la que se usa'}
      </Text>
      <Grid gutter="sm" align="flex-end">
        <Grid.Col span={{ base: 12, sm: 4 }}>
          {editable ? (
            <NumberInput
              label="Densidad medida (g/mL)"
              placeholder="Sin medir"
              min={0}
              decimalScale={5}
              hideControls
              value={densidadProducto}
              onChange={setDensidadProducto}
            />
          ) : (
            <Stack gap={0}>
              <Text size="xs" c="dimmed" fw={500}>
                Densidad (g/mL)
              </Text>
              <Text size="sm" fw={600}>
                {formula.densidad_producto === null
                  ? '— sin medir'
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
              onChange={setDensidadTempC}
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
                    densidad_producto: aNumero(densidadProducto),
                    densidad_temp_c: aNumero(densidadTempC),
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
/**
 * «Pegar de otra fórmula vigente» (pedido del 2026-10-23, D-nuevo-producto-2):
 * cuando un producto lleva la misma fórmula que otro, se pegan sus componentes
 * (al final) y, si se quiere, su procedimiento, y se ajusta.
 */
function PegarDeOtra({
  formulaId,
  productoId,
}: {
  formulaId: string;
  productoId: string;
}) {
  const formulas = useFormulasFabricacion();
  const copiar = useCopiarComponentes();
  const [abierto, setAbierto] = useState(false);
  const [origen, setOrigen] = useState<string | null>(null);
  const [conProcedimiento, setConProcedimiento] = useState(true);
  const vigentes = (formulas.data ?? [])
    .filter((x) => x.estado === 'VIGENTE' && x.id !== formulaId)
    .map((x) => ({
      value: x.id,
      label: `${x.producto?.nombre ?? '¿?'}${x.variedad ? ` — ${x.variedad}` : ''} · v${x.version}${x.producto_id === productoId ? ' (este producto)' : ''}`,
    }));
  return (
    <>
      <Button variant="default" size="sm" onClick={() => setAbierto(true)}>
        Pegar de otra fórmula vigente
      </Button>
      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title={<Text fw={700}>Pegar de otra fórmula vigente</Text>}
        centered
      >
        <Stack gap="sm">
          <Select
            label="Fórmula"
            placeholder="Buscá el producto"
            searchable
            data={vigentes}
            value={origen}
            onChange={setOrigen}
          />
          <Checkbox
            label="Traer también su procedimiento"
            checked={conProcedimiento}
            onChange={(e) => setConProcedimiento(e.currentTarget.checked)}
          />
          <Text size="xs" c="dimmed">
            Los componentes se agregan al final de los que ya tiene. Queda en borrador: la
            revisás y la deja vigente Dirección Técnica.
          </Text>
          <Group justify="flex-end">
            <Button
              disabled={!origen}
              loading={copiar.isPending}
              onClick={() =>
                origen &&
                copiar.mutate(
                  { origen, destino: formulaId, procedimiento: conProcedimiento },
                  {
                    onSuccess: () => {
                      setAbierto(false);
                      setOrigen(null);
                    },
                  },
                )
              }
            >
              Pegar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/**
 * `formulaId` = embebida en «Nuevo producto»: sin el volver ni el
 * procedimiento, que ahí tiene su propia sección.
 */
export function PaginaFormula({ formulaId: embebida }: { formulaId?: string } = {}) {
  const params = useParams();
  const navegar = useNavigate();
  const nuevaVersion = useNuevaVersionFormula();
  const id = embebida ?? params.id;
  const datos = useFormulaCompleta(id);
  const actualizar = useActualizarFormula();
  const eliminarComponente = useEliminarComponenteFormula();
  const esDT = useTieneRol('DIRECCION_TECNICA');
  /* GP carga borradores (D-etiquetado-1, formulas_actualiza_dt); dejarla
     vigente sigue siendo de DT. */
  const esGP = useTieneRol('GERENCIA_PRODUCCION');
  const cargaCostoAprox = useTieneRol('GERENCIA_PRODUCCION', FINANZAS);

  const f = datos.data?.formula;
  const puedeEditar = esDT || (esGP && f?.estado === 'BORRADOR');
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
  // Sin densidad medida alcanza con que sea estimable: lo controla la base
  // (gmp.fn_formula_densidad_vigente).
  const puedeMarcarVigente = editableBorrador && esDT;

  const confirmarVigente = () => {
    modals.openConfirmModal({
      title: <Text fw={700}>Marcar como vigente</Text>,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            {f.producto?.nombre ?? '(producto sin nombre)'}
            {f.variedad ? ` — ${f.variedad}` : ''} · versión {f.version} va a quedar como
            la fórmula oficial para pesar lotes.
          </Text>
          <Alert color="estadoEnAnalisis" variant="light" radius="md">
            Una fórmula vigente no se puede editar: la corrección se hace emitiendo una
            versión nueva. Esta acción no se puede deshacer.
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Marcar como vigente', cancel: 'Cancelar' },
      confirmProps: { color: 'estadoAprobado' },
      onConfirm: () =>
        actualizar.mutate({ id: formulaId, cambios: { estado: 'VIGENTE' } }),
    });
  };

  return (
    <>
      {embebida ? null : (
        <Anchor component={Link} to="/formulas" size="sm" mb="sm">
          <Group gap={4}>
            <IconArrowLeft size={15} />
            Volver a fórmulas
          </Group>
        </Anchor>
      )}

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

        {editableBorrador && esDT ? (
          <Tooltip
            label="Cargá la densidad del producto terminado antes de pasar a vigente."
            disabled={puedeMarcarVigente}
          >
            <Button disabled={!puedeMarcarVigente} onClick={confirmarVigente}>
              Marcar como vigente
            </Button>
          </Tooltip>
        ) : editableBorrador ? (
          <Text size="sm" c="dimmed" maw={260}>
            Borrador: la deja vigente Dirección Técnica.
          </Text>
        ) : null}
      </Group>

      {f.estado !== 'BORRADOR' && (esDT || esGP) ? (
        /* Editar una vigente = versión nueva (D-nuevo-producto-3). */
        <Alert color="estadoEnAnalisis" variant="light" radius="md" mb="md">
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Text size="sm">
              Esta fórmula está {f.estado === 'VIGENTE' ? 'vigente' : 'dada de baja'} y no
              se edita: al editarla se crea la versión siguiente con lo mismo, para
              corregirla. Cuando Dirección Técnica la deje vigente, esta queda dada de
              baja.
            </Text>
            <Button
              leftSection={<IconPencil size={16} />}
              loading={nuevaVersion.isPending}
              onClick={() =>
                nuevaVersion.mutate(formulaId, {
                  onSuccess: (id) => {
                    if (!embebida) void navegar(`/formulas/${id}`);
                  },
                })
              }
            >
              Editar (versión nueva)
            </Button>
          </Group>
        </Alert>
      ) : !puedeEditar ? (
        <Alert color="azul" variant="light" radius="md" mb="md">
          Estás viendo esta fórmula en modo lectura: la edita Dirección Técnica, y
          Gerencia de Producción mientras está en borrador (§3.3).
        </Alert>
      ) : null}

      {/* D-consumo-orden-1: los líquidos como el removedor van en volumen; al
          terminar la orden se descuenta de stock según esto. */}
      <Group gap="sm" mb="md" align="center">
        <Text size="sm" fw={600}>
          Porcentajes en
        </Text>
        <SegmentedControl
          size="md"
          value={f.base_porcentaje ?? 'PP'}
          disabled={!editableBorrador || actualizar.isPending}
          onChange={(v) =>
            actualizar.mutate({
              id: f.id,
              cambios: { base_porcentaje: v as 'PP' | 'VV' },
            })
          }
          data={[
            { value: 'PP', label: '% P/P (masa)' },
            { value: 'VV', label: '% V/V (volumen)' },
          ]}
        />
      </Group>

      <PanelDensidadProducto
        key={f.id}
        formula={f}
        editable={
          esDT ? f.estado === 'BORRADOR' || f.estado === 'VIGENTE' : editableBorrador
        }
      />

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
                <Table.Th ta="right">{textoPorcentaje(f.base_porcentaje)}</Table.Th>
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
                      {/* Costo a granel aproximado, opcional (D-costo-estimado-1). */}
                      {cargaCostoAprox && c.insumo_id ? (
                        <CostoAprox insumoId={c.insumo_id} unidad={null} sangria={0} />
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
        <Paper
          withBorder
          p="md"
          mt="md"
          style={{ borderColor: 'var(--superficie-borde)' }}
        >
          <Group justify="space-between" mb="sm">
            <Title order={3}>Agregar componente</Title>
            <PegarDeOtra formulaId={formulaId} productoId={f.producto_id} />
          </Group>
          <Divider mb="sm" />
          <FormularioComponente
            formulaId={formulaId}
            proximoOrden={proximoOrden}
            hayCsp={hayCsp}
            etiquetaPct={textoPorcentaje(f.base_porcentaje)}
            onListo={() => {}}
          />
        </Paper>
      ) : null}

      {/* Versionado aparte: se edita aunque la fórmula esté vigente, y cada
          edición queda como versión nueva. */}
      {embebida ? null : (
        <Box mt="md">
          <PanelProcedimiento formulaId={formulaId} />
        </Box>
      )}
    </>
  );
}

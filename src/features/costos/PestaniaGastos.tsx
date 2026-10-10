import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useDebouncedState } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconReceipt, IconSearch } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { FINANZAS, useTieneRol } from '@/features/auth/sesion';
import { fechaISO, numero } from '@/lib/formato';
import {
  COMPROBANTES,
  ETIQUETA_CLASE,
  ROLES_CARGAN_GASTOS,
  useCargarGasto,
  useCategoriasGasto,
  useGastos,
  type CategoriaGasto,
  type ClaseGasto,
  type Gasto,
} from '@/lib/consultasCostos';
import { CamposCosto, COSTO_VACIO, type ValorCosto } from './CamposCosto';
import { formaCosto, numOrNull, pesos, reglasCosto } from './comun';

/*
 * Fase 3 (20261009140000). Gasto: resultado de gestión, no fiscal. El gasto no
 * se edita: la corrección es una fila nueva con rectifica_a (CLAUDE.md §3.1).
 */

const TEXTO_CABECERA =
  'Costos fijos y otros gastos del mes al que corresponden (no del pago). Una inversión (máquina, equipo) se carga con su vida útil y se reparte mes a mes: no pega entera en el mes. La nómina de producción se carga en su categoría y no suma como fijo: sólo cuenta la parte que no quedó en el costo de lo vendido.';

const CLASES: ClaseGasto[] = ['FIJO', 'OPERATIVO', 'INVERSION'];
const COLOR_CLASE: Record<ClaseGasto, string> = {
  FIJO: 'blue',
  OPERATIVO: 'teal',
  INVERSION: 'violet',
};

/** Últimos doce meses, «AAAA-MM», el actual primero. */
const MESES = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
  const v = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  return { value: v, label: v };
});
const OPCIONES_MES = [{ value: 'todos', label: 'Todos los meses' }, ...MESES];

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** `mes` puede llegar como 'AAAA-MM' o 'AAAA-MM-DD': se muestra y filtra por 'AAAA-MM'. */
const aMes = (m: string) => m.slice(0, 7);

export function PestaniaGastos() {
  const gastos = useGastos();
  const categorias = useCategoriasGasto();
  const puede = useTieneRol(...ROLES_CARGAN_GASTOS);
  const [texto, setTexto] = useDebouncedState('', 250);
  const [filtro, setFiltro] = useState<string>('todos');
  const [mes, setMes] = useState<string>('todos');
  const [rectificando, setRectificando] = useState<Gasto | null>(null);
  const [cargando, setCargando] = useState(false);

  if (gastos.isLoading || categorias.isLoading) return <Skeleton h={300} />;

  const filas = gastos.data ?? [];
  const busqueda = texto.trim().toLowerCase();
  const visibles = filas
    .filter((r) => mes === 'todos' || aMes(r.mes) === mes)
    .filter(
      (r) =>
        filtro === 'todos' ||
        filtro === r.clase ||
        (filtro === 'sin' && r.tipo_comprobante === 'SIN_COMPROBANTE'),
    )
    .filter(
      (r) =>
        !busqueda ||
        r.descripcion.toLowerCase().includes(busqueda) ||
        r.categoria.toLowerCase().includes(busqueda),
    );
  const total = suma(visibles.map((r) => r.importe_neto_ars));
  const sinCompTotal = suma(
    visibles.filter((r) => r.tipo_comprobante === 'SIN_COMPROBANTE').map((r) => r.importe_neto_ars),
  );
  const pctSinComp = total > 0 ? (sinCompTotal / total) * 100 : 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Text size="sm" c="dimmed" maw={680}>
          {TEXTO_CABECERA}
        </Text>
        <Badge color="gray" variant="light" size="lg">
          Resultado de gestión, no fiscal
        </Badge>
      </Group>

      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
          <Group align="flex-end" wrap="wrap" gap="sm">
            <Select
              label="Mes"
              data={OPCIONES_MES}
              value={mes}
              onChange={(v) => v && setMes(v)}
              allowDeselect={false}
              w={{ base: '100%', sm: 180 }}
            />
            <TextInput
              label="Buscar"
              placeholder="Descripción o categoría"
              leftSection={<IconSearch size={17} />}
              defaultValue={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              w={{ base: '100%', sm: 300 }}
            />
          </Group>
          <SegmentedControl
            value={filtro}
            onChange={setFiltro}
            data={[
              { label: 'Todos', value: 'todos' },
              { label: 'Costos fijos', value: 'FIJO' },
              { label: 'Operativos', value: 'OPERATIVO' },
              { label: 'Inversiones', value: 'INVERSION' },
              { label: 'Sin comprobante', value: 'sin' },
            ]}
          />
          {puede ? (
            <Button size="md" onClick={() => setCargando(true)}>
              Cargar gasto
            </Button>
          ) : null}
        </Group>
      </Paper>

      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Stack gap={2}>
          <Text fw={700} ff="monospace">
            {numero(pctSinComp, 1)} % sin comprobante
          </Text>
          <Text size="sm" c="dimmed">
            Total {pesos(total)} en {visibles.length} gastos del filtro.
          </Text>
        </Stack>
      </Paper>

      {filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconReceipt}
            titulo="Todavía no hay gastos cargados"
            descripcion="Empezá por los costos fijos del mes (alquiler, servicios, sueldos no productivos) y la nómina de producción."
          />
        </Paper>
      ) : visibles.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconSearch}
            titulo="Ningún gasto coincide"
            descripcion="Probá con otro texto o cambiá el filtro."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={1000}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mes</Table.Th>
                  <Table.Th>Categoría</Table.Th>
                  <Table.Th>Descripción</Table.Th>
                  <Table.Th>Comprobante</Table.Th>
                  <Table.Th ta="right">Importe neto $</Table.Th>
                  <Table.Th>Vida útil</Table.Th>
                  {puede ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.slice(0, 300).map((r) => {
                  const vida = r.clase === 'INVERSION' ? r.vida_util_meses : null;
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td ff="monospace">{aMes(r.mes)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {r.categoria}
                        </Text>
                        <Group gap={6} mt={4}>
                          <Badge color={COLOR_CLASE[r.clase]} variant="light" size="sm">
                            {ETIQUETA_CLASE[r.clase]}
                          </Badge>
                          {r.es_nomina_produccion ? (
                            <Badge color="grape" variant="light" size="sm">
                              nómina de producción
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>{r.descripcion}</Table.Td>
                      <Table.Td>
                        {r.tipo_comprobante === 'SIN_COMPROBANTE' ? (
                          <Badge color="orange" variant="filled">
                            SIN COMPROBANTE
                          </Badge>
                        ) : (
                          <Text size="sm">
                            {COMPROBANTES.find((c) => c.value === r.tipo_comprobante)?.label ?? '—'}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" fw={700}>
                        {pesos(r.importe_neto_ars)}
                      </Table.Td>
                      <Table.Td ff="monospace">
                        {vida
                          ? `${vida} meses · cuota ${pesos(r.importe_neto_ars / vida)}`
                          : '—'}
                      </Table.Td>
                      {puede ? (
                        <Table.Td>
                          <Button size="sm" variant="light" onClick={() => setRectificando(r)}>
                            Corregir
                          </Button>
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {visibles.length > 300 ? (
            <Text size="xs" c="dimmed" p="sm">
              Se muestran 300 de {visibles.length}: buscá para acotar.
            </Text>
          ) : null}
        </Paper>
      )}

      <Modal
        opened={rectificando !== null}
        onClose={() => setRectificando(null)}
        title={rectificando ? `Corregir gasto: ${rectificando.descripcion}` : ''}
        centered
        size="lg"
      >
        {rectificando ? (
          <FormularioGasto
            categorias={categorias.data ?? []}
            rectifica={rectificando}
            onListo={() => setRectificando(null)}
          />
        ) : null}
      </Modal>

      <Modal opened={cargando} onClose={() => setCargando(false)} title="Cargar gasto" centered size="lg">
        {cargando ? (
          <FormularioGasto categorias={categorias.data ?? []} onListo={() => setCargando(false)} />
        ) : null}
      </Modal>
    </Stack>
  );
}

type ValoresGasto = ValorCosto & {
  categoria_id: string;
  clase: ClaseGasto | null;
  mes: Date | null;
  descripcion: string;
  vida_util_meses: number | null;
  comprobante_url: string;
  motivo: string;
};

/** Campos del gasto que la base exige (CHECK de gastos), más los del costo. */
const formaGasto = {
  ...formaCosto,
  categoria_id: z.string().min(1, 'Elegí la categoría'),
  clase: z.enum(['FIJO', 'OPERATIVO', 'INVERSION']).nullable(),
  mes: z.date({ error: 'Elegí el mes' }),
  descripcion: z.string().trim().min(3, 'Describí el gasto'),
  vida_util_meses: z.number().int().min(1, 'La vida útil es de al menos 1 mes').max(600, 'La vida útil es de hasta 600 meses').nullable(),
  comprobante_url: z
    .string()
    .trim()
    .refine((s) => s === '' || /^https?:\/\//.test(s), 'El link tiene que empezar con http:// o https://'),
};

/** Sólo las inversiones se amortizan: piden vida útil. */
function reglasGasto(
  v: { clase: ClaseGasto | null; vida_util_meses: number | null },
  ctx: z.RefinementCtx,
) {
  if (v.clase === 'INVERSION' && v.vida_util_meses === null)
    ctx.addIssue({ code: 'custom', path: ['vida_util_meses'], message: 'Falta la vida útil' });
}

const esquemaCargar = z
  .object({ ...formaGasto, motivo: z.string() })
  .superRefine((v, ctx) => {
    reglasCosto(v, ctx, false);
    reglasGasto(v, ctx);
  });

const esquemaCorregir = z
  .object({
    ...formaGasto,
    motivo: z.string().trim().min(3, 'Explicá el motivo de la corrección'),
  })
  .superRefine((v, ctx) => {
    reglasCosto(v, ctx, false);
    reglasGasto(v, ctx);
  });

/** 'AAAA-MM' o 'AAAA-MM-DD' a la fecha del primer día del mes. */
function mesDeTexto(m: string): Date {
  const [y = 0, mm = 1] = m.slice(0, 7).split('-').map(Number);
  return new Date(y, mm - 1, 1);
}

/** Primer día del mes en 'AAAA-MM-01', que es lo que guarda la base. */
const mesISO = (d: Date) => fechaISO(new Date(d.getFullYear(), d.getMonth(), 1)) ?? '';

/** Alta de gasto, o corrección si viene `rectifica`: fila nueva que apunta a la anterior. */
function FormularioGasto({
  categorias,
  rectifica,
  onListo,
}: {
  categorias: CategoriaGasto[];
  rectifica?: Gasto;
  onListo: () => void;
}) {
  const guardar = useCargarGasto();
  const esFinanzas = useTieneRol(FINANZAS);
  const inicial: ValoresGasto = rectifica
    ? {
        ...COSTO_VACIO,
        tipo_comprobante: rectifica.tipo_comprobante,
        importe: rectifica.importe,
        moneda: rectifica.moneda,
        tipo_cambio: rectifica.tipo_cambio,
        categoria_id: rectifica.categoria_id,
        clase: rectifica.clase,
        mes: mesDeTexto(rectifica.mes),
        descripcion: rectifica.descripcion,
        vida_util_meses: rectifica.vida_util_meses,
        comprobante_url: rectifica.comprobante_url ?? '',
        motivo: '',
      }
    : {
        ...COSTO_VACIO,
        categoria_id: '',
        clase: null,
        mes: new Date(),
        descripcion: '',
        vida_util_meses: null,
        comprobante_url: '',
        motivo: '',
      };

  const form = useForm<ValoresGasto>({
    mode: 'controlled',
    initialValues: inicial,
    validate: zod4Resolver(rectifica ? esquemaCorregir : esquemaCargar),
  });
  const v = form.values;
  const primerError = Object.values(form.errors)[0];

  // FIJO sólo lo carga Finanzas (espejo de la base).
  const grupos = CLASES.map((clase) => ({
    group: ETIQUETA_CLASE[clase],
    items: categorias
      .filter((c) => c.activa && c.clase === clase && (clase !== 'FIJO' || esFinanzas))
      .map((c) => ({ value: c.id, label: c.nombre })),
  })).filter((g) => g.items.length > 0);

  const onGuardar = (x: ValoresGasto) => {
    const esA = x.tipo_comprobante === 'FACTURA_A';
    const datos = {
      categoria_id: x.categoria_id,
      mes: x.mes ? mesISO(x.mes) : '',
      descripcion: x.descripcion.trim(),
      tipo_comprobante: x.tipo_comprobante,
      importe: x.importe ?? 0,
      incluye_iva: esA ? x.incluye_iva : null,
      alicuota_iva: esA ? x.alicuota_iva : null,
      moneda: x.moneda,
      tipo_cambio: x.moneda === 'ARS' ? 1 : (x.tipo_cambio ?? 0),
      vida_util_meses: x.clase === 'INVERSION' ? x.vida_util_meses : null,
      comprobante_url: x.comprobante_url.trim() || null,
    };
    guardar.mutate(
      rectifica ? { ...datos, rectifica_a: rectifica.id, motivo: x.motivo.trim() } : datos,
      { onSuccess: onListo },
    );
  };

  return (
    <form onSubmit={form.onSubmit(onGuardar)}>
      <Stack gap="md">
        {rectifica ? (
          <Text size="sm" c="dimmed">
            El gasto no se edita: se carga uno nuevo que corrige al anterior. Para quitarlo, corregilo con importe 0.
          </Text>
        ) : null}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {rectifica ? (
            <TextInput label="Categoría" value={rectifica.categoria} disabled />
          ) : (
            <Select
              label="Categoría"
              placeholder="Elegí una"
              data={grupos}
              value={v.categoria_id || null}
              onChange={(x) => {
                const c = categorias.find((i) => i.id === x);
                form.setValues({ categoria_id: x ?? '', clase: c?.clase ?? null });
              }}
              allowDeselect={false}
              searchable
              error={form.errors.categoria_id}
            />
          )}
          <MonthPickerInput
            label="Mes"
            description="Mes al que corresponde, no el del pago."
            valueFormat="MM/YYYY"
            value={v.mes}
            onChange={(x) => form.setFieldValue('mes', x ? new Date(x) : null)}
            error={form.errors.mes}
          />
        </SimpleGrid>
        <TextInput label="Descripción" required {...form.getInputProps('descripcion')} />
        <CamposCosto valor={v} onChange={(x) => form.setValues(x)} sinCantidad />
        {v.clase === 'INVERSION' ? (
          <NumberInput
            label="Vida útil (meses)"
            description="Se amortiza en partes iguales: neto / vida útil por mes."
            required
            min={1}
            max={600}
            allowDecimal={false}
            value={v.vida_util_meses ?? ''}
            onChange={(x) => form.setFieldValue('vida_util_meses', numOrNull(x))}
            error={form.errors.vida_util_meses}
          />
        ) : null}
        <TextInput
          label="Link al comprobante (opcional)"
          placeholder="https://..."
          {...form.getInputProps('comprobante_url')}
        />
        {rectifica ? (
          <Textarea
            label="Motivo"
            required
            autosize
            minRows={2}
            {...form.getInputProps('motivo')}
          />
        ) : null}
        {primerError ? (
          <Text size="sm" c="red">
            {typeof primerError === 'string' ? primerError : 'Revisá los datos del gasto.'}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button type="submit" size="md" loading={guardar.isPending}>
            {rectifica ? 'Guardar corrección' : 'Cargar gasto'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

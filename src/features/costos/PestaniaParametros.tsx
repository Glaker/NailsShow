import {
  Badge,
  Button,
  Group,
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
} from '@mantine/core';
import { DateInput, MonthPickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconAdjustments, IconChartLine, IconCloudDownload } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { FINANZAS, useTieneRol } from '@/features/auth/sesion';
import { fecha, fechaISO, numero } from '@/lib/formato';
import {
  useCargarParametros,
  useCargarSerie,
  useParametrosCosto,
  useSeriesMacro,
  useTraerSeriesOficiales,
  type ParametrosCosto,
  type PuntoSerieMacro,
  type SerieMacro,
} from '@/lib/consultasCostos';
import { numOrNull, pesos } from './comun';

const SERIES: { value: SerieMacro; label: string; fuente: string }[] = [
  { value: 'IPC', label: 'IPC nivel general', fuente: 'INDEC' },
  {
    value: 'TC_A3500_PROMEDIO',
    label: 'TC A3500 promedio mensual',
    fuente: 'BCRA Com. A 3500',
  },
  {
    value: 'TC_A3500_CIERRE',
    label: 'TC A3500 cierre de mes',
    fuente: 'BCRA Com. A 3500',
  },
];

/** La vista guarda la serie de tipo de cambio como clave; se muestra como nombre de negocio. */
const etiquetaTipoCambio = (serie: string | undefined) => {
  if (serie === 'TC_A3500_PROMEDIO') return 'A3500 (BCRA, mayorista), promedio mensual';
  if (serie === 'TC_A3500_CIERRE') return 'A3500 (BCRA, mayorista), cierre de mes';
  return serie ?? '—';
};

export function PestaniaParametros() {
  const params = useParametrosCosto();
  const series = useSeriesMacro();
  const puede = useTieneRol(FINANZAS);
  const traer = useTraerSeriesOficiales();

  if (params.isLoading || series.isLoading) return <Skeleton h={300} />;
  const p = params.data;
  const costoHora = p?.costo_hora ?? null;

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Text fw={600} mb="sm">
          Parámetros vigentes
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          <div>
            <Text size="xs" c="dimmed">
              Costo hora
            </Text>
            <Text fw={700} ff="monospace">
              {costoHora !== null ? `${pesos(costoHora)} por hora` : 'sin cargar'}
            </Text>
            <Text size="xs" c="dimmed">
              Costo laboral total de producción por hora productiva: sueldos + cargas
              sociales + SAC + vacaciones, dividido por las horas efectivamente
              productivas. No es el sueldo bruto por hora.
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Umbral de aviso
            </Text>
            <Text fw={700} ff="monospace">
              {p ? `${numero(p.umbral_variacion * 100, 1)} %` : '—'}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Margen mínimo
            </Text>
            <Text fw={700} ff="monospace">
              {p ? `${numero(p.margen_minimo * 100, 1)} %` : '—'}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Vigencia de cotización
            </Text>
            <Text fw={700} ff="monospace">
              {p ? `${p.vigencia_cotizacion_dias} días` : '—'}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Tipo de cambio activo
            </Text>
            <Text fw={700}>{etiquetaTipoCambio(p?.serie_tipo_cambio)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Corte de la apertura
            </Text>
            <Text fw={700} ff="monospace">
              {p ? fecha(p.corte_apertura) : '—'}
            </Text>
          </div>
        </SimpleGrid>
      </Paper>

      {puede && p ? <FormularioParametros parametros={p} /> : null}

      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Text fw={600}>Series macro</Text>
          {puede ? (
            <Button
              variant="light"
              size="md"
              leftSection={<IconCloudDownload size={18} />}
              loading={traer.isPending}
              onClick={() => traer.mutate({})}
            >
              Traer del BCRA y el INDEC
            </Button>
          ) : null}
        </Group>
        <Text size="sm" c="dimmed">
          IPC nivel general del INDEC y tipo de cambio mayorista A3500 del BCRA. Se traen
          solos de las fuentes oficiales cada vez que Finanzas abre Costos: el dólar del
          mes en curso queda provisorio (último día publicado) hasta que el mes cierra. El
          IPC sale con unas dos semanas de demora: mientras no esté, los gráficos lo
          estiman y lo marcan como provisorio. Un valor definitivo cargado a mano no se
          pisa.
        </Text>
        <TablaSeries puntos={series.data ?? []} />
      </Stack>

      {puede ? <FormularioSerie puntos={series.data ?? []} /> : null}
    </Stack>
  );
}

type ValoresParametros = {
  costo_hora: number | null;
  umbral: number | null;
  margen: number | null;
  vigencia: number | null;
  corte_a: number | null;
  corte_b: number | null;
  corte_apertura: string | null;
  motivo: string;
};

const esquemaParametros = z
  .object({
    costo_hora: z
      .number({ error: 'Falta el costo hora' })
      .min(0, 'No puede ser negativo')
      .nullable(),
    umbral: z
      .number({ error: 'Falta el umbral' })
      .min(0, 'No puede ser negativo')
      .max(100, 'No puede pasar de 100 %'),
    margen: z
      .number({ error: 'Falta el margen' })
      .min(0, 'No puede ser negativo')
      .max(100, 'No puede pasar de 100 %'),
    vigencia: z
      .number({ error: 'Falta la vigencia' })
      .int('Son días enteros')
      .min(1, 'Tiene que ser al menos 1 día'),
    corte_a: z.number({ error: 'Falta el corte A' }).gt(0).lt(100),
    corte_b: z.number({ error: 'Falta el corte B' }).gt(0).lt(100),
    corte_apertura: z
      .string({ error: 'Falta la fecha de corte' })
      .regex(/^d{4}-d{2}-d{2}$/, 'Falta la fecha de corte'),
    motivo: z.string(),
  })
  .refine((v) => (v.corte_a ?? 0) < (v.corte_b ?? 0), {
    path: ['corte_b'],
    message: 'El corte B tiene que ser mayor que el A',
  });

/** Cada guardado es una versión nueva; los umbrales se ingresan en % y se guardan como fracción. */
function FormularioParametros({ parametros }: { parametros: ParametrosCosto }) {
  const guardar = useCargarParametros();
  const form = useForm<ValoresParametros>({
    mode: 'controlled',
    initialValues: {
      costo_hora: parametros.costo_hora ?? null,
      umbral: parametros.umbral_variacion * 100,
      margen: parametros.margen_minimo * 100,
      vigencia: parametros.vigencia_cotizacion_dias,
      corte_a: parametros.corte_a * 100,
      corte_b: parametros.corte_b * 100,
      corte_apertura: parametros.corte_apertura?.slice(0, 10) ?? null,
      motivo: '',
    },
    validate: zod4Resolver(esquemaParametros),
  });
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <form
        onSubmit={form.onSubmit((v) =>
          guardar.mutate({
            costo_hora: v.costo_hora,
            umbral_variacion: (v.umbral ?? 0) / 100,
            margen_minimo: (v.margen ?? 0) / 100,
            vigencia_cotizacion_dias: v.vigencia ?? 0,
            corte_a: (v.corte_a ?? 80) / 100,
            corte_b: (v.corte_b ?? 95) / 100,
            corte_apertura: v.corte_apertura,
            motivo: v.motivo.trim() || null,
          }),
        )}
      >
        <Stack gap="md">
          <Text fw={600}>
            <IconAdjustments size={17} style={{ verticalAlign: 'text-bottom' }} /> Cambiar
            parámetros
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <NumberInput
              label="Costo hora"
              prefix="$ "
              thousandSeparator="."
              decimalSeparator=","
              decimalScale={2}
              min={0}
              value={form.values.costo_hora ?? ''}
              onChange={(x) => form.setFieldValue('costo_hora', numOrNull(x))}
              error={form.errors.costo_hora}
            />
            <NumberInput
              label="Umbral de aviso"
              suffix=" %"
              decimalScale={2}
              decimalSeparator=","
              min={0}
              max={100}
              value={form.values.umbral ?? ''}
              onChange={(x) => form.setFieldValue('umbral', numOrNull(x))}
              error={form.errors.umbral}
            />
            <NumberInput
              label="Margen mínimo"
              suffix=" %"
              decimalScale={2}
              decimalSeparator=","
              min={0}
              max={100}
              value={form.values.margen ?? ''}
              onChange={(x) => form.setFieldValue('margen', numOrNull(x))}
              error={form.errors.margen}
            />
            <NumberInput
              label="Vigencia de cotización (días)"
              min={1}
              allowDecimal={false}
              value={form.values.vigencia ?? ''}
              onChange={(x) => form.setFieldValue('vigencia', numOrNull(x))}
              error={form.errors.vigencia}
            />
            <NumberInput
              label="Pareto: clase A hasta"
              description="% acumulado de la facturación"
              suffix=" %"
              decimalScale={1}
              decimalSeparator=","
              min={1}
              max={99}
              value={form.values.corte_a ?? ''}
              onChange={(x) => form.setFieldValue('corte_a', numOrNull(x))}
              error={form.errors.corte_a}
            />
            <NumberInput
              label="Pareto: clase B hasta"
              description="el resto es C"
              suffix=" %"
              decimalScale={1}
              decimalSeparator=","
              min={1}
              max={99}
              value={form.values.corte_b ?? ''}
              onChange={(x) => form.setFieldValue('corte_b', numOrNull(x))}
              error={form.errors.corte_b}
            />
            <DateInput
              label="Corte de la apertura"
              description="Antes de esta fecha, o sin fecha: desactualizado"
              valueFormat="DD/MM/YYYY"
              value={form.values.corte_apertura}
              onChange={(x) => form.setFieldValue('corte_apertura', x)}
              error={form.errors.corte_apertura}
            />
          </SimpleGrid>
          <Group align="flex-end" wrap="wrap">
            <TextInput
              label="Motivo"
              placeholder="Paritaria de septiembre, cambio de política…"
              style={{ flex: 1, minWidth: 240 }}
              {...form.getInputProps('motivo')}
            />
            <Button type="submit" size="md" loading={guardar.isPending}>
              Guardar parámetros
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

/** Pivot por mes: una fila por mes, una columna por serie. */
function TablaSeries({ puntos }: { puntos: PuntoSerieMacro[] }) {
  if (puntos.length === 0) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio
          icono={IconChartLine}
          titulo="Sin series cargadas"
          descripcion="Cargá el IPC y el tipo de cambio de cada mes para ver los gráficos en dólares y en pesos constantes."
        />
      </Paper>
    );
  }

  const porMes = new Map<string, Partial<Record<SerieMacro, PuntoSerieMacro>>>();
  for (const pt of puntos) {
    const fila = porMes.get(pt.mes) ?? {};
    fila[pt.serie] = pt;
    porMes.set(pt.mes, fila);
  }
  const meses = [...porMes.entries()].sort(([a], [b]) => b.localeCompare(a));

  const celda = (pt: PuntoSerieMacro | undefined) =>
    pt ? (
      <Group gap={6} justify="flex-end" wrap="nowrap">
        <span>{numero(pt.valor, 2)}</span>
        {pt.es_provisorio ? (
          <Badge color="orange" variant="light" size="xs">
            provisorio
          </Badge>
        ) : null}
      </Group>
    ) : (
      '—'
    );

  return (
    <Paper
      withBorder
      style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
    >
      <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Mes</Table.Th>
              <Table.Th ta="right">IPC</Table.Th>
              <Table.Th ta="right">TC A3500 promedio</Table.Th>
              <Table.Th ta="right">TC A3500 cierre</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {meses.map(([mes, fila]) => (
              <Table.Tr key={mes}>
                <Table.Td fw={600} ff="monospace">
                  {mes.slice(0, 7)}
                </Table.Td>
                <Table.Td ta="right" ff="monospace">
                  {celda(fila.IPC)}
                </Table.Td>
                <Table.Td ta="right" ff="monospace">
                  {celda(fila.TC_A3500_PROMEDIO)}
                </Table.Td>
                <Table.Td ta="right" ff="monospace">
                  {celda(fila.TC_A3500_CIERRE)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

type ValoresSerie = {
  serie: SerieMacro | null;
  mes: Date | null;
  valor: number | null;
  fuente: string;
  provisorio: boolean;
};

const esquemaSerie = z.object({
  serie: z.enum(['IPC', 'TC_A3500_PROMEDIO', 'TC_A3500_CIERRE'], {
    error: 'Elegí la serie',
  }),
  mes: z.date({ error: 'Elegí el mes' }),
  valor: z
    .number({ error: 'Falta el valor' })
    .positive('El valor tiene que ser mayor que cero'),
  fuente: z.string().trim().min(1, 'Falta la fuente'),
  provisorio: z.boolean(),
});

/** Si ya existe la serie en ese mes, se actualiza la fila (id) y no se duplica. */
function FormularioSerie({ puntos }: { puntos: PuntoSerieMacro[] }) {
  const guardar = useCargarSerie();
  const form = useForm<ValoresSerie>({
    mode: 'controlled',
    initialValues: {
      serie: 'IPC',
      mes: new Date(),
      valor: null,
      fuente: 'INDEC',
      provisorio: false,
    },
    validate: zod4Resolver(esquemaSerie),
  });
  const v = form.values;

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <form
        onSubmit={form.onSubmit((x) => {
          const mesISO = fechaISO(new Date(x.mes!.getFullYear(), x.mes!.getMonth(), 1))!;
          const existente = puntos.find((p) => p.serie === x.serie && p.mes === mesISO);
          guardar.mutate(
            {
              ...(existente ? { id: existente.id } : {}),
              serie: x.serie!,
              mes: mesISO,
              valor: x.valor ?? 0,
              fuente: x.fuente.trim(),
              es_provisorio: x.provisorio,
            },
            { onSuccess: () => form.setFieldValue('valor', null) },
          );
        })}
      >
        <Stack gap="md">
          <Text fw={600}>Cargar un mes</Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            <Select
              label="Serie"
              data={SERIES.map((s) => ({ value: s.value, label: s.label }))}
              value={v.serie}
              onChange={(x) => {
                const s = SERIES.find((i) => i.value === x);
                if (!s) return;
                form.setFieldValue('serie', s.value);
                form.setFieldValue('fuente', s.fuente);
              }}
              allowDeselect={false}
              error={form.errors.serie}
            />
            <MonthPickerInput
              label="Mes"
              valueFormat="MM/YYYY"
              value={v.mes}
              onChange={(x) => form.setFieldValue('mes', x ? new Date(x) : null)}
              error={form.errors.mes}
            />
            <NumberInput
              label="Valor"
              min={0}
              decimalScale={4}
              thousandSeparator="."
              decimalSeparator=","
              value={v.valor ?? ''}
              onChange={(x) => form.setFieldValue('valor', numOrNull(x))}
              error={form.errors.valor}
            />
            <TextInput label="Fuente" {...form.getInputProps('fuente')} />
          </SimpleGrid>
          <Group align="center" wrap="wrap">
            <Switch
              size="md"
              label="Provisorio (se reemplaza cuando sale el dato oficial)"
              checked={v.provisorio}
              onChange={(e) => form.setFieldValue('provisorio', e.currentTarget.checked)}
            />
            <Button type="submit" size="md" loading={guardar.isPending}>
              Guardar serie
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

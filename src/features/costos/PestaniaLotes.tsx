import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconReceipt, IconSearch } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { fecha, numero } from '@/lib/formato';
import {
  COMPROBANTES,
  ROLES_CARGAN_COSTO_LOTE,
  UNIDADES_COSTO,
  useCargarCostosLote,
  useCostosLote,
  useLotesSinCosto,
  type CostoLote,
  type CostoReferencia,
  type LoteSinCosto,
} from '@/lib/consultasCostos';
import { CamposCosto, COSTO_VACIO, type ValorCosto } from './CamposCosto';
import {
  camposParaGuardar,
  formaCosto,
  pesos,
  reglasCosto,
  useReferenciaPorInsumo,
} from './comun';

/** Últimos doce meses, «AAAA-MM», el actual primero. */
const MESES = Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
  const v = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  return { value: v, label: v };
});

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function PestaniaLotes() {
  const lotes = useCostosLote();
  const sinCosto = useLotesSinCosto();
  const puede = useTieneRol(...ROLES_CARGAN_COSTO_LOTE);
  const [texto, setTexto] = useDebouncedState('', 250);
  const [filtro, setFiltro] = useState<string>('todos');
  const [mes, setMes] = useState<string>(MESES[0]?.value ?? '');
  const [rectificando, setRectificando] = useState<CostoLote | null>(null);
  const [cargando, setCargando] = useState<LoteSinCosto | null>(null);

  if (lotes.isLoading || sinCosto.isLoading) return <Skeleton h={300} />;

  const filas = lotes.data ?? [];
  const delMes = filas.filter((r) => (r.fecha_costo ?? '').startsWith(mes));
  const totalMes = suma(delMes.map((r) => r.costo_total_ars));
  const sinCompMes = suma(
    delMes
      .filter((r) => r.tipo_comprobante === 'SIN_COMPROBANTE')
      .map((r) => r.costo_total_ars),
  );
  const pctSinComp = totalMes > 0 ? (sinCompMes / totalMes) * 100 : 0;

  const busqueda = texto.trim().toLowerCase();
  const visibles = filas
    .filter(
      (r) =>
        filtro === 'todos' ||
        (filtro === 'sin' && r.tipo_comprobante === 'SIN_COMPROBANTE') ||
        (filtro === 'apertura' && r.origen === 'APERTURA'),
    )
    .filter(
      (r) =>
        !busqueda ||
        r.insumo.toLowerCase().includes(busqueda) ||
        r.codigo_interno.toLowerCase().includes(busqueda),
    );
  const pendientes = sinCosto.data ?? [];

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Select
            label="Mes"
            data={MESES}
            value={mes}
            onChange={(v) => v && setMes(v)}
            allowDeselect={false}
            w={{ base: '100%', sm: 180 }}
          />
          <Stack gap={2} maw={560}>
            <Text fw={700} ff="monospace">
              {numero(pctSinComp, 1)} % del costo del mes sin comprobante
            </Text>
            <Text size="sm" c="dimmed">
              Sin comprobante {pesos(sinCompMes)} de {pesos(totalMes)} cargados en el mes.
            </Text>
          </Stack>
        </Group>
      </Paper>

      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder="Insumo o código"
          leftSection={<IconSearch size={17} />}
          defaultValue={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          w={{ base: '100%', sm: 340 }}
        />
        <SegmentedControl
          value={filtro}
          onChange={setFiltro}
          data={[
            { label: 'Todos', value: 'todos' },
            { label: 'Sin comprobante', value: 'sin' },
            { label: 'Apertura', value: 'apertura' },
          ]}
        />
      </Group>

      {filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconReceipt}
            titulo="Ningún lote con costo"
            descripcion="Cargá el costo de un lote recibido desde la sección de abajo."
          />
        </Paper>
      ) : visibles.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconSearch}
            titulo="Ningún lote coincide"
            descripcion="Probá con otro texto o cambiá el filtro."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={1100}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th>Origen</Table.Th>
                  <Table.Th>Comprobante</Table.Th>
                  <Table.Th>Pagado</Table.Th>
                  <Table.Th ta="right">Cantidad</Table.Th>
                  <Table.Th ta="right">Neto $</Table.Th>
                  <Table.Th ta="right">Accesorios $</Table.Th>
                  <Table.Th ta="right">Unitario</Table.Th>
                  {puede ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.slice(0, 300).map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>{fecha(r.fecha_costo)}</Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {r.insumo}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {r.codigo_interno}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {r.origen === 'APERTURA' ? (
                        <Badge color="gray" variant="light">
                          Apertura
                        </Badge>
                      ) : (
                        <Badge color="blue" variant="light">
                          Recepción
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {r.tipo_comprobante === 'SIN_COMPROBANTE' ? (
                        <Badge color="orange" variant="filled">
                          SIN COMPROBANTE
                        </Badge>
                      ) : (
                        <Text size="sm">
                          {COMPROBANTES.find((c) => c.value === r.tipo_comprobante)
                            ?.label ?? '—'}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ff="monospace">
                      {r.moneda === 'USD'
                        ? `U$D ${numero(r.importe, 2)} · TC ${numero(r.tipo_cambio, 2)}`
                        : pesos(r.importe)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(r.cantidad, 2)} {r.unidad}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {pesos(r.precio_neto_ars)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {pesos(r.accesorios_ars)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {r.costo_unitario_ars !== null && r.unidad_medida ? (
                        `${pesos(r.costo_unitario_ars)} por ${r.unidad_medida}`
                      ) : (
                        <Tooltip label="Sin unidad o sin densidad" withArrow>
                          <Text span c="dimmed">
                            —
                          </Text>
                        </Tooltip>
                      )}
                    </Table.Td>
                    {puede ? (
                      <Table.Td>
                        <Button
                          size="sm"
                          variant="light"
                          onClick={() => setRectificando(r)}
                        >
                          Rectificar
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
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

      <Stack gap="sm">
        <Text fw={600}>Lotes recibidos sin costo ({pendientes.length})</Text>
        {pendientes.length === 0 ? (
          <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
            <Text size="sm" c="dimmed">
              Todos los lotes recibidos tienen costo cargado.
            </Text>
          </Paper>
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={680}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Recepción</Table.Th>
                    <Table.Th>Proveedor</Table.Th>
                    <Table.Th>Insumo</Table.Th>
                    <Table.Th ta="right">Cantidad</Table.Th>
                    {puede ? <Table.Th /> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pendientes.map((l) => (
                    <Table.Tr key={l.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {l.recepcion_numero ?? l.numero_registro_interno}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {fecha(l.recepcion_fecha)}
                        </Text>
                      </Table.Td>
                      <Table.Td>{l.proveedor ?? '—'}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{l.insumo_nombre}</Text>
                        <Text size="xs" c="dimmed">
                          {l.codigo_interno}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {numero(l.cantidad_unidades, 2)} {l.unidad}
                      </Table.Td>
                      {puede ? (
                        <Table.Td>
                          <Button
                            size="sm"
                            variant="light"
                            onClick={() => setCargando(l)}
                          >
                            Cargar costo
                          </Button>
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>

      <Modal
        opened={rectificando !== null}
        onClose={() => setRectificando(null)}
        title={rectificando ? `Rectificar costo: ${rectificando.insumo}` : ''}
        centered
        size="lg"
      >
        {rectificando ? (
          <FormularioRectificar
            fila={rectificando}
            onListo={() => setRectificando(null)}
          />
        ) : null}
      </Modal>

      <Modal
        opened={cargando !== null}
        onClose={() => setCargando(null)}
        title={cargando ? `Cargar costo: ${cargando.insumo_nombre}` : ''}
        centered
        size="lg"
      >
        {cargando ? (
          <FormularioCargar lote={cargando} onListo={() => setCargando(null)} />
        ) : null}
      </Modal>
    </Stack>
  );
}

type ValoresCosto = ValorCosto & {
  motivo: string;
};

const esquemaRectificar = z
  .object({
    ...formaCosto,
    motivo: z.string().trim().min(3, 'Explicá el motivo de la rectificación'),
  })
  .superRefine((v, ctx) => reglasCosto(v, ctx, true));

const esquemaCargar = z
  .object({ ...formaCosto, motivo: z.string() })
  .superRefine((v, ctx) => reglasCosto(v, ctx, true));

/** Formulario de costo compartido: el costo no se edita, se carga uno nuevo. */
function FormularioCosto({
  inicial,
  referencia,
  conMotivo,
  textoGuardar,
  guardando,
  onGuardar,
}: {
  inicial: ValorCosto;
  referencia: CostoReferencia | null;
  conMotivo: boolean;
  textoGuardar: string;
  guardando: boolean;
  onGuardar: (v: ValoresCosto) => void;
}) {
  const form = useForm<ValoresCosto>({
    mode: 'controlled',
    initialValues: { ...inicial, motivo: '' },
    validate: zod4Resolver(conMotivo ? esquemaRectificar : esquemaCargar),
  });
  const primerError = Object.values(form.errors)[0];

  return (
    <form onSubmit={form.onSubmit((v) => onGuardar(v))}>
      <Stack gap="md">
        <CamposCosto
          valor={form.values}
          onChange={(v) => form.setValues(v)}
          unidadCatalogo={referencia?.unidad_medida ?? null}
          referencia={referencia}
        />
        {conMotivo ? (
          <Textarea
            label="Motivo"
            description="El costo no se edita: se carga uno nuevo que corrige al anterior, y el anterior queda en el historial."
            required
            autosize
            minRows={2}
            {...form.getInputProps('motivo')}
          />
        ) : null}
        {primerError ? (
          <Text size="sm" c="red">
            {typeof primerError === 'string'
              ? primerError
              : 'Revisá los datos del costo.'}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button type="submit" size="md" loading={guardando}>
            {textoGuardar}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function FormularioRectificar({
  fila,
  onListo,
}: {
  fila: CostoLote;
  onListo: () => void;
}) {
  const rectificar = useCargarCostosLote();
  const referencia = useReferenciaPorInsumo().get(fila.insumo_id) ?? null;
  const inicial: ValorCosto = {
    tipo_comprobante: fila.tipo_comprobante ?? 'SIN_COMPROBANTE',
    importe: fila.importe,
    incluye_iva: true,
    alicuota_iva: 21,
    moneda: fila.moneda,
    tipo_cambio: fila.tipo_cambio,
    cantidad: fila.cantidad,
    unidad: fila.unidad,
  };
  return (
    <FormularioCosto
      inicial={inicial}
      referencia={referencia}
      conMotivo
      textoGuardar="Guardar rectificación"
      guardando={rectificar.isPending}
      onGuardar={(v) =>
        rectificar.mutate(
          [
            {
              lote_insumo_id: fila.lote_insumo_id,
              ...camposParaGuardar(v),
              fecha_costo: fila.fecha_costo,
              rectifica_a: fila.id,
              motivo: v.motivo.trim(),
            },
          ],
          { onSuccess: onListo },
        )
      }
    />
  );
}

function FormularioCargar({
  lote,
  onListo,
}: {
  lote: LoteSinCosto;
  onListo: () => void;
}) {
  const cargar = useCargarCostosLote();
  const referencia = useReferenciaPorInsumo().get(lote.insumo_id) ?? null;
  const inicial: ValorCosto = {
    ...COSTO_VACIO,
    unidad: UNIDADES_COSTO.includes(lote.unidad) ? lote.unidad : 'UNIDAD',
    cantidad: lote.cantidad_unidades,
  };
  return (
    <FormularioCosto
      inicial={inicial}
      referencia={referencia}
      conMotivo={false}
      textoGuardar="Cargar costo"
      guardando={cargar.isPending}
      onGuardar={(v) =>
        cargar.mutate(
          [
            {
              lote_insumo_id: lote.id,
              ...camposParaGuardar(v),
              fecha_costo: lote.recepcion_fecha?.slice(0, 10) ?? null,
            },
          ],
          { onSuccess: onListo },
        )
      }
    />
  );
}

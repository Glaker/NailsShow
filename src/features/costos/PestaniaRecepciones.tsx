import { useState } from 'react';
import {
  Badge,
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
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconReceipt } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { fecha, fechaISO } from '@/lib/formato';
import {
  COMPROBANTES,
  ROLES_CARGAN_COSTO_LOTE,
  useAccesorios,
  useCargarAccesorio,
  useConciliacion,
  type Accesorio,
  type Conciliacion,
} from '@/lib/consultasCostos';
import { CamposCosto, COSTO_VACIO, type ValorCosto } from './CamposCosto';
import { formaCosto, pesos, reglasCosto } from './comun';

const CONCEPTOS: { value: Accesorio['concepto']; label: string }[] = [
  { value: 'FLETE', label: 'Flete' },
  { value: 'SEGURO', label: 'Seguro' },
  { value: 'ARANCELES', label: 'Aranceles' },
  { value: 'DESPACHANTE', label: 'Despachante' },
  { value: 'OTRO', label: 'Otro' },
];
const etiquetaConcepto = (c: Accesorio['concepto']) =>
  CONCEPTOS.find((x) => x.value === c)?.label ?? c;

export function PestaniaRecepciones() {
  const conciliacion = useConciliacion();
  const [recepcion, setRecepcion] = useState<Conciliacion | null>(null);

  if (conciliacion.isLoading) return <Skeleton h={300} />;
  const filas = conciliacion.data ?? [];

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Compara la suma de netos de los lotes con la factura del proveedor (en B y C, el
        total). No incluye compras sin factura. Tocá una recepción para ver sus costos
        accesorios.
      </Text>

      {filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconReceipt}
            titulo="Sin recepciones para conciliar"
            descripcion="Cuando se reciba un lote con factura, acá aparece la comparación contra el proveedor."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Recepción</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th ta="right">Lotes</Table.Th>
                  <Table.Th ta="right">Neto lotes</Table.Th>
                  <Table.Th ta="right">Neto factura(s)</Table.Th>
                  <Table.Th ta="right">Diferencia</Table.Th>
                  <Table.Th>Estado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((c) => (
                  <Table.Tr
                    key={c.recepcion_id}
                    onClick={() => setRecepcion(c)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td fw={600}>{c.recepcion}</Table.Td>
                    <Table.Td>{fecha(c.fecha)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {c.lotes_con_costo}/{c.lotes}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {pesos(c.neto_lotes)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {pesos(c.neto_comprobantes)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {pesos(c.diferencia)}
                    </Table.Td>
                    <Table.Td>
                      {c.con_aviso ? (
                        <Badge color="orange" variant="filled">
                          Revisar
                        </Badge>
                      ) : (
                        <Badge color="green" variant="light">
                          Concilia
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <Modal
        opened={recepcion !== null}
        onClose={() => setRecepcion(null)}
        title={recepcion ? `Costos accesorios · ${recepcion.recepcion}` : ''}
        centered
        size="xl"
      >
        {recepcion ? <ContenidoAccesorios recepcionId={recepcion.recepcion_id} /> : null}
      </Modal>
    </Stack>
  );
}

function ContenidoAccesorios({ recepcionId }: { recepcionId: string }) {
  const accesorios = useAccesorios(recepcionId);
  const puede = useTieneRol(...ROLES_CARGAN_COSTO_LOTE);
  const [quitando, setQuitando] = useState<Accesorio | null>(null);

  if (accesorios.isLoading) return <Skeleton h={160} />;
  const filas = accesorios.data ?? [];

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Se reparte entre los lotes de la recepción en proporción a lo que costó cada uno.
      </Text>

      {filas.length === 0 ? (
        <Text size="sm" c="dimmed">
          Esta recepción todavía no tiene costos accesorios.
        </Text>
      ) : (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Concepto</Table.Th>
                  <Table.Th>Comprobante</Table.Th>
                  <Table.Th ta="right">Importe neto</Table.Th>
                  {puede ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {etiquetaConcepto(a.concepto)}
                        {a.rectifica_a ? (
                          <Badge ml="xs" color="gray" variant="light">
                            corrige
                          </Badge>
                        ) : null}
                      </Text>
                      {a.descripcion ? (
                        <Text size="xs" c="dimmed">
                          {a.descripcion}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {COMPROBANTES.find((c) => c.value === a.tipo_comprobante)?.label ?? '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {pesos(a.importe_neto_ars)}
                    </Table.Td>
                    {puede ? (
                      <Table.Td>
                        {a.importe_neto_ars !== 0 && !a.rectifica_a ? (
                          <Button
                            size="sm"
                            variant="subtle"
                            color="red"
                            onClick={() => setQuitando(a)}
                          >
                            Quitar
                          </Button>
                        ) : null}
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {quitando ? (
        <FormularioQuitar
          accesorio={quitando}
          onCancelar={() => setQuitando(null)}
          onListo={() => setQuitando(null)}
        />
      ) : null}

      {puede ? <FormularioAccesorio recepcionId={recepcionId} /> : null}
    </Stack>
  );
}

const esquemaQuitar = z.object({
  motivo: z.string().trim().min(3, 'Explicá el motivo para quitarlo'),
});

/** Quitar = corregir con importe 0 que apunta al original (RN de rectificación). */
function FormularioQuitar({
  accesorio,
  onCancelar,
  onListo,
}: {
  accesorio: Accesorio;
  onCancelar: () => void;
  onListo: () => void;
}) {
  const quitar = useCargarAccesorio();
  const form = useForm<{ motivo: string }>({
    mode: 'controlled',
    initialValues: { motivo: '' },
    validate: zod4Resolver(esquemaQuitar),
  });
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <form
        onSubmit={form.onSubmit((v) =>
          quitar.mutate(
            {
              recepcion_id: accesorio.recepcion_id,
              concepto: accesorio.concepto,
              descripcion: accesorio.descripcion,
              tipo_comprobante: accesorio.tipo_comprobante,
              importe: 0,
              incluye_iva: false,
              alicuota_iva: 21,
              moneda: 'ARS',
              tipo_cambio: 1,
              fecha_costo: null,
              rectifica_a: accesorio.id,
              motivo: v.motivo.trim(),
            },
            { onSuccess: onListo },
          ),
        )}
      >
        <Stack gap="sm">
          <Text fw={600}>
            Quitar «{etiquetaConcepto(accesorio.concepto)}» de {pesos(accesorio.importe_neto_ars)}
          </Text>
          <TextInput
            label="Motivo"
            placeholder="Cargado por error, factura anulada…"
            {...form.getInputProps('motivo')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onCancelar}>
              Volver
            </Button>
            <Button type="submit" color="red" loading={quitar.isPending}>
              Quitar accesorio
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

type ValoresAccesorio = ValorCosto & {
  concepto: string | null;
  descripcion: string;
  fecha: Date | null;
};

const esquemaAccesorio = z
  .object({
    ...formaCosto,
    concepto: z.enum(['FLETE', 'SEGURO', 'ARANCELES', 'DESPACHANTE', 'OTRO'], {
      error: 'Elegí el concepto',
    }),
    descripcion: z.string(),
    fecha: z.date({ error: 'Falta la fecha' }),
  })
  .superRefine((v, ctx) => {
    reglasCosto(v, ctx, false);
    if (!(v.importe > 0))
      ctx.addIssue({ code: 'custom', path: ['importe'], message: 'Falta el importe' });
  });

function FormularioAccesorio({ recepcionId }: { recepcionId: string }) {
  const cargar = useCargarAccesorio();
  const form = useForm<ValoresAccesorio>({
    mode: 'controlled',
    initialValues: {
      ...COSTO_VACIO,
      concepto: null,
      descripcion: '',
      fecha: new Date(),
    },
    validate: zod4Resolver(esquemaAccesorio),
  });
  const v = form.values;

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <form
        onSubmit={form.onSubmit((x) =>
          cargar.mutate(
            {
              recepcion_id: recepcionId,
              concepto: x.concepto as Accesorio['concepto'],
              descripcion: x.descripcion.trim() || null,
              tipo_comprobante: x.tipo_comprobante,
              importe: x.importe ?? 0,
              incluye_iva: x.incluye_iva,
              alicuota_iva: x.alicuota_iva,
              moneda: x.moneda,
              tipo_cambio: x.moneda === 'USD' ? (x.tipo_cambio ?? 0) : 1,
              fecha_costo: fechaISO(x.fecha),
            },
            { onSuccess: () => form.reset() },
          ),
        )}
      >
        <Stack gap="md">
          <Text fw={600}>Agregar costo accesorio</Text>
          <Group grow align="flex-start" wrap="wrap">
            <Select
              label="Concepto"
              data={CONCEPTOS}
              value={v.concepto}
              onChange={(x) => form.setFieldValue('concepto', x)}
              error={form.errors.concepto}
            />
            <TextInput
              label="Descripción"
              placeholder="Transportista, número de carta de porte…"
              {...form.getInputProps('descripcion')}
            />
            <DateInput
              label="Fecha"
              valueFormat="DD/MM/YYYY"
              value={v.fecha}
              onChange={(x) => form.setFieldValue('fecha', x ? new Date(x) : null)}
              error={form.errors.fecha}
            />
          </Group>
          <CamposCosto
            valor={form.values}
            onChange={(x) => form.setValues(x)}
            sinCantidad
          />
          <Group justify="flex-end">
            <Button type="submit" size="md" loading={cargar.isPending}>
              Agregar accesorio
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

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
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDebouncedState } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconCoin, IconFileDownload, IconSearch } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { FINANZAS, useTieneRol } from '@/features/auth/sesion';
import { fecha, fechaISO, numero } from '@/lib/formato';
import {
  UNIDADES_COSTO,
  convertirCantidad,
  useCostosPendientes,
  useCostosReferencia,
  useTipoCambioActivo,
  useDarDeBajaReferencia,
  useFijarCostoReferencia,
  type CostoReferencia,
  type Moneda,
} from '@/lib/consultasCostos';
import { numOrNull, pesosUnitario } from './comun';
import { ImportarExcel } from '@/components/ImportarExcel';
import { Exportar } from '@/components/Exportar';
import { PLANTILLA_COSTOS_MP, type ContextoCostos } from '@/lib/importacion';
import { descargarXlsx, type Celda } from '@/lib/xlsx';
import { ROLES_IMPORTAN, useImportarCostosReferencia } from '@/lib/consultasCostos';
import { BadgeOrigen } from './BadgeOrigen';

export function PestaniaInsumos() {
  const referencia = useCostosReferencia();
  const puede = useTieneRol(FINANZAS);
  const baja = useDarDeBajaReferencia();
  const [texto, setTexto] = useDebouncedState('', 250);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [fijando, setFijando] = useState<CostoReferencia | null>(null);
  const importa = useTieneRol(...ROLES_IMPORTAN);
  const importar = useImportarCostosReferencia();

  const filas = referencia.data ?? [];
  const cuenta = (x: Filtro) => filas.filter(FILTROS[x].pasa).length;
  const busqueda = texto.trim().toLowerCase();
  const visibles = filas
    .filter(FILTROS[filtro].pasa)
    .filter(
      (f) =>
        !busqueda ||
        f.nombre.toLowerCase().includes(busqueda) ||
        f.codigo_interno.toLowerCase().includes(busqueda),
    );

  if (referencia.isLoading) return <Skeleton h={300} />;

  const contexto: ContextoCostos = {
    insumos: new Map(filas.map((f) => [f.codigo_interno, { unidad: f.unidad_medida, tieneManual: f.costo_manual !== null }])),
  };

  const darDeBaja = (f: CostoReferencia) => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    modals.openConfirmModal({
      title: 'Dar de baja el precio manual',
      children: (
        <Text size="sm">
          Desde mañana rige el costo del último lote para {f.nombre}. Lo que ya se pagó en
          cada lote no cambia.
        </Text>
      ),
      labels: { confirm: 'Dar de baja', cancel: 'Volver' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        if (f.costo_referencia_id)
          baja.mutate({ id: f.costo_referencia_id, hasta: fechaISO(ayer)! });
      },
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder="Insumo o código"
          leftSection={<IconSearch size={17} />}
          defaultValue={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          w={{ base: '100%', sm: 340 }}
        />
        <Group gap="xs">
          {(['sin', 'pendientes', 'desactualizados'] as const).map((x) => (
            <Button
              key={x}
              size="md"
              variant={filtro === x ? 'filled' : 'default'}
              onClick={() => setFiltro(filtro === x ? 'todos' : x)}
            >
              {FILTROS[x].etiqueta} ({cuenta(x)})
            </Button>
          ))}
        </Group>
        <Group gap="xs" className="no-imprimir">
          {/* Importa Finanzas (la base lo exige); Administración exporta. */}
          {puede ? (
            <ImportarExcel
              plantilla={PLANTILLA_COSTOS_MP}
              contexto={contexto}
              onConfirmar={({ renglones, archivo, hash }) =>
                importar.mutateAsync({ archivo, hash, filas: renglones.map((r) => r.datos) })
              }
            />
          ) : null}
          {importa || puede ? <ExcelPendientes /> : null}
          {importa || puede ? (
            <Exportar
              archivo="costos_de_referencia"
              encabezados={['codigo', 'insumo', 'unidad', 'costo_unitario_neto', 'origen', 'fecha', 'desactualizado', 'pendiente', 'manual', 'ultimo_lote', 'apertura']}
              filas={visibles.map((f) => [f.codigo_interno, f.nombre, f.unidad_medida, f.costo_unitario_ars, f.origen, f.fecha, f.desactualizado === null ? null : f.desactualizado ? 'SI' : 'NO', f.pendiente, f.costo_manual, f.costo_ultimo_lote, f.costo_apertura])}
            />
          ) : null}
        </Group>
      </Group>

      {filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconCoin}
            titulo="Todavía no hay costos"
            descripcion="Se cargan al recibir un lote (Stock › Recepciones) o fijando un precio de referencia acá."
          />
        </Paper>
      ) : visibles.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconSearch}
            titulo="Ningún insumo coincide"
            descripcion="Probá con otro texto o quitá el filtro."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Código / Insumo</Table.Th>
                  <Table.Th>Unidad</Table.Th>
                  <Table.Th ta="right">Costo vigente</Table.Th>
                  <Table.Th>Origen</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  {puede ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.slice(0, 300).map((f) => (
                  <Table.Tr key={f.insumo_id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {f.nombre}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {f.codigo_interno}
                      </Text>
                    </Table.Td>
                    <Table.Td>{f.unidad_medida ?? '—'}</Table.Td>
                    <Table.Td ta="right">
                      {f.costo_unitario_ars !== null ? (
                        <>
                          <Text ff="monospace" fw={700}>
                            {pesosUnitario(f.costo_unitario_ars)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            por {f.unidad_medida ?? 'unidad'}
                          </Text>
                        </>
                      ) : (
                        <Text size="sm" c={f.pendiente ? 'orange' : 'dimmed'}>
                          {f.pendiente ? `Pendiente: ${f.pendiente.toLowerCase()}` : 'sin costo'}
                        </Text>
                      )}
                      <Origenes fila={f} />
                      {f.tipo_cambio_aplicado !== null ? (
                        <Text size="xs" c="dimmed">
                          Dólares a $ {numero(f.tipo_cambio_aplicado, 2)} (A3500 {fecha(f.tipo_cambio_mes).slice(3)})
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <BadgeOrigen origen={f.origen} />
                        {f.desactualizado ? (
                          <Badge color="orange" variant="outline">
                            Desactualizado
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>{fecha(f.fecha)}</Table.Td>
                    {puede ? (
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button size="sm" variant="light" onClick={() => setFijando(f)}>
                            Fijar precio
                          </Button>
                          {f.origen === 'MANUAL' ? (
                            <Button
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={() => darDeBaja(f)}
                            >
                              Dar de baja
                            </Button>
                          ) : null}
                        </Group>
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

      <ModalFijarPrecio fila={fijando} onCerrar={() => setFijando(null)} />
    </Stack>
  );
}

type Filtro = 'todos' | 'sin' | 'pendientes' | 'desactualizados';
const FILTROS: Record<Filtro, { etiqueta: string; pasa: (f: CostoReferencia) => boolean }> = {
  todos: { etiqueta: 'Todos', pasa: () => true },
  sin: { etiqueta: 'Sin costo', pasa: (f) => f.costo_unitario_ars === null },
  pendientes: { etiqueta: 'Pendientes', pasa: (f) => f.pendiente !== null },
  desactualizados: { etiqueta: 'Desactualizados', pasa: (f) => f.desactualizado === true },
};

/**
 * Excel de pendientes de la planilla de apertura (D-42), con las columnas
 * exactas de la plantilla: se completa (cantidad y unidad de la presentación,
 * o el precio en la unidad del catálogo) y se reimporta.
 */
function ExcelPendientes() {
  const pendientes = useCostosPendientes();
  const tc = useTipoCambioActivo();
  const lista = pendientes.data ?? [];
  if (lista.length === 0) return null;
  const descargar = () => {
    const columnas = PLANTILLA_COSTOS_MP.columnas.map((c) => c.clave);
    const filas: Celda[][] = lista.map((p) => {
      const peso = p.peso_planilla ? ` (PESO en la planilla: ${p.peso_planilla})` : '';
      const v: Record<string, Celda> = {
        codigo_insumo: p.codigo_interno,
        importe: p.importe,
        incluye_iva: 'NO',
        alicuota: null,
        cantidad: p.cantidad,
        unidad: p.unidad,
        moneda: p.moneda,
        tipo_cambio: p.moneda === 'USD' ? (tc.data?.valor ?? null) : null,
        vigente_desde: p.fecha_costo,
        motivo: `Apertura: ${p.pendiente.toLowerCase()}${peso}${p.detalle ? ` · ${p.detalle}` : ''}`,
      };
      return columnas.map((c) => v[c] ?? null);
    });
    descargarXlsx([columnas, ...filas], 'pendientes_costos_apertura.xlsx', 'Pendientes');
  };
  return (
    <Button variant="light" color="orange" leftSection={<IconFileDownload size={18} />} onClick={descargar}>
      Excel de pendientes ({lista.length})
    </Button>
  );
}

/** Los tres valores por separado: lo que el inspector pregunta es de dónde sale el vigente. */
function Origenes({ fila }: { fila: CostoReferencia }) {
  const partes = [
    fila.costo_manual !== null ? `Finanzas ${pesosUnitario(fila.costo_manual)}` : null,
    fila.costo_ultimo_lote !== null ? `Último lote ${pesosUnitario(fila.costo_ultimo_lote)}` : null,
    fila.costo_apertura !== null ? `Apertura ${pesosUnitario(fila.costo_apertura)}` : null,
  ].filter((p): p is string => p !== null);
  if (partes.length === 0) return null;
  return (
    <Text size="xs" c="dimmed">
      {partes.join(' · ')}
    </Text>
  );
}

function ModalFijarPrecio({
  fila,
  onCerrar,
}: {
  fila: CostoReferencia | null;
  onCerrar: () => void;
}) {
  return (
    <Modal
      opened={fila !== null}
      onClose={onCerrar}
      title={fila ? `Fijar precio: ${fila.nombre}` : ''}
      centered
      size="lg"
    >
      {fila ? <FormularioFijar fila={fila} onListo={onCerrar} /> : null}
    </Modal>
  );
}

type ValoresFijar = {
  importe: number | null;
  incluye_iva: boolean;
  alicuota_iva: string;
  cantidad: number | null;
  unidad: string;
  moneda: Moneda;
  tipo_cambio: number | null;
  vigente_desde: Date | null;
  vigente_hasta: Date | null;
  motivo: string;
};

const esquemaFijar = z
  .object({
    importe: z.number({ error: 'Falta el importe' }).positive('El importe tiene que ser mayor que cero'),
    incluye_iva: z.boolean(),
    alicuota_iva: z.enum(['10.5', '21', '27']),
    cantidad: z.number({ error: 'Falta la cantidad' }).positive('La cantidad tiene que ser mayor que cero'),
    unidad: z.string().min(1, 'Falta la unidad'),
    moneda: z.enum(['ARS', 'USD']),
    tipo_cambio: z.number().nullable(),
    vigente_desde: z.date({ error: 'Falta la fecha de inicio' }),
    vigente_hasta: z.date().nullable(),
    motivo: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.moneda === 'USD' && !((v.tipo_cambio ?? 0) > 0))
      ctx.addIssue({ code: 'custom', path: ['tipo_cambio'], message: 'Falta el tipo de cambio' });
    if (v.vigente_hasta && v.vigente_hasta < v.vigente_desde)
      ctx.addIssue({
        code: 'custom',
        path: ['vigente_hasta'],
        message: 'Vence antes de que empiece',
      });
  });

function FormularioFijar({ fila, onListo }: { fila: CostoReferencia; onListo: () => void }) {
  const fijar = useFijarCostoReferencia();
  const form = useForm<ValoresFijar>({
    mode: 'controlled',
    initialValues: {
      importe: null,
      incluye_iva: false,
      alicuota_iva: '21',
      cantidad: 1,
      unidad: fila.unidad_medida ?? 'UNIDAD',
      moneda: 'ARS',
      tipo_cambio: null,
      vigente_desde: new Date(),
      vigente_hasta: null,
      motivo: '',
    },
    validate: zod4Resolver(esquemaFijar),
  });
  const v = form.values;
  const tc = v.moneda === 'ARS' ? 1 : (v.tipo_cambio ?? 0);
  const neto = v.importe !== null && v.incluye_iva ? v.importe / (1 + Number(v.alicuota_iva) / 100) : v.importe;
  const totalArs = neto !== null && tc > 0 ? neto * tc : null;
  const enUnidadCatalogo =
    v.cantidad && v.unidad && fila.unidad_medida
      ? convertirCantidad(v.cantidad, v.unidad, fila.unidad_medida)
      : null;
  const porUnidad =
    totalArs !== null && enUnidadCatalogo ? totalArs / enUnidadCatalogo : null;

  return (
    <form
      onSubmit={form.onSubmit((x) =>
        fijar.mutate(
          {
            insumo_id: fila.insumo_id,
            importe: x.importe ?? 0,
            incluye_iva: x.incluye_iva,
            alicuota_iva: x.incluye_iva ? Number(x.alicuota_iva) : null,
            cantidad: x.cantidad ?? 0,
            unidad: x.unidad,
            moneda: x.moneda,
            tipo_cambio: x.moneda === 'USD' ? (x.tipo_cambio ?? 0) : 1,
            vigente_desde: fechaISO(x.vigente_desde)!,
            vigente_hasta: fechaISO(x.vigente_hasta),
            motivo: x.motivo.trim() || null,
          },
          { onSuccess: onListo },
        ),
      )}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          El precio de la presentación, con o sin IVA: se guarda el neto. No cambia lo que se pagó en cada
          lote.
        </Text>
        <Group grow align="flex-start" wrap="wrap">
          <NumberInput
            label="Importe"
            min={0}
            decimalScale={4}
            thousandSeparator="."
            decimalSeparator=","
            prefix={v.moneda === 'USD' ? 'U$D ' : '$ '}
            value={v.importe ?? ''}
            onChange={(x) => form.setFieldValue('importe', numOrNull(x))}
            error={form.errors.importe}
          />
          <NumberInput
            label="Cantidad de la presentación"
            min={0}
            decimalScale={4}
            decimalSeparator=","
            value={v.cantidad ?? ''}
            onChange={(x) => form.setFieldValue('cantidad', numOrNull(x))}
            error={form.errors.cantidad}
          />
          <Select
            label="Unidad"
            data={UNIDADES_COSTO}
            value={v.unidad}
            onChange={(x) => x && form.setFieldValue('unidad', x)}
            allowDeselect={false}
          />
        </Group>
        <Group align="flex-end" wrap="wrap">
          <Switch
            size="lg"
            label="El importe incluye IVA"
            checked={v.incluye_iva}
            onChange={(e) => form.setFieldValue('incluye_iva', e.currentTarget.checked)}
          />
          {v.incluye_iva ? (
            <Select
              label="Alícuota"
              data={[
                { value: '21', label: '21 %' },
                { value: '10.5', label: '10,5 %' },
                { value: '27', label: '27 %' },
              ]}
              value={v.alicuota_iva}
              onChange={(x) => x && form.setFieldValue('alicuota_iva', x)}
              allowDeselect={false}
              w={120}
            />
          ) : null}
          {v.incluye_iva && neto !== null ? (
            <Text size="sm">
              Neto: <b>{v.moneda === 'USD' ? 'U$D' : '$'} {numero(neto, 2)}</b>
            </Text>
          ) : null}
        </Group>
        <div>
          <Text size="sm" fw={500} mb={6}>
            Moneda
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { label: 'Pesos', value: 'ARS' },
              { label: 'Dólares', value: 'USD' },
            ]}
            value={v.moneda}
            onChange={(x) => form.setFieldValue('moneda', x as Moneda)}
          />
        </div>
        {v.moneda === 'USD' ? (
          <NumberInput
            label="Tipo de cambio ($ por U$D)"
            min={0}
            decimalScale={4}
            thousandSeparator="."
            decimalSeparator=","
            value={v.tipo_cambio ?? ''}
            onChange={(x) => form.setFieldValue('tipo_cambio', numOrNull(x))}
            error={form.errors.tipo_cambio}
          />
        ) : null}
        <Group grow align="flex-start" wrap="wrap">
          <DateInput
            label="Vigente desde"
            valueFormat="DD/MM/YYYY"
            value={v.vigente_desde}
            onChange={(x) => form.setFieldValue('vigente_desde', x ? new Date(x) : null)}
            error={form.errors.vigente_desde}
          />
          <DateInput
            label="Vigente hasta (opcional)"
            valueFormat="DD/MM/YYYY"
            clearable
            value={v.vigente_hasta}
            onChange={(x) => form.setFieldValue('vigente_hasta', x ? new Date(x) : null)}
            error={form.errors.vigente_hasta}
          />
        </Group>
        <TextInput
          label="Motivo"
          placeholder="Cotización del proveedor, acuerdo de precio…"
          {...form.getInputProps('motivo')}
        />
        {porUnidad !== null && fila.unidad_medida ? (
          <Text size="sm">
            Equivale a <b>$ {numero(porUnidad, 4)}</b> por {fila.unidad_medida}
          </Text>
        ) : totalArs !== null && v.cantidad && fila.unidad_medida ? (
          <Text size="sm" c="orange">
            No se puede pasar {v.unidad} a {fila.unidad_medida} sin densidad: cargalo en{' '}
            {fila.unidad_medida}.
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button type="submit" size="md" loading={fijar.isPending}>
            Guardar precio
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

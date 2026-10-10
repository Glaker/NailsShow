import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
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
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconCopy, IconFileTypePdf, IconPlus, IconSend, IconTrash, IconX } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { GraficoTorta } from '@/features/administracion/GraficoTorta';
import { useSesion } from '@/features/auth/sesion';
import { fecha, numero } from '@/lib/formato';
import { useClientes } from '@/lib/consultasFacturacion';
import { UNIDADES_COSTO, useCostosReferencia, useParametrosCosto } from '@/lib/consultasCostos';
import { costearLinea, margenes, precioCotizacion, precioPorUnidadBase, type LineaCotizacion } from '@/lib/cotizador';
import {
  useAnularCotizacion,
  useClientesPotenciales,
  useCotizacion,
  useCrearPotencial,
  useDuplicarCotizacion,
  useEmitirCotizacion,
  useGuardarCotizacion,
  useGuardarLinea,
  useLineasCotizacion,
  useProponerCatalogo,
  useQuitarLinea,
  type Cotizacion,
  type LineaGuardada,
} from '@/lib/consultasCotizador';
import { ORIGEN_PRECIO } from './comun';

const pesos = (v: number, d = 2) => `$ ${numero(v, d)}`;
const pct = (v: number | null) => (v === null ? '—' : `${numero(v * 100, 1)} %`);
const n = (v: number | string) => (v === '' ? null : Number(v));

/**
 * Cotizador (Fase 5). Se arma la composición, el costo se recalcula en vivo
 * (src/lib/cotizador.ts), se fija precio o margen y se emite: ahí el servidor
 * recalcula todo, numera y congela. Una emitida no se edita: se duplica.
 */
export function PaginaCotizacion() {
  const { id = null } = useParams();
  const navigate = useNavigate();
  const cot = useCotizacion(id);
  const lineas = useLineasCotizacion(id);
  const referencias = useCostosReferencia();
  const parametros = useParametrosCosto();
  const guardar = useGuardarCotizacion();
  const duplicar = useDuplicarCotizacion();
  const [anulando, setAnulando] = useState(false);

  const c = cot.data;
  if (cot.isLoading || lineas.isLoading) return <Skeleton h={480} />;
  if (!c) return <Text>La cotización no existe o no la podés ver.</Text>;

  const borrador = c.estado === 'BORRADOR';
  const cambiar = (cambios: Partial<Cotizacion>) => guardar.mutate({ id: c.id, cambios });

  return (
    <Stack gap="lg">
      <EncabezadoPagina
        titulo={c.numero ? `Cotización n.º ${c.numero}/${c.anio}` : 'Cotización en borrador'}
        descripcion="Costo de gestión, sin IVA. El costo se recalcula en vivo; al emitir lo recalcula el sistema y queda congelado."
        acciones={
          <Group gap="xs">
            <Anchor component={Link} to="/cotizaciones" size="sm">
              Volver al historial
            </Anchor>
            {c.estado !== 'BORRADOR' ? (
              <>
                <Button component={Link} to={`/cotizaciones/${c.id}/pdf`} leftSection={<IconFileTypePdf size={18} />}>
                  PDF para el cliente
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconCopy size={18} />}
                  loading={duplicar.isPending}
                  onClick={() => duplicar.mutate(c.id, { onSuccess: (nueva) => void navigate(`/cotizaciones/${nueva}`) })}
                >
                  Duplicar
                </Button>
                {c.estado === 'EMITIDA' ? (
                  <Button variant="subtle" color="red" onClick={() => setAnulando(true)}>
                    Anular
                  </Button>
                ) : null}
              </>
            ) : null}
          </Group>
        }
      />
      <Group gap="xs">
        <Badge variant="light" color={c.estado === 'EMITIDA' ? 'green' : c.estado === 'ANULADA' ? 'red' : 'gray'}>
          {c.estado === 'BORRADOR' ? 'Borrador' : c.estado === 'EMITIDA' ? 'Emitida' : 'Anulada'}
        </Badge>
        {c.vence_el ? <Badge variant="light">Vence el {fecha(c.vence_el)}</Badge> : null}
        {c.destino === 'INTERNO' ? <Badge variant="light" color="grape">Uso interno</Badge> : null}
        {c.motivo_anulacion ? <Text size="sm" c="red">Anulada: {c.motivo_anulacion}</Text> : null}
      </Group>

      {borrador ? (
        <Cabecera key={c.id} c={c} onCambiar={cambiar} />
      ) : (
        <Text fw={600} size="lg">
          {c.titulo}
        </Text>
      )}

      <Composicion
        c={c}
        lineas={lineas.data ?? []}
        referencias={referencias.data ?? []}
        costoHora={parametros.data?.costo_hora ?? null}
        margenMinimo={parametros.data?.margen_minimo ?? 0.25}
        onCambiar={cambiar}
      />

      <AnularModal id={c.id} abierto={anulando} onCerrar={() => setAnulando(false)} />
    </Stack>
  );
}

function Cabecera({ c, onCambiar }: { c: Cotizacion; onCambiar: (x: Partial<Cotizacion>) => void }) {
  const clientes = useClientes();
  const potenciales = useClientesPotenciales();
  const crearPotencial = useCrearPotencial();
  const [nuevoPot, setNuevoPot] = useState({ razon_social: '', cuit: '', contacto: '' });
  const [titulo, setTitulo] = useState(c.titulo);
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <TextInput
          label="Producto"
          value={titulo}
          onChange={(e) => setTitulo(e.currentTarget.value)}
          onBlur={() => titulo.trim() && titulo !== c.titulo && onCambiar({ titulo: titulo.trim() })}
        />
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <NumberInput
            label="Contenido por unidad"
            min={0}
            decimalScale={3}
            decimalSeparator=","
            defaultValue={c.contenido_cantidad ?? ''}
            onBlur={(e) => {
              const v = n(e.currentTarget.value.replace(',', '.'));
              onCambiar({ contenido_cantidad: v, contenido_unidad: v ? (c.contenido_unidad ?? 'g') : null });
            }}
            style={{ flex: 1 }}
          />
          <Select
            data={['g', 'mL', 'unidades']}
            value={c.contenido_unidad ?? 'g'}
            onChange={(v) => v && c.contenido_cantidad && onCambiar({ contenido_unidad: v as Cotizacion['contenido_unidad'] })}
            w={110}
            allowDeselect={false}
          />
        </Group>
        <NumberInput
          label="Cantidad cotizada (unidades del pedido)"
          min={1}
          thousandSeparator="."
          decimalSeparator=","
          defaultValue={c.cantidad_cotizada}
          onBlur={(e) => {
            const v = n(e.currentTarget.value.replace(/\./g, '').replace(',', '.'));
            if (v && v > 0) onCambiar({ cantidad_cotizada: v });
          }}
        />
      </SimpleGrid>
      <Stack gap="xs" mt="md">
        <Text size="sm" fw={500}>
          Para
        </Text>
        <SegmentedControl
          value={c.destino}
          onChange={(v) =>
            onCambiar({ destino: v as Cotizacion['destino'], cliente_id: null, cliente_potencial_id: null })
          }
          data={[
            { label: 'Cliente', value: 'CLIENTE' },
            { label: 'Cliente potencial', value: 'POTENCIAL' },
            { label: 'Uso interno', value: 'INTERNO' },
          ]}
        />
        {c.destino === 'CLIENTE' ? (
          <Select
            placeholder="Elegí el cliente"
            searchable
            data={(clientes.data ?? []).filter((x) => x.activo).map((x) => ({ value: x.id, label: x.razon_social }))}
            value={c.cliente_id}
            onChange={(v) => v && onCambiar({ cliente_id: v })}
          />
        ) : null}
        {c.destino === 'POTENCIAL' ? (
          <Group align="flex-end" wrap="wrap">
            <Select
              placeholder="Elegí uno ya cargado"
              searchable
              data={(potenciales.data ?? []).map((x) => ({ value: x.id, label: x.razon_social }))}
              value={c.cliente_potencial_id}
              onChange={(v) => v && onCambiar({ cliente_potencial_id: v })}
              w={{ base: '100%', sm: 280 }}
            />
            <Text size="sm" c="dimmed">
              o cargá uno nuevo:
            </Text>
            <TextInput placeholder="Razón social" value={nuevoPot.razon_social} onChange={(e) => setNuevoPot({ ...nuevoPot, razon_social: e.currentTarget.value })} />
            <TextInput placeholder="CUIT (opcional)" value={nuevoPot.cuit} onChange={(e) => setNuevoPot({ ...nuevoPot, cuit: e.currentTarget.value.replace(/\D/g, '') })} w={150} />
            <TextInput placeholder="Contacto (opcional)" value={nuevoPot.contacto} onChange={(e) => setNuevoPot({ ...nuevoPot, contacto: e.currentTarget.value })} />
            <Button
              variant="light"
              disabled={!nuevoPot.razon_social.trim()}
              loading={crearPotencial.isPending}
              onClick={() =>
                crearPotencial.mutate(
                  { razon_social: nuevoPot.razon_social.trim(), cuit: nuevoPot.cuit || null, contacto: nuevoPot.contacto.trim() || null },
                  { onSuccess: (pid) => { onCambiar({ cliente_potencial_id: pid }); setNuevoPot({ razon_social: '', cuit: '', contacto: '' }); } },
                )
              }
            >
              Cargar
            </Button>
          </Group>
        ) : null}
        {c.destino === 'INTERNO' ? (
          <Text size="sm" c="dimmed">
            Sin cliente: para conocer costo y precio. El PDF lleva la marca «USO INTERNO».
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}

type Referencia = ReturnType<typeof useCostosReferencia>['data'] extends (infer T)[] | undefined ? T : never;

function aLinea(l: LineaGuardada, refs: Map<string, Referencia>): LineaCotizacion {
  const r = l.insumo_id ? refs.get(l.insumo_id) : undefined;
  return {
    tipo: l.tipo,
    nombre: l.nombre,
    cantidad: l.cantidad,
    unidad: l.unidad,
    merma: l.merma,
    costoCatalogo: r?.costo_unitario_ars ?? null,
    unidadCatalogo: r?.unidad_medida ?? null,
    precio: l.precio,
    cantidadPresentacion: l.cantidad_presentacion,
    unidadPresentacion: l.unidad_presentacion,
    incluyeIva: l.incluye_iva,
    alicuotaIva: l.alicuota_iva,
    densidad: l.densidad,
  };
}

function Composicion({
  c,
  lineas,
  referencias,
  costoHora,
  margenMinimo,
  onCambiar,
}: {
  c: Cotizacion;
  lineas: LineaGuardada[];
  referencias: Referencia[];
  costoHora: number | null;
  margenMinimo: number;
  onCambiar: (x: Partial<Cotizacion>) => void;
}) {
  const borrador = c.estado === 'BORRADOR';
  const guardarLinea = useGuardarLinea();
  const quitar = useQuitarLinea();
  const proponer = useProponerCatalogo();
  const emitir = useEmitirCotizacion();
  const { claims } = useSesion();
  const [agregando, setAgregando] = useState(false);
  const [justificacion, setJustificacion] = useState(c.justificacion_margen ?? '');

  const refs = useMemo(() => new Map(referencias.map((r) => [r.insumo_id, r])), [referencias]);
  const calculadas = lineas.map((l) => ({ l, k: costearLinea(aLinea(l, refs)) }));
  const materiales = calculadas.reduce((s, x) => s + (x.k.subtotal ?? 0), 0);
  const faltan = calculadas.filter((x) => x.k.falta);
  const mo = c.incluir_mano_obra && costoHora !== null && c.minutos_por_unidad !== null ? (c.minutos_por_unidad * costoHora) / 60 : 0;
  // Emitida: lo que congeló el servidor. Borrador: el cálculo en vivo.
  const costo = !borrador && c.costo_unitario !== null ? c.costo_unitario : materiales + mo;
  // Precio neto (para el margen) y mostrado (lo que lee el cliente, D-52).
  const ivaIncluido = c.leyenda_iva === 'IVA_INCLUIDO';
  const enVivo = precioCotizacion({
    costo,
    modo: c.modo_margen,
    fija: c.fija,
    margen: c.margen_objetivo,
    precio: c.precio_objetivo,
    redondeo: c.redondeo,
    ivaIncluido,
    alicuota: c.alicuota_iva,
  });
  const precio = !borrador && c.precio_unitario !== null ? c.precio_unitario : (enVivo?.neto ?? 0);
  const mostrado =
    !borrador && c.foto ? c.foto.pdf.precio_unitario : (enVivo?.mostrado ?? 0);
  const m = margenes(costo, precio);
  const bajoMinimo = m.sobrePrecio !== null && m.sobrePrecio < margenMinimo;

  return (
    <Stack gap="lg">
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
        <Group justify="space-between" p="md" pb={0}>
          <Title order={4}>Composición por unidad</Title>
          {borrador ? (
            <Button leftSection={<IconPlus size={18} />} variant="light" onClick={() => setAgregando(true)}>
              Agregar componente
            </Button>
          ) : null}
        </Group>
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="sm" mt="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Componente</Table.Th>
                <Table.Th ta="right">Cantidad</Table.Th>
                <Table.Th ta="right">Precio normalizado</Table.Th>
                <Table.Th ta="right">Merma</Table.Th>
                <Table.Th ta="right">Subtotal</Table.Th>
                <Table.Th ta="right">%</Table.Th>
                {borrador ? <Table.Th /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {calculadas.map(({ l, k }) => {
                const r = l.insumo_id ? refs.get(l.insumo_id) : undefined;
                const origen = l.tipo === 'CATALOGO' ? r?.origen : l.tipo === 'NUEVO' ? 'insumo nuevo' : 'costo libre';
                return (
                  <Table.Tr key={l.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {l.nombre}
                      </Text>
                      <Group gap={4}>
                        <Badge size="xs" variant="light" color={l.tipo === 'CATALOGO' ? (ORIGEN_PRECIO[origen ?? '']?.color ?? 'gray') : 'grape'}>
                          {l.tipo === 'CATALOGO' ? (ORIGEN_PRECIO[origen ?? '']?.label ?? 'sin costo') : origen}
                        </Badge>
                        {k.falta ? (
                          <Text size="xs" c="orange">
                            {k.falta}
                          </Text>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">
                      {borrador ? (
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <NumberInput
                            size="xs"
                            w={100}
                            min={0}
                            decimalScale={6}
                            decimalSeparator=","
                            defaultValue={l.cantidad}
                            onBlur={(e) => {
                              const v = n(e.currentTarget.value.replace(',', '.'));
                              if (v && v > 0 && v !== l.cantidad) guardarLinea.mutate({ id: l.id, cotizacion_id: c.id, cantidad: v });
                            }}
                          />
                          <Text size="sm">{l.unidad}</Text>
                        </Group>
                      ) : (
                        `${numero(l.cantidad, 4)} ${l.unidad}`
                      )}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {k.precioBase === null ? '—' : `${pesos(k.precioBase, 4)} / ${k.unidadBase}`}
                    </Table.Td>
                    <Table.Td ta="right">{pct(l.merma)}</Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={600}>
                      {k.subtotal === null ? '—' : pesos(k.subtotal, 2)}
                    </Table.Td>
                    <Table.Td ta="right">{k.subtotal && costo > 0 ? pct(k.subtotal / costo) : '—'}</Table.Td>
                    {borrador ? (
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {l.tipo === 'NUEVO' ? (
                            <Tooltip label="Proponer para el catálogo (lo decide Dirección Técnica)">
                              <ActionIcon
                                variant="subtle"
                                size="lg"
                                onClick={() => proponer.mutate({ cotizacion_linea_id: l.id, nombre: l.nombre, detalle: c.titulo })}
                                aria-label="Proponer para el catálogo"
                              >
                                <IconSend size={18} />
                              </ActionIcon>
                            </Tooltip>
                          ) : null}
                          <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => quitar.mutate(l.id)} aria-label="Quitar">
                            <IconTrash size={18} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                );
              })}
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Group gap="sm">
                    {borrador ? (
                      <Switch
                        size="md"
                        label="Incluir mano de obra"
                        checked={c.incluir_mano_obra}
                        onChange={(e) => onCambiar({ incluir_mano_obra: e.currentTarget.checked })}
                      />
                    ) : (
                      <Text size="sm">Mano de obra</Text>
                    )}
                    {c.incluir_mano_obra ? (
                      <>
                        {borrador ? (
                          <NumberInput
                            size="xs"
                            w={110}
                            min={0}
                            decimalScale={2}
                            decimalSeparator=","
                            suffix=" min"
                            defaultValue={c.minutos_por_unidad ?? ''}
                            onBlur={(e) => onCambiar({ minutos_por_unidad: n(e.currentTarget.value.replace(' min', '').replace(',', '.')) })}
                          />
                        ) : (
                          <Text size="sm">{numero(c.minutos_por_unidad ?? 0, 2)} min</Text>
                        )}
                        <Text size="xs" c="dimmed">
                          × costo hora {costoHora === null ? '(sin cargar por Finanzas)' : pesos(costoHora, 0)} / 60 — lo fija Finanzas
                        </Text>
                      </>
                    ) : null}
                  </Group>
                </Table.Td>
                <Table.Td ta="right" ff="monospace" fw={600}>
                  {c.incluir_mano_obra ? pesos(mo, 2) : '—'}
                </Table.Td>
                <Table.Td ta="right">{mo && costo > 0 ? pct(mo / costo) : '—'}</Table.Td>
                {borrador ? <Table.Td /> : null}
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <GraficoTorta
          titulo="Incidencia de cada componente"
          datos={[
            ...calculadas.filter((x) => (x.k.subtotal ?? 0) > 0).map((x) => ({ nombre: x.l.nombre, valor: x.k.subtotal! })),
            ...(mo > 0 ? [{ nombre: 'Mano de obra', valor: mo }] : []),
          ]}
          aviso={faltan.length ? 'Hay componentes sin costo: no suman.' : undefined}
        />
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text c="dimmed">Costo unitario {borrador ? '(en vivo)' : '(congelado)'}</Text>
              <Text fw={700} size="xl" ff="monospace">
                {pesos(costo, 2)}
              </Text>
            </Group>
            {borrador ? (
              <>
                <SegmentedControl
                  value={c.fija}
                  onChange={(v) => onCambiar({ fija: v as Cotizacion['fija'], ...(v === 'PRECIO' ? { precio_objetivo: c.precio_objetivo ?? Math.max(1, Math.round(precio)) } : { margen_objetivo: c.margen_objetivo ?? 0.3 }) })}
                  data={[
                    { label: 'Fijo el margen', value: 'MARGEN' },
                    { label: 'Fijo el precio', value: 'PRECIO' },
                  ]}
                />
                {c.fija === 'MARGEN' ? (
                  <Group grow align="flex-end">
                    <NumberInput
                      label={c.modo_margen === 'SOBRE_PRECIO' ? 'Margen sobre el precio' : 'Recargo sobre el costo'}
                      suffix=" %"
                      decimalScale={2}
                      decimalSeparator=","
                      min={0}
                      max={c.modo_margen === 'SOBRE_PRECIO' ? 99 : 1000}
                      defaultValue={(c.margen_objetivo ?? 0.3) * 100}
                      onBlur={(e) => {
                        const v = n(e.currentTarget.value.replace(' %', '').replace(',', '.'));
                        if (v !== null) onCambiar({ margen_objetivo: v / 100 });
                      }}
                    />
                    <Select
                      label="Cómo se cuenta"
                      value={c.modo_margen}
                      onChange={(v) => v && onCambiar({ modo_margen: v as Cotizacion['modo_margen'] })}
                      data={[
                        { value: 'SOBRE_PRECIO', label: 'Margen sobre el precio: P = C / (1 − m)' },
                        { value: 'SOBRE_COSTO', label: 'Recargo sobre el costo: P = C × (1 + k)' },
                      ]}
                      allowDeselect={false}
                    />
                  </Group>
                ) : (
                  <NumberInput
                    label={ivaIncluido ? 'Precio final por unidad (con IVA)' : 'Precio final por unidad (más IVA)'}
                    prefix="$ "
                    thousandSeparator="."
                    decimalSeparator=","
                    decimalScale={2}
                    min={0}
                    defaultValue={c.precio_objetivo ?? ''}
                    onBlur={(e) => {
                      const v = n(e.currentTarget.value.replace('$ ', '').replace(/\./g, '').replace(',', '.'));
                      if (v && v > 0) onCambiar({ precio_objetivo: v });
                    }}
                  />
                )}
                <Group grow>
                  <Select
                    label="Redondeo"
                    value={String(c.redondeo)}
                    onChange={(v) => v && onCambiar({ redondeo: Number(v) })}
                    data={[
                      { value: '0.01', label: 'Sin redondeo' },
                      { value: '1', label: 'A $1' },
                      { value: '10', label: 'A $10' },
                      { value: '100', label: 'A $100' },
                    ]}
                    allowDeselect={false}
                  />
                  <Select
                    label="En el PDF"
                    value={c.leyenda_iva}
                    onChange={(v) => v && onCambiar({ leyenda_iva: v as Cotizacion['leyenda_iva'] })}
                    data={[
                      { value: 'MAS_IVA', label: 'Precio más IVA' },
                      { value: 'IVA_INCLUIDO', label: 'Precio con IVA incluido' },
                    ]}
                    allowDeselect={false}
                  />
                </Group>
              </>
            ) : null}
            <Group justify="space-between">
              <Text c="dimmed">Precio unitario {ivaIncluido ? '(con IVA, en el PDF)' : '(más IVA, en el PDF)'}</Text>
              <Text fw={800} size="xl" ff="monospace">
                {mostrado > 0 ? pesos(mostrado, 2) : '—'}
              </Text>
            </Group>
            {ivaIncluido && precio > 0 ? (
              <Text size="xs" c="dimmed">
                Neto sin IVA: {pesos(precio, 2)} (el margen se calcula sobre el neto)
              </Text>
            ) : null}
            <Text size="sm">
              Margen sobre el precio <b>{pct(m.sobrePrecio)}</b> · equivale a un recargo sobre el costo de{' '}
              <b>{pct(m.sobreCosto)}</b>
            </Text>
            <Text size="sm" c="dimmed">
              Total del pedido: {mostrado > 0 ? pesos(mostrado * c.cantidad_cotizada, 2) : '—'} ({numero(c.cantidad_cotizada)} unidades)
            </Text>
            {bajoMinimo ? (
              <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                El margen queda por debajo del mínimo de Finanzas ({pct(margenMinimo)}). Se puede emitir igual, con una
                nota de por qué.
              </Alert>
            ) : null}
            {borrador ? (
              <>
                {bajoMinimo ? (
                  <Textarea
                    label="Por qué se cotiza con este margen"
                    value={justificacion}
                    onChange={(e) => setJustificacion(e.currentTarget.value)}
                    autosize
                    minRows={2}
                  />
                ) : null}
                <Textarea
                  label="Observaciones para el cliente (van en el PDF)"
                  defaultValue={c.observaciones ?? ''}
                  onBlur={(e) => onCambiar({ observaciones: e.currentTarget.value.trim() || null })}
                  autosize
                  minRows={2}
                />
                <NumberInput
                  label="Vigencia (días)"
                  min={1}
                  allowDecimal={false}
                  defaultValue={c.vigencia_dias}
                  onBlur={(e) => {
                    const v = n(e.currentTarget.value);
                    if (v && v > 0) onCambiar({ vigencia_dias: v });
                  }}
                  w={160}
                />
                <Button
                  size="md"
                  leftSection={<IconFileTypePdf size={18} />}
                  disabled={lineas.length === 0 || faltan.length > 0 || precio <= 0 || (bajoMinimo && !justificacion.trim()) || !claims}
                  loading={emitir.isPending}
                  onClick={() => emitir.mutate({ id: c.id, justificacion: justificacion.trim() || null })}
                >
                  Emitir cotización
                </Button>
                {faltan.length ? (
                  <Text size="xs" c="orange">
                    Hay {faltan.length} componente(s) sin costo: completalos antes de emitir.
                  </Text>
                ) : null}
              </>
            ) : null}
          </Stack>
        </Paper>
      </SimpleGrid>

      <AgregarLinea
        abierto={agregando}
        onCerrar={() => setAgregando(false)}
        cotizacionId={c.id}
        orden={Math.max(0, ...lineas.map((l) => l.orden)) + 1}
        referencias={referencias}
      />
    </Stack>
  );
}

function AgregarLinea({
  abierto,
  onCerrar,
  cotizacionId,
  orden,
  referencias,
}: {
  abierto: boolean;
  onCerrar: () => void;
  cotizacionId: string;
  orden: number;
  referencias: Referencia[];
}) {
  const guardar = useGuardarLinea();
  const vacio = {
    tipo: 'CATALOGO' as LineaGuardada['tipo'],
    insumo_id: null as string | null,
    nombre: '',
    cantidad: null as number | null,
    unidad: 'g',
    precio: null as number | null,
    cantidad_presentacion: 1 as number | null,
    unidad_presentacion: 'kg',
    incluye_iva: false,
    alicuota_iva: 21,
    densidad: null as number | null,
    merma: 0,
  };
  const [v, setV] = useState(vacio);
  const set = (x: Partial<typeof v>) => setV({ ...v, ...x });
  const ref = referencias.find((r) => r.insumo_id === v.insumo_id);
  const normalizado =
    v.tipo === 'NUEVO' && v.precio && v.cantidad_presentacion
      ? precioPorUnidadBase(v.incluye_iva ? v.precio / (1 + v.alicuota_iva / 100) : v.precio, v.cantidad_presentacion, v.unidad_presentacion)
      : null;
  const listo =
    !!v.cantidad && v.cantidad > 0 && (v.tipo === 'CATALOGO' ? !!v.insumo_id : !!v.nombre.trim() && v.precio !== null);
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Agregar componente" size="lg" centered>
      <Stack gap="md">
        <SegmentedControl
          value={v.tipo}
          onChange={(t) => set({ tipo: t as LineaGuardada['tipo'], unidad: t === 'LIBRE' ? 'unidad' : 'g' })}
          data={[
            { label: 'Insumo del catálogo', value: 'CATALOGO' },
            { label: 'Insumo nuevo', value: 'NUEVO' },
            { label: 'Costo libre', value: 'LIBRE' },
          ]}
        />
        {v.tipo === 'CATALOGO' ? (
          <>
            <Select
              label="Insumo"
              searchable
              placeholder="Buscar por código o nombre"
              data={referencias.map((r) => ({ value: r.insumo_id, label: `${r.codigo_interno} — ${r.nombre}` }))}
              value={v.insumo_id}
              onChange={(x) => {
                const r = referencias.find((y) => y.insumo_id === x);
                set({ insumo_id: x, nombre: r?.nombre ?? '', unidad: r?.unidad_medida?.toLowerCase() === 'unidad' ? 'UNIDAD' : 'g' });
              }}
            />
            {ref ? (
              <Text size="sm" c={ref.costo_unitario_ars === null ? 'orange' : 'dimmed'}>
                {ref.costo_unitario_ars === null
                  ? 'Este insumo no tiene costo de referencia: la línea no va a sumar.'
                  : `Costo de referencia: ${pesos(ref.costo_unitario_ars, 4)} por ${ref.unidad_medida} (${ORIGEN_PRECIO[ref.origen ?? '']?.label ?? ''})`}
              </Text>
            ) : null}
          </>
        ) : (
          <TextInput
            label={v.tipo === 'NUEVO' ? 'Nombre del insumo' : 'Concepto (flete, análisis, servicio…)'}
            placeholder={v.tipo === 'NUEVO' ? 'Óxido de zinc (ZnO)' : 'Flete'}
            value={v.nombre}
            onChange={(e) => set({ nombre: e.currentTarget.value })}
          />
        )}
        {v.tipo !== 'LIBRE' ? (
          <Group grow align="flex-end">
            <NumberInput label="Cantidad por unidad de producto" min={0} decimalScale={6} decimalSeparator="," value={v.cantidad ?? ''} onChange={(x) => set({ cantidad: n(x) })} />
            <Select label="Unidad" data={UNIDADES_COSTO} value={v.unidad} onChange={(x) => x && set({ unidad: x })} allowDeselect={false} />
          </Group>
        ) : null}
        {v.tipo !== 'CATALOGO' ? (
          <>
            <Group grow align="flex-end">
              <NumberInput
                label={v.tipo === 'NUEVO' ? 'Precio' : 'Importe por unidad de producto'}
                prefix="$ "
                thousandSeparator="."
                decimalSeparator=","
                decimalScale={4}
                min={0}
                value={v.precio ?? ''}
                onChange={(x) => set({ precio: n(x), ...(v.tipo === 'LIBRE' ? { cantidad: 1 } : {}) })}
              />
              {v.tipo === 'NUEVO' ? (
                <>
                  <NumberInput label="por" min={0} decimalScale={4} decimalSeparator="," value={v.cantidad_presentacion ?? ''} onChange={(x) => set({ cantidad_presentacion: n(x) })} />
                  <Select label="Unidad" data={UNIDADES_COSTO} value={v.unidad_presentacion} onChange={(x) => x && set({ unidad_presentacion: x })} allowDeselect={false} />
                </>
              ) : null}
            </Group>
            <Group>
              <Switch size="md" label="Incluye IVA recuperable (factura A)" description="Si es monotributista, factura B/C o sin factura, dejalo apagado: el total es costo." checked={v.incluye_iva} onChange={(e) => set({ incluye_iva: e.currentTarget.checked })} />
              {v.incluye_iva ? (
                <Select data={['21', '10.5', '27', '0']} value={String(v.alicuota_iva)} onChange={(x) => x && set({ alicuota_iva: Number(x) })} w={100} allowDeselect={false} />
              ) : null}
            </Group>
            {normalizado !== null ? (
              <Text size="sm">
                Se entiende: <b>{pesos(normalizado, 4)}</b> neto por {v.unidad_presentacion.toLowerCase().startsWith('k') ? 'g' : v.unidad_presentacion.toLowerCase() === 'l' ? 'ml' : v.unidad_presentacion}
                {['kg', 'g'].includes(v.unidad_presentacion.toLowerCase()) ? ` (${pesos(normalizado * 1000, 2)} el kg)` : ''}
              </Text>
            ) : null}
          </>
        ) : null}
        {v.tipo !== 'LIBRE' ? (
          <Group grow align="flex-end">
            <NumberInput
              label="Densidad (g/mL), si mezcla masa y volumen"
              decimalScale={5}
              decimalSeparator=","
              min={0}
              value={v.densidad ?? ''}
              onChange={(x) => set({ densidad: n(x) })}
            />
            <NumberInput label="Merma" suffix=" %" min={0} max={99} decimalScale={2} decimalSeparator="," value={v.merma * 100} onChange={(x) => set({ merma: (n(x) ?? 0) / 100 })} />
          </Group>
        ) : (
          <NumberInput label="Merma" suffix=" %" min={0} max={99} decimalScale={2} decimalSeparator="," value={v.merma * 100} onChange={(x) => set({ merma: (n(x) ?? 0) / 100 })} w={160} />
        )}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onCerrar} leftSection={<IconX size={16} />}>
            Cancelar
          </Button>
          <Button
            disabled={!listo}
            loading={guardar.isPending}
            onClick={() =>
              guardar.mutate(
                {
                  cotizacion_id: cotizacionId,
                  orden,
                  tipo: v.tipo,
                  insumo_id: v.tipo === 'CATALOGO' ? v.insumo_id : null,
                  nombre: v.nombre.trim(),
                  cantidad: v.tipo === 'LIBRE' ? 1 : v.cantidad!,
                  unidad: v.tipo === 'LIBRE' ? 'UNIDAD' : v.unidad,
                  precio: v.tipo === 'CATALOGO' ? null : v.precio,
                  cantidad_presentacion: v.tipo === 'NUEVO' ? v.cantidad_presentacion : null,
                  unidad_presentacion: v.tipo === 'NUEVO' ? v.unidad_presentacion : null,
                  incluye_iva: v.tipo === 'CATALOGO' ? null : v.incluye_iva,
                  alicuota_iva: v.tipo !== 'CATALOGO' && v.incluye_iva ? v.alicuota_iva : null,
                  densidad: v.densidad,
                  merma: v.merma,
                },
                { onSuccess: () => { setV(vacio); onCerrar(); } },
              )
            }
          >
            Agregar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function AnularModal({ id, abierto, onCerrar }: { id: string; abierto: boolean; onCerrar: () => void }) {
  const anular = useAnularCotizacion();
  const [motivo, setMotivo] = useState('');
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Anular cotización" centered>
      <Stack>
        <Text size="sm">La cotización queda en el historial como anulada. No se borra.</Text>
        <Textarea label="Motivo" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} autosize minRows={2} />
        <Button color="red" disabled={!motivo.trim()} loading={anular.isPending} onClick={() => anular.mutate({ id, motivo: motivo.trim() }, { onSuccess: onCerrar })}>
          Anular
        </Button>
      </Stack>
    </Modal>
  );
}

import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
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
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconClipboardList,
  IconPlus,
  IconTag,
  IconTool,
  IconTrash,
} from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useFormulasFabricacion, useInsumos, useProductos } from '@/lib/consultas';
import {
  useCrearProduccion,
  usePedidos,
  type PedidoConConteoRow,
} from '@/lib/consultasComercial';
import { fecha, fechaISO, numero, desdeCalendario } from '@/lib/formato';
import {
  useAbrirOrden,
  useAnularOrden,
  useCrearFormulaEnvasado,
  vencimientoISO,
  vencimientoPorDefecto,
  useCrearEquipo,
  useEquipos,
  useEspecificaciones,
  useOrdenes,
} from '@/lib/consultasOrdenes';
import { COLOR_ESTADO_ORDEN } from './etapasOrden';
import { CabeceraEspecificacion } from './PaginaEspecificaciones';
import { PlanillaRotulosProduccion } from '@/features/rotulos/RotulosProduccion';

/** `/ordenes` es una pestaña de Planificación (pedido del 2026-10-22). */
export function PaginaOrdenes() {
  return <Navigate to="/planificacion?vista=ordenes" replace />;
}

/**
 * Órdenes de producción (ítem 5 de la cola del 24/09): cada lote con su
 * registro de etapas, del que sale el batch record. Vive como pestaña de
 * «Planificación y producción»; «+ Producción» la abre desde el encabezado.
 */
export function ListaOrdenes() {
  const ordenes = useOrdenes();
  const productos = useProductos();
  const puede = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const anular = useAnularOrden();
  const [equipos, setEquipos] = useState(false);
  const [rotulos, setRotulos] = useState(false);
  const nombre = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const filas = ordenes.data ?? [];

  return (
    <>
      {puede ? (
        <Group justify="flex-end" mb="sm">
          <Button
            variant="light"
            leftSection={<IconTag size={16} />}
            onClick={() => setRotulos(true)}
          >
            Rótulos
          </Button>
          <Button
            variant="default"
            leftSection={<IconTool size={16} />}
            onClick={() => setEquipos(true)}
          >
            Equipos
          </Button>
        </Group>
      ) : null}
      {ordenes.isLoading ? (
        <Skeleton h={240} />
      ) : filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconClipboardList}
            titulo="Todavía no hay órdenes de producción"
            descripcion="Abrí una por lote: toma la fórmula, arma el número de lote según I.40.25 y guía cada etapa."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Orden</Table.Th>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Lote</Table.Th>
                  <Table.Th>Vencimiento</Table.Th>
                  <Table.Th ta="right">Cantidad</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  {puede ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/ordenes/${o.id}`} fw={600}>
                        {o.numero}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {fecha(o.jornada)}
                      </Text>
                    </Table.Td>
                    <Table.Td>{nombre(o.producto_id)}</Table.Td>
                    <Table.Td ff="monospace">{o.numero_lote}</Table.Td>
                    <Table.Td ff="monospace">{o.vencimiento_texto}</Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(Number(o.cantidad_teorica), 2)} {o.unidad}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={COLOR_ESTADO_ORDEN[o.estado]} variant="light">
                        {o.estado.toLowerCase()}
                      </Badge>
                    </Table.Td>
                    {puede ? (
                      <Table.Td>
                        {/* Descartar: queda anulada con motivo (pedido del 2026-10-27). */}
                        {o.estado === 'ABIERTA' ? (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="estadoRechazado"
                            leftSection={<IconTrash size={14} />}
                            loading={anular.isPending && anular.variables?.id === o.id}
                            onClick={() => {
                              const motivo = window.prompt(
                                `¿Por qué se descarta la orden ${o.numero}?`,
                              );
                              if (motivo !== null)
                                anular.mutate({
                                  id: o.id,
                                  motivo: motivo.trim() || 'Descartada',
                                });
                            }}
                          >
                            Descartar
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
      <ModalEquipos abierto={equipos} onCerrar={() => setEquipos(false)} />
      {/* Se monta al abrir: cada vez arranca con las órdenes del día. */}
      {rotulos ? (
        <PlanillaRotulosProduccion abierto onCerrar={() => setRotulos(false)} />
      ) : null}
    </>
  );
}

/** Lo que el Gantt tiene para un día: un renglón por producto de cada producción. */
interface EnElPlan {
  clave: string;
  pedidoId: string;
  productoId: string;
  cantidad: number;
}

/** Último día del plan (inclusive), como en Planificación. */
const finDelPlan = (inicio: string, dias: number) => {
  const d = new Date(`${inicio}T12:00:00`);
  d.setDate(d.getDate() + dias - 1);
  return fechaISO(d)!;
};

const enElPlan = (pedidos: PedidoConConteoRow[], dia: string): EnElPlan[] =>
  pedidos
    .filter(
      (p) =>
        !p.es_venta &&
        (p.estado === 'CONFIRMADO' || p.estado === 'EN_PRODUCCION') &&
        p.plan_inicio !== null &&
        p.plan_dias !== null &&
        dia >= p.plan_inicio &&
        dia <= finDelPlan(p.plan_inicio, p.plan_dias),
    )
    .flatMap((p) =>
      p.productos.map((r) => ({
        clave: `${p.id}|${r.producto_id}`,
        pedidoId: p.id,
        productoId: r.producto_id,
        cantidad: Number(r.cantidad),
      })),
    );

/** Abrir una orden: fórmula, presentación, jornada y partida (I.40.25). */
export function ModalAbrirOrden({
  abierto,
  onCerrar,
  pedidoId,
  productoInicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  pedidoId: string | null;
  productoInicial?: string;
}) {
  const formulas = useFormulasFabricacion();
  const productos = useProductos();
  const insumos = useInsumos();
  const especificaciones = useEspecificaciones();
  const abrir = useAbrirOrden();
  const crearEnvasado = useCrearFormulaEnvasado();
  // Naza no ve la especificación: la toma de la fórmula, y si falta la
  // completa DT desde su tablero (D-orden-producto-1).
  const esDT = useTieneRol('DIRECCION_TECNICA');
  const pedidos = usePedidos();
  const crearProduccion = useCrearProduccion();
  /* Lo que el plan dice para la jornada (pedido del 2026-10-21): elegir uno
     completa producto y fórmula y vincula la orden; «Otro» la suma al plan. */
  const [eleccion, setEleccion] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<number | string>('');
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [productoId, setProductoId] = useState<string | null>(productoInicial ?? null);
  const [especId, setEspecId] = useState<string | null>(null);
  const [nuevaEspec, setNuevaEspec] = useState(false);
  const [jornada, setJornada] = useState<Date | null>(new Date());
  const [partida, setPartida] = useState<number | string>(1);
  const [presentacion, setPresentacion] = useState<number | string>(1);
  const [presentacionTexto, setPresentacionTexto] = useState('');
  const [cantidad, setCantidad] = useState<number | string>('');
  const [unidad, setUnidad] = useState<'kg' | 'L'>('kg');
  /* «MM/AA»; null = el de por defecto (elaboración + 2 años). */
  const [vencimiento, setVencimiento] = useState<string | null>(null);
  /* El producto no trae fórmula: se envasa un granel comprado. */
  const [sinFormula, setSinFormula] = useState(false);
  const [granelId, setGranelId] = useState<string | null>(null);
  const producto = productoId;
  // Las del producto, vigentes primero (useFormulasFabricacion).
  const delProducto = (formulas.data ?? []).filter((f) => f.producto_id === producto);
  const formula =
    delProducto.find((f) => f.id === formulaId) ?? delProducto[0] ?? undefined;
  const faltaFormula = !!producto && !formulas.isLoading && delProducto.length === 0;
  const textoVenc = vencimiento ?? (jornada ? vencimientoPorDefecto(jornada) : '');
  const vencValido = vencimientoISO(textoVenc) !== null;
  const n = (v: number | string) => (typeof v === 'number' ? v : Number(v || 0));
  const delDia =
    pedidoId === null && jornada ? enElPlan(pedidos.data ?? [], fechaISO(jornada)!) : [];
  const elegido = delDia.find((x) => x.clave === eleccion) ?? null;
  const otro =
    pedidoId === null && !elegido && (eleccion === 'otro' || delDia.length === 0);
  const nombreProducto = (id: string) =>
    (productos.data ?? []).find((x) => x.id === id)?.nombre ?? 'Producto';
  const elegir = (x: EnElPlan) => {
    setEleccion(x.clave);
    setProductoId(x.productoId);
    setFormulaId(null);
    setSinFormula(false);
  };
  const dd = jornada
    ? `${String(jornada.getDate()).padStart(2, '0')}/${String(jornada.getMonth() + 1).padStart(2, '0')}/${String(jornada.getFullYear()).slice(2)}`
    : '';

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Abrir orden de producción"
      size="lg"
      centered
    >
      <Stack gap="md">
        {pedidoId === null ? (
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              {delDia.length > 0
                ? 'Según la planificación, ese día se produce:'
                : 'La planificación no tiene nada para ese día.'}
            </Text>
            {delDia.length > 0 ? (
              <Group gap="xs">
                {delDia.map((x) => (
                  <Button
                    key={x.clave}
                    size="md"
                    variant={eleccion === x.clave ? 'filled' : 'default'}
                    onClick={() => elegir(x)}
                  >
                    {nombreProducto(x.productoId)} × {numero(x.cantidad)}
                  </Button>
                ))}
                <Button
                  size="md"
                  variant={eleccion === 'otro' ? 'filled' : 'default'}
                  onClick={() => {
                    setEleccion('otro');
                    setProductoId(null);
                    setFormulaId(null);
                  }}
                >
                  Otro
                </Button>
              </Group>
            ) : null}
          </Stack>
        ) : null}
        <Select
          label="Producto"
          description="La fórmula la trae el sistema"
          withAsterisk
          searchable
          clearable
          limit={60}
          data={(productos.data ?? [])
            .filter((p) => p.activo)
            .map((p) => ({ value: p.id, label: `${p.codigo_interno} · ${p.nombre}` }))}
          value={producto}
          onChange={(v) => {
            setProductoId(v);
            setFormulaId(null);
            setSinFormula(false);
            setGranelId(null);
          }}
        />
        {delProducto.length > 1 ? (
          <Select
            label="Fórmula"
            data={delProducto.map((f) => ({
              value: f.id,
              label: `${f.variedad ? `${f.variedad} · ` : ''}v${f.version}${f.codigo_me ? ` · ${f.codigo_me}` : ''}${f.estado === 'VIGENTE' ? '' : ' (borrador)'}`,
            }))}
            value={formula?.id ?? null}
            onChange={setFormulaId}
            allowDeselect={false}
          />
        ) : formula ? (
          <Text size="sm" c="dimmed">
            Fórmula: v{formula.version}
            {formula.codigo_me ? ` · ${formula.codigo_me}` : ''}
            {formula.estado === 'VIGENTE' ? '' : ' (borrador)'}
          </Text>
        ) : null}
        {faltaFormula ? (
          <Alert color="estadoCuarentena" variant="light" title="Falta la fórmula">
            <Stack gap="sm">
              <Group gap="sm">
                <Button
                  component={Link}
                  to="/formulas"
                  target="_blank"
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                >
                  Cargar fórmula
                </Button>
                <Button
                  variant={sinFormula ? 'filled' : 'default'}
                  onClick={() => setSinFormula((x) => !x)}
                >
                  No trae fórmula (se envasa el granel)
                </Button>
              </Group>
              {sinFormula ? (
                <Select
                  label="¿Qué granel se envasa?"
                  description="La pesada va a registrar qué lote de ese granel se usó."
                  searchable
                  limit={60}
                  data={(insumos.data ?? [])
                    .filter(
                      (i) =>
                        i.activo &&
                        (i.tipo === 'SEMIELABORADO' || i.tipo === 'MATERIA_PRIMA'),
                    )
                    .map((i) => ({
                      value: i.id,
                      label: `${i.codigo_interno} · ${i.nombre}`,
                    }))}
                  value={granelId}
                  onChange={setGranelId}
                />
              ) : (
                <Text size="sm">
                  Si cargás la fórmula en la otra pestaña, volvé y elegí el producto de
                  nuevo.
                </Text>
              )}
            </Stack>
          </Alert>
        ) : null}
        {esDT ? (
          <>
            <Group align="flex-end" wrap="nowrap">
              <Select
                style={{ flex: 1 }}
                label="Especificación"
                description="Contra la que se controla el producto terminado. Un borrador lo aprueba la DT."
                clearable
                searchable
                nothingFoundMessage="Sin coincidencias: cargala con «Nueva»"
                data={(especificaciones.data ?? [])
                  .filter((e) => e.estado === 'VIGENTE' || e.estado === 'BORRADOR')
                  .map((e) => ({
                    value: e.id,
                    label: `${e.codigo_poe} v${e.version} · ${e.denominacion}${
                      e.estado === 'BORRADOR' ? ' (borrador)' : ''
                    }`,
                  }))}
                value={especId}
                onChange={setEspecId}
              />
              <Button
                size="md"
                variant="light"
                leftSection={<IconPlus size={18} />}
                onClick={() => setNuevaEspec(true)}
              >
                Nueva
              </Button>
            </Group>
            <Modal
              opened={nuevaEspec}
              onClose={() => setNuevaEspec(false)}
              title="Nueva especificación"
              centered
            >
              <CabeceraEspecificacion
                onListo={(id) => {
                  setNuevaEspec(false);
                  setEspecId(id);
                }}
              />
            </Modal>
          </>
        ) : null}
        <Group grow>
          <DateInput
            label="Fecha de elaboración"
            valueFormat="DD/MM/YYYY"
            value={jornada}
            onChange={(v) => setJornada(desdeCalendario(v))}
          />
          <Stack gap={6}>
            <NumberInput
              label={`Cantidad teórica (${unidad})`}
              min={0}
              decimalScale={3}
              value={cantidad}
              onChange={setCantidad}
            />
            {/* En litros, la pesada pasa a kg con la densidad de la fórmula (calcular_lote). */}
            <SegmentedControl
              value={unidad}
              onChange={(v) => setUnidad(v as 'kg' | 'L')}
              data={[
                { label: 'kg', value: 'kg' },
                { label: 'L', value: 'L' },
              ]}
            />
          </Stack>
        </Group>
        <Group grow>
          <NumberInput
            label="Partida del granel (P)"
            description="1 si es el primer granel del día"
            min={1}
            max={99}
            allowDecimal={false}
            value={partida}
            onChange={setPartida}
          />
          <NumberInput
            label="Presentación (#)"
            description="1, 2… si un granel va a varias"
            min={1}
            max={99}
            allowDecimal={false}
            value={presentacion}
            onChange={setPresentacion}
          />
        </Group>
        <Group grow>
          <TextInput
            label="Presentación"
            placeholder="14 g, 45 g…"
            value={presentacionTexto}
            onChange={(e) => setPresentacionTexto(e.currentTarget.value)}
          />
          <TextInput
            label="Vencimiento (MM/AA)"
            description="Por defecto, dos años después de la elaboración"
            placeholder="10/28"
            value={textoVenc}
            onChange={(e) => setVencimiento(e.currentTarget.value)}
            error={
              textoVenc && !vencValido ? 'Escribilo como MM/AA, por ejemplo 10/28' : null
            }
            maxLength={5}
          />
        </Group>
        {otro ? (
          <NumberInput
            label="Unidades a envasar (opcional)"
            description="Si las cargás, la producción se suma a la planificación de ese día."
            min={1}
            allowDecimal={false}
            value={unidades}
            onChange={setUnidades}
          />
        ) : null}
        <Text size="sm">
          Lote:{' '}
          <b>
            #{n(presentacion)} {dd}
          </b>{' '}
          · vencimiento{' '}
          <b>
            P{n(partida)} {vencValido ? textoVenc : '…'}
          </b>{' '}
          (I.40.25, borrador: R-08)
        </Text>
        <Group justify="flex-end">
          <Button
            loading={
              abrir.isPending || crearProduccion.isPending || crearEnvasado.isPending
            }
            disabled={
              !(formula || (faltaFormula && sinFormula && granelId)) ||
              !producto ||
              !jornada ||
              !vencValido ||
              n(cantidad) <= 0
            }
            onClick={() =>
              void (async () => {
                if (!producto || !jornada) return;
                const dia = fechaISO(jornada)!;
                const formulaUsada =
                  formula?.id ??
                  (granelId
                    ? await crearEnvasado.mutateAsync({ productoId: producto, granelId })
                    : null);
                if (!formulaUsada) return;
                // ponytail: dos llamadas, no una transacción. Si la orden falla,
                // la producción queda en el plan y se saca desde Planificación.
                const nueva =
                  otro && n(unidades) > 0
                    ? await crearProduccion.mutateAsync({
                        productoId: producto,
                        cantidad: n(unidades),
                        paraPedidoId: null,
                        inicio: dia,
                        dias: 1,
                      })
                    : null;
                await abrir.mutateAsync({
                  formula_id: formulaUsada,
                  producto_id: producto,
                  jornada: dia,
                  partida: n(partida),
                  presentacion: n(presentacion),
                  presentacion_texto: presentacionTexto.trim() || null,
                  cantidad_teorica: n(cantidad),
                  unidad,
                  vencimiento: vencimientoISO(textoVenc),
                  especificacion_id: esDT ? especId : null,
                  pedidoId: pedidoId ?? elegido?.pedidoId ?? nueva ?? null,
                });
                setEleccion(null);
                setUnidades('');
                onCerrar();
              })().catch(() => {
                /* El error ya lo muestra el onError de cada mutación. */
              })
            }
          >
            Abrir orden
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

const TIPOS_EQUIPO: { value: string; label: string }[] = [
  { value: 'BALANZA', label: 'Balanza' },
  { value: 'BALANZA_PORTATIL', label: 'Balanza portátil' },
  { value: 'VARILLA', label: 'Varilla batidora' },
  { value: 'MAQUINA_FRACCIONADORA', label: 'Máquina fraccionadora' },
  { value: 'ETIQUETADORA', label: 'Etiquetadora' },
  { value: 'PHMETRO', label: 'pHmetro' },
  { value: 'DENSITOMETRO', label: 'Densitómetro' },
  { value: 'MICROSCOPIO_DIGITAL', label: 'Microscopio digital' },
  { value: 'OTRO', label: 'Otro' },
];

/** Equipos que se eligen en las etapas (código de balanza, varilla…). */
export function ModalEquipos({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const equipos = useEquipos();
  const crear = useCrearEquipo();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<string | null>('BALANZA');
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Equipos" centered>
      <Stack gap="md">
        {(equipos.data ?? []).map((e) => (
          <Text key={e.id} size="sm">
            <b>{e.codigo}</b> · {e.nombre} ·{' '}
            {TIPOS_EQUIPO.find((t) => t.value === e.tipo)?.label}
          </Text>
        ))}
        <Group grow align="flex-end">
          <TextInput
            label="Código"
            value={codigo}
            onChange={(e) => setCodigo(e.currentTarget.value)}
          />
          <Select label="Tipo" data={TIPOS_EQUIPO} value={tipo} onChange={setTipo} />
        </Group>
        <TextInput
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            loading={crear.isPending}
            disabled={!codigo.trim() || !nombre.trim() || !tipo}
            onClick={() =>
              tipo &&
              crear.mutate(
                { codigo: codigo.trim(), nombre: nombre.trim(), tipo },
                {
                  onSuccess: () => {
                    setCodigo('');
                    setNombre('');
                  },
                },
              )
            }
          >
            Dar de alta
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

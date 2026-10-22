import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconClipboardList, IconPlus } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useFormulasFabricacion, useProductos } from '@/lib/consultas';
import {
  useCrearProduccion,
  usePedidos,
  type PedidoConConteoRow,
} from '@/lib/consultasComercial';
import { fecha, fechaISO, numero, desdeCalendario } from '@/lib/formato';
import {
  useAbrirOrden,
  useCrearEquipo,
  useEquipos,
  useEspecificaciones,
  useOrdenes,
} from '@/lib/consultasOrdenes';
import { COLOR_ESTADO_ORDEN } from './etapasOrden';

/**
 * Órdenes de producción (ítem 5 de la cola del 24/09): cada lote con su
 * registro de etapas, del que sale el batch record.
 */
export function PaginaOrdenes() {
  const ordenes = useOrdenes();
  const productos = useProductos();
  const puede = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const [abriendo, setAbriendo] = useState(false);
  const [equipos, setEquipos] = useState(false);
  const nombre = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const filas = ordenes.data ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Órdenes de producción"
        descripcion="Cada lote con su registro, de la pesada a la liberación. El batch record sale de acá."
        acciones={
          puede ? (
            <Group gap="sm">
              <Button variant="default" onClick={() => setEquipos(true)}>
                Equipos
              </Button>
              <Button
                leftSection={<IconPlus size={18} />}
                onClick={() => setAbriendo(true)}
              >
                Abrir orden
              </Button>
            </Group>
          ) : null
        }
      />
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
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      <ModalAbrirOrden
        abierto={abriendo}
        onCerrar={() => setAbriendo(false)}
        pedidoId={null}
      />
      <ModalEquipos abierto={equipos} onCerrar={() => setEquipos(false)} />
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
  const especificaciones = useEspecificaciones();
  const abrir = useAbrirOrden();
  const pedidos = usePedidos();
  const crearProduccion = useCrearProduccion();
  /* Lo que el plan dice para la jornada (pedido del 2026-10-21): elegir uno
     completa producto y fórmula y vincula la orden; «Otro» la suma al plan. */
  const [eleccion, setEleccion] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<number | string>('');
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [productoId, setProductoId] = useState<string | null>(productoInicial ?? null);
  const [especId, setEspecId] = useState<string | null>(null);
  const [jornada, setJornada] = useState<Date | null>(new Date());
  const [partida, setPartida] = useState<number | string>(1);
  const [presentacion, setPresentacion] = useState<number | string>(1);
  const [presentacionTexto, setPresentacionTexto] = useState('');
  const [cantidad, setCantidad] = useState<number | string>('');
  const [vencimiento, setVencimiento] = useState<Date | null>(null);
  const formula = (formulas.data ?? []).find((f) => f.id === formulaId);
  const producto = productoId ?? formula?.producto_id ?? null;
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
    // Las vigentes vienen primero (useFormulasFabricacion).
    setFormulaId(
      (formulas.data ?? []).find((f) => f.producto_id === x.productoId)?.id ?? null,
    );
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
          label="Fórmula"
          withAsterisk
          searchable
          data={(formulas.data ?? []).map((f) => ({
            value: f.id,
            label: `${f.producto?.nombre ?? ''}${f.variedad ? ` — ${f.variedad}` : ''} · v${f.version}${f.codigo_me ? ` · ${f.codigo_me}` : ''}`,
          }))}
          value={formulaId}
          onChange={setFormulaId}
        />
        <Select
          label="Producto (presentación que se fracciona)"
          description="Por defecto, el de la fórmula"
          searchable
          clearable
          limit={60}
          data={(productos.data ?? [])
            .filter((p) => p.activo)
            .map((p) => ({ value: p.id, label: `${p.codigo_interno} · ${p.nombre}` }))}
          value={producto}
          onChange={setProductoId}
        />
        <Select
          label="Especificación"
          description="Contra la que se controla el producto terminado"
          clearable
          data={(especificaciones.data ?? [])
            .filter((e) => e.estado === 'VIGENTE')
            .map((e) => ({
              value: e.id,
              label: `${e.codigo_poe} v${e.version} · ${e.denominacion}`,
            }))}
          value={especId}
          onChange={setEspecId}
        />
        <Group grow>
          <DateInput
            label="Fecha de elaboración"
            valueFormat="DD/MM/YYYY"
            value={jornada}
            onChange={(v) => setJornada(desdeCalendario(v))}
          />
          <NumberInput
            label="Cantidad teórica (kg)"
            min={0}
            decimalScale={3}
            value={cantidad}
            onChange={setCantidad}
          />
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
          <DateInput
            label="Vencimiento"
            description="Vacío: fecha de elaboración + vida útil"
            valueFormat="DD/MM/YYYY"
            clearable
            value={vencimiento}
            onChange={(v) => setVencimiento(desdeCalendario(v))}
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
          · vencimiento <b>P{n(partida)} …</b> (I.40.25, borrador: R-08)
        </Text>
        <Group justify="flex-end">
          <Button
            loading={abrir.isPending || crearProduccion.isPending}
            disabled={!formula || !producto || !jornada || n(cantidad) <= 0}
            onClick={() =>
              void (async () => {
                if (!formula || !producto || !jornada) return;
                const dia = fechaISO(jornada)!;
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
                  formula_id: formula.id,
                  producto_id: producto,
                  jornada: dia,
                  partida: n(partida),
                  presentacion: n(presentacion),
                  presentacion_texto: presentacionTexto.trim() || null,
                  cantidad_teorica: n(cantidad),
                  unidad: 'kg',
                  vencimiento: fechaISO(vencimiento),
                  especificacion_id: especId,
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

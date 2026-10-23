import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconArrowsSort,
  IconCheck,
  IconPlus,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProductos } from '@/lib/consultas';
import { useOrdenes } from '@/lib/consultasOrdenes';
import {
  TEXTO_TIPO,
  useGuardarJornada,
  useGuardarTarea,
  useHechoPorTarea,
  useJornadas,
  usePersonal,
  useReordenarTareas,
  useTareasProduccion,
  useTramosAbiertos,
  type Jornada,
  type TareaProduccion,
  type TipoTarea,
} from '@/lib/consultasTareasProduccion';
import { fechaISO, numero } from '@/lib/formato';
import { GrupoEnCurso } from './MisTareas';

/** Un color por grupo de operarias: las tareas del mismo grupo se ven iguales. */
const PALETA = [
  '#e64980',
  '#1c7ed6',
  '#2f9e44',
  '#f08c00',
  '#7048e8',
  '#0c8599',
  '#d9480f',
  '#5c940d',
];
export function colorGrupo(ids: string[]): string {
  if (ids.length === 0) return '#868e96';
  let h = 0;
  for (const c of [...ids].sort().join('|')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length]!;
}

/** Tramos contiguos de columnas: dos vecinas se funden en un rectángulo. */
function tramosContiguos(columnas: number[]): [number, number][] {
  const orden = [...columnas].sort((a, b) => a - b);
  const r: [number, number][] = [];
  for (const c of orden) {
    const ultimo = r[r.length - 1];
    if (ultimo && ultimo[1] === c - 1) ultimo[1] = c;
    else r.push([c, c]);
  }
  return r;
}

const ANCHO_COLUMNA = 150;

function FilaTarea({
  t,
  columnas,
  ordenando,
  enCurso,
  hecho,
  onAbrir,
}: {
  t: TareaProduccion;
  columnas: string[];
  ordenando: boolean;
  enCurso: boolean;
  hecho: number;
  onAbrir: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: t.id,
    });
  const color = colorGrupo(t.asignadas);
  // Columna 0: «Sin asignar» (o asignada a quien hoy no trabaja).
  const idx = t.asignadas.map((a) => columnas.indexOf(a) + 1).filter((i) => i > 0);
  const bloques = idx.length ? tramosContiguos(idx) : [[0, 0] as [number, number]];
  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columnas.length + 1}, ${ANCHO_COLUMNA}px)`,
        gap: 8,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : undefined,
        touchAction: ordenando ? 'none' : 'manipulation',
      }}
    >
      {bloques.map(([a, b], i) => (
        <Paper
          key={i}
          p="xs"
          radius="md"
          {...(ordenando && !isDragging ? { className: 'tiembla' } : {})}
          {...(ordenando ? {} : { onClick: onAbrir })}
          style={{
            gridColumn: `${a + 1} / ${b + 2}`,
            background: `${color}22`,
            border: `2px solid ${color}`,
            cursor: ordenando ? 'grab' : 'pointer',
            animationDelay: `${(t.id.charCodeAt(0) % 5) * -0.05}s`,
            boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,.25)' : undefined,
          }}
        >
          <Text size="sm" fw={700} lh={1.2}>
            {t.descripcion}
          </Text>
          <Group gap={4} mt={4}>
            <Badge size="xs" variant="light" color={enCurso ? 'green' : 'gray'}>
              {enCurso ? 'En curso' : t.estado === 'LISTA' ? 'Lista' : 'Pendiente'}
            </Badge>
            {t.cantidad ? (
              <Text size="xs" c="dimmed">
                {numero(hecho)} / {numero(t.cantidad)}
              </Text>
            ) : null}
          </Group>
        </Paper>
      ))}
    </Box>
  );
}

/** Nueva tarea o edición: qué, de qué producto y orden, cuánto y quiénes. */
function ModalTarea({
  tarea,
  personal,
  delDia,
  prioridad,
  onCerrar,
}: {
  tarea: TareaProduccion | null;
  personal: { value: string; label: string }[];
  delDia: string[];
  prioridad: number;
  onCerrar: () => void;
}) {
  const productos = useProductos();
  const ordenes = useOrdenes();
  const guardar = useGuardarTarea();
  const tramos = useTramosAbiertos();
  const [tipo, setTipo] = useState<TipoTarea>(tarea?.tipo ?? 'ENVASAR');
  const [producto, setProducto] = useState<string | null>(tarea?.producto_id ?? null);
  const [orden, setOrden] = useState<string | null>(tarea?.orden_id ?? null);
  const [cantidad, setCantidad] = useState<number | string>(tarea?.cantidad ?? '');
  const [asignadas, setAsignadas] = useState<string[]>(tarea?.asignadas ?? []);
  const [texto, setTexto] = useState(tarea?.descripcion ?? '');
  const [tocado, setTocado] = useState(Boolean(tarea));

  const nombreProducto =
    (productos.data ?? []).find((p) => p.id === producto)?.nombre ?? '';
  // «Etiquetar 500 unidades de Sanitizante», mientras no la escriba a mano.
  const sugerida =
    tipo === 'OTRA'
      ? ''
      : `${TEXTO_TIPO[tipo]}${cantidad !== '' ? ` ${numero(Number(cantidad))} unidades` : ''}${nombreProducto ? ` de ${nombreProducto}` : ''}`;
  const descripcion = tocado ? texto : sugerida;
  const ordenesDelProducto = (ordenes.data ?? []).filter(
    (o) => o.estado === 'ABIERTA' && (!producto || o.producto_id === producto),
  );
  const tramo = (tramos.data ?? []).find((x) => x.tarea_id === tarea?.id);
  const editable = !tarea || tarea.estado === 'PENDIENTE' || tarea.estado === 'EN_CURSO';
  const opcionesPersonal = [...personal].sort(
    (a, b) => Number(delDia.includes(b.value)) - Number(delDia.includes(a.value)),
  );

  return (
    <Modal
      opened
      onClose={onCerrar}
      title={<Text fw={700}>{tarea ? 'Tarea' : 'Nueva tarea'}</Text>}
      size="lg"
    >
      <Stack gap="sm">
        <SegmentedControl
          fullWidth
          value={tipo}
          onChange={(v) => setTipo(v as TipoTarea)}
          data={(Object.keys(TEXTO_TIPO) as TipoTarea[]).map((k) => ({
            value: k,
            label: TEXTO_TIPO[k],
          }))}
          disabled={!editable}
        />
        <Group grow align="flex-start">
          <Select
            label="Producto"
            placeholder={tipo === 'OTRA' ? 'Opcional' : 'Elegí el producto'}
            searchable
            clearable
            data={(productos.data ?? [])
              .filter((p) => p.activo)
              .map((p) => ({ value: p.id, label: `${p.codigo_interno} · ${p.nombre}` }))}
            value={producto}
            onChange={(v) => {
              setProducto(v);
              setOrden(null);
            }}
            disabled={!editable}
          />
          <Select
            label="Orden de producción"
            description="Opcional: de ahí sale el lote"
            clearable
            data={ordenesDelProducto.map((o) => ({
              value: o.id,
              label: `${o.numero} · ${o.numero_lote}`,
            }))}
            value={orden}
            onChange={(v) => {
              setOrden(v);
              const o = (ordenes.data ?? []).find((x) => x.id === v);
              if (o && !producto) setProducto(o.producto_id);
            }}
            disabled={!editable}
          />
        </Group>
        <NumberInput
          label="Cantidad"
          placeholder="Opcional"
          min={1}
          allowDecimal={false}
          value={cantidad}
          onChange={setCantidad}
          disabled={!editable}
          w={160}
        />
        <TextInput
          label="Qué dice la tarea"
          value={descripcion}
          onChange={(e) => {
            setTocado(true);
            setTexto(e.currentTarget.value);
          }}
          disabled={!editable}
        />
        <MultiSelect
          label="Quiénes la hacen"
          description="Las que trabajan juntas comparten color en el tablero"
          data={opcionesPersonal}
          value={asignadas}
          onChange={setAsignadas}
          searchable
          disabled={!editable}
        />
        {tramo ? (
          <Paper withBorder p="sm" radius="md">
            <Text size="sm" fw={600} mb={4}>
              Trabajando ahora
            </Text>
            <GrupoEnCurso tramo={tramo} personal={personal} />
          </Paper>
        ) : null}
        <Group justify="space-between">
          {tarea && tarea.estado === 'PENDIENTE' && !tramo ? (
            <Button
              variant="subtle"
              color="red"
              loading={guardar.isPending}
              onClick={() =>
                guardar.mutate(
                  { id: tarea.id, estado: 'CANCELADA' },
                  { onSuccess: onCerrar },
                )
              }
            >
              Cancelar la tarea
            </Button>
          ) : (
            <span />
          )}
          {editable ? (
            <Button
              loading={guardar.isPending}
              disabled={!descripcion.trim()}
              onClick={() =>
                guardar.mutate(
                  {
                    ...(tarea ? { id: tarea.id } : { prioridad }),
                    tipo,
                    descripcion: descripcion.trim(),
                    producto_id: producto,
                    orden_id: orden,
                    cantidad: cantidad === '' ? null : Number(cantidad),
                    asignadas,
                  },
                  { onSuccess: onCerrar },
                )
              }
            >
              {tarea ? 'Guardar' : 'Mandar la tarea'}
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Modal>
  );
}

/** Cabecera de una operaria del día: nombre, horario y sacarla del día. */
function ColumnaOperaria({ j, nombre }: { j: Jornada; nombre: string }) {
  const guardar = useGuardarJornada();
  const cambiar = (c: Partial<Jornada>) =>
    guardar.mutate({ fecha: j.fecha, usuario_id: j.usuario_id, ...c });
  return (
    <Paper
      withBorder
      p={6}
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Group justify="space-between" wrap="nowrap" gap={2}>
        <Text size="sm" fw={700} truncate>
          {nombre}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          aria-label={`${nombre} no trabaja hoy`}
          onClick={() => cambiar({ trabaja: false })}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>
      <Group gap={2} wrap="nowrap">
        <TextInput
          type="time"
          size="xs"
          aria-label="Entrada"
          defaultValue={j.entrada.slice(0, 5)}
          onBlur={(e) =>
            e.currentTarget.value && cambiar({ entrada: e.currentTarget.value })
          }
        />
        <TextInput
          type="time"
          size="xs"
          aria-label="Salida"
          defaultValue={j.salida.slice(0, 5)}
          onBlur={(e) =>
            e.currentTarget.value && cambiar({ salida: e.currentTarget.value })
          }
        />
      </Group>
    </Paper>
  );
}

/**
 * Tablero de tareas de Naza (D-tareas-1, pedido del 2026-10-23): a lo ancho,
 * las operarias del día; a lo largo, las tareas por prioridad. Una tarea de
 * varias ocupa sus columnas (las vecinas se funden), y las del mismo grupo
 * tienen el mismo color. Se reordena manteniendo apretado y arrastrando.
 */
export function TableroTareasProduccion() {
  const hoy = fechaISO(new Date())!;
  const tareas = useTareasProduccion();
  const tramos = useTramosAbiertos();
  const jornadas = useJornadas(hoy);
  const personal = usePersonal();
  const guardarJornada = useGuardarJornada();
  const reordenar = useReordenarTareas();
  const [ordenando, setOrdenando] = useState(false);
  const [abierta, setAbierta] = useState<TareaProduccion | 'nueva' | null>(null);
  const [local, setLocal] = useState<string[] | null>(null);

  const lista = (tareas.data ?? []).filter((t) => t.estado !== 'CANCELADA');
  const hecho = useHechoPorTarea(lista.map((t) => t.id));
  const porId = new Map(lista.map((t) => [t.id, t]));
  const orden = (local ?? lista.map((t) => t.id)).filter((id) => porId.has(id));
  const delDia = (jornadas.data ?? []).filter((j) => j.trabaja);
  const columnas = delDia.map((j) => j.usuario_id);
  const nombres = new Map((personal.data ?? []).map((p) => [p.id, p.nombre_completo]));
  const opcionesPersonal = (personal.data ?? []).map((p) => ({
    value: p.id,
    label: p.nombre_completo,
  }));
  const enCurso = new Set((tramos.data ?? []).map((x) => x.tarea_id));

  const sensores = useSensors(
    // Mantener apretado entra en modo ordenar, como en el iPhone.
    useSensor(PointerSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const alSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const nuevo = arrayMove(
      orden,
      orden.indexOf(String(e.active.id)),
      orden.indexOf(String(e.over.id)),
    );
    setLocal(nuevo);
    reordenar.mutate(nuevo, { onSettled: () => setLocal(null) });
  };

  const fuera = (personal.data ?? []).filter((p) => !columnas.includes(p.id));
  const agregar = (id: string | null) =>
    id &&
    guardarJornada.mutate({
      fecha: hoy,
      usuario_id: id,
      trabaja: true,
      orden: delDia.length,
    });

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Select
            placeholder="Sumar operaria al día"
            leftSection={<IconUserPlus size={16} />}
            searchable
            value={null}
            onChange={agregar}
            data={fuera
              .sort(
                (a, b) => Number(b.rol === 'PRODUCCION') - Number(a.rol === 'PRODUCCION'),
              )
              .map((p) => ({ value: p.id, label: p.nombre_completo }))}
            w={240}
          />
          {columnas.length === 0 ? (
            <Button
              variant="light"
              onClick={() =>
                fuera
                  .filter((p) => p.rol === 'PRODUCCION')
                  .forEach((p, i) =>
                    guardarJornada.mutate({
                      fecha: hoy,
                      usuario_id: p.id,
                      trabaja: true,
                      orden: i,
                    }),
                  )
              }
            >
              Todas las de Producción
            </Button>
          ) : null}
        </Group>
        <Group gap="xs">
          <Button
            variant={ordenando ? 'filled' : 'default'}
            leftSection={
              ordenando ? <IconCheck size={16} /> : <IconArrowsSort size={16} />
            }
            onClick={() => setOrdenando((o) => !o)}
          >
            {ordenando ? 'Listo' : 'Ordenar'}
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setAbierta('nueva')}
          >
            Tarea
          </Button>
        </Group>
      </Group>

      <Box style={{ overflowX: 'auto' }} pb="sm">
        <Stack gap={8} style={{ width: 'max-content' }}>
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columnas.length + 1}, ${ANCHO_COLUMNA}px)`,
              gap: 8,
            }}
          >
            <Paper
              p={6}
              radius="md"
              style={{ background: 'var(--mantine-color-gray-1)' }}
            >
              <Text size="sm" fw={700} c="dimmed">
                Sin asignar
              </Text>
            </Paper>
            {delDia.map((j) => (
              <ColumnaOperaria
                key={j.id}
                j={j}
                nombre={nombres.get(j.usuario_id) ?? '—'}
              />
            ))}
          </Box>
          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            onDragStart={() => setOrdenando(true)}
            onDragEnd={alSoltar}
          >
            <SortableContext items={orden} strategy={verticalListSortingStrategy}>
              {orden.map((id) => {
                const t = porId.get(id)!;
                return (
                  <FilaTarea
                    key={id}
                    t={t}
                    columnas={columnas}
                    ordenando={ordenando}
                    enCurso={enCurso.has(id)}
                    hecho={hecho.data?.get(id) ?? 0}
                    onAbrir={() => setAbierta(t)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
          {orden.length === 0 ? (
            <Text c="dimmed" size="sm">
              Sin tareas. Tocá «Tarea» para mandar la primera.
            </Text>
          ) : null}
        </Stack>
      </Box>

      {abierta ? (
        <ModalTarea
          tarea={abierta === 'nueva' ? null : abierta}
          personal={opcionesPersonal}
          delDia={columnas}
          prioridad={lista.length ? Math.max(...lista.map((t) => t.prioridad)) + 1 : 0}
          onCerrar={() => setAbierta(null)}
        />
      ) : null}
    </Stack>
  );
}

import { useRef, useState, type PointerEvent as EventoPuntero } from 'react';
import {
  Badge,
  Button,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useSesion } from '@/features/auth/sesion';
import { fechaHora } from '@/lib/formato';
import { useNomina } from '@/lib/consultasComercial';
import {
  useCerrarTareaEquipo,
  useCrearTareaEquipo,
  useMoverTareaEquipo,
  useTareasEquipo,
  type TareaEquipo,
} from '@/lib/consultasTareasEquipo';
import { colorDe } from './colores';

/*
 * Matriz de Eisenhower. x: urgencia (0 urgente, a la izquierda);
 * y: importancia (0 importante, arriba). El pin se clava donde está la punta
 * de la aguja.
 */
const CUADRANTES = [
  { clave: 'hacer', titulo: 'Hacer ya', sub: 'Urgente e importante', x: 0.25, y: 0.25 },
  {
    clave: 'planificar',
    titulo: 'Planificar',
    sub: 'Importante, no urgente',
    x: 0.75,
    y: 0.25,
  },
  {
    clave: 'delegar',
    titulo: 'Delegar',
    sub: 'Urgente, no importante',
    x: 0.25,
    y: 0.75,
  },
  {
    clave: 'despues',
    titulo: 'Para después',
    sub: 'Ni urgente ni importante',
    x: 0.75,
    y: 0.75,
  },
] as const;

const limitar = (v: number) => Math.min(0.98, Math.max(0.02, v));
/** La punta de la aguja queda 26 px debajo de donde se agarra la cabeza. */
const AGUJA = 26;

/** Pin plano: cabeza lisa del color de la persona, punto blanco y aguja fina. */
function Pin({ color, alto = 30 }: { color: string; alto?: number }) {
  return (
    <svg
      width={alto * 0.8}
      height={alto}
      viewBox="0 0 24 30"
      aria-hidden
      style={{ display: 'block' }}
    >
      <path d="M12 15 L12 29" stroke="#495057" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="9" r="8" fill={color} />
      <circle cx="12" cy="9" r="2.6" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

export function MatrizTareas() {
  const { claims } = useSesion();
  const yo = claims?.usuario_id ?? null;
  const tareas = useTareasEquipo(true);
  const nomina = useNomina();
  const mover = useMoverTareaEquipo();
  const cerrar = useCerrarTareaEquipo();
  const tablero = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<{
    id: string;
    x: number;
    y: number;
    desdeX: number;
    desdeY: number;
    movido: boolean;
  } | null>(null);
  const [clavado, setClavado] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'mias'>('todas');
  const [cargando, setCargando] = useState(false);

  const nombre = (id: string | null) => (id ? (nomina.data?.get(id) ?? '') : '');
  const visibles = (tareas.data ?? []).filter(
    (t) => filtro === 'todas' || t.creada_por === yo,
  );
  const personas = [...new Set(visibles.map((t) => t.creada_por))];

  const posicion = (e: EventoPuntero) => {
    const r = tablero.current!.getBoundingClientRect();
    return {
      x: limitar((e.clientX - r.left) / r.width),
      y: limitar((e.clientY + AGUJA - r.top) / r.height),
    };
  };

  const agarrar = (e: EventoPuntero<HTMLDivElement>, t: TareaEquipo) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setAbierta(null);
    setArrastre({
      id: t.id,
      x: t.pos_x,
      y: t.pos_y,
      desdeX: e.clientX,
      desdeY: e.clientY,
      movido: false,
    });
  };
  const arrastrar = (e: EventoPuntero<HTMLDivElement>) => {
    if (!arrastre) return;
    const movido =
      arrastre.movido ||
      Math.hypot(e.clientX - arrastre.desdeX, e.clientY - arrastre.desdeY) > 4;
    setArrastre({ ...arrastre, ...(movido ? posicion(e) : {}), movido });
  };
  const soltar = () => {
    if (!arrastre) return;
    if (arrastre.movido) {
      mover.mutate({ id: arrastre.id, pos_x: arrastre.x, pos_y: arrastre.y });
      setClavado(arrastre.id);
      window.setTimeout(() => setClavado(null), 450);
    } else {
      setAbierta(abierta === arrastre.id ? null : arrastre.id);
    }
    setArrastre(null);
  };

  return (
    <Stack gap="sm" h="100%">
      {/* Una sola franja arriba: la matriz se lleva el resto de la pantalla. */}
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
          <SegmentedControl
            size="xs"
            value={filtro}
            onChange={(v) => setFiltro(v as 'todas' | 'mias')}
            data={[
              { value: 'todas', label: 'Todas' },
              { value: 'mias', label: 'Solo las mías' },
            ]}
          />
          <Text size="xs" c="dimmed" truncate visibleFrom="sm">
            Tocá un pin para ver la tarea. Arrastralo para moverlo.
          </Text>
        </Group>
        <Popover
          opened={cargando}
          onChange={setCargando}
          position="bottom-end"
          shadow="md"
          width={340}
          trapFocus
        >
          <Popover.Target>
            <Button
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={() => setCargando((v) => !v)}
            >
              Nueva tarea
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <NuevaTarea onListo={() => setCargando(false)} />
          </Popover.Dropdown>
        </Popover>
      </Group>

      <div
        ref={tablero}
        className="matriz-tareas"
        onClick={(e) => {
          if (e.target === e.currentTarget) setAbierta(null);
        }}
      >
        {CUADRANTES.map((c) => (
          <div key={c.clave} className={`matriz-cuadrante matriz-${c.clave}`}>
            <Text fw={700} size="sm">
              {c.titulo}
            </Text>
            <Text size="xs" c="dimmed">
              {c.sub}
            </Text>
          </div>
        ))}
        <span className="matriz-eje matriz-eje-x">← Más urgente · Menos urgente →</span>
        <span className="matriz-eje matriz-eje-y">
          ← Menos importante · Más importante →
        </span>

        {visibles.map((t) => {
          const enArrastre = arrastre?.id === t.id ? arrastre : null;
          const x = enArrastre ? enArrastre.x : t.pos_x;
          const y = enArrastre ? enArrastre.y : t.pos_y;
          const autor = nombre(t.creada_por);
          return (
            <Popover
              key={t.id}
              opened={abierta === t.id}
              onChange={(o) => !o && setAbierta(null)}
              position="right-start"
              withArrow
              shadow="md"
              width={280}
            >
              <Popover.Target>
                <div
                  className={[
                    'pin-tarea',
                    enArrastre?.movido ? 'pin-levantado' : '',
                    clavado === t.id ? 'pin-clavado' : '',
                  ].join(' ')}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  onPointerDown={(e) => agarrar(e, t)}
                  onPointerMove={arrastrar}
                  onPointerUp={soltar}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t.titulo}, de ${autor}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setAbierta(t.id);
                  }}
                >
                  <div className="pin-cuerpo">
                    <Pin color={colorDe(autor)} />
                  </div>
                  <span className="pin-etiqueta">{t.titulo}</span>
                </div>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap={6}>
                  <Group gap="xs" wrap="nowrap">
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: colorDe(autor),
                        flexShrink: 0,
                      }}
                    />
                    <Text fw={700} style={{ wordBreak: 'break-word' }}>
                      {t.titulo}
                    </Text>
                  </Group>
                  {t.detalle ? (
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {t.detalle}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    La asignó {autor || '—'} · {fechaHora(t.creada_en)}
                  </Text>
                  {t.movida_por ? (
                    <Text size="xs" c="dimmed">
                      La movió {nombre(t.movida_por)} · {fechaHora(t.movida_en)}
                    </Text>
                  ) : null}
                  <Badge
                    variant="light"
                    color={t.compartida ? 'azul' : 'gray'}
                    w="fit-content"
                  >
                    {t.compartida ? 'Común: la ven todos' : 'Propia: solo vos'}
                  </Badge>
                  <Group gap="xs" mt={4}>
                    <Button
                      size="compact-md"
                      color="estadoAprobado"
                      onClick={() => cerrar.mutate({ id: t.id, como: 'hecha' })}
                    >
                      Hecha
                    </Button>
                    {t.creada_por === yo ? (
                      <Button
                        size="compact-md"
                        variant="subtle"
                        color="gray"
                        onClick={() => cerrar.mutate({ id: t.id, como: 'archivada' })}
                      >
                        Sacar
                      </Button>
                    ) : null}
                  </Group>
                </Stack>
              </Popover.Dropdown>
            </Popover>
          );
        })}
      </div>

      {personas.length ? (
        <Group gap="md">
          {personas.map((p) => (
            <Group key={p} gap={6}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: colorDe(nombre(p)),
                }}
              />
              <Text size="xs">{nombre(p)}</Text>
            </Group>
          ))}
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          Todavía no hay tareas. Tocá «Nueva tarea» y después arrastrá el pin donde va.
        </Text>
      )}
    </Stack>
  );
}

function NuevaTarea({ onListo }: { onListo: () => void }) {
  const crear = useCrearTareaEquipo();
  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [compartida, setCompartida] = useState(true);
  const [donde, setDonde] = useState<(typeof CUADRANTES)[number]['clave']>('hacer');
  return (
    <Stack gap="xs">
      <TextInput
        size="sm"
        label="Tarea"
        placeholder="Llamar al proveedor de envases…"
        maxLength={120}
        value={titulo}
        onChange={(e) => setTitulo(e.currentTarget.value)}
        data-autofocus
      />
      <Textarea
        size="sm"
        label="Detalle (opcional)"
        autosize
        minRows={1}
        maxRows={3}
        value={detalle}
        onChange={(e) => setDetalle(e.currentTarget.value)}
      />
      <SegmentedControl
        size="xs"
        fullWidth
        value={compartida ? 'comun' : 'propia'}
        onChange={(v) => setCompartida(v === 'comun')}
        data={[
          { value: 'comun', label: 'Común' },
          { value: 'propia', label: 'Solo yo' },
        ]}
      />
      <SegmentedControl
        size="xs"
        fullWidth
        value={donde}
        onChange={(v) => setDonde(v as typeof donde)}
        data={CUADRANTES.map((c) => ({ value: c.clave, label: c.titulo }))}
      />
      <Group justify="flex-end" gap="xs">
        <Button size="sm" variant="subtle" color="gray" onClick={onListo}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={!titulo.trim()}
          loading={crear.isPending}
          onClick={() => {
            const c = CUADRANTES.find((q) => q.clave === donde)!;
            // Un poco de dispersión para que no caigan todas en el mismo lugar.
            const j = () => (Math.random() - 0.5) * 0.16;
            crear.mutate(
              {
                titulo: titulo.trim(),
                detalle: detalle.trim() || null,
                compartida,
                pos_x: limitar(c.x + j()),
                pos_y: limitar(c.y + j()),
              },
              { onSuccess: onListo },
            );
          }}
        >
          Clavar
        </Button>
      </Group>
    </Stack>
  );
}

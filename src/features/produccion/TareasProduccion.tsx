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
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconBell, IconChecklist, IconPlus } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useSesion } from '@/features/auth/sesion';
import { useProductos } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import { useNomina } from '@/lib/consultasComercial';
import {
  ETAPAS,
  useOrdenesAbiertasConEtapas,
  type EtapaOrden,
  type OrdenProduccion,
} from '@/lib/consultasOrdenes';
import {
  ROLES_GESTIONAN_TAREAS,
  useAsignarEtapa,
  useAsignarTarea,
  useAvisosTareas,
  useCrearTarea,
  useEmpezarEtapa,
  useEmpezarTarea,
  useMarcarVista,
  usePersonalPlanta,
  useQuitarTarea,
  useTareasPlanta,
  useTerminarTarea,
  type TareaPlanta,
} from '@/lib/consultasTareas';
import { EditorEtapa } from './PaginaOrden';

/*
 * Lo que hace planta según los POE: pesada (I.40.16), elaboración y
 * fraccionamiento (ME.40.x / R.40.x.1), cada una con sus verificaciones de
 * área, equipos y vestimenta. Muestreos, controles y contramuestra son de
 * Control de Calidad (I.50.4, I.60.12) y no aparecen acá.
 */
const DE_PLANTA: EtapaOrden[] = ['PESADA', 'ELABORACION', 'FRACCIONAMIENTO'];

/** El próximo paso de planta de una orden, en el orden del batch record. */
export const proximaDePlanta = (hechas: EtapaOrden[]) =>
  DE_PLANTA.find((e) => !hechas.includes(e)) ?? null;

/** Asignada a mí, a nadie (= para todos), o soy quien gestiona: la veo. */
export const laVe = (
  asignadaA: string | null | undefined,
  yo: string | null,
  gestor: boolean,
) => gestor || !asignadaA || asignadaA === yo;

const QUE_SE_CARGA: Partial<Record<EtapaOrden, string>> = {
  PESADA:
    'Verificaciones de área, balanza y vestimenta, y lo que pesaste de cada materia prima.',
  ELABORACION: 'Verificaciones de área y vestimenta, y cada paso con su equipo.',
  FRACCIONAMIENTO: 'Verificaciones, envases usados y el recuento de canastas.',
};

const hora = (t: string | null) =>
  t
    ? new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '';

/**
 * «Tareas de producción»: por cada orden abierta, el próximo paso de planta,
 * y las tareas libres que cargó Producción. Asignar es opcional: lo que no
 * está asignado lo ven todos. Horarios y nombres los pone el sistema.
 */
export function TareasProduccion({ titulo = true }: { titulo?: boolean }) {
  const { claims } = useSesion();
  const yo = claims?.usuario_id ?? null;
  const gestor = (claims?.roles ?? []).some((r) => ROLES_GESTIONAN_TAREAS.includes(r));
  const ordenes = useOrdenesAbiertasConEtapas();
  const tareas = useTareasPlanta();
  const productos = useProductos();
  const nomina = useNomina();
  const personal = usePersonalPlanta();
  const empezarEtapa = useEmpezarEtapa();
  const asignarEtapa = useAsignarEtapa();
  const asignarTarea = useAsignarTarea();
  const empezarTarea = useEmpezarTarea();
  const terminarTarea = useTerminarTarea();
  const quitarTarea = useQuitarTarea();
  const [haciendo, setHaciendo] = useState<{
    orden: OrdenProduccion;
    etapa: EtapaOrden;
    inicio: string | null;
  } | null>(null);
  const [nueva, setNueva] = useState<{ para: string | null } | null>(null);

  if (ordenes.isLoading || tareas.isLoading) return <Skeleton h={200} radius="lg" />;

  const producto = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const quien = (id: string | null) => (id ? (nomina.data?.get(id) ?? '') : '');
  const opcionesPersonal = (personal.data ?? []).map((u) => ({
    value: u.id,
    label: u.nombre_completo ?? '',
  }));
  const filas = tareas.data ?? [];
  const deEtapa = (ordenId: string, etapa: EtapaOrden) =>
    filas.find((t) => t.orden_id === ordenId && t.etapa === etapa);
  const ordenPorId = new Map((ordenes.data ?? []).map((o) => [o.id, o]));

  const etapasPendientes = (ordenes.data ?? []).flatMap(({ op_etapas, ...orden }) => {
    const etapa = proximaDePlanta((op_etapas ?? []).map((e) => e.etapa));
    if (!etapa) return [];
    const tarea = deEtapa(orden.id, etapa);
    return laVe(tarea?.asignada_a, yo, gestor) ? [{ orden, etapa, tarea }] : [];
  });
  const libres = filas.filter(
    (t) => !t.etapa && !t.terminada_en && laVe(t.asignada_a, yo, gestor),
  );
  const total = etapasPendientes.length + libres.length;

  const asignacion = (
    t: TareaPlanta | undefined,
    onCambiar: (u: string | null) => void,
  ) =>
    gestor ? (
      <Select
        size="sm"
        w={200}
        placeholder="Para todos"
        aria-label="Asignar a"
        clearable
        data={opcionesPersonal}
        value={t?.asignada_a ?? null}
        onChange={onCambiar}
      />
    ) : null;

  const estado = (t: TareaPlanta | undefined) => (
    <Group gap="xs">
      <Badge variant="light" color={t?.asignada_a ? 'azul' : 'gray'}>
        {t?.asignada_a ? `Para ${quien(t.asignada_a)}` : 'Para todos'}
      </Badge>
      {t?.iniciada_en ? (
        <Badge variant="light" color="estadoEnAnalisis">
          Empezó {quien(t.iniciada_por)} a las {hora(t.iniciada_en)}
        </Badge>
      ) : null}
    </Group>
  );

  return (
    <Stack gap="md">
      {titulo ? (
        <div>
          <Title order={2}>
            {claims?.nombre
              ? `Hola, ${claims.nombre.split(' ')[0]}`
              : 'Tareas de producción'}
          </Title>
          <Text c="dimmed" size="lg">
            {total === 0
              ? 'No hay nada para hacer en planta por ahora.'
              : 'Elegí qué vas a hacer y, cuando termines, tocá «Listo».'}
          </Text>
        </div>
      ) : null}

      {gestor ? <AvisosTerminadas onAsignar={(para) => setNueva({ para })} /> : null}

      {gestor ? (
        <Group justify="flex-end">
          <Button
            leftSection={<IconPlus size={18} />}
            variant="light"
            onClick={() => setNueva({ para: null })}
          >
            Nueva tarea
          </Button>
        </Group>
      ) : null}

      {total === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconChecklist}
            titulo="Sin tareas"
            descripcion="Cuando Gerencia de Producción abra una orden o cargue una tarea, aparece acá."
          />
        </Paper>
      ) : null}

      {etapasPendientes.map(({ orden, etapa, tarea }) => (
        <Paper
          key={orden.id}
          withBorder
          p="lg"
          radius="lg"
          style={{ borderColor: 'var(--superficie-borde)' }}
        >
          <Group justify="space-between" wrap="wrap" gap="md">
            <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
              <Group gap="xs">
                <Badge size="lg" variant="light">
                  {ETAPAS.find((e) => e.etapa === etapa)?.titulo}
                </Badge>
                {estado(tarea)}
              </Group>
              <Text fw={700} size="lg">
                {producto(orden.producto_id)}
              </Text>
              <Text size="sm" c="dimmed">
                Lote {orden.numero_lote} · {numero(Number(orden.cantidad_teorica), 2)}{' '}
                {orden.unidad} · elaboración {fecha(orden.jornada)}
              </Text>
              <Text size="sm">{QUE_SE_CARGA[etapa]}</Text>
            </Stack>
            <Stack gap="xs" align="flex-end">
              {asignacion(tarea, (u) =>
                asignarEtapa.mutate({ ordenId: orden.id, etapa, usuario: u }),
              )}
              <Button
                size="lg"
                loading={
                  empezarEtapa.isPending && empezarEtapa.variables?.ordenId === orden.id
                }
                onClick={() =>
                  empezarEtapa.mutate(
                    { ordenId: orden.id, etapa },
                    {
                      onSuccess: (t) =>
                        setHaciendo({ orden, etapa, inicio: t?.iniciada_en ?? null }),
                    },
                  )
                }
              >
                {tarea?.iniciada_en ? 'Seguir' : 'Hacer'}
              </Button>
            </Stack>
          </Group>
        </Paper>
      ))}

      {libres.map((t) => {
        const o = t.orden_id ? ordenPorId.get(t.orden_id) : undefined;
        return (
          <Paper
            key={t.id}
            withBorder
            p="lg"
            radius="lg"
            style={{ borderColor: 'var(--superficie-borde)' }}
          >
            <Group justify="space-between" wrap="wrap" gap="md">
              <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                {estado(t)}
                <Text fw={700} size="lg" style={{ whiteSpace: 'pre-wrap' }}>
                  {t.descripcion}
                </Text>
                {o ? (
                  <Text size="sm" c="dimmed">
                    {producto(o.producto_id)} · lote {o.numero_lote}
                  </Text>
                ) : null}
                <Text size="xs" c="dimmed">
                  La pidió {quien(t.creada_por)}
                </Text>
              </Stack>
              <Stack gap="xs" align="flex-end">
                {asignacion(t, (u) => asignarTarea.mutate({ id: t.id, usuario: u }))}
                <Group gap="xs">
                  {gestor ? (
                    <Button
                      variant="subtle"
                      color="gray"
                      onClick={() => quitarTarea.mutate(t.id)}
                    >
                      Quitar
                    </Button>
                  ) : null}
                  {t.iniciada_en ? null : (
                    <Button
                      size="lg"
                      variant="light"
                      onClick={() => empezarTarea.mutate(t.id)}
                    >
                      Empezar
                    </Button>
                  )}
                  <Button
                    size="lg"
                    color="estadoAprobado"
                    loading={terminarTarea.isPending && terminarTarea.variables === t.id}
                    onClick={() => terminarTarea.mutate(t.id)}
                  >
                    Listo
                  </Button>
                </Group>
              </Stack>
            </Group>
          </Paper>
        );
      })}

      <Modal
        opened={haciendo !== null}
        onClose={() => setHaciendo(null)}
        title={
          haciendo ? (
            <Text fw={700}>
              {ETAPAS.find((e) => e.etapa === haciendo.etapa)?.titulo} · lote{' '}
              {haciendo.orden.numero_lote}
            </Text>
          ) : null
        }
        size="xl"
        centered
      >
        {haciendo ? (
          <EditorEtapa
            orden={haciendo.orden}
            etapa={haciendo.etapa}
            registrada={null}
            inicio={haciendo.inicio}
            etiquetaRegistrar="Listo, hecho"
            onListo={() => setHaciendo(null)}
          />
        ) : null}
      </Modal>

      {nueva ? (
        <ModalNuevaTarea
          para={nueva.para}
          personal={opcionesPersonal}
          ordenes={(ordenes.data ?? []).map((o) => ({
            value: o.id,
            label: `${producto(o.producto_id)} · lote ${o.numero_lote}`,
          }))}
          onCerrar={() => setNueva(null)}
        />
      ) : null}
    </Stack>
  );
}

/**
 * El aviso de Producción: quién terminó qué. «Asignarle otra tarea» abre una
 * tarea nueva para esa persona; «Visto» la saca del aviso (y del puntito).
 */
function AvisosTerminadas({ onAsignar }: { onAsignar: (para: string | null) => void }) {
  const avisos = useAvisosTareas();
  const nomina = useNomina();
  const ordenes = useOrdenesAbiertasConEtapas();
  const productos = useProductos();
  const marcar = useMarcarVista();
  if (avisos.length === 0) return null;
  const quien = (id: string | null) =>
    id ? (nomina.data?.get(id) ?? 'Alguien') : 'Alguien';
  const que = (t: TareaPlanta) => {
    if (!t.etapa) return t.descripcion ?? '';
    const o = (ordenes.data ?? []).find((x) => x.id === t.orden_id);
    const p = o ? (productos.data ?? []).find((x) => x.id === o.producto_id)?.nombre : '';
    const titulo = ETAPAS.find((e) => e.etapa === t.etapa)?.titulo ?? '';
    return `${titulo}${p ? ` de ${p}` : ''}${o ? ` (lote ${o.numero_lote})` : ''}`;
  };
  return (
    <Paper
      withBorder
      p="md"
      radius="lg"
      style={{ borderColor: 'var(--mantine-color-azul-4)' }}
    >
      <Group gap="xs" mb="sm">
        <IconBell size={18} color="var(--mantine-color-azul-6)" />
        <Text fw={700}>Terminaron</Text>
      </Group>
      <Stack gap="xs">
        {avisos.map((t) => (
          <Group key={t.id} justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">
              <b>{quien(t.terminada_por)}</b> terminó «{que(t)}» a las{' '}
              {hora(t.terminada_en)}.
            </Text>
            <Group gap="xs">
              <Button
                size="compact-md"
                variant="light"
                onClick={() => onAsignar(t.terminada_por)}
              >
                Asignarle otra tarea
              </Button>
              <Button
                size="compact-md"
                variant="subtle"
                color="gray"
                onClick={() => marcar.mutate(t.id)}
              >
                Visto
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

/** Tarea libre: lo que Producción quiera pedir. Persona y orden, opcionales. */
function ModalNuevaTarea({
  para,
  personal,
  ordenes,
  onCerrar,
}: {
  para: string | null;
  personal: { value: string; label: string }[];
  ordenes: { value: string; label: string }[];
  onCerrar: () => void;
}) {
  const crear = useCrearTarea();
  const [descripcion, setDescripcion] = useState('');
  const [asignada, setAsignada] = useState<string | null>(para);
  const [orden, setOrden] = useState<string | null>(null);
  return (
    <Modal opened onClose={onCerrar} title={<Text fw={700}>Nueva tarea</Text>} centered>
      <Stack gap="md">
        <Textarea
          label="Qué hay que hacer"
          placeholder="Poner etiquetas a los frascos de aceite Amor…"
          autosize
          minRows={2}
          value={descripcion}
          onChange={(e) => setDescripcion(e.currentTarget.value)}
        />
        <Select
          label="Para quién (opcional)"
          description="Si no elegís a nadie, la ven todos."
          placeholder="Para todos"
          clearable
          data={personal}
          value={asignada}
          onChange={setAsignada}
        />
        <Select
          label="De qué orden (opcional)"
          clearable
          data={ordenes}
          value={orden}
          onChange={setOrden}
        />
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!descripcion.trim()}
            loading={crear.isPending}
            onClick={() =>
              crear.mutate(
                {
                  descripcion: descripcion.trim(),
                  asignada_a: asignada,
                  orden_id: orden,
                },
                { onSuccess: onCerrar },
              )
            }
          >
            Crear tarea
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

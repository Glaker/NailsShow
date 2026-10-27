import { useState } from 'react';
import {
  Badge,
  Button,
  Chip,
  CloseButton,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconCheck,
  IconMapPin,
  IconPlayerPause,
  IconPlayerPlay,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import { useSesion } from '@/features/auth/sesion';
import { Vacio } from '@/components/Vacio';
import { useProductos } from '@/lib/consultas';
import { useOrdenes } from '@/lib/consultasOrdenes';
import {
  useCambiarGrupo,
  useCerrarTramo,
  useHechoPorTarea,
  useIniciarTarea,
  useReanudarTarea,
  usePersonal,
  useTareasProduccion,
  useTramosAbiertos,
  useUbicacionInsumos,
  type Participante,
  type TareaProduccion,
  type Tramo,
} from '@/lib/consultasTareasProduccion';
import { fecha, numero } from '@/lib/formato';

type TramoConGrupo = Tramo & { tramo_participantes: Participante[] };

/** Quiénes están trabajando: sacar a alguien o sumar a otra. */
export function GrupoEnCurso({
  tramo,
  personal,
}: {
  tramo: TramoConGrupo;
  personal: { value: string; label: string }[];
}) {
  const cambiar = useCambiarGrupo();
  const nombre = new Map(personal.map((p) => [p.value, p.label]));
  const en = tramo.tramo_participantes
    .filter((p) => p.hasta === null)
    .map((p) => p.usuario_id);
  return (
    <Group gap="xs" wrap="wrap">
      {en.map((id) => (
        <Badge
          key={id}
          size="xl"
          variant="light"
          radius="sm"
          rightSection={
            en.length > 1 ? (
              <CloseButton
                size="sm"
                aria-label={`Sacar a ${nombre.get(id) ?? ''}`}
                onClick={() =>
                  cambiar.mutate({ tramoId: tramo.id, usuarioId: id, entra: false })
                }
              />
            ) : null
          }
        >
          {nombre.get(id) ?? '—'}
        </Badge>
      ))}
      <Select
        placeholder="Sumar a alguien"
        leftSection={<IconUserPlus size={16} />}
        searchable
        value={null}
        data={personal.filter((p) => !en.includes(p.value))}
        onChange={(v) =>
          v && cambiar.mutate({ tramoId: tramo.id, usuarioId: v, entra: true })
        }
        w={210}
      />
    </Group>
  );
}

/** «Listo»: cuántas hicieron, y si queda pendiente o se terminó. */
function ModalListo({
  tarea,
  tramoId,
  falta,
  onCerrar,
}: {
  tarea: TareaProduccion;
  tramoId: string;
  falta: number | null;
  onCerrar: () => void;
}) {
  const cerrar = useCerrarTramo();
  const [cuantas, setCuantas] = useState<number | string>('');
  const n = cuantas === '' ? null : Number(cuantas);
  return (
    <Modal
      opened
      onClose={onCerrar}
      title={<Text fw={700}>{tarea.descripcion}</Text>}
      centered
      size="md"
    >
      <Stack gap="md">
        <NumberInput
          label="¿Cuántas hicieron entre todas?"
          description={falta !== null ? `Faltaban ${numero(falta)}` : undefined}
          size="xl"
          min={0}
          allowDecimal={false}
          value={cuantas}
          onChange={setCuantas}
          data-autofocus
        />
        <Button
          size="xl"
          variant="light"
          disabled={n === null}
          loading={cerrar.isPending}
          onClick={() =>
            cerrar.mutate(
              { tramoId, cierre: 'LISTO_HOY', cantidad: n },
              { onSuccess: onCerrar },
            )
          }
        >
          Listo por hoy: quedan pendientes
        </Button>
        <Button
          size="xl"
          color="green"
          leftSection={<IconCheck size={22} />}
          loading={cerrar.isPending}
          onClick={() =>
            cerrar.mutate(
              { tramoId, cierre: 'COMPLETA', cantidad: n },
              { onSuccess: onCerrar },
            )
          }
        >
          Completamos la tarea
        </Button>
        {falta !== null ? (
          <Text size="xs" c="dimmed">
            Si tocás «Completamos» sin poner cuántas, se cuentan las {numero(falta)} que
            faltaban.
          </Text>
        ) : null}
      </Stack>
    </Modal>
  );
}

/**
 * Dónde está cada insumo que se usa para el producto de la tarea: depósito,
 * estiba, cuánto queda y cuándo vence, el que vence antes primero
 * (D-ubicacion-insumos-1).
 */
export function UbicacionInsumos({
  productoId,
  producto,
  onCerrar,
}: {
  productoId: string;
  producto: string | null;
  onCerrar: () => void;
}) {
  const ubicacion = useUbicacionInsumos(productoId, true);
  const filas = ubicacion.data ?? [];
  const insumos = [...new Set(filas.map((f) => f.insumo_id))];
  return (
    <Modal
      opened
      onClose={onCerrar}
      title={
        <Text fw={700}>Dónde está cada insumo{producto ? ` · ${producto}` : ''}</Text>
      }
      size="xl"
    >
      {ubicacion.isLoading ? (
        <Skeleton h={200} />
      ) : insumos.length === 0 ? (
        <Text c="dimmed">
          Este producto todavía no tiene fórmula vigente ni materiales cargados.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="sm" fz="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Insumo</Table.Th>
                <Table.Th>Depósito</Table.Th>
                <Table.Th>Estiba</Table.Th>
                <Table.Th>Lote</Table.Th>
                <Table.Th ta="right">Queda</Table.Th>
                <Table.Th>Vence</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f, i) => {
                const primero = i === 0 || filas[i - 1]!.insumo_id !== f.insumo_id;
                return (
                  <Table.Tr key={`${f.insumo_id}-${f.lote ?? 'sin'}-${i}`}>
                    <Table.Td>
                      {primero ? (
                        <>
                          <Text fw={700}>{f.insumo}</Text>
                          <Text size="xs" c="dimmed">
                            {f.codigo} · {f.para}
                          </Text>
                        </>
                      ) : null}
                    </Table.Td>
                    {f.lote === null ? (
                      <Table.Td colSpan={5}>
                        <Text c="estadoRechazado" fw={600}>
                          Sin stock aprobado
                        </Text>
                      </Table.Td>
                    ) : (
                      <>
                        <Table.Td>{f.deposito}</Table.Td>
                        <Table.Td>
                          <Text fw={700}>{f.estiba ?? '—'}</Text>
                        </Table.Td>
                        <Table.Td>{f.lote}</Table.Td>
                        <Table.Td ta="right">
                          {numero(Number(f.saldo), 3)}{' '}
                          {f.unidad === 'UNIDAD' ? 'u' : f.unidad}
                        </Table.Td>
                        <Table.Td>{f.vence ? fecha(f.vence) : '—'}</Table.Td>
                      </>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Modal>
  );
}

function TarjetaTarea({
  t,
  tramo,
  hecho,
  personal,
  producto,
  lote,
}: {
  t: TareaProduccion;
  tramo: TramoConGrupo | undefined;
  hecho: number;
  personal: { value: string; label: string }[];
  producto: string | null;
  lote: string | null;
}) {
  const { claims } = useSesion();
  const yo = claims?.usuario_id ?? '';
  const iniciar = useIniciarTarea();
  const cerrar = useCerrarTramo();
  const cambiar = useCambiarGrupo();
  const [eligiendo, setEligiendo] = useState(false);
  const [con, setCon] = useState<string[]>(t.asignadas.filter((a) => a !== yo));
  const [listo, setListo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const nombre = new Map(personal.map((p) => [p.value, p.label]));
  const estoy = tramo?.tramo_participantes.some(
    (p) => p.usuario_id === yo && p.hasta === null,
  );
  const falta = t.cantidad === null ? null : Math.max(t.cantidad - hecho, 0);
  const reanudar = useReanudarTarea();
  // En curso sin tramo abierto: está en pausa (D-tareas-2).
  const enPausa = t.estado === 'EN_CURSO' && !tramo;
  const enGrupo = (tramo?.tramo_participantes ?? []).filter(
    (p) => p.hasta === null,
  ).length;
  const pausar = () =>
    tramo && cerrar.mutate({ tramoId: tramo.id, cierre: 'PAUSA', cantidad: null });

  return (
    <Paper
      withBorder
      p="lg"
      radius="lg"
      style={{ borderColor: tramo ? 'var(--mantine-color-green-6)' : undefined }}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Title order={3}>{t.descripcion}</Title>
            <Text c="dimmed">
              {[producto, lote ? `Lote ${lote}` : null].filter(Boolean).join(' · ')}
            </Text>
          </Stack>
          {tramo ? (
            <Badge size="lg" color="green">
              En curso
            </Badge>
          ) : enPausa ? (
            <Badge size="lg" color="yellow">
              En pausa
            </Badge>
          ) : null}
        </Group>
        {t.cantidad !== null ? (
          <Text size="lg">
            Hechas <b>{numero(hecho)}</b> de <b>{numero(t.cantidad)}</b>
          </Text>
        ) : null}
        {t.donde_buscar ? (
          <Stack gap={2}>
            <Text size="sm" fw={700} c="dimmed">
              DÓNDE ESTÁN LAS COSAS
            </Text>
            <Text size="lg" style={{ whiteSpace: 'pre-line' }}>
              {t.donde_buscar}
            </Text>
          </Stack>
        ) : null}
        {t.donde_dejar ? (
          <Text size="lg">
            <b>Dejarlo en:</b> {t.donde_dejar}
          </Text>
        ) : null}
        {t.notas ? (
          <Paper p="sm" radius="md" bg="var(--mantine-color-yellow-0)">
            <Text size="sm" fw={700} c="dimmed">
              NOTAS DE NAZA
            </Text>
            <Text size="lg" style={{ whiteSpace: 'pre-line' }}>
              {t.notas}
            </Text>
          </Paper>
        ) : null}
        {t.producto_id ? (
          <Button
            size="lg"
            variant="light"
            leftSection={<IconMapPin size={22} />}
            onClick={() => setBuscando(true)}
            style={{ alignSelf: 'flex-start' }}
          >
            Dónde están los insumos
          </Button>
        ) : null}
        {buscando && t.producto_id ? (
          <UbicacionInsumos
            productoId={t.producto_id}
            producto={producto}
            onCerrar={() => setBuscando(false)}
          />
        ) : null}

        {tramo ? (
          <>
            <GrupoEnCurso tramo={tramo} personal={personal} />
            {estoy ? (
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                {/* Pausa: para todas, o solo yo si las demás siguen trabajando. */}
                {enGrupo > 1 ? (
                  <Menu position="bottom" withinPortal>
                    <Menu.Target>
                      <Button
                        size="xl"
                        variant="default"
                        aria-label="Pausa"
                        loading={cerrar.isPending}
                      >
                        <IconPlayerPause size={28} />
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item fz="lg" onClick={pausar}>
                        Pausa para todas
                      </Menu.Item>
                      <Menu.Item
                        fz="lg"
                        onClick={() =>
                          cambiar.mutate({
                            tramoId: tramo.id,
                            usuarioId: yo,
                            entra: false,
                          })
                        }
                      >
                        Pauso solo yo (las demás siguen)
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                ) : (
                  <Button
                    size="xl"
                    variant="default"
                    aria-label="Pausa"
                    loading={cerrar.isPending}
                    onClick={pausar}
                  >
                    <IconPlayerPause size={28} />
                  </Button>
                )}
                <Button
                  size="xl"
                  variant="default"
                  color="red"
                  leftSection={<IconX size={22} />}
                  loading={cerrar.isPending}
                  onClick={() =>
                    cerrar.mutate({
                      tramoId: tramo.id,
                      cierre: 'CANCELADO',
                      cantidad: null,
                    })
                  }
                >
                  Cancelar
                </Button>
                <Button
                  size="xl"
                  color="green"
                  leftSection={<IconCheck size={22} />}
                  onClick={() => setListo(true)}
                >
                  Listo
                </Button>
              </SimpleGrid>
            ) : (
              <Button
                size="xl"
                leftSection={
                  t.asignadas.includes(yo) ? (
                    <IconPlayerPlay size={28} />
                  ) : (
                    <IconUserPlus size={22} />
                  )
                }
                aria-label={t.asignadas.includes(yo) ? 'Seguir' : 'Sumarme'}
                loading={cambiar.isPending}
                onClick={() =>
                  cambiar.mutate({ tramoId: tramo.id, usuarioId: yo, entra: true })
                }
              >
                {t.asignadas.includes(yo) ? null : 'Sumarme'}
              </Button>
            )}
          </>
        ) : enPausa ? (
          <Button
            size="xl"
            aria-label="Seguir"
            loading={reanudar.isPending}
            onClick={() => reanudar.mutate(t.id)}
          >
            <IconPlayerPlay size={28} />
          </Button>
        ) : (
          <Button
            size="xl"
            leftSection={<IconPlayerPlay size={22} />}
            onClick={() => setEligiendo(true)}
          >
            Iniciar
          </Button>
        )}
      </Stack>

      <Modal
        opened={eligiendo}
        onClose={() => setEligiendo(false)}
        title={<Text fw={700}>¿Con quién trabajás?</Text>}
        centered
      >
        <Stack gap="md">
          <Chip.Group multiple value={con} onChange={setCon}>
            <Group gap="xs">
              {personal
                .filter((p) => p.value !== yo)
                .map((p) => (
                  <Chip key={p.value} value={p.value} size="lg">
                    {p.label}
                  </Chip>
                ))}
            </Group>
          </Chip.Group>
          <Text size="sm" c="dimmed">
            {con.length === 0
              ? 'Sola.'
              : `Con ${con.map((c) => nombre.get(c)).join(', ')}. Una sola carga por todas.`}
          </Text>
          <Button
            size="xl"
            leftSection={<IconPlayerPlay size={22} />}
            loading={iniciar.isPending}
            onClick={() =>
              iniciar.mutate(
                { tareaId: t.id, con },
                { onSuccess: () => setEligiendo(false) },
              )
            }
          >
            Iniciar
          </Button>
        </Stack>
      </Modal>
      {listo && tramo ? (
        <ModalListo
          tarea={t}
          tramoId={tramo.id}
          falta={falta}
          onCerrar={() => setListo(false)}
        />
      ) : null}
    </Paper>
  );
}

/**
 * Mis tareas (rol Producción, D-tareas-1): lo que Naza les mandó, en orden de
 * prioridad, y lo que está en curso para sumarse. Iniciar, pausa, cancelar y
 * listo. No se muestran tiempos: los toma la base.
 */
export function MisTareas() {
  const { claims } = useSesion();
  const yo = claims?.usuario_id ?? '';
  const tareas = useTareasProduccion();
  const tramos = useTramosAbiertos();
  const personal = usePersonal();
  const productos = useProductos();
  const ordenes = useOrdenes();

  const tramoDe = new Map((tramos.data ?? []).map((x) => [x.tarea_id, x]));
  const lista = (tareas.data ?? []).filter(
    (t) =>
      (t.estado === 'PENDIENTE' || t.estado === 'EN_CURSO') &&
      (t.asignadas.includes(yo) || tramoDe.has(t.id)),
  );
  const hecho = useHechoPorTarea(lista.map((t) => t.id));
  const opciones = (personal.data ?? []).map((p) => ({
    value: p.id,
    label: p.nombre_completo,
  }));
  const nombreProducto = new Map((productos.data ?? []).map((p) => [p.id, p.nombre]));
  const loteDe = new Map((ordenes.data ?? []).map((o) => [o.id, o.numero_lote]));

  if (tareas.isLoading) return <Skeleton h={240} />;
  const mias = lista.filter(
    (t) =>
      t.asignadas.includes(yo) ||
      tramoDe
        .get(t.id)
        ?.tramo_participantes.some((p) => p.usuario_id === yo && p.hasta === null),
  );
  const otras = lista.filter((t) => !mias.includes(t));
  const tarjeta = (t: TareaProduccion) => (
    <TarjetaTarea
      key={t.id}
      t={t}
      tramo={tramoDe.get(t.id)}
      hecho={hecho.data?.get(t.id) ?? 0}
      personal={opciones}
      producto={t.producto_id ? (nombreProducto.get(t.producto_id) ?? null) : null}
      lote={t.orden_id ? (loteDe.get(t.orden_id) ?? null) : null}
    />
  );

  return (
    <Stack gap="lg">
      <Title order={1}>Mis tareas</Title>
      {mias.length === 0 ? (
        <Paper withBorder>
          <Vacio
            icono={IconCheck}
            titulo="No tenés tareas"
            descripcion="Cuando Naza te mande una, aparece acá."
          />
        </Paper>
      ) : (
        mias.map(tarjeta)
      )}
      {otras.length > 0 ? (
        <>
          <Title order={2}>En curso del equipo</Title>
          <Text c="dimmed">Si te sumás a una de estas, tocá «Sumarme».</Text>
          {otras.map(tarjeta)}
        </>
      ) : null}
    </Stack>
  );
}

import { Fragment, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconFlask,
  IconPackageImport,
  IconPencil,
  IconPlus,
  IconTrash,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { FormularioRecepcion } from './FormularioRecepcion';
import { ControlRapidoMP } from '@/features/calidad/ControlRapidoMP';
import {
  useAprobarEnvases,
  useCompletarContenedoresLimpiados,
} from '@/lib/consultasAnalisis';
import {
  useCargarRecepcionAStock,
  useDepositoPorDefecto,
  useDepositos,
  useEliminarRecepcion,
  useLotesDeRecepcion,
  useRecepciones,
} from '@/lib/consultas';
import { etiquetaUnidad, fechaHora, numero } from '@/lib/formato';
import { InsigniaEstado } from '@/components/InsigniaEstado';
import { useTieneRol } from '@/features/auth/sesion';
import {
  ETIQUETA_COMPROBANTE,
  numeroComprobante,
  useComprobantesProveedor,
} from '@/lib/consultasCompras';

/**
 * Recepciones (I.20.1).
 *
 * El listado es el índice del registro: número correlativo, remito, proveedor y
 * cuántos lotes entraron. Cada fila se despliega y muestra qué llegó, aun
 * cargada a stock. El circuito de cada lote sigue en la pantalla de lotes,
 * porque es ahí donde el material sigue su circuito.
 */
export function PaginaRecepciones() {
  const recepciones = useRecepciones();
  const cargar = useCargarRecepcionAStock();
  const eliminar = useEliminarRecepcion();
  // gmp.eliminar_recepcion (D-recepcion-3).
  const esDT = useTieneRol('DIRECCION_TECNICA');
  const puedeEliminar = useTieneRol(
    'RECEPCION',
    'GERENCIA_PRODUCCION',
    'DIRECCION_TECNICA',
  );
  /* Sin motivo, pero con una confirmación: lo eliminado no vuelve. */
  const confirmarEliminar = (r: Recepcion) =>
    modals.openConfirmModal({
      title: <Text fw={700}>¿Eliminar la recepción {r.numero}?</Text>,
      children: (
        <Text size="sm">
          Se va con sus {r.lotes.length} {r.lotes.length === 1 ? 'lote' : 'lotes'}. No se
          puede deshacer.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Volver' },
      confirmProps: { color: 'estadoRechazado' },
      onConfirm: () => eliminar.mutate(r.id),
    });
  const comprobantes = useComprobantesProveedor();
  /* Comprobantes vigentes por recepción (RN-65: registro aparte, vinculado). */
  const comprobantesDe = new Map<string, NonNullable<typeof comprobantes.data>>();
  for (const c of comprobantes.data ?? []) {
    if (!c.recepcion_id || c.anulado_en) continue;
    comprobantesDe.set(c.recepcion_id, [
      ...(comprobantesDe.get(c.recepcion_id) ?? []),
      c,
    ]);
  }
  const [abierto, modal] = useDisclosure(false);
  /* Editar antes de cargar a stock (D-recepcion-5): mismos roles que eliminar. */
  const [aEditar, setAEditar] = useState<Recepcion | null>(null);
  /* §3.3 no tiene fila para la entrada por compra. Toma el conjunto de
     «Ajustar stock por diferencia de inventario», que es el mismo que ya puede
     completar la carga administrativa de la recepción (decisión abierta D-14). */
  const puedeCargarStock = useTieneRol(
    'DIRECCION_TECNICA',
    'ADMINISTRACION',
    'GERENCIA_PRODUCCION',
    'RECEPCION',
  );
  const puedeRegistrar = useTieneRol(
    'OPERARIO',
    'CONTROL_CALIDAD',
    'DIRECCION_TECNICA',
    'GERENCIA_PRODUCCION',
    'RECEPCION',
  );
  /* gmp.control_rapido_materia_prima (D-recepcion-1). */
  const haceControlRapido = useTieneRol(
    'RECEPCION',
    'CONTROL_CALIDAD',
    'DIRECCION_TECNICA',
  );
  /* gmp.control_recepcion_envase (D-recepcion-2): quien recibe controla
     los envases antes de cargarlos, y entran a aprobados. */
  const aprobarEnvases = useAprobarEnvases();
  /* D-recepcion-4: si a un envase le quedó sin tildar «contenedores
     limpiados», se completa antes de darlo por controlado. */
  const completar = useCompletarContenedoresLimpiados();
  const [aCompletar, setACompletar] = useState<{
    recepcion: Recepcion;
    lotes: LoteDeRecepcion[];
  } | null>(null);
  const [tildados, setTildados] = useState<string[]>([]);
  const controlaEnvases = useTieneRol(
    'RECEPCION',
    'GERENCIA_PRODUCCION',
    'CONTROL_CALIDAD',
    'DIRECCION_TECNICA',
  );
  const [aControlar, setAControlar] = useState<LoteDeRecepcion[]>([]);
  /* Lo que el usuario puede controlar de una recepción: la materia prima
     (D-recepcion-1) y los envases (D-recepcion-2). */
  const aControlarDe = (r: Recepcion): LoteDeRecepcion[] => [
    ...(haceControlRapido ? pendientesMP(r) : []),
  ];

  const filas = recepciones.data ?? [];
  /* Recepciones desplegadas: muestran qué llegó, cargadas a stock o no. */
  const [desplegadas, setDesplegadas] = useState<Set<string>>(() => new Set());
  const alternar = (id: string) =>
    setDesplegadas((prev) => {
      const sig = new Set(prev);
      if (!sig.delete(id)) sig.add(id);
      return sig;
    });
  /* El id y no la fila: tras cada control la recepción se relee y el modal
     tiene que ver el estado nuevo de sus lotes. */
  const [aCargarId, setACargar] = useState<string | null>(null);
  const aCargar = filas.find((r) => r.id === aCargarId) ?? null;

  return (
    <>
      <EncabezadoPagina
        titulo="Recepciones"
        descripcion="Ingreso de mercadería según I.20.1. Cada recepción agrupa los lotes que llegaron con un remito."
        acciones={
          puedeRegistrar ? (
            <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
              Nueva recepción
            </Button>
          ) : null
        }
      />

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {recepciones.isLoading ? (
          <Skeleton h={260} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={IconTruckDelivery}
            titulo="Todavía no hay recepciones"
            descripcion="Registrá el primer ingreso de mercadería. Se numera solo y queda auditado con tu firma."
            accion={
              puedeRegistrar ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={modal.open}
                >
                  Nueva recepción
                </Button>
              ) : null
            }
          />
        ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N°</Table.Th>
                  <Table.Th>Fecha y hora</Table.Th>
                  <Table.Th>Proveedor</Table.Th>
                  <Table.Th>Remito</Table.Th>
                  <Table.Th>Comprobante</Table.Th>
                  <Table.Th>Lotes</Table.Th>
                  <Table.Th>Estado administrativo</Table.Th>
                  {puedeCargarStock || haceControlRapido || puedeEliminar ? (
                    <Table.Th />
                  ) : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((r) => {
                  const proveedor = r.proveedor as { razon_social: string } | null;
                  const lotes = r.lotes ?? [];
                  const desplegada = desplegadas.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <Table.Tr>
                        <Table.Td>
                          <Text ff="monospace" fw={600} size="sm">
                            {r.numero}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{fechaHora(r.fecha_hora)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            <Text size="sm">{proveedor?.razon_social ?? '—'}</Text>
                            {r.proveedor_nuevo ? (
                              <Badge size="xs" variant="light" color="indigo" radius="sm">
                                nuevo
                              </Badge>
                            ) : null}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            <Text size="sm">{r.numero_remito ?? 'Sin remito'}</Text>
                            {!r.coincide_con_pedido ? (
                              <Tooltip label="No coincide con lo pedido (I.20.1 paso 2)">
                                <IconAlertTriangle
                                  size={15}
                                  color="var(--mantine-color-estadoCuarentena-7)"
                                />
                              </Tooltip>
                            ) : null}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          {(comprobantesDe.get(r.id) ?? []).map((c) => (
                            <Group key={c.id} gap={6} wrap="nowrap">
                              <Badge
                                size="sm"
                                variant="light"
                                radius="sm"
                                color={
                                  c.tipo === 'SIN_FACTURA' ? 'estadoCuarentena' : 'azul'
                                }
                              >
                                {ETIQUETA_COMPROBANTE[c.tipo]}
                              </Badge>
                              {c.tipo === 'SIN_FACTURA' ? null : (
                                <Text size="xs" ff="monospace">
                                  {numeroComprobante(c)}
                                </Text>
                              )}
                            </Group>
                          ))}
                          {comprobantesDe.has(r.id) ? null : (
                            <Text size="xs" c="dimmed">
                              sin cargar
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="compact-md"
                            variant="subtle"
                            color="azul"
                            aria-expanded={desplegada}
                            aria-label={`Qué llegó en la recepción ${r.numero}`}
                            rightSection={
                              desplegada ? (
                                <IconChevronUp size={16} />
                              ) : (
                                <IconChevronDown size={16} />
                              )
                            }
                            onClick={() => alternar(r.id)}
                          >
                            {numero(lotes.length)}
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            radius="sm"
                            color={r.cargado_a_stock ? 'azul' : 'gray'}
                          >
                            {r.cargado_a_stock ? 'Cargada a stock' : 'Pendiente'}
                          </Badge>
                          {r.cargado_a_stock ? (
                            <Text size="xs" c="dimmed" mt={2}>
                              {fechaHora(r.cargado_en)}
                            </Text>
                          ) : null}
                        </Table.Td>
                        {puedeCargarStock || haceControlRapido || puedeEliminar ? (
                          <Table.Td>
                            {puedeEliminar && !r.cargado_a_stock ? (
                              <Tooltip label="Editar recepción">
                                <ActionIcon
                                  size="lg"
                                  variant="subtle"
                                  color="azul"
                                  aria-label={`Editar la recepción ${r.numero}`}
                                  onClick={() => setAEditar(r)}
                                  style={{ float: 'right' }}
                                >
                                  <IconPencil size={18} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            {puedeEliminar && eliminable(r, esDT) ? (
                              <Tooltip label="Eliminar recepción">
                                <ActionIcon
                                  size="lg"
                                  variant="subtle"
                                  color="estadoRechazado"
                                  aria-label={`Eliminar la recepción ${r.numero}`}
                                  loading={
                                    eliminar.isPending && eliminar.variables === r.id
                                  }
                                  onClick={() => confirmarEliminar(r)}
                                  style={{ float: 'right' }}
                                >
                                  <IconTrash size={18} />
                                </ActionIcon>
                              </Tooltip>
                            ) : null}
                            {puedeCargarStock && !r.cargado_a_stock ? (
                              <Button
                                size="compact-sm"
                                variant="light"
                                color="azul"
                                leftSection={<IconPackageImport size={15} />}
                                loading={
                                  cargar.isPending &&
                                  cargar.variables.recepcionId === r.id
                                }
                                onClick={() => setACargar(r.id)}
                              >
                                Cargar a stock
                              </Button>
                            ) : null}
                            {aControlarDe(r).length > 0 ? (
                              <Button
                                size="compact-sm"
                                variant="light"
                                color="estadoEnAnalisis"
                                leftSection={<IconFlask size={15} />}
                                mt={4}
                                onClick={() => setAControlar(aControlarDe(r))}
                              >
                                Control de calidad ({aControlarDe(r).length})
                              </Button>
                            ) : null}
                            {/* Envases que quedaron en cuarentena: lo constatado al
                              recibirlos es el control, sin preguntas. */}
                            {controlaEnvases && envasesPendientes(r).length > 0 ? (
                              <Button
                                size="compact-sm"
                                variant="light"
                                color="estadoAprobado"
                                leftSection={<IconCheck size={15} />}
                                mt={4}
                                loading={aprobarEnvases.isPending}
                                onClick={() => {
                                  const faltan = sinContenedorLimpio(
                                    envasesPendientes(r),
                                  );
                                  if (faltan.length > 0) {
                                    setTildados([]);
                                    setACompletar({ recepcion: r, lotes: faltan });
                                  } else {
                                    aprobarEnvases.mutate(
                                      envasesPendientes(r).map((l) => l.id),
                                    );
                                  }
                                }}
                              >
                                Dar envases por controlados ({envasesPendientes(r).length}
                                )
                              </Button>
                            ) : null}
                          </Table.Td>
                        ) : null}
                      </Table.Tr>
                      {desplegada ? (
                        <Table.Tr>
                          <Table.Td
                            colSpan={
                              puedeCargarStock || haceControlRapido || puedeEliminar
                                ? 8
                                : 7
                            }
                            bg="var(--mantine-color-default-hover)"
                          >
                            <LotesQueLlegaron lotes={lotes} />
                          </Table.Td>
                        </Table.Tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal
        opened={abierto}
        onClose={modal.close}
        title={<Text fw={700}>Nueva recepción</Text>}
        size="xl"
      >
        <FormularioRecepcion onListo={modal.close} />
      </Modal>

      <Modal
        opened={aEditar !== null}
        onClose={() => setAEditar(null)}
        title={<Text fw={700}>Editar la recepción {aEditar?.numero}</Text>}
        size="xl"
      >
        {aEditar ? (
          <EditarRecepcion recepcion={aEditar} onListo={() => setAEditar(null)} />
        ) : null}
      </Modal>

      <Modal
        opened={aCompletar !== null}
        onClose={() => setACompletar(null)}
        title={
          <Text fw={700}>
            Falta marcar algo en la recepción {aCompletar?.recepcion.numero}
          </Text>
        }
        centered
      >
        {aCompletar ? (
          <Stack gap="md">
            <Text size="sm">
              I.20.1 pide los contenedores limpios antes de pasar a cuarentena, y estos
              lotes quedaron sin la casilla. Tildala si se limpiaron: queda registrado a
              tu nombre, con la hora.
            </Text>
            {aCompletar.lotes.map((l) => (
              <Switch
                key={l.id}
                size="md"
                label={`${l.insumo?.nombre ?? 'Lote'} · ${l.numero_registro_interno}: contenedores limpiados`}
                checked={tildados.includes(l.id)}
                onChange={(e) => {
                  const si = e.currentTarget.checked;
                  setTildados((t) => (si ? [...t, l.id] : t.filter((x) => x !== l.id)));
                }}
              />
            ))}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setACompletar(null)}>
                Cancelar
              </Button>
              <Button
                color="estadoAprobado"
                disabled={tildados.length !== aCompletar.lotes.length}
                loading={completar.isPending || aprobarEnvases.isPending}
                onClick={() => {
                  const r = aCompletar.recepcion;
                  void completar.mutateAsync(tildados).then(() => {
                    setACompletar(null);
                    aprobarEnvases.mutate(envasesPendientes(r).map((l) => l.id));
                  });
                }}
              >
                Guardar y dar por controlados
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={aCargar !== null}
        onClose={() => setACargar(null)}
        title={<Text fw={700}>Cargar a stock la recepción {aCargar?.numero}</Text>}
        size="lg"
      >
        {aCargar ? (
          <CargarAStock
            recepcion={aCargar}
            controlaEnvases={controlaEnvases}
            enCurso={cargar.isPending || aprobarEnvases.isPending}
            onCancelar={() => setACargar(null)}
            onConfirmar={(depositos, envasesOk, estibas, envasesA) => {
              const recepcion = aCargar;
              void aprobarEnvases
                .mutateAsync(envasesOk)
                .then(() =>
                  cargar.mutate(
                    { recepcionId: recepcion.id, depositos, estibas, envasesA },
                    // Lo pidió la planta: al cargar a stock salta el control de
                    // la materia prima, de a un lote (D-recepcion-1).
                    {
                      onSuccess: () => {
                        if (haceControlRapido) setAControlar(pendientesMP(recepcion));
                      },
                    },
                  ),
                )
                .catch(() => {
                  /* El error ya lo muestra el onError de la mutación. */
                });
              setACargar(null);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={aControlar.length > 0}
        onClose={() => setAControlar([])}
        title={
          <Text fw={700}>
            Control de recepción
            {aControlar.length > 1 ? ` · quedan ${aControlar.length}` : ''}
          </Text>
        }
        size="lg"
      >
        {aControlar[0] ? (
          <ControlRapidoMP
            key={aControlar[0].id}
            lote={{
              id: aControlar[0].id,
              numero: aControlar[0].numero_registro_interno,
              nombre: aControlar[0].insumo?.nombre ?? '',
              requiereProtocolo: aControlar[0].insumo?.requiere_protocolo ?? false,
              bultos: aControlar[0].cantidad_bultos,
            }}
            onListo={() => setAControlar((l) => l.slice(1))}
          />
        ) : null}
      </Modal>
    </>
  );
}

type Recepcion = NonNullable<ReturnType<typeof useRecepciones>['data']>[number];
type LoteDeRecepcion = Recepcion['lotes'][number];

/** Qué llegó en una recepción: un renglón por lote. */
function LotesQueLlegaron({ lotes }: { lotes: LoteDeRecepcion[] }) {
  if (lotes.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        La recepción no tiene lotes.
      </Text>
    );
  }
  return (
    <Table verticalSpacing={6} withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Lote interno</Table.Th>
          <Table.Th>Insumo</Table.Th>
          <Table.Th>Lote del proveedor</Table.Th>
          <Table.Th ta="right">Cantidad</Table.Th>
          <Table.Th ta="right">Bultos</Table.Th>
          <Table.Th>Estado</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {lotes.map((l) => (
          <Table.Tr key={l.id}>
            <Table.Td>
              <Text size="sm" ff="monospace">
                {l.numero_registro_interno}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">
                {l.insumo?.codigo_interno ? (
                  <Text span ff="monospace" size="sm" c="dimmed" mr={6}>
                    {l.insumo.codigo_interno}
                  </Text>
                ) : null}
                {l.insumo?.nombre ?? '—'}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{l.lote_proveedor || '—'}</Text>
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm">
                {numero(l.cantidad_unidades, 2)}{' '}
                {l.unidad ? etiquetaUnidad(l.unidad) : ''}
              </Text>
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm">{numero(l.cantidad_bultos)}</Text>
            </Table.Td>
            <Table.Td>
              <InsigniaEstado estado={l.estado} size="sm" />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Los que todavía no pueden pasar a cuarentena: I.20.1 pide contenedores limpios. */
const sinContenedorLimpio = (lotes: LoteDeRecepcion[]) =>
  lotes.filter((l) => l.estado === 'RECIBIDO' && !l.contenedores_limpiados);

/** Envases, empaques y etiquetas de la recepción sin veredicto (D-recepcion-2). */
const envasesPendientes = (r: Recepcion): LoteDeRecepcion[] =>
  r.lotes.filter(
    (l) =>
      (l.insumo?.tipo === 'MATERIAL_ENVASE' ||
        l.insumo?.tipo === 'MATERIAL_EMPAQUE' ||
        l.insumo?.tipo === 'ETIQUETA') &&
      (l.estado === 'RECIBIDO' || l.estado === 'CUARENTENA'),
  );

/**
 * El formulario de la recepción con lo guardado (D-recepcion-5). Espera los
 * lotes completos: el formulario se inicializa una sola vez.
 */
function EditarRecepcion({
  recepcion,
  onListo,
}: {
  recepcion: Recepcion;
  onListo: () => void;
}) {
  const lotes = useLotesDeRecepcion(recepcion.id);
  if (!lotes.data) return <Skeleton h={320} />;
  return (
    <FormularioRecepcion
      onListo={onListo}
      editar={{ recepcion: recepcion, lotes: lotes.data }}
    />
  );
}

/** Lo que admite gmp.eliminar_recepcion: sin cargar a stock y todo en cuarentena;
    DT también con lotes dictaminados (D-estado-orden-envasado-2). */
const eliminable = (r: Recepcion, esDT: boolean) =>
  !r.cargado_a_stock &&
  (esDT || r.lotes.every((l) => l.estado === 'RECIBIDO' || l.estado === 'CUARENTENA'));

/** Estiba del depósito: una letra y un número (D-rotulos-y-estiba-1). */
const ESTIBA = /^[A-Z]-\d+$/;

/** Materia prima de la recepción que todavía no tiene veredicto. */
const pendientesMP = (r: Recepcion): LoteDeRecepcion[] =>
  r.lotes.filter(
    (l) =>
      l.insumo?.tipo === 'MATERIA_PRIMA' &&
      (l.estado === 'RECIBIDO' || l.estado === 'CUARENTENA'),
  );

/**
 * La carga a stock es un acto administrativo deliberado y posterior a la
 * recepción física, no un efecto automático de ella: Depósito recibe y
 * Administración concilia. Se confirma porque no tiene vuelta atrás por la
 * vía fácil —deshacerla exige anular movimiento por movimiento (RN-54)—.
 *
 * Un lote sin depósito (recibido antes de 20261020130000, o de un insumo sin
 * cuarentena en la ficha) se resuelve acá mismo: se propone el de su tipo y
 * se puede cambiar.
 */
export function CargarAStock({
  recepcion,
  controlaEnvases,
  enCurso,
  onCancelar,
  onConfirmar,
}: {
  recepcion: Recepcion;
  controlaEnvases: boolean;
  enCurso: boolean;
  onCancelar: () => void;
  /**
   * Depósitos elegidos, los envases que entran aprobados, las estibas
   * escritas y a qué depósito de envases (1 o 2) va cada envase aprobado.
   */
  onConfirmar: (
    depositos: Record<string, string>,
    envasesOk: string[],
    estibas: Record<string, string>,
    envasesA: Record<string, string>,
  ) => void;
}) {
  const lotes = recepcion.lotes;
  const envases = controlaEnvases ? envasesPendientes(recepcion) : [];
  /* Lo revisó quien recibió (bultos, unidades contadas, si coincide con lo
     pedido): no se vuelve a preguntar. Se puede apagar y entran a cuarentena. */
  const [envasesBien, setEnvasesBien] = useState(true);
  const aprobados = new Set(envasesBien ? envases.map((l) => l.id) : []);
  // Los que se aprueban toman el depósito de aprobados: no se les elige uno.
  const sinDeposito = lotes.filter((l) => !l.deposito_actual_id && !aprobados.has(l.id));
  const depositos = useDepositos();
  const sugeridos = useDepositoPorDefecto([
    ...new Set(sinDeposito.map((l) => l.insumo_id)),
  ]);
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const elegido = (l: (typeof lotes)[number]) =>
    elegidos[l.id] ?? sugeridos.data?.get(l.insumo_id) ?? null;
  const faltan = sinDeposito.some((l) => !elegido(l));
  /* Envase que entra aprobado: depósito de envases 1 o 2; el 1 por defecto
     (D-envases-1-y-2-1). Solo envases: empaques y etiquetas, como siempre. */
  const depEnvases = (depositos.data ?? []).filter(
    (d) =>
      d.activo &&
      d.tipo_contenido === 'ENVASE_EMPAQUE' &&
      d.estado_admitido === 'APROBADO',
  );
  const deposito1 = depEnvases.find((d) => d.numero === 'ENV-APR')?.id ?? null;
  const esEnvase = (l: (typeof lotes)[number]) => l.insumo?.tipo === 'MATERIAL_ENVASE';
  const envasesAprobados = lotes.filter((l) => esEnvase(l) && aprobados.has(l.id));
  const [depEnvase, setDepEnvase] = useState<Record<string, string>>({});
  const depDe = (l: (typeof lotes)[number]) => depEnvase[l.id] ?? deposito1;
  /* Optativa; no va en el rótulo (pedido del 2026-10-26). De los envases,
     no en el depósito 2: es el único sin estibas. Un envase ya aprobado al
     recibirlo (D-recepcion-2 ter) no está entre los pendientes y también la
     lleva (2026-11-03: en la tablet había desaparecido). */
  const enDeposito2 = (id: string | null) =>
    id !== null && id !== deposito1 && depEnvases.some((d) => d.id === id);
  const llevaEstiba = (l: (typeof lotes)[number]) =>
    !esEnvase(l) ||
    (aprobados.has(l.id) ? depDe(l) === deposito1 : !enDeposito2(l.deposito_actual_id));
  const [estibas, setEstibas] = useState<Record<string, string>>({});
  const escritas = Object.fromEntries(
    Object.entries(estibas).filter(
      ([id, v]) => v !== '' && lotes.some((l) => l.id === id && llevaEstiba(l)),
    ),
  );
  const estibaMala = Object.values(escritas).some((v) => !ESTIBA.test(v));

  const opciones = (depositos.data ?? [])
    // Los mismos que acepta gmp.asignar_deposito_lote: cuarentena o inflamables.
    .filter(
      (d) =>
        d.activo &&
        (d.estado_admitido === 'CUARENTENA' || d.tipo_contenido === 'INFLAMABLES'),
    )
    .map((d) => ({ value: d.id, label: `${d.numero} — ${d.nombre}` }));

  return (
    <Stack gap="md">
      <Text size="sm">
        Se registra una entrada por cada uno de los {numero(lotes.length)}{' '}
        {lotes.length === 1 ? 'lote' : 'lotes'} de la recepción, en el depósito de cada
        uno. Queda a tu nombre y no se deshace: un movimiento de stock no se borra, se
        anula con su inverso.
      </Text>
      {envases.length > 0 ? (
        <Paper
          withBorder
          p="md"
          radius="md"
          style={{ borderColor: 'var(--superficie-borde)' }}
        >
          <Switch
            size="lg"
            checked={envasesBien}
            onChange={(e) => setEnvasesBien(e.currentTarget.checked)}
            label={
              envases.length === 1
                ? 'El envase llegó bien: entra aprobado'
                : `Los ${envases.length} envases llegaron bien: entran aprobados`
            }
            description={
              envasesBien
                ? `Van a aprobados a tu nombre: ${envases
                    .map((l) => l.insumo?.nombre ?? l.numero_registro_interno)
                    .join(', ')}.`
                : 'Entran a cuarentena y se controlan después con «Control de calidad».'
            }
          />
        </Paper>
      ) : null}
      {sinDeposito.length > 0 ? (
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            {sinDeposito.length === 1
              ? 'Este lote no tiene depósito. Te propongo el de su tipo:'
              : 'Estos lotes no tienen depósito. Te propongo el de su tipo:'}
          </Text>
          {sinDeposito.map((l) => (
            <Select
              key={l.id}
              label={`${l.numero_registro_interno} · ${l.insumo?.nombre ?? ''}`}
              data={opciones}
              value={elegido(l)}
              onChange={(v) => v && setElegidos((e) => ({ ...e, [l.id]: v }))}
              allowDeselect={false}
              searchable
              disabled={sugeridos.isLoading}
            />
          ))}
        </Stack>
      ) : null}
      {envasesAprobados.length > 0 ? (
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            ¿En qué depósito de envases va?
          </Text>
          {envasesAprobados.map((l) => (
            <Select
              key={l.id}
              label={`${l.numero_registro_interno} · ${l.insumo?.nombre ?? ''}`}
              data={depEnvases.map((d) => ({ value: d.id, label: d.nombre }))}
              value={depDe(l)}
              onChange={(v) => v && setDepEnvase((e) => ({ ...e, [l.id]: v }))}
              allowDeselect={false}
              maw={360}
            />
          ))}
        </Stack>
      ) : null}
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Estiba (optativa): una letra y un número, por ejemplo B-12.
        </Text>
        {lotes.filter(llevaEstiba).map((l) => {
          const v = estibas[l.id] ?? '';
          return (
            <TextInput
              key={l.id}
              label={`${l.numero_registro_interno} · ${l.insumo?.nombre ?? ''}`}
              placeholder="A-1"
              value={v}
              onChange={(e) => {
                // Leído antes: en el updater, currentTarget ya es null.
                const escrita = e.currentTarget.value.toUpperCase().replace(/\s/g, '');
                setEstibas((x) => ({ ...x, [l.id]: escrita }));
              }}
              error={
                v !== '' && !ESTIBA.test(v) ? 'Tiene que ser letra-número: B-12' : null
              }
              maw={360}
            />
          );
        })}
      </Stack>
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          color="azul"
          loading={enCurso || sugeridos.isLoading}
          disabled={faltan || estibaMala || envasesAprobados.some((l) => !depDe(l))}
          onClick={() =>
            onConfirmar(
              Object.fromEntries(sinDeposito.map((l) => [l.id, elegido(l)!])),
              [...aprobados],
              escritas,
              Object.fromEntries(envasesAprobados.map((l) => [l.id, depDe(l)!])),
            )
          }
        >
          Cargar a stock
        </Button>
      </Group>
    </Stack>
  );
}

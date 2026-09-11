import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Paper,
  Skeleton,
  Modal,
  Stack,
  Table,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDisclosure } from '@mantine/hooks';
import { Link, useParams } from 'react-router-dom';
import {
  IconArrowLeft,
  IconCircleCheck,
  IconCircleX,
  IconFlask,
  IconPrinter,
  IconTag,
  IconTestPipe,
} from '@tabler/icons-react';
import { InsigniaEstado, TEXTO_ESTADO } from '@/components/InsigniaEstado';
import { RotuloLote } from '@/features/rotulos/RotuloLote';
import { EtiquetaMuestreo } from '@/features/rotulos/EtiquetaMuestreo';
import { FormularioMuestreo } from '@/features/muestreo/FormularioMuestreo';
import { PanelBloqueos } from '@/features/stock/PanelBloqueos';
import { PanelStockLote } from '@/features/stock/PanelStockLote';
import {
  useEmitirRotulo,
  useLote,
  useMuestreosDeLote,
  useRotulosDeLote,
  type EstadoCalidad,
} from '@/lib/consultas';
import { fecha, fechaHora, numero } from '@/lib/formato';
import { useSesion, type Rol } from '@/features/auth/sesion';

/**
 * Transiciones ofrecidas en pantalla.
 *
 * Espeja la máquina de estado de §5.1 y la matriz de §3.3. La base valida las
 * dos cosas por su cuenta —la transición en `trg_transicion_lote_insumo`, el
 * rol en la política y en el trigger—; esto solo evita ofrecer un botón que va
 * a terminar en error.
 */
const TRANSICIONES: Record<
  EstadoCalidad,
  { destino: EstadoCalidad; etiqueta: string; roles: Rol[]; nota: string }[]
> = {
  RECIBIDO: [
    {
      destino: 'CUARENTENA',
      etiqueta: 'Poner en cuarentena',
      roles: ['OPERARIO', 'CONTROL_CALIDAD', 'DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'],
      nota: 'Emite el rótulo amarillo R.20.2.1 y manda el material al depósito de cuarentena.',
    },
  ],
  /*
   * CUARENTENA → MUESTREADO no está acá a propósito. Esa transición no es un
   * cambio de rótulo: exige registrar el muestreo de I.50.4 con sus cinco
   * verificaciones previas y emitir la etiqueta R.50.4.1 (RN-07). Tiene su
   * propio formulario, y la base rechaza el avance si el muestreo no existe.
   */
  CUARENTENA: [],
  MUESTREADO: [
    {
      destino: 'EN_ANALISIS',
      etiqueta: 'Enviar a análisis',
      roles: ['CONTROL_CALIDAD', 'DIRECCION_TECNICA'],
      nota: 'Emite el rótulo gris de «en análisis» (I.20.2).',
    },
  ],
  EN_ANALISIS: [
    {
      destino: 'APROBADO',
      etiqueta: 'Aprobar',
      roles: ['CONTROL_CALIDAD', 'DIRECCION_TECNICA'],
      nota: 'Rótulo verde y traslado al depósito de aprobados. Es un estado terminal.',
    },
    {
      destino: 'RECHAZADO',
      etiqueta: 'Rechazar',
      roles: ['CONTROL_CALIDAD', 'DIRECCION_TECNICA'],
      nota: 'Rótulo rojo. Es un estado terminal y abre no conformidad según PG.60.18.',
    },
  ],
  APROBADO: [],
  RECHAZADO: [],
};

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={500}>
        {etiqueta}
      </Text>
      <Text size="sm" fw={600}>
        {children}
      </Text>
    </Box>
  );
}

export function PaginaLote() {
  const { id } = useParams();
  const lote = useLote(id);
  const rotulos = useRotulosDeLote(id);
  const muestreos = useMuestreosDeLote(id);
  const emitir = useEmitirRotulo();
  const { claims } = useSesion();
  const [muestreoAbierto, modalMuestreo] = useDisclosure(false);

  if (lote.isLoading) {
    return <Skeleton h={420} radius="lg" />;
  }

  const l = lote.data;

  if (lote.isError || !l?.id) {
    return (
      <Alert color="red" variant="light" radius="md">
        No se encontró el lote, o tu rol no tiene permiso para verlo.
      </Alert>
    );
  }

  const loteId = l.id;
  const estado = l.estado as EstadoCalidad;
  const rotuloVigente = (rotulos.data ?? []).find((r) => r.vigente) ?? null;
  const roles = claims?.roles ?? [];
  const opciones = TRANSICIONES[estado].filter((t) =>
    t.roles.some((r) => roles.includes(r)),
  );
  const listaMuestreos = muestreos.data ?? [];
  const puedeMuestrear =
    estado === 'CUARENTENA' &&
    (roles.includes('CONTROL_CALIDAD') || roles.includes('DIRECCION_TECNICA'));

  const confirmarTransicion = (
    destino: EstadoCalidad,
    etiqueta: string,
    nota: string,
  ) => {
    modals.openConfirmModal({
      title: <Text fw={700}>{etiqueta}</Text>,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            El lote pasa de <b>{TEXTO_ESTADO[estado].toLowerCase()}</b> a{' '}
            <b>{TEXTO_ESTADO[destino].toLowerCase()}</b>, se emite el rótulo nuevo y el
            anterior queda no vigente.
          </Text>
          <Text size="sm" c="dimmed">
            {nota}
          </Text>
          <Alert color="violeta" variant="light" radius="md">
            Queda registrado a tu nombre y no se puede deshacer. La corrección de un
            estado se hace con no conformidad, no revirtiendo.
          </Alert>
        </Stack>
      ),
      labels: { confirm: etiqueta, cancel: 'Cancelar' },
      confirmProps: { color: destino === 'RECHAZADO' ? 'estadoRechazado' : 'violeta' },
      onConfirm: () => emitir.mutate({ loteId, estado: destino }),
    });
  };

  return (
    <>
      <Anchor component={Link} to="/lotes" size="sm" mb="sm" className="no-imprimir">
        <Group gap={4}>
          <IconArrowLeft size={15} />
          Volver a lotes
        </Group>
      </Anchor>

      <Group
        justify="space-between"
        align="flex-start"
        wrap="wrap"
        gap="md"
        mb="lg"
        className="no-imprimir"
      >
        <Stack gap={4}>
          <Group gap="sm">
            <Title order={1}>{l.insumo_nombre}</Title>
            <InsigniaEstado estado={estado} size="lg" />
          </Group>
          <Text c="dimmed" size="sm">
            {l.numero_registro_interno} · lote {l.lote_proveedor} · {l.proveedor}
          </Text>
        </Stack>

        <Group gap="sm">
          {puedeMuestrear ? (
            <Button
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              leftSection={<IconTestPipe size={18} />}
              onClick={modalMuestreo.open}
            >
              Registrar muestreo
            </Button>
          ) : null}
          {rotuloVigente ? (
            <Button
              variant="light"
              leftSection={<IconPrinter size={18} />}
              onClick={() => window.print()}
            >
              Imprimir rótulo
            </Button>
          ) : null}
          {opciones.map((t) => (
            <Button
              key={t.destino}
              {...(t.destino === 'RECHAZADO'
                ? { variant: 'outline' as const, color: 'estadoRechazado' }
                : {
                    variant: 'gradient' as const,
                    gradient: { from: 'violeta.7', to: 'rosa.6', deg: 135 },
                  })}
              leftSection={
                t.destino === 'RECHAZADO' ? (
                  <IconCircleX size={18} />
                ) : t.destino === 'APROBADO' ? (
                  <IconCircleCheck size={18} />
                ) : (
                  <IconTag size={18} />
                )
              }
              loading={emitir.isPending}
              onClick={() => confirmarTransicion(t.destino, t.etiqueta, t.nota)}
            >
              {t.etiqueta}
            </Button>
          ))}
        </Group>
      </Group>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="md">
            <Paper
              withBorder
              p="lg"
              style={{ borderColor: 'var(--superficie-borde)' }}
              className="no-imprimir"
            >
              <Title order={3} mb="md">
                Datos del lote
              </Title>
              <Grid gutter="lg">
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Dato etiqueta="Código de insumo">{l.codigo_interno}</Dato>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Dato etiqueta="Tipo">
                    {l.insumo_tipo?.replace(/_/g, ' ').toLowerCase()}
                  </Dato>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Dato etiqueta="Plazo de validez">
                    {l.plazo_validez ? fecha(l.plazo_validez) : 'No indicado'}
                  </Dato>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Dato etiqueta="Bultos">{numero(l.cantidad_bultos)}</Dato>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Dato etiqueta="Cantidad">
                    {numero(l.cantidad_unidades, 3)} {l.unidad}
                  </Dato>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  {/* El destino que le asignó el circuito de calidad al cambiar de
                      estado. No es necesariamente dónde está la mercadería: un lote
                      puede quedar repartido entre depósitos, y eso lo contesta el
                      panel de existencia. */}
                  <Dato etiqueta="Depósito del circuito">
                    {l.deposito_nombre ?? 'Sin asignar'}
                  </Dato>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Dato etiqueta="Recepción">
                    <Anchor component={Link} to="/recepciones" size="sm">
                      {l.recepcion_numero}
                    </Anchor>
                  </Dato>
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Dato etiqueta="Recibido el">{fechaHora(l.recepcion_fecha)}</Dato>
                </Grid.Col>
                {l.total_etiquetas !== null ? (
                  <Grid.Col span={{ base: 6, sm: 4 }}>
                    <Dato etiqueta="Total de etiquetas (RN-44)">
                      {numero(l.total_etiquetas)}
                    </Dato>
                  </Grid.Col>
                ) : null}
              </Grid>

              <Group gap="sm" mt="lg">
                {l.requiere_protocolo ? (
                  <Badge
                    variant="light"
                    radius="sm"
                    color={l.protocolo_recibido ? 'estadoAprobado' : 'estadoRechazado'}
                    leftSection={<IconFlask size={13} />}
                  >
                    {l.protocolo_recibido ? 'Protocolo recibido' : 'Sin protocolo'}
                  </Badge>
                ) : null}
                <Badge
                  variant="light"
                  radius="sm"
                  color={l.contenedores_limpiados ? 'estadoAprobado' : 'gray'}
                >
                  {l.contenedores_limpiados
                    ? 'Contenedores limpiados'
                    : 'Contenedores sin limpiar'}
                </Badge>
                {l.es_inflamable ? (
                  <Badge variant="light" radius="sm" color="estadoRechazado">
                    Inflamable · I.20.6
                  </Badge>
                ) : null}
              </Group>
            </Paper>

            <PanelBloqueos loteId={loteId} />

            <PanelStockLote loteId={loteId} />

            {listaMuestreos.length > 0 ? (
              <Paper
                withBorder
                p="lg"
                style={{ borderColor: 'var(--superficie-borde)' }}
                className="no-imprimir"
              >
                <Title order={3} mb="md">
                  Muestreos
                </Title>
                <Table.ScrollContainer minWidth={560}>
                  <Table verticalSpacing="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>N°</Table.Th>
                        <Table.Th>Fecha</Table.Th>
                        <Table.Th>Tomado</Table.Th>
                        <Table.Th>Sobrante</Table.Th>
                        <Table.Th>Responsable</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {listaMuestreos.map((m) => (
                        <Table.Tr key={m.id}>
                          <Table.Td>
                            <Text size="sm" ff="monospace" fw={600}>
                              {m.numero}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{fechaHora(m.fecha_hora)}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              {numero(m.cantidad_tomada, 3)} {m.unidad}
                            </Text>
                            {m.justificacion_cantidad ? (
                              <Text size="xs" c="dimmed">
                                desvío justificado
                              </Text>
                            ) : null}
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              {(m.destino_sobrante ?? '')
                                .replace(/_/g, ' ')
                                .toLowerCase()}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{m.realizado_por_nombre}</Text>
                            <Text size="xs" c="dimmed">
                              {m.area_muestreo}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>

                {listaMuestreos.some((m) => m.signos_no_conformidad) ? (
                  <Alert color="estadoCuarentena" variant="light" radius="md" mt="md">
                    Se registraron signos de no conformidad durante el muestreo.
                    Corresponde evaluarlos según PG.60.18.
                    {listaMuestreos
                      .filter((m) => m.signos_no_conformidad)
                      .map((m) => (
                        <Text size="sm" mt={6} key={m.id}>
                          <b>{m.numero}:</b> {m.signos_no_conformidad}
                        </Text>
                      ))}
                  </Alert>
                ) : null}
              </Paper>
            ) : null}

            <Paper
              withBorder
              p="lg"
              style={{ borderColor: 'var(--superficie-borde)' }}
              className="no-imprimir"
            >
              <Title order={3} mb="md">
                Historial de rótulos
              </Title>
              {rotulos.isLoading ? (
                <Skeleton h={120} />
              ) : (rotulos.data ?? []).length === 0 ? (
                <Text size="sm" c="dimmed">
                  Todavía no se emitió ningún rótulo para este lote.
                </Text>
              ) : (
                <Timeline active={0} bulletSize={20} lineWidth={2} color="violeta">
                  {(rotulos.data ?? []).map((r) => (
                    <Timeline.Item
                      key={r.id}
                      bullet={<IconTag size={12} />}
                      title={
                        <Group gap="xs">
                          <InsigniaEstado estado={r.estado} size="sm" />
                          {r.vigente ? (
                            <Badge size="xs" variant="filled" color="violeta" radius="sm">
                              vigente
                            </Badge>
                          ) : null}
                        </Group>
                      }
                    >
                      <Text size="xs" c="dimmed">
                        {r.tipo_registro} v{r.version_formato} · {fechaHora(r.emitido_en)}
                      </Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              )}
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="md">
            <Text fw={600} size="sm" c="dimmed" className="no-imprimir">
              Rótulo vigente
            </Text>
            {rotuloVigente ? (
              <RotuloLote lote={l} rotulo={rotuloVigente} />
            ) : (
              <Alert color="violeta" variant="light" radius="md" className="no-imprimir">
                Este lote todavía no tiene rótulo. Mientras no lo tenga, el material no
                puede ingresar a cuarentena: I.20.2 exige rotular el estado.
              </Alert>
            )}

            {listaMuestreos.length > 0 ? (
              <>
                <Text fw={600} size="sm" c="dimmed" mt="sm" className="no-imprimir">
                  Etiqueta de la muestra
                </Text>
                <EtiquetaMuestreo muestreo={listaMuestreos[0]!} />
              </>
            ) : null}
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal
        opened={muestreoAbierto}
        onClose={modalMuestreo.close}
        title={<Text fw={700}>Registrar muestreo · I.50.4</Text>}
        size="lg"
      >
        <FormularioMuestreo lote={l} onListo={modalMuestreo.close} />
      </Modal>
    </>
  );
}

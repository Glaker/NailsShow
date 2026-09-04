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
  Stack,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { Link, useParams } from 'react-router-dom';
import {
  IconArrowLeft,
  IconCircleCheck,
  IconCircleX,
  IconFlask,
  IconPrinter,
  IconTag,
} from '@tabler/icons-react';
import { InsigniaEstado, TEXTO_ESTADO } from '@/components/InsigniaEstado';
import { RotuloLote } from '@/features/rotulos/RotuloLote';
import {
  useEmitirRotulo,
  useLote,
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
  CUARENTENA: [
    {
      destino: 'MUESTREADO',
      etiqueta: 'Registrar muestreo',
      roles: ['CONTROL_CALIDAD', 'DIRECCION_TECNICA'],
      nota: 'El muestreo completo de I.50.4, con sus cinco verificaciones previas, se implementa en la fase siguiente.',
    },
  ],
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
  const emitir = useEmitirRotulo();
  const { claims } = useSesion();

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
                  <Dato etiqueta="Depósito actual">
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
          </Stack>
        </Grid.Col>
      </Grid>
    </>
  );
}

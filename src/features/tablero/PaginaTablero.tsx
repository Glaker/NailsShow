import {
  Anchor,
  Badge,
  Box,
  Grid,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { Link, Navigate } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconChecks,
  IconFlask,
  IconHourglassHigh,
  IconPackages,
  IconTruckDelivery,
  IconUsers,
  IconClipboardOff,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { InsigniaEstado, TEXTO_ESTADO } from '@/components/InsigniaEstado';
import { GraficoArea } from '@/components/GraficoArea';
import { Vacio } from '@/components/Vacio';
import {
  useLotes,
  useLotesPorEstado,
  useRecepcionesPorDia,
  useTablero,
  type EstadoCalidad,
} from '@/lib/consultas';
import { COLORES_ESTADO_ROTULO } from '@/app/theme';
import { diasHasta, fecha, numero } from '@/lib/formato';
import { FINANZAS, useSesion } from '@/features/auth/sesion';
import { PaginaResultado } from '@/features/costos/PaginaResultado';
import { InicioPedidos } from '@/features/produccion/Planificacion';
import { PaginaAdministracion } from '@/features/administracion/PaginaAdministracion';
import { PaginaArmado } from '@/features/ventas/PaginaArmado';
import { TableroDT } from './TableroDT';
import { TareasProduccion } from '@/features/produccion/TareasProduccion';
import { PanelEtiquetado } from '@/features/produccion/PanelEtiquetado';
import { TareasCarga } from '@/features/produccion/TareasCarga';
import { TarjetaLotear } from '@/features/produccion/Loteo';
import { MisTareas } from '@/features/tareas/MisTareas';
import { GraficoProductividad } from '@/features/informes/GraficoProductividad';

function TarjetaPanel({
  titulo,
  extra,
  children,
}: {
  titulo: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper withBorder p="lg" h="100%" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Title order={3}>{titulo}</Title>
        {extra}
      </Group>
      {children}
    </Paper>
  );
}

/**
 * Tablero según el rol principal (pedido del 2026-10-01): cada uno ve al
 * entrar lo que le toca y nada más. Gerencia, el administrador del sistema,
 * calidad y planta siguen con el tablero general del circuito de insumos.
 */
export function PaginaTablero() {
  const { claims } = useSesion();
  // Finanzas entra al resultado de gestión (gráfico principal de la Fase 3).
  if (claims?.rol === FINANZAS)
    return (
      <Stack gap="xl">
        <PaginaResultado />
        <GraficoProductividad />
      </Stack>
    );
  switch (claims?.rol) {
    case 'ADMINISTRACION':
      return <PaginaAdministracion />;
    case 'DIRECCION_TECNICA':
      return <TableroDT />;
    case 'GERENCIA_PRODUCCION':
      // La pesada suele hacerla ella: tiene las mismas tareas que planta.
      return (
        <Stack gap="xl">
          {/* El saludo siempre arriba; lo primero debajo, «Lotear» (pedido del
              2026-10-22). Lo que falta etiquetar baja, antes de las tareas de
              carga. */}
          <InicioPedidos debajoDelSaludo={<TarjetaLotear />} />
          {/* Productividad de las operarias, en barras (D-tareas-1). */}
          <GraficoProductividad />
          <Stack gap="sm">
            <Title order={2}>Tareas de planta</Title>
            <Text c="dimmed">
              Lo mismo que ven los operarios. Podés hacer vos la pesada u otra etapa.
            </Text>
            <TareasProduccion titulo={false} />
          </Stack>
          <PanelEtiquetado />
          <TareasCarga />
        </Stack>
      );
    case 'PRODUCCION':
      // Las operarias ven solo lo que les manda Naza (D-tareas-1).
      return <MisTareas />;
    case 'OPERARIO':
      return <TareasProduccion />;
    case 'VENTAS':
      return <InicioPedidos descripcion="Así vienen los pedidos." soloEntregas />;
    case 'ENCARGADA_STOCK':
      return <PaginaArmado />;
    case 'RECEPCION':
      // Sin tablero: entra directo a lo suyo (pedido del 2026-10-20).
      return <Navigate to="/stock?vista=recepciones" replace />;
    default:
      return <TableroGeneral />;
  }
}

/**
 * Tablero general.
 *
 * El criterio de qué entra: cada número tiene que poder terminar en una acción
 * del turno. «Lotes en cuarentena» manda a muestrear, «recepciones sin cargar»
 * manda a Administración, «lotes por vencer» manda a revisar depósito. Un
 * indicador que solo se mira no ocupa lugar acá.
 */
function TableroGeneral() {
  const { claims } = useSesion();
  const tablero = useTablero();
  const porDia = useRecepcionesPorDia();
  const porEstado = useLotesPorEstado();
  const enCuarentena = useLotes({ estado: 'CUARENTENA' });

  const t = tablero.data;
  const totalLotes = (porEstado.data ?? []).reduce(
    (acc, e) => acc + Number(e.cantidad ?? 0),
    0,
  );

  const serie = (porDia.data ?? []).map((d) => ({
    etiqueta: fecha(d.dia).slice(0, 5),
    valor: Number(d.lotes ?? 0),
  }));

  const nombreCorto = claims?.nombre?.split(' ')[0] ?? '';

  return (
    <>
      <EncabezadoPagina
        titulo="Tablero"
        descripcion={
          nombreCorto
            ? `Hola, ${nombreCorto}. Esto es lo que hay abierto hoy.`
            : 'Estado del circuito de insumos.'
        }
        acciones={
          <Badge
            variant="light"
            color="azul"
            size="lg"
            radius="sm"
            leftSection={<IconCalendarClock size={14} />}
          >
            {fecha(new Date())}
          </Badge>
        }
      />

      <Stack gap="lg">
        <SimpleGrid
          cols={{ base: 1, xs: 2, lg: 4 }}
          spacing="md"
          className="entrada-escalonada"
        >
          {tablero.isLoading ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} h={116} radius="lg" />)
          ) : (
            <>
              <TarjetaIndicador
                etiqueta="Lotes en cuarentena"
                valor={numero(t?.lotes_en_cuarentena ?? 0)}
                icono={IconHourglassHigh}
                color="estadoCuarentena"
                detalle="Esperan muestreo según I.50.4"
                a="/lotes?estado=CUARENTENA"
              />
              <TarjetaIndicador
                etiqueta="Lotes aprobados"
                valor={numero(t?.lotes_aprobados ?? 0)}
                icono={IconChecks}
                color="estadoAprobado"
                detalle="Disponibles para pesada (RN-13)"
                a="/lotes?estado=APROBADO"
              />
              <TarjetaIndicador
                etiqueta="Recepciones del mes"
                valor={numero(t?.recepciones_del_mes ?? 0)}
                icono={IconTruckDelivery}
                detalle={`${numero(t?.recepciones_sin_cargar ?? 0)} sin carga administrativa`}
                a="/stock?vista=recepciones"
              />
              <TarjetaIndicador
                etiqueta="Sin rotular"
                valor={numero(t?.lotes_sin_rotular ?? 0)}
                icono={IconClipboardOff}
                color="indigo"
                detalle="Recibidos y todavía sin rótulo de estado"
                a="/lotes?estado=RECIBIDO"
              />
            </>
          )}
        </SimpleGrid>

        <Grid gutter="md" align="stretch">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <TarjetaPanel
              titulo="Ingreso de lotes"
              extra={
                <Text size="xs" c="dimmed">
                  últimos 30 días
                </Text>
              }
            >
              {porDia.isLoading ? (
                <Skeleton h={220} radius="md" />
              ) : (
                <GraficoArea datos={serie} unidad="lotes" />
              )}
            </TarjetaPanel>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 5 }}>
            <TarjetaPanel
              titulo="Lotes por estado"
              extra={
                <Text size="xs" c="dimmed">
                  {numero(totalLotes)} en total
                </Text>
              }
            >
              <Stack gap="md">
                {totalLotes === 0 ? (
                  <Text c="dimmed" size="sm" ta="center" py="xl">
                    Sin lotes registrados.
                  </Text>
                ) : null}
                {(porEstado.data ?? []).map((fila) => {
                  const estado = fila.estado as EstadoCalidad;
                  const cantidad = Number(fila.cantidad ?? 0);
                  const porcentaje = totalLotes > 0 ? (cantidad / totalLotes) * 100 : 0;
                  return (
                    <Box key={estado}>
                      <Group justify="space-between" mb={6}>
                        <InsigniaEstado estado={estado} size="sm" />
                        <Text size="sm" fw={600}>
                          {numero(cantidad)}
                        </Text>
                      </Group>
                      <Progress
                        value={porcentaje}
                        color={COLORES_ESTADO_ROTULO[estado]}
                        size="sm"
                        radius="xl"
                        transitionDuration={220}
                      />
                    </Box>
                  );
                })}
              </Stack>
            </TarjetaPanel>
          </Grid.Col>
        </Grid>

        <Grid gutter="md" align="stretch">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <TarjetaPanel
              titulo="En cuarentena, a muestrear"
              extra={
                <Anchor component={Link} to="/lotes?estado=CUARENTENA" size="sm">
                  Ver todos
                </Anchor>
              }
            >
              {enCuarentena.isLoading ? (
                <Skeleton h={180} radius="md" />
              ) : (enCuarentena.data ?? []).length === 0 ? (
                <Vacio
                  icono={IconPackages}
                  titulo="Nada en cuarentena"
                  descripcion="Cuando se registre una recepción y se emita el rótulo amarillo, los lotes aparecen acá."
                />
              ) : (
                <Table.ScrollContainer minWidth={520}>
                  <Table verticalSpacing="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Insumo</Table.Th>
                        <Table.Th>N° interno</Table.Th>
                        <Table.Th>Proveedor</Table.Th>
                        <Table.Th>Vence</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {(enCuarentena.data ?? []).slice(0, 8).map((l) => {
                        const dias = diasHasta(l.plazo_validez);
                        return (
                          <Table.Tr key={l.id}>
                            <Table.Td>
                              <Anchor
                                component={Link}
                                to={`/lotes/${l.id}`}
                                fw={600}
                                size="sm"
                              >
                                {l.insumo_nombre}
                              </Anchor>
                              <Text size="xs" c="dimmed">
                                lote {l.lote_proveedor ?? 's/lote'}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" ff="monospace">
                                {l.numero_registro_interno}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{l.proveedor}</Text>
                            </Table.Td>
                            <Table.Td>
                              {l.plazo_validez ? (
                                <Group gap={6} wrap="nowrap">
                                  <Text size="sm">{fecha(l.plazo_validez)}</Text>
                                  {dias !== null && dias <= 90 ? (
                                    <IconAlertTriangle
                                      size={15}
                                      color="var(--mantine-color-estadoCuarentena-7)"
                                    />
                                  ) : null}
                                </Group>
                              ) : (
                                <Text size="sm" c="dimmed">
                                  —
                                </Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </TarjetaPanel>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 4 }}>
            <TarjetaPanel titulo="Resumen">
              <Stack gap={0}>
                {[
                  {
                    icono: IconFlask,
                    etiqueta: 'Insumos en catálogo',
                    valor: numero(t?.insumos_activos ?? 0),
                  },
                  {
                    icono: IconTruckDelivery,
                    etiqueta: 'Proveedores activos',
                    valor: numero(t?.proveedores_activos ?? 0),
                  },
                  {
                    icono: IconHourglassHigh,
                    etiqueta: 'Proveedores sin dictamen',
                    valor: numero(t?.proveedores_pendientes ?? 0),
                  },
                  {
                    icono: IconAlertTriangle,
                    etiqueta: 'Lotes que vencen en 90 días',
                    valor: numero(t?.lotes_por_vencer ?? 0),
                  },
                  {
                    icono: IconPackages,
                    etiqueta: `Lotes ${TEXTO_ESTADO.EN_ANALISIS.toLowerCase()}`,
                    valor: numero(t?.lotes_en_analisis ?? 0),
                  },
                  {
                    icono: IconUsers,
                    etiqueta: 'Usuarios habilitados',
                    valor: numero(t?.usuarios_activos ?? 0),
                  },
                ].map((fila, i, arr) => (
                  <Group
                    key={fila.etiqueta}
                    justify="space-between"
                    py="sm"
                    wrap="nowrap"
                    style={{
                      borderBottom:
                        i === arr.length - 1
                          ? undefined
                          : '1px solid var(--superficie-borde)',
                    }}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <fila.icono
                        size={18}
                        stroke={1.6}
                        color="var(--mantine-color-azul-6)"
                      />
                      <Text size="sm">{fila.etiqueta}</Text>
                    </Group>
                    <Text size="sm" fw={700}>
                      {fila.valor}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </TarjetaPanel>
          </Grid.Col>
        </Grid>
      </Stack>
    </>
  );
}

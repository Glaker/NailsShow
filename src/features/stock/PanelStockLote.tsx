import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowsExchange,
  IconBan,
  IconInfoCircle,
  IconPencilMinus,
  IconRotateClockwise,
} from '@tabler/icons-react';
import {
  TEXTO_TIPO_MOVIMIENTO,
  useAnularMovimiento,
  useExistenciasDeLote,
  useKardexDeLote,
  type ExistenciaLote,
} from '@/lib/consultas';
import { fechaHora, numero } from '@/lib/formato';
import { useSesion } from '@/features/auth/sesion';
import { FormularioMovimiento } from './FormularioMovimiento';
import { FormularioTransferencia } from './FormularioTransferencia';

/* §3.3, fila «Ajustar stock por diferencia de inventario». La base lo exige
   igual: esto solo evita ofrecer un botón que va a terminar en error. */
const ROLES_STOCK = ['DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'];

/**
 * Existencia de un lote y su libro de movimientos.
 *
 * El saldo se muestra por depósito y no consolidado, porque la pregunta del
 * depósito no es cuánto hay del lote sino cuánto hay acá. Un lote repartido
 * entre dos depósitos es normal.
 */
export function PanelStockLote({ loteId }: { loteId: string }) {
  const existencias = useExistenciasDeLote(loteId);
  const kardex = useKardexDeLote(loteId);
  const anular = useAnularMovimiento();
  const { claims } = useSesion();
  const [movimiento, setMovimiento] = useState<ExistenciaLote | null>(null);
  const [transferencia, setTransferencia] = useState<ExistenciaLote | null>(null);
  const [anulando, setAnulando] = useState<{ id: string; descripcion: string } | null>(
    null,
  );
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  const puedeMover = (claims?.roles ?? []).some((r) => ROLES_STOCK.includes(r));
  const posiciones = existencias.data ?? [];
  const movimientos = kardex.data ?? [];
  const total = posiciones.reduce((a, p) => a + Number(p.saldo ?? 0), 0);
  const unidad = posiciones[0]?.unidad ?? '';

  const abrirAnulacion = (id: string, descripcion: string) => {
    setMotivoAnulacion('');
    setAnulando({ id, descripcion });
  };

  if (existencias.isLoading) return <Skeleton h={220} radius="lg" />;

  return (
    <>
      <Paper
        withBorder
        p="lg"
        style={{ borderColor: 'var(--superficie-borde)' }}
        className="no-imprimir"
      >
        <Group justify="space-between" align="baseline" mb="md" wrap="wrap" gap="xs">
          <Title order={3}>Existencia</Title>
          {posiciones.length > 0 ? (
            <Text size="sm" c="dimmed">
              Total{' '}
              <Text span fw={700} ff="monospace" c="ciruela.2">
                {numero(total, 3)} {unidad}
              </Text>{' '}
              en {posiciones.length} {posiciones.length === 1 ? 'depósito' : 'depósitos'}
            </Text>
          ) : null}
        </Group>

        {posiciones.length === 0 ? (
          <Alert
            color="violeta"
            variant="light"
            radius="md"
            icon={<IconInfoCircle size={18} />}
          >
            Este lote no tiene existencia registrada. El material entra a stock cuando
            Administración carga la recepción, desde la pantalla de recepciones.
          </Alert>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Depósito</Table.Th>
                  <Table.Th ta="right">Saldo</Table.Th>
                  <Table.Th>Despacho</Table.Th>
                  {puedeMover ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {posiciones.map((p) => (
                  <Table.Tr key={p.deposito_id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {p.deposito_numero}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {p.deposito_nombre}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" fw={600}>
                        {numero(p.saldo, 3)} {p.unidad}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {p.impedimento_despacho ? (
                        <Tooltip label={p.impedimento_despacho} multiline w={300}>
                          <Badge
                            color="estadoRechazado"
                            variant="light"
                            radius="sm"
                            leftSection={<IconBan size={12} />}
                          >
                            No despachable
                          </Badge>
                        </Tooltip>
                      ) : (
                        <Badge color="estadoAprobado" variant="light" radius="sm">
                          Despachable
                        </Badge>
                      )}
                    </Table.Td>
                    {puedeMover ? (
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <Tooltip label="Transferir a otro depósito">
                            <ActionIcon
                              variant="light"
                              color="violeta"
                              size="lg"
                              onClick={() => setTransferencia(p)}
                            >
                              <IconArrowsExchange size={17} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Ajuste, descarte o muestra">
                            <ActionIcon
                              variant="light"
                              color="violeta"
                              size="lg"
                              onClick={() => setMovimiento(p)}
                            >
                              <IconPencilMinus size={17} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {movimientos.length > 0 ? (
        <Paper
          withBorder
          p="lg"
          style={{ borderColor: 'var(--superficie-borde)' }}
          className="no-imprimir"
        >
          <Title order={3} mb="xs">
            Movimientos
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            El libro completo del lote, del más reciente al más antiguo. Nada se borra: un
            movimiento corregido queda, marcado, junto a su inverso.
          </Text>
          <Table.ScrollContainer minWidth={680}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Movimiento</Table.Th>
                  <Table.Th>Depósito</Table.Th>
                  <Table.Th ta="right">Cantidad</Table.Th>
                  <Table.Th ta="right">Saldo</Table.Th>
                  <Table.Th>Quién</Table.Th>
                  {puedeMover ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {movimientos.map((m) => {
                  const cantidad = Number(m.cantidad ?? 0);
                  const anulado = m.anulado === true;
                  const esInverso = Boolean(m.anula_a_movimiento_id);
                  return (
                    <Table.Tr key={m.id} style={anulado ? { opacity: 0.55 } : undefined}>
                      <Table.Td>
                        <Text size="xs">{fechaHora(m.ocurrido_en)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">
                            {m.tipo ? TEXTO_TIPO_MOVIMIENTO[m.tipo] : '—'}
                          </Text>
                          {anulado ? (
                            <Badge size="xs" color="gray" variant="light" radius="sm">
                              anulado
                            </Badge>
                          ) : null}
                          {esInverso ? (
                            <Tooltip label="Movimiento inverso que corrige a otro (RN-54)">
                              <Badge
                                size="xs"
                                color="estadoEnAnalisis"
                                variant="light"
                                radius="sm"
                                leftSection={<IconRotateClockwise size={10} />}
                              >
                                corrección
                              </Badge>
                            </Tooltip>
                          ) : null}
                        </Group>
                        {m.motivo ? (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {m.motivo}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{m.deposito_numero}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text
                          size="sm"
                          ff="monospace"
                          fw={600}
                          c={cantidad < 0 ? 'estadoRechazado.7' : 'estadoAprobado.8'}
                        >
                          {cantidad > 0 ? '+' : ''}
                          {numero(cantidad, 3)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" c="dimmed">
                          {numero(m.saldo_posterior, 3)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {m.registrado_por_nombre}
                        </Text>
                      </Table.Td>
                      {puedeMover ? (
                        <Table.Td>
                          {!anulado && !esInverso ? (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="estadoRechazado"
                              onClick={() =>
                                abrirAnulacion(
                                  m.id!,
                                  `${m.tipo ? TEXTO_TIPO_MOVIMIENTO[m.tipo] : ''} de ${numero(
                                    Math.abs(cantidad),
                                    3,
                                  )} ${m.unidad ?? ''} del ${fechaHora(m.ocurrido_en)}.`,
                                )
                              }
                            >
                              Anular
                            </Button>
                          ) : null}
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      ) : null}

      <Modal
        opened={movimiento !== null}
        onClose={() => setMovimiento(null)}
        title={<Text fw={700}>Registrar movimiento</Text>}
      >
        {movimiento ? (
          <FormularioMovimiento
            posicion={movimiento}
            onListo={() => setMovimiento(null)}
          />
        ) : null}
      </Modal>

      <Modal
        opened={anulando !== null}
        onClose={() => setAnulando(null)}
        title={<Text fw={700}>Anular movimiento</Text>}
      >
        <Stack gap="md">
          <Text size="sm">{anulando?.descripcion}</Text>
          <Alert color="violeta" variant="light" radius="md">
            El movimiento no se borra ni se edita: se crea su inverso y los dos quedan en
            el kardex, uno al lado del otro. Es lo que exige RN-54 y lo que un inspector
            espera encontrar.
          </Alert>
          <Textarea
            label="Motivo de la anulación"
            withAsterisk
            autosize
            minRows={2}
            placeholder="Por qué este movimiento estaba mal."
            value={motivoAnulacion}
            onChange={(e) => setMotivoAnulacion(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setAnulando(null)}>
              Cancelar
            </Button>
            <Button
              color="estadoRechazado"
              loading={anular.isPending}
              disabled={motivoAnulacion.trim().length < 10}
              onClick={() =>
                anular.mutate(
                  { id: anulando!.id, motivo: motivoAnulacion.trim() },
                  { onSuccess: () => setAnulando(null) },
                )
              }
            >
              Anular con su inverso
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={transferencia !== null}
        onClose={() => setTransferencia(null)}
        title={<Text fw={700}>Transferir entre depósitos</Text>}
      >
        {transferencia ? (
          <FormularioTransferencia
            posicion={transferencia}
            onListo={() => setTransferencia(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}

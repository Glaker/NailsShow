import { useMemo } from 'react';
import {
  Badge,
  Chip,
  Group,
  Paper,
  Skeleton,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconFlame, IconPackages, IconSearch } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { InsigniaEstado, TEXTO_ESTADO } from '@/components/InsigniaEstado';
import { Vacio } from '@/components/Vacio';
import { useLotes, type EstadoCalidad } from '@/lib/consultas';
import { diasHasta, fecha, numero } from '@/lib/formato';

const ESTADOS: EstadoCalidad[] = [
  'RECIBIDO',
  'CUARENTENA',
  'MUESTREADO',
  'EN_ANALISIS',
  'APROBADO',
  'RECHAZADO',
];

/**
 * Lotes de insumo.
 *
 * La pantalla de consulta del depósito: se llega buscando un número interno
 * leído de un rótulo, o filtrando por estado para saber qué falta muestrear.
 * El filtro de estado viaja en la URL para que un enlace del tablero abra
 * directo la lista que corresponde.
 */
export function PaginaLotes() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const estado = (params.get('estado') as EstadoCalidad | null) ?? null;
  const [texto, setTexto] = useDebouncedState(params.get('q') ?? '', 250);

  const lotes = useLotes({ estado, texto });
  const filas = lotes.data ?? [];

  const resumen = useMemo(() => {
    if (!estado) return `${numero(filas.length)} lotes`;
    return `${numero(filas.length)} en ${TEXTO_ESTADO[estado].toLowerCase()}`;
  }, [estado, filas.length]);

  return (
    <>
      <EncabezadoPagina
        titulo="Lotes de insumo"
        descripcion="Cada lote recibido, con su estado en el circuito de I.20.1 y su rótulo vigente."
      />

      <Paper withBorder p="md" mb="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Group justify="space-between" wrap="wrap" gap="md">
          <TextInput
            placeholder="N° interno, lote del proveedor o insumo"
            leftSection={<IconSearch size={17} />}
            defaultValue={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            w={{ base: '100%', sm: 340 }}
          />
          <Group gap="xs" wrap="wrap">
            <Chip
              checked={estado === null}
              onChange={() => {
                params.delete('estado');
                setParams(params, { replace: true });
              }}
              variant="light"
              color="violeta"
              radius="sm"
            >
              Todos
            </Chip>
            {ESTADOS.map((e) => (
              <Chip
                key={e}
                checked={estado === e}
                onChange={() => {
                  params.set('estado', e);
                  setParams(params, { replace: true });
                }}
                variant="light"
                color="violeta"
                radius="sm"
              >
                {TEXTO_ESTADO[e]}
              </Chip>
            ))}
          </Group>
        </Group>
      </Paper>

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {lotes.isLoading ? (
          <Skeleton h={280} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={IconPackages}
            titulo="No hay lotes con ese criterio"
            descripcion="Probá quitando el filtro de estado o buscando por otro número."
          />
        ) : (
          <>
            <Group justify="space-between" px="md" py="sm">
              <Text size="sm" c="dimmed">
                {resumen}
              </Text>
            </Group>
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Insumo</Table.Th>
                    <Table.Th>N° interno</Table.Th>
                    <Table.Th>Lote proveedor</Table.Th>
                    <Table.Th>Proveedor</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th>Depósito</Table.Th>
                    <Table.Th>Vence</Table.Th>
                    <Table.Th>Cantidad</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((l) => {
                    const dias = diasHasta(l.plazo_validez);
                    return (
                      <Table.Tr
                        key={l.id}
                        className="fila-tocable"
                        tabIndex={0}
                        role="link"
                        onClick={() => {
                          void navegar(`/lotes/${l.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void navegar(`/lotes/${l.id}`);
                        }}
                      >
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            <Text size="sm" fw={600}>
                              {l.insumo_nombre}
                            </Text>
                            {l.es_inflamable ? (
                              <Tooltip label="Inflamable — depósito exterior (I.20.6)">
                                <IconFlame
                                  size={15}
                                  color="var(--mantine-color-estadoRechazado-6)"
                                />
                              </Tooltip>
                            ) : null}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {l.codigo_interno}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" ff="monospace">
                            {l.numero_registro_interno}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{l.lote_proveedor}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{l.proveedor}</Text>
                        </Table.Td>
                        <Table.Td>
                          <InsigniaEstado estado={l.estado as EstadoCalidad} size="sm" />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{l.deposito_nombre ?? '—'}</Text>
                        </Table.Td>
                        <Table.Td>
                          {l.plazo_validez ? (
                            <Group gap={6} wrap="nowrap">
                              <Text size="sm">{fecha(l.plazo_validez)}</Text>
                              {dias !== null && dias < 0 ? (
                                <Badge
                                  size="xs"
                                  color="estadoRechazado"
                                  variant="light"
                                  radius="sm"
                                >
                                  vencido
                                </Badge>
                              ) : dias !== null && dias <= 90 ? (
                                <Badge
                                  size="xs"
                                  color="estadoCuarentena"
                                  variant="light"
                                  radius="sm"
                                >
                                  {dias} d
                                </Badge>
                              ) : null}
                            </Group>
                          ) : (
                            <Text size="sm" c="dimmed">
                              —
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {numero(l.cantidad_bultos)} b ·{' '}
                            {numero(l.cantidad_unidades, 0)} {l.unidad}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        )}
      </Paper>
    </>
  );
}

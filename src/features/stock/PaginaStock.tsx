import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Chip,
  Collapse,
  Group,
  Paper,
  Skeleton,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconBan,
  IconChevronDown,
  IconChevronRight,
  IconFlame,
  IconPackages,
  IconSearch,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { InsigniaEstado } from '@/components/InsigniaEstado';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { useExistenciasPorLote, useStockPorArticulo } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';

type Filtro = 'todos' | 'con-saldo' | 'bajo-minimo' | 'no-despachable';

/**
 * Existencia real, por artículo, con desglose por lote y depósito.
 *
 * Es la contracara de la pantalla de lotes: aquélla cuenta dónde está cada
 * lote en el circuito de calidad, ésta cuánto hay. Las dos cantidades que
 * muestra no son intercambiables y la distinción es la que importa:
 * «hay» es todo el material registrado; «despachable» es el que además está
 * aprobado, vigente y sin bloqueo (RN-51, RN-52). Prometer la primera cifra a
 * un cliente es prometer mercadería que no puede salir.
 */
export function PaginaStock() {
  const articulos = useStockPorArticulo();
  const [texto, setTexto] = useDebouncedState('', 250);
  const [filtro, setFiltro] = useState<Filtro>('con-saldo');
  const [abierto, setAbierto] = useState<string | null>(null);

  const filas = useMemo(() => {
    const busqueda = texto.trim().toLowerCase();
    return (articulos.data ?? []).filter((a) => {
      const saldo = Number(a.saldo_total ?? 0);
      const despachable = Number(a.saldo_despachable ?? 0);
      if (filtro === 'con-saldo' && saldo <= 0) return false;
      if (filtro === 'bajo-minimo' && !a.bajo_minimo) return false;
      if (filtro === 'no-despachable' && (saldo <= 0 || despachable >= saldo))
        return false;
      if (!busqueda) return true;
      return (
        (a.insumo_nombre ?? '').toLowerCase().includes(busqueda) ||
        (a.codigo_interno ?? '').toLowerCase().includes(busqueda) ||
        (a.sku ?? '').toLowerCase().includes(busqueda)
      );
    });
  }, [articulos.data, texto, filtro]);

  const todos = articulos.data ?? [];
  const conSaldo = todos.filter((a) => Number(a.saldo_total ?? 0) > 0);
  const bajoMinimo = todos.filter((a) => a.bajo_minimo);
  const retenido = conSaldo.filter(
    (a) => Number(a.saldo_despachable ?? 0) < Number(a.saldo_total ?? 0),
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Stock"
        descripcion="Existencia real por artículo, con el desglose por lote y depósito."
      />

      <Group grow mb="md" wrap="wrap">
        <TarjetaIndicador
          etiqueta="Artículos con existencia"
          valor={numero(conSaldo.length)}
          icono={IconPackages}
        />
        <TarjetaIndicador
          etiqueta="Bajo el mínimo"
          valor={numero(bajoMinimo.length)}
          icono={IconAlertTriangle}
          {...(bajoMinimo.length > 0 ? { color: 'estadoEnAnalisis' } : {})}
        />
        <TarjetaIndicador
          etiqueta="Con material retenido"
          valor={numero(retenido.length)}
          icono={IconBan}
          {...(retenido.length > 0 ? { color: 'estadoRechazado' } : {})}
        />
      </Group>

      <Paper withBorder p="md" mb="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Group justify="space-between" wrap="wrap" gap="md">
          <TextInput
            placeholder="Insumo, código o SKU"
            leftSection={<IconSearch size={17} />}
            defaultValue={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            w={{ base: '100%', sm: 340 }}
          />
          <Group gap="xs" wrap="wrap">
            {(
              [
                ['con-saldo', 'Con existencia'],
                ['bajo-minimo', 'Bajo el mínimo'],
                ['no-despachable', 'Con material retenido'],
                ['todos', 'Todos'],
              ] as [Filtro, string][]
            ).map(([valor, etiqueta]) => (
              <Chip
                key={valor}
                checked={filtro === valor}
                onChange={() => setFiltro(valor)}
                variant="light"
                color="violeta"
                radius="sm"
              >
                {etiqueta}
              </Chip>
            ))}
          </Group>
        </Group>
      </Paper>

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {articulos.isLoading ? (
          <Skeleton h={300} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={IconPackages}
            titulo="No hay artículos con ese criterio"
            descripcion="El material entra a stock cuando Administración carga una recepción, desde la pantalla de recepciones."
          />
        ) : (
          <Table.ScrollContainer minWidth={860}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36} />
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th ta="right">Hay</Table.Th>
                  <Table.Th ta="right">Despachable</Table.Th>
                  <Table.Th ta="right">Mínimo</Table.Th>
                  <Table.Th ta="right">Lotes</Table.Th>
                  <Table.Th>Vence primero</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((a) => {
                  const total = Number(a.saldo_total ?? 0);
                  const despachable = Number(a.saldo_despachable ?? 0);
                  const retiene = total > 0 && despachable < total;
                  const expandido = abierto === a.articulo_id;
                  return (
                    <Fragment key={a.articulo_id}>
                      <Table.Tr>
                        <Table.Td>
                          <UnstyledButton
                            onClick={() =>
                              setAbierto(expandido ? null : (a.articulo_id ?? null))
                            }
                            aria-label={expandido ? 'Cerrar desglose' : 'Ver desglose'}
                          >
                            {expandido ? (
                              <IconChevronDown size={17} />
                            ) : (
                              <IconChevronRight size={17} />
                            )}
                          </UnstyledButton>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            <Text size="sm" fw={600}>
                              {a.insumo_nombre}
                            </Text>
                            {a.es_inflamable ? (
                              <Tooltip label="Inflamable — depósito exterior (I.20.6)">
                                <IconFlame
                                  size={15}
                                  color="var(--mantine-color-estadoRechazado-6)"
                                />
                              </Tooltip>
                            ) : null}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {a.codigo_interno}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" ff="monospace" fw={600}>
                            {numero(total, 3)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {a.unidad_medida}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Group gap={6} justify="flex-end" wrap="nowrap">
                            <Text
                              size="sm"
                              ff="monospace"
                              fw={600}
                              {...(retiene ? { c: 'estadoRechazado.7' } : {})}
                            >
                              {numero(despachable, 3)}
                            </Text>
                            {retiene ? (
                              <Tooltip
                                label={`${numero(total - despachable, 3)} ${a.unidad_medida ?? ''} no se pueden despachar: el lote no está aprobado, venció o está bloqueado (RN-51, RN-52).`}
                                multiline
                                w={280}
                              >
                                <IconBan
                                  size={15}
                                  color="var(--mantine-color-estadoRechazado-6)"
                                />
                              </Tooltip>
                            ) : null}
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right">
                          {a.stock_minimo === null ? (
                            <Text size="xs" c="dimmed">
                              sin definir
                            </Text>
                          ) : (
                            <Group gap={6} justify="flex-end" wrap="nowrap">
                              <Text size="sm" ff="monospace" c="dimmed">
                                {numero(a.stock_minimo, 3)}
                              </Text>
                              {a.bajo_minimo ? (
                                <Badge
                                  size="xs"
                                  color="estadoEnAnalisis"
                                  variant="light"
                                  radius="sm"
                                >
                                  reponer
                                </Badge>
                              ) : null}
                            </Group>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" ff="monospace">
                            {numero(a.lotes_con_saldo)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{fecha(a.vence_primero)}</Text>
                        </Table.Td>
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td colSpan={7} p={0} style={{ border: 0 }}>
                          <Collapse in={expandido}>
                            {expandido && a.articulo_id ? (
                              <Desglose articuloId={a.articulo_id} />
                            ) : null}
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </>
  );
}

/** Desglose de un artículo: una fila por lote y depósito, que es la posición real. */
function Desglose({ articuloId }: { articuloId: string }) {
  const posiciones = useExistenciasPorLote(articuloId);

  if (posiciones.isLoading) return <Skeleton h={90} m="md" />;

  const filas = posiciones.data ?? [];
  if (filas.length === 0) {
    return (
      <Text size="sm" c="dimmed" p="md">
        Sin posiciones registradas.
      </Text>
    );
  }

  return (
    <Table
      verticalSpacing="xs"
      withColumnBorders={false}
      style={{ background: 'var(--mantine-color-violeta-0)' }}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Lote</Table.Th>
          <Table.Th>Estado</Table.Th>
          <Table.Th>Depósito</Table.Th>
          <Table.Th ta="right">Saldo</Table.Th>
          <Table.Th>Vence</Table.Th>
          <Table.Th>Despacho</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {filas.map((p) => (
          <Table.Tr key={`${p.lote_insumo_id}-${p.deposito_id}`}>
            <Table.Td>
              <Anchor component={Link} to={`/lotes/${p.lote_insumo_id}`} size="sm">
                {p.numero_registro_interno}
              </Anchor>
              <Text size="xs" c="dimmed">
                prov. {p.lote_proveedor}
              </Text>
            </Table.Td>
            <Table.Td>
              {p.estado ? <InsigniaEstado estado={p.estado} size="sm" /> : null}
            </Table.Td>
            <Table.Td>
              <Text size="sm">{p.deposito_numero}</Text>
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
              <Group gap={6} wrap="nowrap">
                <Text size="sm">{fecha(p.plazo_validez)}</Text>
                {p.vence_en_90_dias ? (
                  <Badge size="xs" color="estadoEnAnalisis" variant="light" radius="sm">
                    pronto
                  </Badge>
                ) : null}
              </Group>
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
                    Retenido
                  </Badge>
                </Tooltip>
              ) : (
                <Badge color="estadoAprobado" variant="light" radius="sm">
                  Despachable
                </Badge>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

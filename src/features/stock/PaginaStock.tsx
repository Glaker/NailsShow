import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Anchor,
  Badge,
  Button,
  Chip,
  Collapse,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Table,
  Stack,
  Text,
  Textarea,
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
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { InsigniaEstado } from '@/components/InsigniaEstado';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import {
  useEntradasDeArticulo,
  useExistenciasPorLote,
  useInsumos,
  useStockPorArticulo,
} from '@/lib/consultas';
import {
  ROLES_ACTUALIZAN_STOCK,
  useDescartarArticulo,
  useRegistrarConteo,
} from '@/lib/consultasComercial';
import { useTieneRol } from '@/features/auth/sesion';
import { fecha, fechaHora, numero } from '@/lib/formato';
import { PanelReservas } from '@/features/tercerizados/PanelReservas';

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
  const puedeAgregar = useTieneRol(...ROLES_ACTUALIZAN_STOCK);
  const [agregando, setAgregando] = useState(false);

  const filas = useMemo(() => {
    const busqueda = texto.trim().toLowerCase();
    /* Lo último que se movió arriba (pedido del 2026-10-20): lo recién
       recibido es lo que se busca. Sin movimientos, al final. */
    const recientes = [...(articulos.data ?? [])].sort((a, b) =>
      (b.ultimo_movimiento ?? '').localeCompare(a.ultimo_movimiento ?? ''),
    );
    return recientes.filter((a) => {
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
        acciones={
          puedeAgregar ? (
            <Button
              size="md"
              leftSection={<IconPlus size={18} />}
              onClick={() => setAgregando(true)}
            >
              Agregar stock de insumos
            </Button>
          ) : null
        }
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
                color="azul"
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

      <Box mt="lg">
        <PanelReservas titular={null} />
      </Box>

      {agregando ? <AgregarStock onCerrar={() => setAgregando(false)} /> : null}
    </>
  );
}

/**
 * Agregar stock de insumos sin pasar por recepciones (pedido del 2026-11-10):
 * solo insumo y cantidad. Se suma al saldo con comercial.registrar_conteo, que
 * deja el conteo (lo que había y lo que quedó: existencia histórica) y el
 * ajuste en el kardex a nombre de quien lo cargó.
 */
function AgregarStock({ onCerrar }: { onCerrar: () => void }) {
  const insumos = useInsumos();
  const stock = useStockPorArticulo();
  const registrar = useRegistrarConteo();
  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState<number | string>('');
  const insumo = (insumos.data ?? []).find((i) => i.id === insumoId);
  // ponytail: el saldo sale de la última lectura; dos cargas simultáneas del mismo insumo pisan una.
  const hay = Number(
    (stock.data ?? []).find((s) => s.insumo_id === insumoId)?.saldo_total ?? 0,
  );
  const n = Number(cantidad);
  const valido = insumo !== undefined && cantidad !== '' && n > 0;
  return (
    <Modal
      opened
      onClose={onCerrar}
      title="Agregar stock de insumos"
      centered
      radius="md"
    >
      <Stack gap="md">
        <Select
          label="Insumo"
          size="md"
          searchable
          data-autofocus
          nothingFoundMessage="No hay un insumo con ese nombre o código"
          data={(insumos.data ?? [])
            .filter((i) => i.activo && i.unidad_medida)
            .map((i) => ({ value: i.id, label: `${i.codigo_interno} · ${i.nombre}` }))}
          value={insumoId}
          onChange={setInsumoId}
        />
        <NumberInput
          label={`Cantidad${insumo ? ` (${insumo.unidad_medida})` : ''}`}
          size="md"
          min={0}
          decimalSeparator=","
          thousandSeparator="."
          value={cantidad}
          onChange={setCantidad}
          description={
            insumo
              ? `Hay ${numero(hay, 3)}; queda en ${numero(hay + (n > 0 ? n : 0), 3)}.`
              : undefined
          }
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            size="md"
            disabled={!valido || stock.isFetching}
            loading={registrar.isPending}
            onClick={() =>
              registrar.mutate(
                {
                  insumoId: insumo!.id,
                  cantidad: hay + n,
                  observacion: `Ingreso de ${n} ${insumo!.unidad_medida} desde Stock (se suma al saldo)`,
                },
                { onSuccess: onCerrar },
              )
            }
          >
            Agregar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Desglose de un artículo: una fila por lote y depósito, que es la posición real. */
function Desglose({ articuloId }: { articuloId: string }) {
  const posiciones = useExistenciasPorLote(articuloId);
  const entradas = useEntradasDeArticulo(articuloId);
  // Los roles de la política de INSERT de movimientos_stock.
  const puedeMover = useTieneRol(
    'DIRECCION_TECNICA',
    'ADMINISTRACION',
    'GERENCIA_PRODUCCION',
  );
  const descartar = useDescartarArticulo();
  const [bajando, setBajando] = useState(false);
  const [motivo, setMotivo] = useState('');

  if (posiciones.isLoading) return <Skeleton h={90} m="md" />;

  /* La entrada más vieja de cada lote es su carga a stock: cuándo y quién. */
  const cargaDe = new Map<string, { ocurrido_en: string; por: string }>();
  for (const m of entradas.data ?? []) {
    if (m.lote_insumo_id && m.ocurrido_en && !cargaDe.has(m.lote_insumo_id))
      cargaDe.set(m.lote_insumo_id, {
        ocurrido_en: m.ocurrido_en,
        por: m.registrado_por_nombre ?? '—',
      });
  }
  const filas = [...(posiciones.data ?? [])].sort((a, b) =>
    (cargaDe.get(b.lote_insumo_id ?? '')?.ocurrido_en ?? '').localeCompare(
      cargaDe.get(a.lote_insumo_id ?? '')?.ocurrido_en ?? '',
    ),
  );
  if (filas.length === 0) {
    return (
      <Text size="sm" c="dimmed" p="md">
        Sin posiciones registradas.
      </Text>
    );
  }

  const conSaldo = filas.filter((p) => Number(p.saldo ?? 0) > 0);

  return (
    <>
      {puedeMover && conSaldo.length > 0 ? (
        <Group justify="flex-end" px="md" pt="sm">
          <Button
            size="sm"
            variant="light"
            color="estadoRechazado"
            leftSection={<IconTrash size={16} />}
            onClick={() => setBajando(true)}
          >
            Dar de baja todo el stock
          </Button>
        </Group>
      ) : null}
      <Modal
        opened={bajando}
        onClose={() => setBajando(false)}
        title="Dar de baja todo el stock"
      >
        <Stack gap="md">
          <Text size="sm">
            Se registra un descarte «Discontinuado» por cada lote y depósito con saldo (
            {conSaldo.length} {conSaldo.length === 1 ? 'posición' : 'posiciones'}). Los
            movimientos quedan en el kardex y no se deshacen: la corrección es un ajuste.
          </Text>
          <Textarea
            label="Motivo"
            withAsterisk
            autosize
            minRows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setBajando(false)}>
              Cancelar
            </Button>
            <Button
              color="estadoRechazado"
              disabled={motivo.trim().length === 0}
              loading={descartar.isPending}
              onClick={() =>
                descartar.mutate(
                  { articuloId, motivo },
                  {
                    onSuccess: () => {
                      setBajando(false);
                      setMotivo('');
                    },
                  },
                )
              }
            >
              Dar de baja
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Table
        verticalSpacing="xs"
        withColumnBorders={false}
        style={{ background: 'var(--mantine-color-azul-light)' }}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Lote</Table.Th>
            <Table.Th>Cargado</Table.Th>
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
                  prov. {p.lote_proveedor ?? 's/lote'}
                </Text>
              </Table.Td>
              <Table.Td>
                {cargaDe.has(p.lote_insumo_id ?? '') ? (
                  <>
                    <Text size="sm">
                      {fechaHora(cargaDe.get(p.lote_insumo_id ?? '')!.ocurrido_en)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {cargaDe.get(p.lote_insumo_id ?? '')!.por}
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
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
    </>
  );
}

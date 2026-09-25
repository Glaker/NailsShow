import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Pagination,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBuildingWarehouse,
  IconCheck,
  IconInfoCircle,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShieldCheck,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { numero } from '@/lib/formato';
import {
  ROLES_METAS_SS,
  faltaTotal,
  useAltaProductoDeSku,
  useGuardarMetaSS,
  useProducirParaStock,
  useStockSeguridad,
  type FilaStockSeguridad,
} from '@/lib/consultasStockSeguridad';

type Vista = 'reponer' | 'activos' | 'todos';
const POR_PAGINA = 40;
const n = (x: number | string | null | undefined) => Number(x ?? 0);

/**
 * Qué producir o comprar por SKU para volver al punto de pedido, separado en
 * lo que falta para cubrir la demanda del lead time (el disponible) y lo que
 * falta para el stock de seguridad. La meta de SS la fija Producción; la de la
 * planilla queda como referencia.
 */
export function PaginaStockSeguridad() {
  const filas = useStockSeguridad();
  const puedeMeta = useTieneRol(...ROLES_METAS_SS);
  const altaProducto = useAltaProductoDeSku();
  const [vista, setVista] = useState<Vista>('reponer');
  const [accion, setAccion] = useState<'todas' | 'PRODUCIR' | 'COMPRAR'>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [editandoMeta, setEditandoMeta] = useState<FilaStockSeguridad | null>(null);
  const [produciendo, setProduciendo] = useState(false);

  const todas = useMemo(() => filas.data ?? [], [filas.data]);
  const texto = busqueda.trim().toLowerCase();
  const visibles = useMemo(
    () =>
      todas
        .filter((f) => f.aplica_stock)
        .filter((f) =>
          vista === 'todos'
            ? true
            : vista === 'activos'
              ? f.estado_demanda === 'Activo' || f.estado_demanda === 'Nuevo (<12m)'
              : f.bajo_punto_de_pedido &&
                (f.estado_demanda === 'Activo' || f.estado_demanda === 'Nuevo (<12m)') &&
                faltaTotal(f) > 0,
        )
        .filter((f) => accion === 'todas' || f.accion === accion)
        .filter(
          (f) =>
            !texto ||
            (f.sku_cod ?? '').toLowerCase().includes(texto) ||
            (f.descripcion ?? '').toLowerCase().includes(texto),
        )
        .sort((a, b) => faltaTotal(b) - faltaTotal(a)),
    [todas, vista, accion, texto],
  );
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const enPagina = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const activos = todas.filter(
    (f) =>
      f.aplica_stock &&
      (f.estado_demanda === 'Activo' || f.estado_demanda === 'Nuevo (<12m)'),
  );
  const aReponer = activos.filter((f) => f.bajo_punto_de_pedido && faltaTotal(f) > 0);
  const sinStockContado = activos.filter((f) => n(f.en_fabrica) === 0).length;

  const seleccion = todas.filter((f) => f.sku_id && elegidos.has(f.sku_id));
  const alternar = (id: string) => {
    const s = new Set(elegidos);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setElegidos(s);
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Stock de seguridad"
        descripcion="Por SKU: qué hay en fábrica, qué falta para cubrir la demanda del lead time y qué falta para el stock de seguridad."
        acciones={
          <Group gap="sm">
            <Button
              component={Link}
              to="/producto-terminado"
              variant="default"
              leftSection={<IconBuildingWarehouse size={16} />}
            >
              Stock en fábrica
            </Button>
            {puedeMeta ? (
              <Button
                leftSection={<IconSettings size={16} />}
                disabled={seleccion.length === 0}
                onClick={() => setProduciendo(true)}
              >
                Producir para stock{seleccion.length ? ` (${seleccion.length})` : ''}
              </Button>
            ) : null}
          </Group>
        }
      />

      {filas.isLoading ? (
        <Skeleton h={320} />
      ) : (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <TarjetaIndicador
              etiqueta="SKU activos bajo el punto de pedido"
              valor={`${aReponer.length} de ${activos.length}`}
              icono={IconAlertTriangle}
              color="estadoRechazado"
              detalle="Hay que producir o comprar."
            />
            <TarjetaIndicador
              etiqueta="Unidades para volver al punto de pedido"
              valor={numero(
                aReponer.reduce((a, f) => a + faltaTotal(f), 0),
                0,
              )}
              icono={IconSettings}
              detalle={`${numero(
                aReponer.reduce((a, f) => a + Math.ceil(n(f.falta_ss)), 0),
                0,
              )} son de stock de seguridad`}
            />
            <TarjetaIndicador
              etiqueta="Metas propias"
              valor={String(todas.filter((f) => f.meta_propia).length)}
              icono={IconShieldCheck}
              detalle="SKU con SS fijado por Producción; el resto usa el de la planilla."
            />
          </SimpleGrid>

          {sinStockContado > activos.length / 2 ? (
            <Alert
              color="estadoEnAnalisis"
              variant="light"
              radius="md"
              icon={<IconInfoCircle size={18} />}
            >
              {sinStockContado} SKU activos no tienen stock cargado en fábrica. Mientras
              no se cuente el stock inicial en{' '}
              <Text
                component={Link}
                to="/producto-terminado"
                c="violeta"
                fw={600}
                size="sm"
              >
                Stock en fábrica
              </Text>
              , la pantalla los muestra como si no hubiera nada.
            </Alert>
          ) : null}

          <Group gap="sm" wrap="wrap">
            <SegmentedControl
              value={vista}
              onChange={(v) => {
                setVista(v as Vista);
                setPagina(1);
              }}
              data={[
                { value: 'reponer', label: `Hay que reponer (${aReponer.length})` },
                { value: 'activos', label: 'Activos' },
                { value: 'todos', label: 'Todos' },
              ]}
            />
            <SegmentedControl
              value={accion}
              onChange={(v) => {
                setAccion(v as typeof accion);
                setPagina(1);
              }}
              data={[
                { value: 'todas', label: 'Producir y comprar' },
                { value: 'PRODUCIR', label: 'Producir' },
                { value: 'COMPRAR', label: 'Comprar' },
              ]}
            />
            <TextInput
              leftSection={<IconSearch size={16} />}
              placeholder="Buscar SKU o producto"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.currentTarget.value);
                setPagina(1);
              }}
              style={{ flex: 1, minWidth: 220 }}
            />
          </Group>

          {visibles.length === 0 ? (
            <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
              <Vacio
                icono={IconCheck}
                titulo="Nada para reponer con este filtro"
                descripcion="Todos los SKU están por encima de su punto de pedido."
              />
            </Paper>
          ) : (
            <Paper
              withBorder
              style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
            >
              <Table.ScrollContainer minWidth={1100}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={40} />
                      <Table.Th>SKU</Table.Th>
                      <Table.Th ta="right">Venta/mes</Table.Th>
                      <Table.Th ta="right">En fábrica</Table.Th>
                      <Table.Th ta="right">Comprometido</Table.Th>
                      <Table.Th ta="right">En producción</Table.Th>
                      <Table.Th ta="right">Falta p/ disponible</Table.Th>
                      <Table.Th ta="right">Falta p/ SS</Table.Th>
                      <Table.Th ta="right">SS (meta)</Table.Th>
                      <Table.Th>Qué hacer</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {enPagina.map((f) => {
                      const total = faltaTotal(f);
                      return (
                        <Table.Tr key={f.sku_id}>
                          <Table.Td>
                            {f.producto_id ? (
                              <Checkbox
                                aria-label={`Elegir ${f.sku_cod}`}
                                checked={elegidos.has(f.sku_id!)}
                                onChange={() => alternar(f.sku_id!)}
                              />
                            ) : null}
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={600}>
                              {f.descripcion}
                            </Text>
                            <Group gap={6}>
                              <Text size="xs" c="dimmed" ff="monospace">
                                {f.sku_cod}
                              </Text>
                              {f.clase_demanda ? (
                                <Text size="xs" c="dimmed">
                                  · {f.clase_demanda}
                                </Text>
                              ) : null}
                              {n(f.en_calle5) > 0 ? (
                                <Text size="xs" c="dimmed">
                                  · {numero(n(f.en_calle5), 0)} en Calle 5
                                </Text>
                              ) : null}
                            </Group>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace">
                              {numero(n(f.mu_mensual), 0)}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace" fw={600}>
                              {numero(n(f.en_fabrica), 0)}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace" c="dimmed">
                              {numero(n(f.comprometido), 0)}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text size="sm" ff="monospace" c="dimmed">
                              {numero(n(f.en_produccion), 0)}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text
                              size="sm"
                              ff="monospace"
                              fw={700}
                              c={
                                n(f.falta_disponible) > 0 ? 'estadoRechazado.8' : 'dimmed'
                              }
                            >
                              {numero(Math.ceil(n(f.falta_disponible)), 0)}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Text
                              size="sm"
                              ff="monospace"
                              fw={700}
                              c={n(f.falta_ss) > 0 ? 'estadoCuarentena.9' : 'dimmed'}
                            >
                              {numero(Math.ceil(n(f.falta_ss)), 0)}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <Tooltip
                                label={`Planilla: ${numero(n(f.ss_planilla), 0)}${f.meta_propia ? ' · meta propia de Producción' : ''}`}
                              >
                                <Text
                                  size="sm"
                                  ff="monospace"
                                  fw={f.meta_propia ? 700 : 400}
                                >
                                  {numero(n(f.ss_meta), 0)}
                                </Text>
                              </Tooltip>
                              {puedeMeta ? (
                                <ActionIcon
                                  variant="subtle"
                                  color="gray"
                                  size="lg"
                                  aria-label="Editar meta de SS"
                                  onClick={() => setEditandoMeta(f)}
                                >
                                  <IconPencil size={16} />
                                </ActionIcon>
                              ) : null}
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            {!f.producto_id ? (
                              puedeMeta ? (
                                <Button
                                  size="xs"
                                  variant="light"
                                  leftSection={<IconPlus size={14} />}
                                  loading={
                                    altaProducto.isPending &&
                                    altaProducto.variables === f.sku_id
                                  }
                                  onClick={() => altaProducto.mutate(f.sku_id!)}
                                >
                                  Dar de alta el producto
                                </Button>
                              ) : (
                                <Text size="xs" c="dimmed">
                                  Sin producto en el catálogo
                                </Text>
                              )
                            ) : total > 0 ? (
                              <Badge
                                size="lg"
                                radius="sm"
                                variant="light"
                                color={f.accion === 'PRODUCIR' ? 'violeta' : 'indigo'}
                              >
                                {f.accion === 'PRODUCIR' ? 'Producir' : 'Comprar'}{' '}
                                {numero(total, 0)}
                              </Badge>
                            ) : (
                              <Text size="xs" c="dimmed">
                                Cubierto
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          )}
          {paginas > 1 ? (
            <Group justify="center">
              <Pagination total={paginas} value={pagina} onChange={setPagina} />
            </Group>
          ) : null}
          <Text size="xs" c="dimmed">
            Falta para el disponible = demanda del lead time (producción + materia prima)
            − posición. Falta para el SS = meta de SS − lo que sobra de la posición.
            Posición = en fábrica − comprometido con clientes + en producción para stock.
            Planilla: nivel de servicio 95 %, lead time 12 días hábiles fabricados y 7
            comprados.
          </Text>
        </Stack>
      )}

      <Modal
        opened={editandoMeta !== null}
        onClose={() => setEditandoMeta(null)}
        title={`Meta de stock de seguridad · ${editandoMeta?.sku_cod ?? ''}`}
        centered
        radius="md"
      >
        {editandoMeta ? (
          <FormularioMeta fila={editandoMeta} onListo={() => setEditandoMeta(null)} />
        ) : null}
      </Modal>

      <Modal
        opened={produciendo}
        onClose={() => setProduciendo(false)}
        title="Producir para stock"
        size="lg"
        centered
        radius="md"
      >
        {produciendo ? (
          <FormularioProducirStock
            filas={seleccion}
            onListo={(hecho) => {
              setProduciendo(false);
              if (hecho) setElegidos(new Set());
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

function FormularioMeta({
  fila,
  onListo,
}: {
  fila: FilaStockSeguridad;
  onListo: () => void;
}) {
  const guardar = useGuardarMetaSS();
  const [valor, setValor] = useState<number | ''>(n(fila.ss_meta));
  const [motivo, setMotivo] = useState('');
  return (
    <Stack gap="md">
      <Text size="sm">
        {fila.descripcion}. La planilla sugiere <b>{numero(n(fila.ss_planilla), 0)}</b>{' '}
        unidades de stock de seguridad (95 % de nivel de servicio). Poné lo que se puede
        sostener hoy; se puede ir subiendo de a poco.
      </Text>
      <NumberInput
        label="Stock de seguridad (unidades)"
        min={0}
        allowDecimal={false}
        value={valor}
        onChange={(v) => setValor(typeof v === 'number' ? v : '')}
      />
      <Textarea
        label="Motivo"
        placeholder="Por ejemplo: capacidad de la semana"
        autosize
        minRows={1}
        value={motivo}
        onChange={(e) => setMotivo(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Cancelar
        </Button>
        <Button
          variant="light"
          onClick={() =>
            guardar.mutate(
              {
                skuId: fila.sku_id!,
                ssMeta: n(fila.ss_planilla),
                motivo: 'Vuelve a la de la planilla',
              },
              { onSuccess: onListo },
            )
          }
          disabled={!fila.meta_propia}
        >
          Usar la de la planilla
        </Button>
        <Button
          loading={guardar.isPending}
          disabled={valor === ''}
          onClick={() =>
            guardar.mutate(
              {
                skuId: fila.sku_id!,
                ssMeta: Number(valor),
                motivo: motivo.trim() || null,
              },
              { onSuccess: onListo },
            )
          }
        >
          Guardar
        </Button>
      </Group>
    </Stack>
  );
}

function FormularioProducirStock({
  filas,
  onListo,
}: {
  filas: FilaStockSeguridad[];
  onListo: (hecho: boolean) => void;
}) {
  const producir = useProducirParaStock();
  const [cantidades, setCantidades] = useState<Record<string, number | ''>>(() =>
    Object.fromEntries(filas.map((f) => [f.sku_id!, faltaTotal(f) || ''])),
  );
  const [obs, setObs] = useState('');
  const renglones = filas
    .map((f) => ({
      productoId: f.producto_id!,
      cantidad: Number(cantidades[f.sku_id!] || 0),
    }))
    .filter((r) => r.cantidad > 0);

  return (
    <Stack gap="md">
      <Text size="sm">
        Se arma un pedido para stock y queda enviado a producción. Cuando lo termines, lo
        producido entra al stock en fábrica.
      </Text>
      <Table verticalSpacing="xs">
        <Table.Tbody>
          {filas.map((f) => (
            <Table.Tr key={f.sku_id}>
              <Table.Td>
                <Text size="sm" fw={600}>
                  {f.descripcion}
                </Text>
                <Text size="xs" c="dimmed">
                  {f.sku_cod} · faltan {numero(Math.ceil(n(f.falta_disponible)), 0)} para
                  el disponible y {numero(Math.ceil(n(f.falta_ss)), 0)} para el SS
                </Text>
              </Table.Td>
              <Table.Td w={140}>
                <NumberInput
                  aria-label={`Cantidad de ${f.sku_cod}`}
                  min={0}
                  allowDecimal={false}
                  hideControls
                  value={cantidades[f.sku_id!] ?? ''}
                  onChange={(v) =>
                    setCantidades({
                      ...cantidades,
                      [f.sku_id!]: typeof v === 'number' ? v : '',
                    })
                  }
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Textarea
        label="Observaciones"
        autosize
        minRows={1}
        value={obs}
        onChange={(e) => setObs(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={() => onListo(false)}>
          Cancelar
        </Button>
        <Button
          loading={producir.isPending}
          disabled={renglones.length === 0}
          leftSection={<IconSettings size={16} />}
          onClick={() =>
            producir.mutate(
              { renglones, observaciones: obs.trim() || null },
              { onSuccess: () => onListo(true) },
            )
          }
        >
          Enviar a producción
        </Button>
      </Group>
    </Stack>
  );
}

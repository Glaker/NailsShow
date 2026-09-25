import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconBuildingStore,
  IconClipboardCheck,
  IconInfoCircle,
  IconPackage,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { useDepositos, useProductos } from '@/lib/consultas';
import { numero } from '@/lib/formato';
import {
  TIPOS_MOVIMIENTO_PT,
  TIPOS_PT_CON_MOTIVO,
  useMovimientosPuntoVenta,
  useRegistrarMovimientoPt,
  useStockPuntoVenta,
} from '@/lib/consultasComercial';
import { useRegistrarConteoPt } from '@/lib/consultasStockSeguridad';

/**
 * Qué depósito de producto terminado muestra la pantalla. La de Calle 5 es la
 * original (20260922230000); el stock en fábrica (PTF, 20260925100000) usa la
 * misma pantalla y el mismo libro.
 */
interface ConfigDeposito {
  numero: string;
  titulo: string;
  descripcion: string;
  unidadesEn: string;
  vacioTitulo: string;
  vacioDescripcion: string;
}

const CALLE5: ConfigDeposito = {
  numero: 'C5',
  titulo: 'Calle 5 — punto de venta',
  descripcion:
    'Stock de producto terminado del local. Entra lo que manda la planta, sale lo que se vende.',
  unidadesEn: 'Unidades en el local',
  vacioTitulo: 'El local todavía no tiene stock',
  vacioDescripcion: 'Registrá la primera entrada cuando llegue mercadería desde planta.',
};

const FABRICA: ConfigDeposito = {
  numero: 'PTF',
  titulo: 'Stock en fábrica',
  descripcion:
    'Producto terminado en el depósito de fábrica: entra lo que se termina, sale lo que se entrega. Es el stock del que parte el stock de seguridad.',
  unidadesEn: 'Unidades en fábrica',
  vacioTitulo: 'Todavía no hay stock contado en fábrica',
  vacioDescripcion:
    'Empezá por el conteo inicial: «Contar» deja cada producto en lo que hay de verdad.',
};

/**
 * Punto de venta de Calle 5.
 *
 * Pensada para usarse en el mostrador: dos acciones grandes —entró algo, salió
 * algo— y el saldo siempre a la vista. El signo del movimiento lo resuelve el
 * hook según el tipo; acá nadie escribe números negativos.
 */
/** Stock de producto terminado en fábrica (PTF): misma pantalla, otro depósito. */
export function PaginaStockFabrica() {
  return <PaginaPuntoVenta config={FABRICA} />;
}

export function PaginaPuntoVenta({ config = CALLE5 }: { config?: ConfigDeposito }) {
  const depositos = useDepositos();
  const stockTodos = useStockPuntoVenta();
  const productos = useProductos();
  const registrar = useRegistrarMovimientoPt();
  const contar = useRegistrarConteoPt();
  const [contando, setContando] = useState(false);
  const [conteoProducto, setConteoProducto] = useState<string | null>(null);
  const [conteoCantidad, setConteoCantidad] = useState<number | ''>('');
  const [conteoObs, setConteoObs] = useState('');

  const deposito = (depositos.data ?? []).find((d) => d.numero === config.numero) ?? null;
  // La vista trae todos los depósitos comerciales: acá solo el de la pantalla.
  const stock = {
    isLoading: stockTodos.isLoading,
    data: (stockTodos.data ?? []).filter((f) => f.deposito_id === deposito?.id),
  };
  const movimientos = useMovimientosPuntoVenta(deposito?.id);

  const [abierto, setAbierto] = useState(false);
  const [sentido, setSentido] = useState<'entra' | 'sale'>('sale');
  const [tipo, setTipo] = useState<string>('SALIDA_VENTA');
  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState<number | ''>('');
  const [lote, setLote] = useState('');
  const [motivo, setMotivo] = useState('');

  const delSentido = TIPOS_MOVIMIENTO_PT.filter((t) =>
    sentido === 'entra' ? t.value.startsWith('ENTRADA') : t.value.startsWith('SALIDA'),
  );
  const exigeMotivo = TIPOS_PT_CON_MOTIVO.includes(tipo);

  // `stock.data ?? []` crea un arreglo nuevo en cada render, así que el memo
  // se calcula sobre `stock.data` y el fallback queda adentro.
  const totalUnidades = stock.data.reduce((a, f) => a + Number(f.saldo), 0);
  const conStock = stock.data.filter((f) => Number(f.saldo) > 0);
  const saldoDe = (id: string | null) =>
    Number(stock.data.find((f) => f.producto_id === id)?.saldo ?? 0);

  function abrir(s: 'entra' | 'sale') {
    setSentido(s);
    setTipo(s === 'entra' ? 'ENTRADA_DEVOLUCION' : 'SALIDA_VENTA');
    setAbierto(true);
  }

  function guardar() {
    if (!deposito || !productoId || typeof cantidad !== 'number') return;
    registrar.mutate(
      {
        productoId,
        depositoId: deposito.id,
        tipo,
        cantidad,
        loteTexto: lote.trim() || null,
        motivo: motivo.trim() || null,
      },
      {
        onSuccess: () => {
          setAbierto(false);
          setProductoId(null);
          setCantidad('');
          setLote('');
          setMotivo('');
        },
      },
    );
  }

  if (depositos.isLoading) return <Skeleton h={300} />;

  if (!deposito) {
    return (
      <>
        <EncabezadoPagina titulo={config.titulo} />
        <Alert
          color="estadoEnAnalisis"
          variant="light"
          radius="md"
          title="Falta el depósito"
        >
          No existe el depósito <b>{config.numero}</b>: probablemente falta aplicar la
          migración que lo crea con <code>supabase db push</code>.
        </Alert>
      </>
    );
  }

  return (
    <>
      <EncabezadoPagina
        titulo={config.titulo}
        descripcion={config.descripcion}
        acciones={
          <Group gap="sm">
            <Button
              size="md"
              variant="default"
              leftSection={<IconClipboardCheck size={18} />}
              onClick={() => setContando(true)}
            >
              Contar
            </Button>
            <Button
              size="md"
              variant="light"
              color="estadoAprobado"
              leftSection={<IconArrowDown size={18} />}
              onClick={() => abrir('entra')}
            >
              Entró
            </Button>
            <Button
              size="md"
              color="violeta"
              leftSection={<IconArrowUp size={18} />}
              onClick={() => abrir('sale')}
            >
              Salió
            </Button>
          </Group>
        }
      />

      <Stack gap="lg">
        <Group grow wrap="wrap">
          <TarjetaIndicador
            etiqueta={config.unidadesEn}
            valor={numero(totalUnidades, 0)}
            icono={IconBuildingStore}
          />
          <TarjetaIndicador
            etiqueta="Productos con stock"
            valor={String(conStock.length)}
            icono={IconPackage}
          />
        </Group>

        <Alert
          color="gray"
          variant="light"
          radius="md"
          icon={<IconInfoCircle size={18} />}
        >
          El lote de cada unidad se anota como texto. Hasta que el sistema tenga lote de
          producto terminado, un retiro de mercado no alcanza automáticamente a este
          depósito: conviene cargarlo siempre.
        </Alert>

        {stock.isLoading ? (
          <Skeleton h={200} />
        ) : conStock.length === 0 ? (
          <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
            <Vacio
              icono={IconBuildingStore}
              titulo={config.vacioTitulo}
              descripcion={config.vacioDescripcion}
              accion={<Button onClick={() => setContando(true)}>Contar</Button>}
            />
          </Paper>
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={520}>
              <Table verticalSpacing="md" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Unidades</Table.Th>
                    <Table.Th>Último movimiento</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {conStock.map((f) => (
                    <Table.Tr key={f.producto_id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {f.producto}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="lg" ff="monospace" fw={700}>
                          {numero(Number(f.saldo), 0)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {f.ultimo_movimiento
                            ? new Date(f.ultimo_movimiento).toLocaleDateString('es-AR')
                            : '—'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}

        <UltimosMovimientos
          filas={movimientos.data ?? []}
          cargando={movimientos.isLoading}
        />
      </Stack>

      <Modal
        opened={contando}
        onClose={() => setContando(false)}
        title={`Conteo · ${config.titulo}`}
        centered
        radius="md"
      >
        <Stack gap="md">
          <Text size="sm">
            Poné lo que hay contado de un producto. El sistema registra el ajuste por la
            diferencia, con lo que había antes, y el saldo queda en lo contado.
          </Text>
          <Select
            label="Producto"
            searchable
            limit={60}
            nothingFoundMessage="Sin coincidencias"
            data={(productos.data ?? [])
              .filter((x) => x.activo && x.tercero_id === null)
              .map((x) => ({ value: x.id, label: `${x.codigo_interno} · ${x.nombre}` }))}
            value={conteoProducto}
            onChange={setConteoProducto}
          />
          {conteoProducto ? (
            <Text size="sm" c="dimmed">
              Registrado hoy: <b>{numero(saldoDe(conteoProducto), 0)}</b> unidades.
            </Text>
          ) : null}
          <NumberInput
            label="Unidades contadas"
            min={0}
            allowDecimal={false}
            hideControls
            value={conteoCantidad}
            onChange={(v) => setConteoCantidad(typeof v === 'number' ? v : '')}
          />
          <TextInput
            label="Observación"
            placeholder="Por ejemplo: conteo inicial"
            value={conteoObs}
            onChange={(e) => setConteoObs(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setContando(false)}>
              Cerrar
            </Button>
            <Button
              loading={contar.isPending}
              disabled={!conteoProducto || conteoCantidad === ''}
              onClick={() =>
                contar.mutate(
                  {
                    productoId: conteoProducto!,
                    cantidad: Number(conteoCantidad),
                    observacion: conteoObs.trim() || null,
                    deposito: config.numero,
                  },
                  {
                    // Queda abierto para seguir contando el siguiente producto.
                    onSuccess: () => {
                      setConteoProducto(null);
                      setConteoCantidad('');
                    },
                  },
                )
              }
            >
              Registrar conteo
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title={sentido === 'entra' ? 'Registrar entrada' : 'Registrar salida'}
        centered
        radius="md"
      >
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            value={sentido}
            onChange={(v) => {
              const s = v as 'entra' | 'sale';
              setSentido(s);
              setTipo(s === 'entra' ? 'ENTRADA_DEVOLUCION' : 'SALIDA_VENTA');
            }}
            data={[
              { label: 'Entra', value: 'entra' },
              { label: 'Sale', value: 'sale' },
            ]}
          />

          <Select
            label="Motivo del movimiento"
            withAsterisk
            data={delSentido.map((t) => ({ value: t.value, label: t.label }))}
            value={tipo}
            onChange={(v) => v && setTipo(v)}
          />

          <Select
            label="Producto"
            withAsterisk
            searchable
            nothingFoundMessage="Sin coincidencias"
            data={(productos.data ?? []).map((x) => ({ value: x.id, label: x.nombre }))}
            value={productoId}
            onChange={setProductoId}
          />

          <NumberInput
            label="Cantidad"
            withAsterisk
            description="Siempre en positivo. El signo lo pone el sistema según el motivo."
            min={1}
            hideControls
            value={cantidad}
            onChange={(v) => setCantidad(typeof v === 'number' ? v : '')}
          />

          <TextInput
            label="Lote"
            description="El que figura en el envase. Es lo que permite alcanzar esta mercadería en un retiro."
            value={lote}
            onChange={(e) => setLote(e.currentTarget.value)}
          />

          <Textarea
            label="Observaciones"
            withAsterisk={exigeMotivo}
            description={
              exigeMotivo
                ? 'Un ajuste o descarte sin explicación es un descuadre escondido.'
                : undefined
            }
            autosize
            minRows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              loading={registrar.isPending}
              disabled={
                !productoId ||
                typeof cantidad !== 'number' ||
                cantidad <= 0 ||
                (exigeMotivo && !motivo.trim())
              }
            >
              Registrar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function UltimosMovimientos({
  filas,
  cargando,
}: {
  filas: NonNullable<ReturnType<typeof useMovimientosPuntoVenta>['data']>;
  cargando: boolean;
}) {
  if (cargando) return <Skeleton h={160} />;
  if (filas.length === 0) return null;

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm" c="dimmed">
        Últimos movimientos
      </Text>
      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Motivo</Table.Th>
                <Table.Th>Lote</Table.Th>
                <Table.Th ta="right">Cantidad</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.slice(0, 40).map((m) => {
                const entra = Number(m.cantidad) > 0;
                return (
                  <Table.Tr key={m.id}>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {new Date(m.ocurrido_en).toLocaleDateString('es-AR')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{m.producto?.nombre ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        radius="sm"
                        color={entra ? 'estadoAprobado' : 'violeta'}
                      >
                        {m.tipo.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {m.lote_texto ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text
                        size="sm"
                        ff="monospace"
                        fw={600}
                        c={entra ? 'estadoAprobado.7' : 'inherit'}
                      >
                        {entra ? '+' : ''}
                        {numero(Number(m.cantidad), 0)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Stack>
  );
}

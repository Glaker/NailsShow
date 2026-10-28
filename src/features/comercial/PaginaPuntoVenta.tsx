import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconBuildingStore,
  IconClipboardCheck,
  IconFileText,
  IconInfoCircle,
  IconPackage,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { useDepositos, useProductos } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import {
  TIPOS_MOVIMIENTO_PT,
  TIPOS_PT_CON_MOTIVO,
  useMovimientosPuntoVenta,
  useRegistrarMovimientoPt,
  useStockPtLotes,
  useStockPuntoVenta,
} from '@/lib/consultasComercial';
import { useRegistrarConteoPt } from '@/lib/consultasStockSeguridad';
import { type DepositoPt, useTransferirPt } from '@/lib/consultasCalle5';
import { ModalRemito, ModalRemitosEmitidos } from './Remito';
import { PanelCalle5 } from './Calle5';

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

const BERNA: ConfigDeposito = {
  numero: 'BER',
  titulo: 'Berna',
  descripcion: 'Stock de producto terminado en Berna. A Berna va solo lo liberado.',
  unidadesEn: 'Unidades en Berna',
  vacioTitulo: 'Berna todavía no tiene stock',
  vacioDescripcion: 'Empezá por el conteo inicial o enviá desde la fábrica.',
};

/** Los depósitos de producto terminado, en el orden de los cuadraditos. */
const DEPOSITOS_PT = [
  { config: FABRICA, nombre: 'Fábrica', color: 'blue' },
  { config: CALLE5, nombre: 'Calle 5', color: 'teal' },
  { config: BERNA, nombre: 'Berna', color: 'grape' },
];

/**
 * Producto terminado por depósito (pedido del 2026-10-22): un cuadradito por
 * depósito, como los de tercerizados, y debajo la pantalla del elegido. El
 * elegido va en la URL (`dep`) para que un enlace lleve a él.
 */
export function PaginaDepositos() {
  const [params, setParams] = useSearchParams();
  const depositos = useDepositos();
  const stock = useStockPuntoVenta();
  const elegido =
    DEPOSITOS_PT.find((d) => d.config.numero === params.get('dep')) ?? DEPOSITOS_PT[0]!;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="md">
        {DEPOSITOS_PT.map((d) => {
          const id = (depositos.data ?? []).find((x) => x.numero === d.config.numero)?.id;
          const filas = (stock.data ?? []).filter((f) => f.deposito_id === id);
          const unidades = filas.reduce((a, f) => a + Number(f.saldo), 0);
          const productos = filas.filter((f) => Number(f.saldo) > 0).length;
          const retenidas = filas.reduce((a, f) => a + Number(f.retenido), 0);
          const activo = d === elegido;
          return (
            <UnstyledButton
              key={d.config.numero}
              onClick={() => {
                params.set('dep', d.config.numero);
                setParams(params, { replace: true });
              }}
              aria-label={`Ver ${d.nombre}`}
              aria-pressed={activo}
            >
              <Paper
                withBorder
                radius="lg"
                className="cuadrito-tercero"
                style={{
                  borderColor: activo
                    ? `var(--mantine-color-${d.color}-6)`
                    : 'var(--superficie-borde)',
                  borderWidth: activo ? 2 : 1,
                  overflow: 'hidden',
                }}
              >
                <Box h={10} bg={`${d.color}.6`} />
                <Stack gap="sm" p="md">
                  <Text fz={22} fw={800} truncate>
                    {d.nombre}
                  </Text>
                  <SimpleGrid cols={3} spacing="xs">
                    <Cifra valor={unidades} etiqueta="unidades" color={d.color} />
                    <Cifra valor={productos} etiqueta="productos" color={d.color} />
                    <Cifra
                      valor={retenidas}
                      etiqueta="retenidas"
                      color="estadoEnAnalisis"
                    />
                  </SimpleGrid>
                </Stack>
              </Paper>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
      <PaginaPuntoVenta key={elegido.config.numero} config={elegido.config} />
    </Stack>
  );
}

function Cifra({
  valor,
  etiqueta,
  color,
}: {
  valor: number;
  etiqueta: string;
  color: string;
}) {
  return (
    <Stack gap={0} align="flex-start">
      <Text fz={28} lh={1} c={valor > 0 ? color : 'dimmed'} className="cifra">
        {numero(valor, 0)}
      </Text>
      <Text size="xs" c="dimmed" lh={1.2}>
        {etiqueta}
      </Text>
    </Stack>
  );
}

/**
 * Punto de venta de Calle 5.
 *
 * Pensada para usarse en el mostrador: dos acciones grandes —entró algo, salió
 * algo— y el saldo siempre a la vista. El signo del movimiento lo resuelve el
 * hook según el tipo; acá nadie escribe números negativos.
 */
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
  const esCalle5 = config.numero === 'C5';
  const transferir = useTransferirPt();
  const [enviando, setEnviando] = useState(false);
  const [envioProducto, setEnvioProducto] = useState<string | null>(null);
  const [envioCantidad, setEnvioCantidad] = useState<number | ''>('');
  const destinos = DEPOSITOS_PT.filter((d) => d.config.numero !== config.numero);
  const [envioDestino, setEnvioDestino] = useState<string>(destinos[0]!.config.numero);
  /* D-remito-1: el remito de lo que sale, con el producto y la cantidad del
     movimiento ya puestos; la clave lo arma de nuevo en cada apertura. */
  const [remito, setRemito] = useState<{
    clave: number;
    motivo: 'TRANSFERENCIA' | 'SALIDA';
    receptor: string;
    productoId: string;
    cantidad: number;
  } | null>(null);
  const [verRemitos, setVerRemitos] = useState(false);

  const deposito = (depositos.data ?? []).find((d) => d.numero === config.numero) ?? null;
  // La vista trae todos los depósitos comerciales: acá solo el de la pantalla.
  const stock = {
    isLoading: stockTodos.isLoading,
    data: (stockTodos.data ?? []).filter((f) => f.deposito_id === deposito?.id),
  };
  const movimientos = useMovimientosPuntoVenta(deposito?.id);
  const lotes = useStockPtLotes(deposito?.id);
  /* Por producto, sus lotes con saldo en este depósito (pedido del 2026-10-26). */
  const lotesDe = (productoId: string | null) =>
    (lotes.data ?? []).filter((l) => l.producto_id === productoId && Number(l.saldo) > 0);

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
  const conteoDifiere =
    Boolean(conteoProducto) &&
    conteoCantidad !== '' &&
    conteoCantidad !== saldoDe(conteoProducto);
  const retenidoDe = (id: string | null) =>
    Number(stock.data.find((f) => f.producto_id === id)?.retenido ?? 0);

  function abrir(s: 'entra' | 'sale', t?: string) {
    setSentido(s);
    setTipo(t ?? (s === 'entra' ? 'ENTRADA_DEVOLUCION' : 'SALIDA_VENTA'));
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
              variant="default"
              leftSection={<IconFileText size={18} />}
              onClick={() => setVerRemitos(true)}
            >
              Remitos
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
              variant="light"
              leftSection={<IconBuildingStore size={18} />}
              onClick={() => setEnviando(true)}
            >
              Enviar a otro depósito
            </Button>
            <Button
              size="md"
              color="azul"
              variant={esCalle5 ? 'default' : 'filled'}
              leftSection={<IconArrowUp size={18} />}
              onClick={() => abrir('sale')}
            >
              {/* En Calle 5 los pedidos se despachan enteros (ítem 21); esto queda para
                  lo que sale sin pedido: mostrador, ajuste, descarte (D-35). */}
              {esCalle5 ? 'Salida sin pedido' : 'Salió'}
            </Button>
            {esCalle5 ? (
              // Lo fallado sale como descarte, con motivo obligatorio (lo exige la
              // base): nunca se borra un movimiento, se corrige con otro (RN-54).
              <Button
                size="md"
                variant="light"
                color="red"
                leftSection={<IconArrowUp size={18} />}
                onClick={() => abrir('sale', 'SALIDA_DESCARTE')}
              >
                Sacar fallado
              </Button>
            ) : null}
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
          Lo producido entra con su lote; lo que se carga a mano lleva el lote como texto.
          Un ajuste o un descarte siempre pide motivo y no se borra: si estuvo mal, se
          corrige con otro movimiento.
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
                        {lotesDe(f.producto_id).map((l) => (
                          <Text key={l.orden_id ?? 'sin-lote'} size="xs" c="dimmed">
                            {l.numero_lote ? `Lote ${l.numero_lote}` : 'Sin lote'}
                            {l.vencimiento_texto
                              ? ` · vence ${l.vencimiento_texto}`
                              : l.vencimiento
                                ? ` · vence ${fecha(l.vencimiento)}`
                                : ''}
                            {' · '}
                            {numero(Number(l.saldo), 0)} u
                          </Text>
                        ))}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="lg" ff="monospace" fw={700}>
                          {numero(Number(f.saldo), 0)}
                        </Text>
                        {Number(f.retenido) > 0 ? (
                          <Text size="xs" c="estadoEnAnalisis">
                            {numero(Number(f.retenido), 0)} retenidas: lote sin liberar
                          </Text>
                        ) : null}
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

        {esCalle5 ? <PanelCalle5 /> : null}

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
          {/* Con diferencia, el ajuste lleva su porqué (pedido del 2026-10-22). */}
          <TextInput
            label="Motivo"
            withAsterisk={conteoDifiere}
            placeholder={
              conteoDifiere ? 'Por qué no coincide' : 'Por ejemplo: conteo inicial'
            }
            value={conteoObs}
            onChange={(e) => setConteoObs(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setContando(false)}>
              Cerrar
            </Button>
            <Button
              loading={contar.isPending}
              disabled={
                !conteoProducto ||
                conteoCantidad === '' ||
                (conteoDifiere && conteoObs.trim().length < 3)
              }
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
        opened={enviando}
        onClose={() => setEnviando(false)}
        title={`Enviar desde ${config.titulo}`}
        centered
        radius="md"
      >
        <Stack gap="md">
          <Text size="sm">
            Pasa producto terminado a otro depósito. Fuera de la fábrica va solo lo
            liberado por la DT.
          </Text>
          <SegmentedControl
            fullWidth
            value={envioDestino}
            onChange={setEnvioDestino}
            data={destinos.map((d) => ({ value: d.config.numero, label: d.nombre }))}
          />
          <Select
            label="Producto"
            searchable
            nothingFoundMessage="Sin stock en este depósito"
            data={conStock.map((f) => ({
              value: f.producto_id,
              // Fuera de la fábrica va solo lo liberado o sin lote (R-09).
              label: `${f.producto} · ${numero(Number(f.saldo) - Number(f.retenido), 0)} para enviar`,
            }))}
            value={envioProducto}
            onChange={setEnvioProducto}
          />
          <NumberInput
            label="Unidades"
            min={1}
            max={saldoDe(envioProducto) - retenidoDe(envioProducto)}
            allowDecimal={false}
            hideControls
            value={envioCantidad}
            onChange={(v) => setEnvioCantidad(typeof v === 'number' ? v : '')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEnviando(false)}>
              Cancelar
            </Button>
            <Button
              variant="default"
              leftSection={<IconFileText size={18} />}
              disabled={
                !envioProducto || typeof envioCantidad !== 'number' || envioCantidad <= 0
              }
              onClick={() =>
                envioProducto &&
                typeof envioCantidad === 'number' &&
                setRemito({
                  clave: Date.now(),
                  motivo: 'TRANSFERENCIA',
                  receptor: `Nailshow — ${destinos.find((d) => d.config.numero === envioDestino)?.nombre ?? ''}`,
                  productoId: envioProducto,
                  cantidad: envioCantidad,
                })
              }
            >
              Remito
            </Button>
            <Button
              loading={transferir.isPending}
              disabled={
                !envioProducto ||
                typeof envioCantidad !== 'number' ||
                envioCantidad <= 0 ||
                envioCantidad > saldoDe(envioProducto) - retenidoDe(envioProducto)
              }
              onClick={() =>
                envioProducto &&
                typeof envioCantidad === 'number' &&
                transferir.mutate(
                  {
                    productoId: envioProducto,
                    cantidad: envioCantidad,
                    origen: config.numero as DepositoPt,
                    destino: envioDestino as DepositoPt,
                  },
                  {
                    onSuccess: () => {
                      setEnviando(false);
                      setEnvioProducto(null);
                      setEnvioCantidad('');
                    },
                  },
                )
              }
            >
              Enviar
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
            limit={60}
            nothingFoundMessage="Sin coincidencias"
            // Código y nombre: se busca por cualquiera de los dos (pedido del 2026-10-26).
            data={(productos.data ?? []).map((x) => ({
              value: x.id,
              label: `${x.codigo_interno} · ${x.nombre}`,
            }))}
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
            label={exigeMotivo ? 'Motivo' : 'Observaciones'}
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
            {sentido === 'sale' ? (
              <Button
                variant="default"
                leftSection={<IconFileText size={18} />}
                disabled={!productoId || typeof cantidad !== 'number' || cantidad <= 0}
                onClick={() =>
                  productoId &&
                  typeof cantidad === 'number' &&
                  setRemito({
                    clave: Date.now(),
                    motivo: 'SALIDA',
                    receptor: '',
                    productoId,
                    cantidad,
                  })
                }
              >
                Remito
              </Button>
            ) : null}
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

      {remito ? (
        <ModalRemito
          key={remito.clave}
          abierto
          onCerrar={() => setRemito(null)}
          motivo={remito.motivo}
          depositoOrigenId={deposito.id}
          receptorInicial={remito.receptor}
          renglonesIniciales={[
            {
              producto_id: remito.productoId,
              codigo:
                (productos.data ?? []).find((p) => p.id === remito.productoId)
                  ?.codigo_interno ?? '',
              descripcion:
                (productos.data ?? []).find((p) => p.id === remito.productoId)?.nombre ??
                '',
              cantidad: remito.cantidad,
            },
          ]}
        />
      ) : null}
      <ModalRemitosEmitidos
        abierto={verRemitos}
        onCerrar={() => setVerRemitos(false)}
        depositoId={deposito.id}
      />
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
                        color={entra ? 'estadoAprobado' : 'azul'}
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
                        c={entra ? 'estadoAprobado' : 'inherit'}
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

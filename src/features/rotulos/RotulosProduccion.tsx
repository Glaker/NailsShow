import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  ColorInput,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconPlus, IconPrinter, IconTrash } from '@tabler/icons-react';
import QRCode from 'qrcode';
import { useProductos } from '@/lib/consultas';
import { useOrdenes, type OrdenProduccion } from '@/lib/consultasOrdenes';
import { useTerceros } from '@/lib/consultasTercerizados';
import { desdeCalendario, fecha, fechaISO, numero } from '@/lib/formato';
import { imprimirRotulo } from './imprimir';
import { RotulosInsumos } from './PlanillaRotulos';
import { textoLote } from '@/features/produccion/posicionesLoteo';

/** Solo estas tres: no se escriben (pedido del 2026-10-23). */
const ESTADOS = [
  { value: 'ETIQUETADO', label: 'Etiquetado' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'POR_REPROCESAR', label: 'Por reprocesar' },
] as const;
type EstadoPT = (typeof ESTADOS)[number]['value'];

/** Nail Show sale en magenta; cada tercero, con uno de estos. */
const MAGENTA = '#c2185b';
const COLORES_TERCEROS = [
  '#1971c2',
  '#2f9e44',
  '#e8590c',
  '#6741d9',
  '#0c8599',
  '#5c940d',
];

/** Rótulos por hoja A4, como los de insumos (global.css). */
const POR_HOJA = 8;

interface Renglon {
  clave: number;
  ordenId: string;
  codigo: string;
  producto: string;
  lote: string;
  cantidad: string;
  cliente: string;
  estado: EstadoPT;
  color: string;
  copias: number;
  /** De la orden, para el QR: no se edita. */
  vence: string;
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Box>
      <Text fz={9} fw={700} style={{ letterSpacing: 0.8, opacity: 0.7 }}>
        {etiqueta.toUpperCase()}
      </Text>
      <Text fz={14} fw={600} lh={1.25}>
        {valor || '—'}
      </Text>
    </Box>
  );
}

function Casilla({ texto }: { texto: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Box w={18} h={18} style={{ border: '2px solid #212529', borderRadius: 2 }} />
      <Text fz={13} fw={700}>
        {texto}
      </Text>
    </Group>
  );
}

/**
 * Lo que dice el QR: texto plano, sin enlace ni cuenta. Cualquier lector del
 * celular lo muestra tal cual.
 */
const textoQr = (r: Pick<Renglon, 'lote' | 'vence' | 'codigo'>) =>
  `Producido en Nail Show\nLote: ${r.lote}\nVence: ${r.vence}\nCódigo: ${r.codigo}`;

/** Rótulo de producto terminado (pedido del 2026-10-23). */
export function RotuloProduccion({ r, impreso }: { r: Renglon; impreso: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const contenido = textoQr(r);
  useEffect(() => {
    let vigente = true;
    QRCode.toDataURL(contenido, {
      margin: 0,
      width: 320,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => vigente && setQr(url))
      .catch(() => vigente && setQr(null));
    return () => {
      vigente = false;
    };
  }, [contenido]);
  const etiquetaEstado = ESTADOS.find((e) => e.value === r.estado)?.label ?? '';

  return (
    <Paper
      className="hoja-rotulo"
      radius="md"
      p={0}
      style={{ border: `3px solid ${r.color}`, overflow: 'hidden', background: '#fff' }}
    >
      <Group
        justify="space-between"
        px="md"
        py="xs"
        wrap="nowrap"
        style={{ background: r.color, color: '#fff' }}
      >
        <Text fz={26} fw={900} lh={1} style={{ letterSpacing: 1 }}>
          {etiquetaEstado.toUpperCase()}
        </Text>
        <Stack gap={0} align="flex-end">
          <Text fz={10} fw={700} style={{ letterSpacing: 1 }}>
            PRODUCTO TERMINADO
          </Text>
          <Text fz={10} fw={600}>
            NAIL SHOW SRL
          </Text>
        </Stack>
      </Group>

      <Group align="flex-start" wrap="nowrap" p="md" gap="md">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Campo etiqueta="Producto" valor={r.producto} />
          <Group gap="xl" wrap="wrap">
            <Campo etiqueta="Código" valor={r.codigo} />
            <Campo etiqueta="Lote" valor={r.lote} />
          </Group>
          <Group gap="xl" wrap="wrap">
            <Campo etiqueta="Cantidad" valor={r.cantidad} />
            <Campo etiqueta="Cliente" valor={r.cliente} />
          </Group>
        </Stack>
        <Stack gap={4} align="center">
          {qr ? (
            <img
              src={qr}
              alt="Código QR del lote"
              width={104}
              height={104}
              style={{ display: 'block' }}
            />
          ) : (
            <Box w={104} h={104} style={{ background: '#f1f3f5', borderRadius: 4 }} />
          )}
          <Text fz={8} c="dimmed" ta="center" maw={110}>
            Lote, vencimiento y código
          </Text>
        </Stack>
      </Group>

      <Group gap="lg" px="md" pb="xs" wrap="nowrap">
        <Text fz={11} fw={700} style={{ letterSpacing: 0.8, opacity: 0.7 }}>
          CONTADO:
        </Text>
        <Casilla texto="Sí" />
        <Casilla texto="No" />
      </Group>

      <Group
        justify="space-between"
        px="md"
        py={6}
        style={{ borderTop: '1px solid #dee2e6', background: '#fafafa' }}
      >
        <Text fz={9} c="dimmed">
          Impreso {impreso}
        </Text>
        <Text fz={9} c="dimmed">
          Vence {r.vence}
        </Text>
      </Group>
    </Paper>
  );
}

/**
 * Planilla de rótulos de producto terminado (pedido del 2026-10-23): arranca
 * con las órdenes del día y se agregan otras. Todo viene de la orden y se
 * puede cambiar, menos el estado, que es uno de tres. Mismo tamaño y hoja que
 * los rótulos de insumos.
 */
export function PlanillaRotulosProduccion({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const ordenes = useOrdenes();
  const productos = useProductos();
  const terceros = useTerceros();
  const [tipo, setTipo] = useState<'producto' | 'insumos'>('producto');
  const [dia, setDia] = useState<Date | null>(new Date());
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [cargado, setCargado] = useState(false);
  const [hoy] = useState(() => fecha(new Date().toISOString()));

  const listaTerceros = terceros.data ?? [];
  const desdeOrden = (o: OrdenProduccion, clave: number): Renglon => {
    const p = (productos.data ?? []).find((x) => x.id === o.producto_id);
    const i = listaTerceros.findIndex((t) => t.id === p?.tercero_id);
    const cant = o.unidades_obtenidas ?? o.cantidad_obtenida ?? o.cantidad_teorica;
    return {
      clave,
      ordenId: o.id,
      codigo: p?.codigo_interno ?? '',
      producto: p?.nombre ?? '',
      // Mismo formato que el loteo: DDMMAAAA (pedido del 2026-10-23).
      lote: textoLote(o.jornada),
      cantidad: `${numero(Number(cant), 2)} ${o.unidades_obtenidas !== null ? 'unidades' : o.unidad}`,
      cliente: i >= 0 ? listaTerceros[i]!.nombre : 'Nail Show',
      estado: 'FINALIZADO',
      color: i >= 0 ? COLORES_TERCEROS[i % COLORES_TERCEROS.length]! : MAGENTA,
      copias: 1,
      vence: o.vencimiento_texto || fecha(o.vencimiento),
    };
  };
  const delDia = (d: Date | null) =>
    (ordenes.data ?? []).filter(
      (o) => d && o.jornada === fechaISO(d) && o.estado !== 'ANULADA',
    );
  const siguiente = (rs: Renglon[]) => Math.max(0, ...rs.map((r) => r.clave)) + 1;

  // La primera vez que hay datos, las órdenes de hoy.
  if (!cargado && ordenes.data && productos.data && terceros.data) {
    setCargado(true);
    setRenglones(delDia(dia).map((o, i) => desdeOrden(o, i + 1)));
  }

  const cambiar = (clave: number, cambio: Partial<Renglon>) =>
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));
  const agregarOrden = (id: string | null) => {
    const o = (ordenes.data ?? []).find((x) => x.id === id);
    if (o) setRenglones((rs) => [...rs, desdeOrden(o, siguiente(rs))]);
  };
  const agregarDia = () =>
    setRenglones((rs) => {
      const base = siguiente(rs);
      return [...rs, ...delDia(dia).map((o, i) => desdeOrden(o, base + i))];
    });

  const rotulos = renglones.flatMap((r) =>
    Array.from({ length: Math.max(0, r.copias) }, (_, i) => ({ ...r, i })),
  );
  const total = rotulos.length;
  const hojas = Math.ceil(total / POR_HOJA);
  const nombreProducto = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';

  const imprimir = () => {
    const planilla = document.querySelector<HTMLElement>('[data-rotulo="planilla-pt"]');
    const listo = () => (planilla?.querySelectorAll('img').length ?? 0) >= total;
    const intentar = (n: number) =>
      listo() || n === 0
        ? imprimirRotulo(planilla)
        : setTimeout(() => intentar(n - 1), 150);
    intentar(20);
  };

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={<Text fw={700}>Rótulos</Text>}
      size="xl"
    >
      {/* Todos los rótulos en un lugar (pedido del 2026-10-23). */}
      <SegmentedControl
        fullWidth
        mb="md"
        value={tipo}
        onChange={(v) => setTipo(v as 'producto' | 'insumos')}
        data={[
          { value: 'producto', label: 'Producto' },
          { value: 'insumos', label: 'Insumos (cuarentena, aprobado…)' },
        ]}
      />
      {tipo === 'insumos' ? (
        <RotulosInsumos onCerrar={onCerrar} />
      ) : (
        <Stack gap="md">
          <Group align="flex-end" gap="sm" wrap="wrap">
            <DateInput
              label="Día de producción"
              value={dia}
              onChange={(v) => setDia(desdeCalendario(v))}
              valueFormat="DD/MM/YYYY"
              w={170}
            />
            <Button
              variant="light"
              onClick={agregarDia}
              disabled={delDia(dia).length === 0}
            >
              Agregar las {delDia(dia).length} del día
            </Button>
            <Select
              label="O una orden en particular"
              placeholder="Buscá por lote o producto"
              searchable
              value={null}
              onChange={agregarOrden}
              data={(ordenes.data ?? [])
                .filter((o) => o.estado !== 'ANULADA')
                .map((o) => ({
                  value: o.id,
                  label: `${textoLote(o.jornada)} · ${nombreProducto(o.producto_id)}`,
                }))}
              style={{ flex: 1, minWidth: 220 }}
            />
          </Group>

          {renglones.length === 0 ? (
            <Text size="sm" c="dimmed">
              No hay órdenes ese día. Elegí otro día o agregá una orden.
            </Text>
          ) : null}

          {renglones.map((r) => (
            <Paper
              key={r.clave}
              withBorder
              p="sm"
              radius="md"
              style={{ borderColor: 'var(--superficie-borde)' }}
            >
              <Stack gap="xs">
                <Group align="flex-end" gap="sm" wrap="wrap">
                  <TextInput
                    label="Código"
                    value={r.codigo}
                    onChange={(e) => cambiar(r.clave, { codigo: e.currentTarget.value })}
                    w={110}
                  />
                  <TextInput
                    label="Producto"
                    value={r.producto}
                    onChange={(e) =>
                      cambiar(r.clave, { producto: e.currentTarget.value })
                    }
                    style={{ flex: 1, minWidth: 180 }}
                  />
                  <TextInput
                    label="Lote"
                    value={r.lote}
                    onChange={(e) => cambiar(r.clave, { lote: e.currentTarget.value })}
                    w={150}
                  />
                </Group>
                <Group align="flex-end" gap="sm" wrap="wrap">
                  <TextInput
                    label="Cantidad"
                    value={r.cantidad}
                    onChange={(e) =>
                      cambiar(r.clave, { cantidad: e.currentTarget.value })
                    }
                    w={130}
                  />
                  <TextInput
                    label="Cliente"
                    value={r.cliente}
                    onChange={(e) => cambiar(r.clave, { cliente: e.currentTarget.value })}
                    w={160}
                  />
                  <Select
                    label="Estado"
                    data={ESTADOS}
                    value={r.estado}
                    onChange={(v) => v && cambiar(r.clave, { estado: v as EstadoPT })}
                    allowDeselect={false}
                    w={150}
                  />
                  <ColorInput
                    label="Color"
                    value={r.color}
                    onChange={(v) => cambiar(r.clave, { color: v })}
                    swatches={[MAGENTA, ...COLORES_TERCEROS]}
                    w={130}
                  />
                  <NumberInput
                    label="Cuántos"
                    min={1}
                    max={80}
                    allowDecimal={false}
                    value={r.copias}
                    onChange={(v) => cambiar(r.clave, { copias: Number(v) || 0 })}
                    w={90}
                  />
                  <ActionIcon
                    size="lg"
                    variant="subtle"
                    color="estadoRechazado"
                    aria-label="Quitar renglón"
                    onClick={() =>
                      setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))
                    }
                  >
                    <IconTrash size={18} />
                  </ActionIcon>
                </Group>
              </Stack>
            </Paper>
          ))}

          <Group justify="space-between">
            <Button
              variant="subtle"
              leftSection={<IconPlus size={16} />}
              disabled={renglones.length === 0}
              onClick={() =>
                setRenglones((rs) => [
                  ...rs,
                  { ...rs[rs.length - 1]!, clave: siguiente(rs), copias: 1 },
                ])
              }
            >
              Repetir el último
            </Button>
            <Text size="sm" c="dimmed">
              {total} {total === 1 ? 'rótulo' : 'rótulos'} · {hojas}{' '}
              {hojas === 1 ? 'hoja' : 'hojas'} A4 ({POR_HOJA} por hoja)
            </Text>
          </Group>

          {/* Vista previa achicada; se imprime lo de adentro, a tamaño real. */}
          <Box
            style={{
              zoom: 0.5,
              maxHeight: 900,
              overflow: 'auto',
              border: '1px dashed var(--superficie-borde)',
              padding: 16,
            }}
          >
            <div data-rotulo="planilla-pt" className="planilla-rotulos">
              {rotulos.map((r) => (
                <div key={`${r.clave}-${r.i}`} className="planilla-celda">
                  <RotuloProduccion r={r} impreso={hoy} />
                </div>
              ))}
            </div>
          </Box>

          <Group justify="flex-end">
            <Button variant="default" onClick={onCerrar}>
              Volver
            </Button>
            <Button
              leftSection={<IconPrinter size={18} />}
              disabled={total === 0}
              onClick={imprimir}
            >
              Imprimir {hojas} {hojas === 1 ? 'hoja' : 'hojas'}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

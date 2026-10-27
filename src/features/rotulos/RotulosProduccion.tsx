import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Autocomplete,
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
import { IconPlus, IconTrash } from '@tabler/icons-react';
import QRCode from 'qrcode';
import { useProductos } from '@/lib/consultas';
import { useOrdenes, type OrdenProduccion } from '@/lib/consultasOrdenes';
import { useTerceros } from '@/lib/consultasTercerizados';
import { desdeCalendario, fecha, fechaISO, numero } from '@/lib/formato';
import {
  CeldasInsumos,
  EditorInsumos,
  PieHoja,
  VistaHoja,
  copiasDe,
  imprimirPlanilla,
  useLotesRotulo,
  type RenglonInsumo,
} from './PlanillaRotulos';
import { NombreGrande } from './RotuloLote';
import { textoLote } from '@/features/produccion/posicionesLoteo';

/** Sugeridos; se puede escribir cualquier otro (pedido del 2026-10-26). */
const ESTADOS = ['Etiquetado', 'Aprobado', 'Por reprocesar'];

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

interface Renglon {
  clave: number;
  ordenId: string;
  codigo: string;
  producto: string;
  lote: string;
  cantidad: string;
  cliente: string;
  /** Lo que dice el encabezado, tal cual se escribió. */
  estado: string;
  color: string;
  copias: number;
  /** De la orden (o por la vida útil, sin orden); va en el QR. */
  vence: string;
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Box>
      <Text fz={12} fw={700} style={{ letterSpacing: 0.8, opacity: 0.7 }}>
        {etiqueta.toUpperCase()}
      </Text>
      <Text fz={20} fw={700} lh={1.2}>
        {valor || '—'}
      </Text>
    </Box>
  );
}

function Casilla({ texto }: { texto: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Box w={24} h={24} style={{ border: '2px solid #212529', borderRadius: 2 }} />
      <Text fz={17} fw={700}>
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
        py="sm"
        wrap="nowrap"
        style={{ background: r.color, color: '#fff' }}
      >
        <Text fz={36} fw={900} lh={1} style={{ letterSpacing: 1 }}>
          {r.estado.toUpperCase()}
        </Text>
        <Stack gap={0} align="flex-end" style={{ flexShrink: 0 }}>
          <Text fz={13} fw={700} style={{ letterSpacing: 1 }}>
            PRODUCTO TERMINADO
          </Text>
          <Text fz={13} fw={600}>
            NAIL SHOW SRL
          </Text>
        </Stack>
      </Group>

      <NombreGrande etiqueta="Producto" valor={r.producto || '—'} />

      <Group align="flex-start" wrap="nowrap" p="md" pt="xs" gap="md">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          {/* Lote y vencimiento a la vista (pedido del 2026-10-26). */}
          <Group gap="md" wrap="wrap">
            <Campo etiqueta="Lote" valor={r.lote} />
            <Campo etiqueta="Vence" valor={r.vence} />
          </Group>
          <Group gap="md" wrap="wrap">
            <Campo etiqueta="Código" valor={r.codigo} />
            <Campo etiqueta="Cantidad" valor={r.cantidad} />
          </Group>
          <Campo etiqueta="Cliente" valor={r.cliente} />
        </Stack>
        <Stack gap={4} align="center">
          {qr ? (
            <img
              src={qr}
              alt="Código QR del lote"
              width={130}
              height={130}
              style={{ display: 'block' }}
            />
          ) : (
            <Box w={130} h={130} style={{ background: '#f1f3f5', borderRadius: 4 }} />
          )}
          <Text fz={10} c="dimmed" ta="center" maw={130}>
            Lote, vencimiento y código
          </Text>
        </Stack>
      </Group>

      {/* «Contado» va en la franja de abajo: deja lugar al nombre grande. */}
      <Group
        justify="space-between"
        px="md"
        py={6}
        mt="auto"
        wrap="nowrap"
        style={{ borderTop: '1px solid #dee2e6', background: '#fafafa' }}
      >
        <Group gap="lg" wrap="nowrap">
          <Text fz={14} fw={700} style={{ letterSpacing: 0.8, opacity: 0.7 }}>
            CONTADO:
          </Text>
          <Casilla texto="Sí" />
          <Casilla texto="No" />
        </Group>
        <Text fz={11} c="dimmed">
          Impreso {impreso}
        </Text>
      </Group>
    </Paper>
  );
}

/**
 * Planilla de rótulos de producto terminado (pedido del 2026-10-23): arranca
 * con las órdenes del día y se agregan otras. Todo viene de la orden y se
 * puede cambiar, también el estado: se sugieren tres y se escribe el que haga
 * falta. Mismo tamaño y hoja que los rótulos de insumos.
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
  /* Los de insumos van en la misma hoja (pedido del 2026-10-23). */
  const [insumos, setInsumos] = useState<RenglonInsumo[]>([]);
  const lotesRotulo = useLotesRotulo();
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
      estado: 'Aprobado',
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
  /* Fuera de las órdenes (pedido del 2026-10-23): un producto del catálogo
     o lo que se escriba. Lote hoy y vencimiento por la vida útil, editables. */
  const suelto = (
    clave: number,
    producto: string,
    p?: (typeof productos.data & {})[number],
  ) => {
    const i = listaTerceros.findIndex((t) => t.id === p?.tercero_id);
    const hoy = fechaISO(new Date())!;
    const vence = p?.vida_util_meses
      ? fechaISO(
          new Date(
            new Date().getFullYear(),
            new Date().getMonth() + p.vida_util_meses,
            1,
          ),
        )!
      : null;
    return {
      clave,
      ordenId: '',
      codigo: p?.codigo_interno ?? '',
      producto,
      lote: textoLote(hoy),
      cantidad: '',
      cliente: i >= 0 ? listaTerceros[i]!.nombre : 'Nail Show',
      estado: 'Aprobado',
      color: i >= 0 ? COLORES_TERCEROS[i % COLORES_TERCEROS.length]! : MAGENTA,
      copias: 1,
      vence: vence ? `${vence.slice(5, 7)}/${vence.slice(2, 4)}` : '',
    };
  };
  const [buscado, setBuscado] = useState('');
  const agregarOtro = (v: string | null) => {
    if (!v) return;
    if (v.startsWith('prod:')) {
      const p = (productos.data ?? []).find((x) => x.id === v.slice(5));
      if (p) setRenglones((rs) => [...rs, suelto(siguiente(rs), p.nombre, p)]);
      return;
    }
    const o = (ordenes.data ?? []).find((x) => x.id === v);
    if (o) setRenglones((rs) => [...rs, desdeOrden(o, siguiente(rs))]);
  };
  const agregarDia = () =>
    setRenglones((rs) => {
      const base = siguiente(rs);
      return [...rs, ...delDia(dia).map((o, i) => desdeOrden(o, base + i))];
    });

  const rotulos = copiasDe(renglones);
  const total = rotulos.length + copiasDe(insumos).length;
  const nombreProducto = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';

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
          { value: 'producto', label: `Producto (${rotulos.length})` },
          { value: 'insumos', label: `Insumos (${copiasDe(insumos).length})` },
        ]}
      />
      <Stack gap="md">
        {tipo === 'insumos' ? (
          <EditorInsumos
            renglones={insumos}
            setRenglones={setInsumos}
            porId={lotesRotulo.porId}
            opciones={lotesRotulo.opciones}
          />
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
                label="Agregar otro"
                placeholder="Una orden, un producto o escribí lo que quieras"
                searchable
                value={null}
                onChange={agregarOtro}
                onSearchChange={setBuscado}
                data={[
                  {
                    group: 'Órdenes de producción',
                    items: (ordenes.data ?? [])
                      .filter((o) => o.estado !== 'ANULADA')
                      .map((o) => ({
                        value: o.id,
                        label: `${textoLote(o.jornada)} · ${nombreProducto(o.producto_id)}`,
                      })),
                  },
                  {
                    group: 'Sin orden: productos del catálogo',
                    items: (productos.data ?? [])
                      .filter((p) => p.activo)
                      .map((p) => ({
                        value: `prod:${p.id}`,
                        label: `${p.codigo_interno} · ${p.nombre}`,
                      })),
                  },
                ]}
                nothingFoundMessage={
                  buscado.trim() ? (
                    <Button
                      fullWidth
                      variant="light"
                      leftSection={<IconPlus size={16} />}
                      onClick={() => {
                        setRenglones((rs) => [
                          ...rs,
                          suelto(siguiente(rs), buscado.trim()),
                        ]);
                        setBuscado('');
                      }}
                    >
                      Agregar «{buscado.trim()}» sin orden
                    </Button>
                  ) : (
                    'Sin coincidencias'
                  )
                }
                style={{ flex: 1, minWidth: 260 }}
              />
            </Group>

            {renglones.length === 0 ? (
              <Text size="sm" c="dimmed">
                No hay órdenes ese día. Elegí otro día o agregá uno con «Agregar otro».
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
                      onChange={(e) =>
                        cambiar(r.clave, { codigo: e.currentTarget.value })
                      }
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
                    <TextInput
                      label="Vence"
                      placeholder="MM/AA"
                      value={r.vence}
                      onChange={(e) => cambiar(r.clave, { vence: e.currentTarget.value })}
                      w={110}
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
                      onChange={(e) =>
                        cambiar(r.clave, { cliente: e.currentTarget.value })
                      }
                      w={160}
                    />
                    <Autocomplete
                      label="Estado"
                      placeholder="Elegí o escribí"
                      data={ESTADOS}
                      value={r.estado}
                      onChange={(v) => cambiar(r.clave, { estado: v })}
                      w={170}
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
              style={{ alignSelf: 'flex-start' }}
            >
              Repetir el último
            </Button>
          </Stack>
        )}

        {/* Una sola hoja con los dos: primero producto, después insumos. */}
        <VistaHoja id="planilla-pt">
          {rotulos.map((r) => (
            <div key={`p-${r.clave}-${r.i}`} className="planilla-celda">
              <RotuloProduccion r={r} impreso={hoy} />
            </div>
          ))}
          <CeldasInsumos renglones={insumos} porId={lotesRotulo.porId} hoy={hoy} />
        </VistaHoja>
        <PieHoja
          total={total}
          onCerrar={onCerrar}
          onImprimir={() => imprimirPlanilla('[data-rotulo="planilla-pt"]', total)}
        />
      </Stack>
    </Modal>
  );
}

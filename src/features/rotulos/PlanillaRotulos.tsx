import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Box,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useLotes, type LoteVista, type Rotulo } from '@/lib/consultas';
import { useTerceros } from '@/lib/consultasTercerizados';
import { TEXTO_ESTADO } from '@/components/InsigniaEstado';
import { fecha } from '@/lib/formato';
import { RotuloLote, cantidadDelLote } from './RotuloLote';
import { imprimirRotulo } from './imprimir';

type Estado = Rotulo['estado'];

/** Los rótulos que tiene sentido tener impresos: los del circuito. */
const ESTADOS: Estado[] = ['CUARENTENA', 'EN_ANALISIS', 'APROBADO', 'RECHAZADO'];

/** Rótulos por hoja A4: dos de ancho, cuatro de alto (global.css). */
const POR_HOJA = 8;

interface Renglon {
  clave: number;
  loteId: string;
  estado: Estado;
  copias: number;
  reservado: string;
  /** Libre; arranca con la del lote. */
  cantidad: string;
}

/**
 * Planilla de rótulos (D-rotulos-1, pedido del 2026-10-22): varios rótulos
 * por hoja, de este lote y de otros, en el estado que se elija y con
 * «Reservado» para quien corresponda. Se imprimen por adelantado para no
 * volver a imprimir cuando el lote cambia de estado. Pegarlo sigue
 * dependiendo del estado real, que es el del sistema: el QR lleva a la ficha.
 */
export function PlanillaRotulos({
  abierto,
  onCerrar,
  lote,
  rotuloVigente,
  ejemplo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  lote: LoteVista;
  rotuloVigente: Rotulo | null;
  ejemplo: boolean;
}) {
  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={<Text fw={700}>Imprimir rótulos</Text>}
      size="xl"
    >
      <RotulosInsumos
        lote={lote}
        rotuloVigente={rotuloVigente}
        ejemplo={ejemplo}
        onCerrar={onCerrar}
      />
    </Modal>
  );
}

/**
 * La planilla de rótulos de insumos, sin el modal: la usan la ficha del lote
 * (con ese lote ya cargado) y «Rótulos» de Stock y Órdenes, donde se eligen
 * los lotes (pedido del 2026-10-23: todos los rótulos en un mismo lugar).
 */
export function RotulosInsumos({
  lote,
  rotuloVigente = null,
  ejemplo = false,
  onCerrar,
}: {
  lote?: LoteVista;
  rotuloVigente?: Rotulo | null;
  ejemplo?: boolean;
  onCerrar: () => void;
}) {
  const lotes = useLotes();
  const terceros = useTerceros();
  const renglonDe = (l: LoteVista, clave: number, estado?: Estado): Renglon => ({
    clave,
    loteId: l.id!,
    estado:
      estado ??
      (ESTADOS.includes(l.estado as Estado) ? (l.estado as Estado) : 'CUARENTENA'),
    copias: 1,
    reservado: '',
    cantidad: cantidadDelLote(l),
  });
  const [renglones, setRenglones] = useState<Renglon[]>(() =>
    lote ? [renglonDe(lote, 0, rotuloVigente?.estado ?? undefined)] : [],
  );
  const [hoy] = useState(() => fecha(new Date().toISOString()));

  const porId = new Map((lotes.data ?? []).map((x) => [x.id!, x]));
  if (lote) porId.set(lote.id!, lote);
  const opcionesLote = [...porId.values()].map((x) => ({
    value: x.id!,
    label: `${x.numero_registro_interno ?? ''} · ${x.insumo_nombre ?? ''}`,
  }));
  const reservas = ['Nail Show', ...(terceros.data ?? []).map((t) => t.nombre)];

  const cambiar = (clave: number, cambio: Partial<Renglon>) =>
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));
  const siguiente = (rs: Renglon[]) => Math.max(0, ...rs.map((r) => r.clave)) + 1;
  const agregar = () =>
    setRenglones((rs) =>
      rs.length
        ? [...rs, { ...rs[rs.length - 1]!, clave: siguiente(rs), copias: 1 }]
        : rs,
    );
  const agregarLote = (id: string | null) => {
    const l = id ? porId.get(id) : undefined;
    if (l) setRenglones((rs) => [...rs, renglonDe(l, siguiente(rs))]);
  };

  const rotulos = renglones.flatMap((r) =>
    Array.from({ length: Math.max(0, r.copias) }, (_, i) => ({ ...r, i })),
  );
  const total = rotulos.length;
  const hojas = Math.ceil(total / POR_HOJA);

  const imprimir = () => {
    const planilla = document.querySelector<HTMLElement>('[data-rotulo="planilla"]');
    // Los QR se generan aparte: se espera a que estén todos.
    const listo = () => (planilla?.querySelectorAll('img').length ?? 0) >= total;
    const intentar = (n: number) =>
      listo() || n === 0
        ? imprimirRotulo(planilla)
        : setTimeout(() => intentar(n - 1), 150);
    intentar(20);
  };

  return (
    <Stack gap="md">
      <Select
        label="Agregar un lote"
        placeholder="Buscá por número interno o insumo"
        searchable
        value={null}
        onChange={agregarLote}
        data={opcionesLote}
      />
      {renglones.length === 0 ? (
        <Text size="sm" c="dimmed">
          Elegí un lote para armar sus rótulos (cuarentena, en análisis, aprobado o
          rechazado).
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
          <Group align="flex-end" gap="sm" wrap="wrap">
            <Select
              label="Lote"
              data={opcionesLote}
              value={r.loteId}
              onChange={(v) => {
                const otro = v ? porId.get(v) : undefined;
                if (v)
                  cambiar(r.clave, {
                    loteId: v,
                    cantidad: otro ? cantidadDelLote(otro) : '',
                  });
              }}
              searchable
              allowDeselect={false}
              style={{ flex: 2, minWidth: 220 }}
            />
            <Select
              label="Rótulo"
              data={ESTADOS.map((e) => ({ value: e, label: TEXTO_ESTADO[e] }))}
              value={r.estado}
              onChange={(v) => v && cambiar(r.clave, { estado: v as Estado })}
              allowDeselect={false}
              w={150}
            />
            <NumberInput
              label="Cuántos"
              min={1}
              max={80}
              allowDecimal={false}
              value={r.copias}
              onChange={(v) => cambiar(r.clave, { copias: Number(v) || 0 })}
              w={100}
            />
            <TextInput
              label="Cantidad"
              placeholder="Vacío: no la muestra"
              value={r.cantidad}
              onChange={(e) => cambiar(r.clave, { cantidad: e.currentTarget.value })}
              w={130}
            />
            <Autocomplete
              label="Reservado"
              placeholder="Vacío: se completa a mano"
              data={reservas}
              value={r.reservado}
              onChange={(v) => cambiar(r.clave, { reservado: v })}
              style={{ flex: 1, minWidth: 160 }}
            />
            <ActionIcon
              size="lg"
              variant="subtle"
              color="estadoRechazado"
              aria-label="Quitar renglón"
              disabled={Boolean(lote) && renglones.length === 1}
              onClick={() => setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        </Paper>
      ))}

      <Group justify="space-between">
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={agregar}
          disabled={renglones.length === 0}
        >
          Repetir el último
        </Button>
        <Text size="sm" c="dimmed">
          {total} {total === 1 ? 'rótulo' : 'rótulos'} · {hojas}{' '}
          {hojas === 1 ? 'hoja' : 'hojas'} A4 ({POR_HOJA} por hoja)
        </Text>
      </Group>

      {renglones.some((r) => r.estado !== porId.get(r.loteId)?.estado) ? (
        <Alert color="estadoCuarentena" variant="light">
          Hay rótulos de un estado que el lote todavía no tiene. Se guardan y se pegan
          recién cuando el sistema lo marque así.
        </Alert>
      ) : null}

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
        <div data-rotulo="planilla" className="planilla-rotulos">
          {rotulos.map((r) => {
            const l = porId.get(r.loteId);
            return l ? (
              <div key={`${r.clave}-${r.i}`} className="planilla-celda">
                <RotuloLote
                  lote={l}
                  rotulo={{
                    estado: r.estado,
                    version_formato: rotuloVigente?.version_formato ?? '01',
                    emitido_en: rotuloVigente?.emitido_en ?? new Date().toISOString(),
                  }}
                  ejemplo={ejemplo && r.loteId === lote?.id}
                  reservado={r.reservado.trim()}
                  cantidad={r.cantidad.trim()}
                  impreso={hoy}
                />
              </div>
            ) : null;
          })}
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
  );
}

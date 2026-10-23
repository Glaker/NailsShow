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
export const POR_HOJA = 8;

export interface RenglonInsumo {
  clave: number;
  loteId: string;
  estado: Estado;
  copias: number;
  reservado: string;
  /** Libre; arranca con la del lote. */
  cantidad: string;
}

export function renglonInsumo(
  l: LoteVista,
  clave: number,
  estado?: Estado,
): RenglonInsumo {
  return {
    clave,
    loteId: l.id!,
    estado:
      estado ??
      (ESTADOS.includes(l.estado as Estado) ? (l.estado as Estado) : 'CUARENTENA'),
    copias: 1,
    reservado: '',
    cantidad: cantidadDelLote(l),
  };
}

/** Los lotes que se pueden rotular, por id y como opciones del selector. */
export function useLotesRotulo(lote?: LoteVista) {
  const lotes = useLotes();
  const porId = new Map((lotes.data ?? []).map((x) => [x.id!, x]));
  if (lote) porId.set(lote.id!, lote);
  const opciones = [...porId.values()].map((x) => ({
    value: x.id!,
    label: `${x.numero_registro_interno ?? ''} · ${x.insumo_nombre ?? ''}`,
  }));
  return { porId, opciones };
}

/** Las copias de cada renglón, una por rótulo. */
export const copiasDe = <T extends { copias: number }>(rs: T[]) =>
  rs.flatMap((r) =>
    Array.from({ length: Math.max(0, r.copias) }, (_, i) => ({ ...r, i })),
  );

/** Los renglones de insumos: qué lote, qué rótulo, cuántos y lo demás. */
export function EditorInsumos({
  renglones,
  setRenglones,
  porId,
  opciones,
  fijo,
}: {
  renglones: RenglonInsumo[];
  setRenglones: (f: (rs: RenglonInsumo[]) => RenglonInsumo[]) => void;
  porId: Map<string, LoteVista>;
  opciones: { value: string; label: string }[];
  /** El lote de la ficha: su renglón no se quita si es el único. */
  fijo?: string;
}) {
  const terceros = useTerceros();
  const reservas = ['Nail Show', ...(terceros.data ?? []).map((t) => t.nombre)];
  const cambiar = (clave: number, cambio: Partial<RenglonInsumo>) =>
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));
  const siguiente = (rs: RenglonInsumo[]) => Math.max(0, ...rs.map((r) => r.clave)) + 1;
  const agregarLote = (id: string | null) => {
    const l = id ? porId.get(id) : undefined;
    if (l) setRenglones((rs) => [...rs, renglonInsumo(l, siguiente(rs))]);
  };

  return (
    <Stack gap="md">
      <Select
        label="Agregar un lote"
        placeholder="Buscá por número interno o insumo"
        searchable
        value={null}
        onChange={agregarLote}
        data={opciones}
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
              data={opciones}
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
              disabled={r.loteId === fijo && renglones.length === 1}
              onClick={() => setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        </Paper>
      ))}
      {renglones.length > 0 ? (
        <Button
          variant="subtle"
          leftSection={<IconPlus size={16} />}
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
      ) : null}
      {renglones.some((r) => r.estado !== porId.get(r.loteId)?.estado) ? (
        <Alert color="estadoCuarentena" variant="light">
          Hay rótulos de un estado que el lote todavía no tiene. Se guardan y se pegan
          recién cuando el sistema lo marque así.
        </Alert>
      ) : null}
    </Stack>
  );
}

/** Las celdas de los rótulos de insumos para la hoja (una por copia). */
export function CeldasInsumos({
  renglones,
  porId,
  hoy,
  rotuloVigente = null,
  ejemploDe,
}: {
  renglones: RenglonInsumo[];
  porId: Map<string, LoteVista>;
  hoy: string;
  rotuloVigente?: Rotulo | null;
  /** El lote marcado SOLO EJEMPLO, si lo hay. */
  ejemploDe?: string;
}) {
  return (
    <>
      {copiasDe(renglones).map((r) => {
        const l = porId.get(r.loteId);
        return l ? (
          <div key={`i-${r.clave}-${r.i}`} className="planilla-celda">
            <RotuloLote
              lote={l}
              rotulo={{
                estado: r.estado,
                version_formato: rotuloVigente?.version_formato ?? '01',
                emitido_en: rotuloVigente?.emitido_en ?? new Date().toISOString(),
              }}
              ejemplo={r.loteId === ejemploDe}
              reservado={r.reservado.trim()}
              cantidad={r.cantidad.trim()}
              impreso={hoy}
            />
          </div>
        ) : null;
      })}
    </>
  );
}

/** Imprime la hoja cuando están todos los QR (se generan aparte). */
export function imprimirPlanilla(selector: string, total: number) {
  const planilla = document.querySelector<HTMLElement>(selector);
  const listo = () => (planilla?.querySelectorAll('img').length ?? 0) >= total;
  const intentar = (n: number) =>
    listo() || n === 0
      ? imprimirRotulo(planilla)
      : setTimeout(() => intentar(n - 1), 150);
  intentar(20);
}

/** Vista previa achicada de la hoja; se imprime lo de adentro, a tamaño real. */
export function VistaHoja({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Box
      style={{
        zoom: 0.5,
        maxHeight: 900,
        overflow: 'auto',
        border: '1px dashed var(--superficie-borde)',
        padding: 16,
      }}
    >
      <div data-rotulo={id} className="planilla-rotulos">
        {children}
      </div>
    </Box>
  );
}

/** «N rótulos · M hojas A4» y los botones de volver e imprimir. */
export function PieHoja({
  total,
  onCerrar,
  onImprimir,
}: {
  total: number;
  onCerrar: () => void;
  onImprimir: () => void;
}) {
  const hojas = Math.ceil(total / POR_HOJA);
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        {total} {total === 1 ? 'rótulo' : 'rótulos'} · {hojas}{' '}
        {hojas === 1 ? 'hoja' : 'hojas'} A4 ({POR_HOJA} por hoja)
      </Text>
      <Group gap="sm">
        <Button variant="default" onClick={onCerrar}>
          Volver
        </Button>
        <Button
          leftSection={<IconPrinter size={18} />}
          disabled={total === 0}
          onClick={onImprimir}
        >
          Imprimir {hojas} {hojas === 1 ? 'hoja' : 'hojas'}
        </Button>
      </Group>
    </Group>
  );
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
  const { porId, opciones } = useLotesRotulo(lote);
  const [renglones, setRenglones] = useState<RenglonInsumo[]>(() => [
    renglonInsumo(lote, 0, rotuloVigente?.estado ?? undefined),
  ]);
  const [hoy] = useState(() => fecha(new Date().toISOString()));
  const total = copiasDe(renglones).length;
  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={<Text fw={700}>Imprimir rótulos</Text>}
      size="xl"
    >
      <Stack gap="md">
        <EditorInsumos
          renglones={renglones}
          setRenglones={setRenglones}
          porId={porId}
          opciones={opciones}
          fijo={lote.id!}
        />
        <VistaHoja id="planilla">
          <CeldasInsumos
            renglones={renglones}
            porId={porId}
            hoy={hoy}
            rotuloVigente={rotuloVigente}
            {...(ejemplo ? { ejemploDe: lote.id! } : {})}
          />
        </VistaHoja>
        <PieHoja
          total={total}
          onCerrar={onCerrar}
          onImprimir={() => imprimirPlanilla('[data-rotulo="planilla"]', total)}
        />
      </Stack>
    </Modal>
  );
}

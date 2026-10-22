import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPrinter, IconTag } from '@tabler/icons-react';
import { useProductos } from '@/lib/consultas';
import { useOrdenes } from '@/lib/consultasOrdenes';
import { imprimirRotulo } from '@/features/rotulos/imprimir';
import { POSICIONES_LOTEO, textoLote, textoVencimiento } from './posicionesLoteo';

/** EMU de PowerPoint a milímetros. */
const mm = (emu: number) => `${emu / 36000}mm`;

/**
 * La hoja de loteo tal cual la plantilla de la planta (pedido del 2026-10-22):
 * 72 etiquetas de 15 × 8 mm en las mismas posiciones, Calibri 8 pt, dos
 * renglones centrados y sin márgenes internos. Nada de esto se ajusta: las
 * medidas salen de «lote 20102026.pptx» (posicionesLoteo.ts y global.css).
 */
function HojaLoteo({ linea1, linea2 }: { linea1: string; linea2: string }) {
  return (
    <div data-rotulo="loteo" className="hoja-loteo">
      <div className="hoja-loteo-diapositiva">
        {POSICIONES_LOTEO.map(([x, y]) => (
          <div
            key={`${x}-${y}`}
            className="etiqueta-loteo"
            style={{ left: mm(x), top: mm(y) }}
          >
            {linea1}
            <br />
            {linea2}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Editar los dos renglones (cambian las 72 a la vez) e imprimir la hoja. */
export function PlanillaLoteo({
  abierto,
  onCerrar,
  titulo,
  linea1Inicial,
  linea2Inicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  linea1Inicial: string;
  linea2Inicial: string;
}) {
  const [linea1, setLinea1] = useState(linea1Inicial);
  const [linea2, setLinea2] = useState(linea2Inicial);
  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={<Text fw={700}>Lotear · {titulo}</Text>}
      size="xl"
    >
      <Stack gap="md">
        <Group grow align="flex-start">
          <TextInput
            label="Primer renglón"
            description="Fecha del lote, DDMMAAAA"
            value={linea1}
            onChange={(e) => setLinea1(e.currentTarget.value)}
            size="md"
          />
          <TextInput
            label="Segundo renglón"
            description="Vencimiento, v:MM/AA. Podés sumarle, por ejemplo, «P1»."
            value={linea2}
            onChange={(e) => setLinea2(e.currentTarget.value)}
            size="md"
          />
        </Group>
        <Text size="sm" c="dimmed">
          Cambia en las 72 etiquetas de la hoja. Imprimí en A4, al 100 % (sin «ajustar a
          la página»).
        </Text>
        {/* Vista previa achicada; se imprime lo de adentro, a tamaño real. */}
        <Box
          style={{
            zoom: 0.55,
            border: '1px dashed var(--superficie-borde)',
            alignSelf: 'center',
            background: '#fff',
          }}
        >
          <HojaLoteo linea1={linea1} linea2={linea2} />
        </Box>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Volver
          </Button>
          <Button
            leftSection={<IconPrinter size={18} />}
            onClick={() =>
              imprimirRotulo(document.querySelector<HTMLElement>('[data-rotulo="loteo"]'))
            }
          >
            Imprimir
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Lo que abre la planilla para una orden: lote y vencimiento de la orden. */
export interface OrdenALotear {
  id: string;
  jornada: string;
  vencimiento: string;
  numero_lote: string;
  producto: string;
}

export function BotonLotear({ orden }: { orden: OrdenALotear }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button
        variant="light"
        leftSection={<IconTag size={18} />}
        onClick={() => setAbierto(true)}
      >
        Lotear
      </Button>
      {abierto ? (
        <PlanillaLoteo
          abierto
          onCerrar={() => setAbierto(false)}
          titulo={`${orden.producto} · ${orden.numero_lote}`}
          linea1Inicial={textoLote(orden.jornada)}
          linea2Inicial={textoVencimiento(orden.vencimiento)}
        />
      ) : null}
    </>
  );
}

/**
 * «Lotear» en el tablero de Gerencia de Producción: una fila por orden en
 * producción (abierta), con su botón. Arriba, para encontrarlo rápido.
 */
export function PanelLoteo() {
  const ordenes = useOrdenes();
  const productos = useProductos();
  const nombre = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const abiertas = (ordenes.data ?? []).filter((o) => o.estado === 'ABIERTA');
  return (
    <Paper withBorder p="lg" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group gap="sm" mb="sm">
        <IconTag size={22} />
        <Title order={3}>Lotear</Title>
        <Badge variant="light" radius="sm" size="lg">
          {abiertas.length}
        </Badge>
      </Group>
      {abiertas.length === 0 ? (
        <Text size="sm" c="dimmed">
          No hay órdenes en producción. Cuando abras una, su loteo aparece acá.
        </Text>
      ) : (
        <Stack gap="xs">
          {abiertas.map((o) => (
            <Group key={o.id} justify="space-between" wrap="nowrap">
              <div>
                <Text fw={600}>{nombre(o.producto_id)}</Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  {o.numero} · lote {o.numero_lote}
                </Text>
              </div>
              <BotonLotear
                orden={{
                  id: o.id,
                  jornada: o.jornada,
                  vencimiento: o.vencimiento,
                  numero_lote: o.numero_lote,
                  producto: nombre(o.producto_id),
                }}
              />
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

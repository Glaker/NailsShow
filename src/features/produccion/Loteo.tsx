import { useState } from 'react';
import {
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  UnstyledButton,
  TextInput,
} from '@mantine/core';
import { IconPrinter, IconTag } from '@tabler/icons-react';
import { imprimirRotulo } from '@/features/rotulos/imprimir';
import { POSICIONES_LOTEO, textoLote, textoVencimiento } from './posicionesLoteo';
import { fechaISO } from '@/lib/formato';

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

/** Hoy en ISO (día local), para el texto por defecto. */
const hoyISO = () => fechaISO(new Date())!;

/**
 * «Lotear» en el tablero (pedido del 2026-10-22): una tarjeta chica que abre la
 * hoja directamente, sin orden de producción. Por defecto, el lote es hoy y el
 * vencimiento a dos años; los dos renglones se editan antes de imprimir.
 */
export function TarjetaLotear() {
  const [abierto, setAbierto] = useState(false);
  const [hoy, setHoy] = useState(hoyISO);
  const vence = `${Number(hoy.slice(0, 4)) + 2}${hoy.slice(4)}`;
  return (
    <>
      <UnstyledButton
        onClick={() => {
          setHoy(hoyISO());
          setAbierto(true);
        }}
        className="tarjeta-enlace"
        w={{ base: '100%', xs: 240 }}
      >
        <Paper
          withBorder
          p="md"
          radius="md"
          style={{ borderColor: 'var(--superficie-borde)' }}
        >
          <Group gap="sm" wrap="nowrap">
            <IconTag size={28} />
            <div>
              <Text fw={700} fz="lg">
                Lotear
              </Text>
              <Text size="xs" c="dimmed">
                Imprimir la hoja de etiquetas de lote
              </Text>
            </div>
          </Group>
        </Paper>
      </UnstyledButton>
      {abierto ? (
        <PlanillaLoteo
          abierto
          onCerrar={() => setAbierto(false)}
          titulo="hoja de etiquetas"
          linea1Inicial={textoLote(hoy)}
          linea2Inicial={textoVencimiento(vence)}
        />
      ) : null}
    </>
  );
}

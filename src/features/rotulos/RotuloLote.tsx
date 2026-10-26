import { useEffect, useState } from 'react';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import QRCode from 'qrcode';
import type { LoteVista, Rotulo } from '@/lib/consultas';
import { fecha, fechaHora, numero } from '@/lib/formato';
import { TEXTO_ESTADO } from '@/components/InsigniaEstado';
import type { Database } from '@/lib/database.types';
import { MarcaEjemplo } from '@/components/MarcaEjemplo';

type EstadoCalidad = Database['gmp']['Enums']['estado_calidad_enum'];

/**
 * Colores del rótulo impreso.
 *
 * Estos son los cuatro colores de I.20.2 en su forma más saturada, porque el
 * rótulo se imprime y se pega en un tambor: no es una insignia de pantalla, es
 * la señal que alguien va a ver a tres metros en un depósito. La fuente de
 * verdad sigue siendo `gmp.color_rotulo()` en la base; esto es su tinta.
 */
const TINTA: Record<EstadoCalidad, { fondo: string; texto: string; borde: string }> = {
  RECIBIDO: { fondo: '#f1f3f5', texto: '#212529', borde: '#adb5bd' },
  CUARENTENA: { fondo: '#ffd43b', texto: '#5c3d00', borde: '#e67700' },
  MUESTREADO: { fondo: '#f1f3f5', texto: '#212529', borde: '#adb5bd' },
  EN_ANALISIS: { fondo: '#dee2e6', texto: '#212529', borde: '#868e96' },
  APROBADO: { fondo: '#51cf66', texto: '#0b3d18', borde: '#2b8a3e' },
  RECHAZADO: { fondo: '#fa5252', texto: '#4d0505', borde: '#c92a2a' },
  // AZUL de gmp.color_rotulo(): saldo de apertura, sin lote identificado.
  SALDO_APERTURA: { fondo: '#74c0fc', texto: '#0b2e4f', borde: '#1971c2' },
};

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Box>
      <Text fz={12} fw={700} style={{ letterSpacing: 0.8, opacity: 0.7 }}>
        {etiqueta.toUpperCase()}
      </Text>
      <Text fz={20} fw={700} lh={1.2}>
        {valor}
      </Text>
    </Box>
  );
}

interface Props {
  lote: LoteVista;
  rotulo: Pick<Rotulo, 'estado' | 'version_formato' | 'emitido_en'>;
  /** Lote bloqueado como EJEMPLO: lleva la marca de agua. */
  ejemplo?: boolean;
  /**
   * Para quién está reservado el material (pedido del 2026-10-22). Ausente,
   * no hay renglón; vacío, queda la línea para escribirlo a mano.
   */
  reservado?: string;
  /**
   * Cantidad que dice el rótulo (pedido del 2026-10-23). Ausente, la del lote;
   * desde la planilla se escribe libre (por ejemplo, la de un bulto).
   */
  cantidad?: string;
  /**
   * Impreso desde la planilla (D-rotulos-1): el pie dice cuándo se imprimió,
   * no cuándo se emitió, porque puede ser un estado que el lote todavía no
   * tiene.
   */
  impreso?: string;
}

/**
 * Rótulo R.20.2.1 v01, listo para imprimir.
 *
 * Los campos son los del registro, en el orden del registro: nombre, n° de lote
 * del proveedor, proveedor, n° interno/código, plazo de validez y estatus. El
 * QR lleva a la ficha del lote en el sistema, que es lo que convierte a un
 * cartel pegado en un tambor en una entrada de trazabilidad consultable desde
 * el teléfono, sin tipear un número de veinte caracteres con guantes puestos.
 */
/** La cantidad del lote como la lee planta: «25 kg». */
export function cantidadDelLote(
  lote: Pick<LoteVista, 'cantidad_unidades' | 'unidad'>,
): string {
  return lote.cantidad_unidades === null || lote.cantidad_unidades === undefined
    ? ''
    : `${numero(lote.cantidad_unidades, 3)} ${lote.unidad ?? ''}`.trim();
}

export function RotuloLote({
  lote,
  rotulo,
  ejemplo = false,
  reservado,
  impreso,
  cantidad,
}: Props) {
  const textoCantidad = cantidad ?? cantidadDelLote(lote);
  const [qr, setQr] = useState<string | null>(null);
  const estado = rotulo.estado;
  const tinta = TINTA[estado];

  useEffect(() => {
    let vigente = true;
    const destino = `${window.location.origin}/lotes/${lote.id}`;
    QRCode.toDataURL(destino, {
      margin: 0,
      width: 320,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (vigente) setQr(url);
      })
      .catch(() => {
        if (vigente) setQr(null);
      });
    return () => {
      vigente = false;
    };
  }, [lote.id]);

  return (
    <Paper
      className="hoja-rotulo"
      radius="md"
      p={0}
      style={{
        border: `3px solid ${tinta.borde}`,
        overflow: 'hidden',
        background: '#fff',
        position: 'relative',
      }}
    >
      {ejemplo ? <MarcaEjemplo /> : null}
      <Group
        justify="space-between"
        px="md"
        py="sm"
        wrap="nowrap"
        style={{ background: tinta.fondo, color: tinta.texto }}
      >
        <Text fz={36} fw={900} lh={1} style={{ letterSpacing: 1 }}>
          {TEXTO_ESTADO[estado].toUpperCase()}
        </Text>
        <Stack gap={0} align="flex-end">
          <Text fz={13} fw={700} style={{ letterSpacing: 1 }}>
            R.20.2.1 v{rotulo.version_formato}
          </Text>
          <Text fz={13} fw={600}>
            NAIL SHOW SRL
          </Text>
        </Stack>
      </Group>

      <Group align="flex-start" wrap="nowrap" p="md" gap="md">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Campo etiqueta="Nombre" valor={lote.insumo_nombre ?? '—'} />
          <Campo
            etiqueta="N° interno / código"
            valor={`${lote.numero_registro_interno ?? '—'} · ${lote.codigo_interno ?? '—'}`}
          />
          <Group gap="md" wrap="wrap">
            <Campo etiqueta="N° lote proveedor" valor={lote.lote_proveedor ?? '—'} />
            <Campo
              etiqueta="Plazo de validez"
              valor={lote.plazo_validez ? fecha(lote.plazo_validez) : 'No indicado'}
            />
          </Group>
          <Group gap="md" wrap="wrap">
            <Campo etiqueta="Proveedor" valor={lote.proveedor ?? '—'} />
            {textoCantidad ? <Campo etiqueta="Cantidad" valor={textoCantidad} /> : null}
          </Group>
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
            Escaneá para ver la ficha del lote
          </Text>
        </Stack>
      </Group>

      {reservado !== undefined ? (
        <Group gap={6} px="md" pb="xs" wrap="nowrap" align="flex-end">
          <Text fz={14} fw={700} style={{ letterSpacing: 0.8, opacity: 0.7 }}>
            RESERVADO:
          </Text>
          <Text
            fz={20}
            fw={700}
            lh={1.2}
            style={{ flex: 1, borderBottom: '1px solid #868e96', minHeight: 26 }}
          >
            {reservado}
          </Text>
        </Group>
      ) : null}

      <Group
        justify="space-between"
        px="md"
        py={6}
        mt="auto"
        style={{ borderTop: '1px solid #dee2e6', background: '#fafafa' }}
      >
        <Text fz={11} c="dimmed">
          {impreso ? `Impreso ${impreso}` : `Emitido ${fechaHora(rotulo.emitido_en)}`}
        </Text>
        <Text fz={11} c="dimmed">
          Adherir al cuerpo del recipiente, nunca a la tapa (I.20.2)
        </Text>
      </Group>
    </Paper>
  );
}

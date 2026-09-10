import { useEffect, useState } from 'react';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import QRCode from 'qrcode';
import type { MuestreoVista } from '@/lib/consultas';
import { fechaHora, numero } from '@/lib/formato';

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Box>
      <Text fz={9} fw={700} style={{ letterSpacing: 0.8, opacity: 0.7 }}>
        {etiqueta.toUpperCase()}
      </Text>
      <Text fz={13} fw={600} lh={1.25}>
        {valor}
      </Text>
    </Box>
  );
}

/**
 * Etiqueta R.50.4.1, la que acompaña a la muestra hasta el laboratorio.
 *
 * Los campos son los del registro, en su orden: material muestreado, n°
 * interno/código, n° de lote del proveedor, responsable de la toma y fecha de
 * la toma.
 *
 * No lleva ninguno de los cuatro colores de I.20.2 y eso es deliberado: I.20.2
 * define esos colores para comunicar el estado de calidad de un material, y
 * esto identifica una muestra. Pintarla de amarillo diría algo que el POE no
 * dijo, y en planta el color es justamente lo que se lee de lejos.
 */
export function EtiquetaMuestreo({ muestreo }: { muestreo: MuestreoVista }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const destino = `${window.location.origin}/lotes/${muestreo.entidad_id}`;
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
  }, [muestreo.entidad_id]);

  return (
    <Paper
      className="hoja-rotulo"
      radius="md"
      p={0}
      style={{ border: '3px solid #495057', overflow: 'hidden', background: '#fff' }}
    >
      <Group
        justify="space-between"
        px="md"
        py="xs"
        wrap="nowrap"
        style={{ background: '#f1f3f5', color: '#212529' }}
      >
        <Text fz={19} fw={900} lh={1} style={{ letterSpacing: 1 }}>
          MUESTRA
        </Text>
        <Stack gap={0} align="flex-end">
          <Text fz={10} fw={700} style={{ letterSpacing: 1 }}>
            R.50.4.1 · {muestreo.numero}
          </Text>
          <Text fz={10} fw={600}>
            NAIL SHOW SRL
          </Text>
        </Stack>
      </Group>

      <Group align="flex-start" wrap="nowrap" p="md" gap="md">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Campo etiqueta="Material muestreado" valor={muestreo.insumo_nombre ?? '—'} />
          <Group gap="xl" wrap="wrap">
            <Campo
              etiqueta="N° interno / código"
              valor={`${muestreo.numero_registro_interno ?? '—'} · ${muestreo.codigo_interno ?? '—'}`}
            />
            <Campo etiqueta="N° lote proveedor" valor={muestreo.lote_proveedor ?? '—'} />
          </Group>
          <Group gap="xl" wrap="wrap">
            <Campo
              etiqueta="Responsable de la toma"
              valor={muestreo.realizado_por_nombre ?? '—'}
            />
            <Campo etiqueta="Fecha de la toma" valor={fechaHora(muestreo.fecha_hora)} />
          </Group>
          <Campo
            etiqueta="Cantidad tomada"
            valor={`${numero(muestreo.cantidad_tomada, 3)} ${muestreo.unidad ?? ''}`}
          />
        </Stack>

        <Stack gap={4} align="center">
          {qr ? (
            <img
              src={qr}
              alt="Código QR del lote muestreado"
              width={96}
              height={96}
              style={{ display: 'block' }}
            />
          ) : (
            <Box w={96} h={96} style={{ background: '#f1f3f5', borderRadius: 4 }} />
          )}
          <Text fz={8} c="dimmed" ta="center" maw={104}>
            Escaneá para ver el lote de origen
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

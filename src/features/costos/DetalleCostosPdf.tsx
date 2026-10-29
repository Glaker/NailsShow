import { Box, Group, Stack, Table, Text, Title } from '@mantine/core';
import { etiquetaUnidad, numero } from '@/lib/formato';
import type { FotoCotizacion } from '@/lib/consultasCotizador';

const pesos = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? '—' : `$ ${numero(v, d)}`;
/** Hasta `max` decimales, sin ceros de más: 88,5 y no 88,500. */
const corto = (v: number, min: number, max: number) => {
  const dec = (String(Number(v.toFixed(max))).split('.')[1] ?? '').length;
  return numero(v, Math.max(min, dec));
};
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${numero(v * 100, 1)} %`;

/**
 * Detalle de costos de la cotización, solo para la hoja de uso interno
 * (pedido del 2026-10-29). Sale de la foto que congeló la base al emitir: los
 * componentes como se costearon, mano de obra, costo, precio neto y margen. El
 * PDF del cliente (CotizacionPdf sola) no lo lleva.
 */
export function DetalleCostosPdf({ foto }: { foto: FotoCotizacion }) {
  const cantidad = foto.pdf.cantidad;
  const lineas = [...(foto.lineas ?? [])].sort((a, b) => a.orden - b.orden);
  return (
    <Box
      className="hoja-cotizacion"
      p="xl"
      maw={760}
      mx="auto"
      mt="md"
      bg="white"
      c="black"
      style={{ breakBefore: 'page' }}
    >
      <Group justify="space-between" align="baseline" mb="md">
        <Title order={3}>Detalle de costos</Title>
        <Text size="sm" fw={700}>
          USO INTERNO — no se envía a clientes
        </Text>
      </Group>
      <Text size="sm" mb="sm">
        Por unidad de producto, sin IVA, como se costeó al emitir la cotización n.º{' '}
        {foto.pdf.numero}/{foto.pdf.anio}.
      </Text>

      <Table withTableBorder withColumnBorders mb="md" fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Componente</Table.Th>
            <Table.Th ta="right">Cantidad</Table.Th>
            <Table.Th ta="right">Costo base</Table.Th>
            <Table.Th ta="right">Merma</Table.Th>
            <Table.Th ta="right">Subtotal</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lineas.map((l) => (
            <Table.Tr key={l.orden}>
              <Table.Td>{l.nombre}</Table.Td>
              <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                {corto(l.cantidad, 0, 3)} {etiquetaUnidad(l.unidad)}
              </Table.Td>
              <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                {l.precio_base === null ? '—' : `$ ${corto(l.precio_base, 2, 4)}`}
                {l.unidad_base ? ` / ${etiquetaUnidad(l.unidad_base)}` : ''}
              </Table.Td>
              <Table.Td ta="right">{l.merma ? pct(l.merma) : '—'}</Table.Td>
              <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                {pesos(l.subtotal)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Stack gap={4} maw={360} ml="auto">
        <Fila etiqueta="Materiales" valor={pesos(foto.costo_materiales)} />
        <Fila
          etiqueta={
            foto.minutos_por_unidad
              ? `Mano de obra (${numero(foto.minutos_por_unidad, 1)} min a ${pesos(foto.costo_hora)} la hora)`
              : 'Mano de obra'
          }
          valor={pesos(foto.mano_de_obra)}
        />
        <Fila etiqueta="Costo unitario" valor={pesos(foto.costo_unitario)} fuerte />
        <Fila etiqueta="Precio unitario neto" valor={pesos(foto.precio_unitario)} />
        <Fila etiqueta="Margen sobre precio" valor={pct(foto.margen_sobre_precio)} />
        <Fila etiqueta="Recargo sobre costo" valor={pct(foto.recargo_sobre_costo)} />
        <Fila
          etiqueta={`Ganancia por ${numero(cantidad, cantidad % 1 ? 2 : 0)} unidades`}
          valor={pesos((foto.precio_unitario - foto.costo_unitario) * cantidad)}
          fuerte
        />
      </Stack>
    </Box>
  );
}

function Fila({
  etiqueta,
  valor,
  fuerte = false,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <Group justify="space-between" gap="md">
      <Text size="sm">{etiqueta}</Text>
      <Text size="sm" fw={fuerte ? 700 : 400}>
        {valor}
      </Text>
    </Group>
  );
}

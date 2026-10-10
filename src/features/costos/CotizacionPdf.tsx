import { Box, Group, Stack, Table, Text, Title } from '@mantine/core';
import { fecha, numero } from '@/lib/formato';
import { MODO_PRACTICA } from '@/lib/practica';
import type { DatosPdf } from '@/lib/consultasCotizador';

/**
 * Hoja de la cotización para el cliente. Recibe SÓLO el bloque `pdf` de la
 * foto que guardó la base al emitir: costos, márgenes y composición no llegan
 * acá ni por error (lo verifica CotizacionPdf.test.tsx). Se imprime o se
 * guarda como PDF desde el navegador; lo envía quien cotizó.
 */
export function CotizacionPdf({ datos, marcaPractica = MODO_PRACTICA }: { datos: DatosPdf; marcaPractica?: boolean }) {
  const pesos = (v: number) => `$ ${numero(v, 2)}`;
  const contenido =
    datos.contenido_cantidad !== null && datos.contenido_unidad
      ? `${numero(datos.contenido_cantidad, datos.contenido_cantidad % 1 ? 2 : 0)} ${datos.contenido_unidad}`
      : null;
  const iva =
    datos.leyenda_iva === 'MAS_IVA'
      ? 'Precios más IVA.'
      : `Precios con IVA incluido (${numero(datos.alicuota_iva, datos.alicuota_iva % 1 ? 1 : 0)} %).`;
  return (
    <Box className="hoja-cotizacion" p="xl" maw={760} mx="auto" bg="white" c="black" style={{ position: 'relative' }}>
      {marcaPractica || datos.destino === 'INTERNO' ? (
        <Text
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '42%',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 72,
            fontWeight: 800,
            color: 'rgba(0,0,0,0.07)',
            transform: 'rotate(-18deg)',
            pointerEvents: 'none',
          }}
        >
          {marcaPractica ? 'PRÁCTICA' : 'USO INTERNO'}
        </Text>
      ) : null}
      <Group justify="space-between" align="flex-start" mb="xl">
        <img src="/marca-nailshow.png" alt="Nail Show" width={84} height={84} />
        <Stack gap={2} align="flex-end">
          <Title order={2}>Cotización n.º {datos.numero}/{datos.anio}</Title>
          <Text size="sm">Fecha: {fecha(datos.fecha)}</Text>
          <Text size="sm" fw={600}>
            Válida hasta el {fecha(datos.vence_el)}
          </Text>
        </Stack>
      </Group>

      <Stack gap={2} mb="lg">
        <Text size="xs" tt="uppercase" c="gray.7">
          {datos.destino === 'INTERNO' ? 'Uso interno' : 'Cliente'}
        </Text>
        {datos.destino === 'INTERNO' ? (
          <Text fw={600}>USO INTERNO — no se envía a clientes</Text>
        ) : (
          <>
            <Text fw={600}>{datos.cliente?.razon_social}</Text>
            {datos.cliente?.documento ? <Text size="sm">CUIT / documento: {datos.cliente.documento}</Text> : null}
            {datos.cliente?.contacto ? <Text size="sm">Contacto: {datos.cliente.contacto}</Text> : null}
          </>
        )}
      </Stack>

      <Table withTableBorder withColumnBorders mb="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Producto</Table.Th>
            <Table.Th ta="right">Cantidad</Table.Th>
            <Table.Th ta="right">Precio unitario</Table.Th>
            <Table.Th ta="right">Total</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td>
              <Text fw={600}>{datos.titulo}</Text>
              {contenido ? <Text size="sm">Contenido por unidad: {contenido}</Text> : null}
            </Table.Td>
            <Table.Td ta="right">{numero(datos.cantidad, datos.cantidad % 1 ? 2 : 0)}</Table.Td>
            <Table.Td ta="right">{pesos(datos.precio_unitario)}</Table.Td>
            <Table.Td ta="right" fw={700}>
              {pesos(datos.total)}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      <Text size="sm" mb="lg">
        {iva}
      </Text>

      {datos.observaciones ? (
        <Stack gap={2} mb="lg">
          <Text size="xs" tt="uppercase" c="gray.7">
            Observaciones
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {datos.observaciones}
          </Text>
        </Stack>
      ) : null}

      <Text size="sm" mt="xl">
        Emitió: {datos.emitida_por ?? '—'} · Nail Show SRL
      </Text>
    </Box>
  );
}

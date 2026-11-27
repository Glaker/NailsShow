import { Box, Group, Stack, Table, Text, Title } from '@mantine/core';
import { fecha, numero } from '@/lib/formato';
import { MODO_PRACTICA } from '@/lib/practica';
import type { DatosPdf, ItemPdf } from '@/lib/consultasCotizador';

/**
 * Hoja de la cotización para el cliente. Recibe SÓLO el bloque `pdf` de la
 * foto que guardó la base al emitir: costos, márgenes y composición no llegan
 * acá ni por error (lo verifica CotizacionPdf.test.tsx). Se imprime o se
 * guarda como PDF desde el navegador; lo envía quien cotizó.
 */
export function CotizacionPdf({
  datos,
  marcaPractica = MODO_PRACTICA,
  interna = false,
  imagenes = [],
}: {
  datos: DatosPdf;
  marcaPractica?: boolean;
  /** Imágenes cargadas en la cotización (data URL), debajo de los productos. */
  imagenes?: string[];
  /** La hoja interna (con el detalle de costos abajo): lleva «USO INTERNO». */
  interna?: boolean;
}) {
  const pesos = (v: number) => `$ ${numero(v, 2)}`;
  const contenido = (i: ItemPdf) =>
    i.contenido_cantidad !== null && i.contenido_unidad
      ? `${numero(i.contenido_cantidad, i.contenido_cantidad % 1 ? 2 : 0)} ${i.contenido_unidad}`
      : null;
  // Con varios productos la base guarda `items`; con uno, sólo los campos sueltos.
  const items: ItemPdf[] = datos.items ?? [datos];
  const iva =
    datos.leyenda_iva === 'MAS_IVA'
      ? 'Precios más IVA.'
      : `Precios con IVA incluido (${numero(datos.alicuota_iva, datos.alicuota_iva % 1 ? 1 : 0)} %).`;
  return (
    <Box
      className="hoja-cotizacion"
      p="xl"
      maw={760}
      mx="auto"
      bg="white"
      c="black"
      style={{ position: 'relative' }}
    >
      {/* La marca va sólo en la hoja interna: el PDF para el cliente sale limpio
          aunque la cotización se haya cargado como «Uso interno». */}
      {marcaPractica || interna ? (
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
          <Title order={2}>
            Cotización n.º {datos.numero}/{datos.anio}
          </Title>
          <Text size="sm">Fecha: {fecha(datos.fecha)}</Text>
          <Text size="sm" fw={600}>
            Válida hasta el {fecha(datos.vence_el)}
          </Text>
        </Stack>
      </Group>

      {datos.cliente ? (
        <Stack gap={2} mb="lg">
          <Text size="xs" tt="uppercase" c="gray.7">
            Cliente
          </Text>
          <Text fw={600}>{datos.cliente.razon_social}</Text>
          {datos.cliente.documento ? (
            <Text size="sm">CUIT / documento: {datos.cliente.documento}</Text>
          ) : null}
          {datos.cliente.contacto ? (
            <Text size="sm">Contacto: {datos.cliente.contacto}</Text>
          ) : null}
        </Stack>
      ) : null}

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
          {items.map((i, k) => (
            <Table.Tr key={k}>
              <Table.Td>
                <Text fw={600}>{i.titulo}</Text>
                {contenido(i) ? (
                  <Text size="sm">Contenido por unidad: {contenido(i)}</Text>
                ) : null}
              </Table.Td>
              <Table.Td ta="right">{numero(i.cantidad, i.cantidad % 1 ? 2 : 0)}</Table.Td>
              <Table.Td ta="right">{pesos(i.precio_unitario)}</Table.Td>
              <Table.Td ta="right" fw={700}>
                {pesos(i.total)}
              </Table.Td>
            </Table.Tr>
          ))}
          {datos.total_general !== undefined ? (
            <Table.Tr>
              <Table.Td colSpan={3} ta="right" fw={700}>
                Total
              </Table.Td>
              <Table.Td ta="right" fw={800}>
                {pesos(datos.total_general)}
              </Table.Td>
            </Table.Tr>
          ) : null}
        </Table.Tbody>
      </Table>
      <Text size="sm" mb="lg">
        {iva}
      </Text>

      {imagenes.length ? (
        <Group gap="md" mb="lg" justify="center">
          {imagenes.map((src, k) => (
            <img
              key={k}
              src={src}
              alt=""
              style={{ maxWidth: imagenes.length === 1 ? '100%' : '48%', maxHeight: 320 }}
            />
          ))}
        </Group>
      ) : null}

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

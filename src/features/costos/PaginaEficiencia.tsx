import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Badge, Group, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconBuildingWarehouse, IconTruckDelivery } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { GraficoPareto, COLOR_CLASE } from '@/components/GraficoPareto';
import { GraficoMatriz } from '@/components/GraficoMatriz';
import { numero } from '@/lib/formato';
import { useParametrosCosto, usePareto } from '@/lib/consultasCostos';
import { TablaAlertasPrecio, TablaPreciosProveedor, TablaRotacion } from './TablasEficiencia';
import { useVistaMoneda } from './vistaMoneda';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const pct = (v: number) => `${numero(v * 100, 1)} %`;

/**
 * Fase 4: Pareto ABC por facturación, matriz facturación × margen, y las
 * herramientas de eficiencia (rotación y capital inmovilizado, precios por
 * proveedor, alertas de precio contra costo). Los porcentajes no dependen de
 * la moneda; los montos de las tablas, sí.
 */
export function PaginaEficiencia() {
  const [meses, setMeses] = useState('3');
  const { desde, hasta } = useMemo(() => {
    const hoy = new Date();
    return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - Number(meses) + 1, 1)), hasta: iso(hoy) };
  }, [meses]);
  const pareto = usePareto(desde, hasta);
  const parametros = useParametrosCosto();
  const { convertir, vista, leyenda } = useVistaMoneda();
  const corteA = parametros.data?.corte_a ?? 0.8;
  const corteB = parametros.data?.corte_b ?? 0.95;
  const margenMinimo = parametros.data?.margen_minimo ?? 0.25;
  const filas = pareto.data ?? [];
  const cuenta = (c: string) => filas.filter((f) => f.clase === c).length;
  const dinero = (v: number) => {
    const x = convertir(v, hasta.slice(0, 7), 'FLUJO').valor;
    return x === null ? '—' : `${vista === 'USD' ? 'U$D' : '$'} ${numero(x, 0)}`;
  };

  return (
    <Stack gap="lg">
      <EncabezadoPagina
        titulo="Eficiencia"
        descripcion="Qué productos explican la facturación (Pareto ABC), cuánto deja cada uno, y dónde está la plata parada en stock."
        acciones={
          <SegmentedControl
            value={meses}
            onChange={setMeses}
            data={[
              { label: 'Último mes', value: '1' },
              { label: '3 meses', value: '3' },
              { label: '6 meses', value: '6' },
              { label: '12 meses', value: '12' },
            ]}
          />
        }
      />

      {pareto.isLoading ? (
        <Skeleton h={300} />
      ) : (
        <>
          <Group gap="xs">
            {(['A', 'B', 'C'] as const).map((c) => (
              <Badge key={c} variant="light" color="gray" leftSection={<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: `var(--serie-${COLOR_CLASE[c]})` }} />}>
                {cuenta(c)} productos clase {c}
              </Badge>
            ))}
            <Text size="xs" c="dimmed">
              Cortes: A hasta {pct(corteA)} de la facturación acumulada, B hasta {pct(corteB)} (los cambia Finanzas en Costos ›
              Parámetros).
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
              <Title order={4} mb="sm">
                Curva de Pareto
              </Title>
              <GraficoPareto
                titulo="Participación de cada producto en la facturación y acumulado"
                corteA={corteA}
                corteB={corteB}
                barras={filas.map((f) => ({
                  nombre: f.producto,
                  participacion: f.participacion,
                  acumulado: f.acumulado,
                  clase: f.clase,
                  detalle: `Facturación ${dinero(f.facturacion)}`,
                }))}
              />
            </Paper>
            <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
              <Title order={4} mb={4}>
                Facturación × margen
              </Title>
              <Text size="xs" c="dimmed" mb="sm">
                Un A de margen bajo y un C de margen alto piden decisiones distintas. Sólo productos con costo completo.
              </Text>
              <GraficoMatriz
                titulo="Participación en la facturación contra margen sobre el precio"
                margenMinimo={margenMinimo}
                puntos={filas
                  .filter((f) => f.margen_pct !== null)
                  .map((f) => ({ nombre: f.producto, participacion: f.participacion, margen: f.margen_pct!, clase: f.clase }))}
              />
            </Paper>
          </SimpleGrid>

          <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="xs" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Clase</Table.Th>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Unidades</Table.Th>
                    <Table.Th ta="right">Facturación ({leyenda})</Table.Th>
                    <Table.Th ta="right">Participación</Table.Th>
                    <Table.Th ta="right">Acumulado</Table.Th>
                    <Table.Th ta="right">Margen</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f) => (
                    <Table.Tr key={f.producto_id}>
                      <Table.Td>
                        <Badge variant="light" color="gray">
                          {f.clase}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/costos/producto/${f.producto_id}`} size="sm" fw={600}>
                          {f.producto}
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          {f.codigo_interno}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">{numero(f.unidades)}</Table.Td>
                      <Table.Td ta="right" ff="monospace">{dinero(f.facturacion)}</Table.Td>
                      <Table.Td ta="right" ff="monospace">{pct(f.participacion)}</Table.Td>
                      <Table.Td ta="right" ff="monospace">{pct(f.acumulado)}</Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {f.margen_pct === null ? (
                          <Badge color="orange" variant="light">
                            costo incompleto
                          </Badge>
                        ) : (
                          <Text span {...(f.margen_pct < margenMinimo ? { c: 'red.7' } : {})} size="sm" ff="monospace">
                            {pct(f.margen_pct)}
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </>
      )}

      <Tabs defaultValue="rotacion" color="azul" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="rotacion" leftSection={<IconBuildingWarehouse size={17} />}>
            Stock: rotación y capital inmovilizado
          </Tabs.Tab>
          <Tabs.Tab value="proveedores" leftSection={<IconTruckDelivery size={17} />}>
            Precios por proveedor
          </Tabs.Tab>
          <Tabs.Tab value="alertas" leftSection={<IconAlertTriangle size={17} />}>
            Alertas de precio
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="rotacion">
          <TablaRotacion />
        </Tabs.Panel>
        <Tabs.Panel value="proveedores">
          <TablaPreciosProveedor />
        </Tabs.Panel>
        <Tabs.Panel value="alertas">
          <TablaAlertasPrecio />
          <Text size="xs" c="dimmed" mt="sm">
            Las variaciones de precio de compra contra tu referencia están en Costos › Avisos.
          </Text>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

import {
  Alert,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChartLine,
  IconCoin,
  IconPackage,
  IconScale,
  IconTrendingUp,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { fecha, numero } from '@/lib/formato';
import { useCostosProducto, usePareto, useResultadoGestion } from '@/lib/consultasCostos';
import { useProduccionPeriodo } from '@/lib/consultasCotizador';
import { useVistaMoneda } from './vistaMoneda';

const pct = (v: number) => `${numero(v * 100, 1)} %`;

/** Pantalla de gerencia: pocos números grandes. Todo importe pasa por `convertir` (vistaMoneda). */
export function PaginaGerencia() {
  const hoy = new Date();
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const resultado = useResultadoGestion();
  const pareto = usePareto(inicioMes, inicioMes);
  const produccion = useProduccionPeriodo(inicioMes);
  const productos = useCostosProducto();
  const { convertir, leyenda, vista } = useVistaMoneda();

  if (resultado.isLoading || pareto.isLoading || produccion.isLoading)
    return <Skeleton h={420} />;

  const encabezado = (
    <EncabezadoPagina
      titulo="Gerencia"
      descripcion={`Resumen del mes. Resultado de gestión, no fiscal. Montos ${leyenda}.`}
    />
  );

  // El mes en curso todavía puede no tener facturas: las tarjetas muestran el último mes con datos.
  const conDatos = (resultado.data ?? []).filter(
    (r) => r.facturacion > 0 || r.costos_totales > 0,
  );
  const ultimo = conDatos[conDatos.length - 1];
  if (!ultimo) {
    return (
      <Stack>
        {encabezado}
        <Vacio
          icono={IconChartLine}
          titulo="Todavía no hay datos para el resumen."
          descripcion="Aparece en cuanto haya facturas autorizadas y gastos cargados."
        />
      </Stack>
    );
  }

  const fmt = (v: number | null) =>
    v === null ? '—' : `${vista === 'USD' ? 'U$D ' : '$ '}${numero(v, 0)}`;
  const conv = (v: number | null, mes: string) =>
    v === null ? null : convertir(v, mes, 'FLUJO').valor;

  const resultadoMes = conv(ultimo.resultado, ultimo.mes);
  const facturacionMes = conv(ultimo.facturacion, ultimo.mes);
  const equilibrioMes = conv(ultimo.facturacion_equilibrio, ultimo.mes);
  const diferencia =
    equilibrioMes !== null && facturacionMes !== null
      ? equilibrioMes - facturacionMes
      : null;
  const perdida = resultadoMes !== null && resultadoMes < 0;

  const ordenes = produccion.data ?? [];
  const unidades = ordenes.reduce((s, o) => s + (o.unidades_obtenidas ?? 0), 0);
  const nombres = new Map(
    (productos.data ?? []).map((p) => [p.producto_id, p.nombre] as const),
  );
  const nombreDe = (id: string) => nombres.get(id) ?? '—';
  const top = [...(pareto.data ?? [])]
    .sort((a, b) => b.facturacion - a.facturacion)
    .slice(0, 5);

  return (
    <Stack gap="lg">
      {encabezado}

      {ultimo.productos_sin_costo > 0 ? (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          Parte de lo vendido no tiene costo completo: el resultado está sobreestimado.
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <TarjetaIndicador
          etiqueta="Resultado del mes"
          icono={IconTrendingUp}
          color={perdida ? 'red' : 'green'}
          valor={
            <Text span inherit c={perdida ? 'red.7' : 'green.7'}>
              {resultadoMes === null
                ? '—'
                : `${perdida ? '−' : ''}${fmt(Math.abs(resultadoMes))}`}
            </Text>
          }
          detalle={
            resultadoMes === null
              ? 'Falta el tipo de cambio o el IPC del mes'
              : perdida
                ? 'Pérdida'
                : 'Ganancia'
          }
        />
        <TarjetaIndicador
          etiqueta="Facturación"
          icono={IconCoin}
          valor={fmt(facturacionMes)}
          detalle={
            ultimo.margen_contribucion_pct === null
              ? 'Sin margen de contribución'
              : `Margen de contribución ${pct(ultimo.margen_contribucion_pct)}`
          }
        />
        <TarjetaIndicador
          etiqueta="Punto de equilibrio"
          icono={IconScale}
          valor={fmt(equilibrioMes)}
          detalle={
            diferencia === null
              ? 'Sin margen de contribución para calcularlo'
              : diferencia > 0
                ? `Falta ${fmt(diferencia)}`
                : `Sobra ${fmt(-diferencia)}`
          }
        />
        <TarjetaIndicador
          etiqueta="Producción del mes"
          icono={IconPackage}
          valor={numero(unidades, 0)}
          detalle={`${ordenes.length} ${ordenes.length === 1 ? 'orden terminada' : 'órdenes terminadas'}`}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Text fw={700} size="lg" mb="sm">
            Lo que más se vendió este mes
          </Text>
          {top.length === 0 ? (
            <Text c="dimmed">Todavía no hay ventas facturadas este mes.</Text>
          ) : (
            <Stack gap={0}>
              {top.map((f, i) => {
                const sinMargen = f.costo_incompleto || f.margen_pct === null;
                return (
                  <div key={f.producto_id}>
                    {i > 0 ? <Divider /> : null}
                    <Group justify="space-between" wrap="nowrap" py="sm">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fw={600} truncate>
                          {f.producto}
                        </Text>
                        <Text size="xs" c={sinMargen ? 'orange' : 'dimmed'}>
                          {sinMargen
                            ? 'costo incompleto'
                            : `Margen ${pct(f.margen_pct ?? 0)}`}
                        </Text>
                      </Stack>
                      <Text fw={700} ff="monospace" ta="right">
                        {fmt(conv(f.facturacion, inicioMes))}
                      </Text>
                    </Group>
                  </div>
                );
              })}
            </Stack>
          )}
        </Paper>

        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Text fw={700} size="lg" mb="sm">
            Producción del período
          </Text>
          {ordenes.length === 0 ? (
            <Text c="dimmed">Todavía no hay órdenes terminadas este mes.</Text>
          ) : (
            <Stack gap={0}>
              {ordenes.slice(0, 10).map((o, i) => (
                <div key={o.id}>
                  {i > 0 ? <Divider /> : null}
                  <Group justify="space-between" wrap="nowrap" py="sm">
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Text fw={600} truncate>
                        {nombreDe(o.producto_id)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {`Orden ${o.numero} · ${fecha(o.terminada_en)}`}
                      </Text>
                    </Stack>
                    <Text fw={700} ff="monospace" ta="right">
                      {o.unidades_obtenidas === null
                        ? '—'
                        : `${numero(o.unidades_obtenidas, 0)} unidades`}
                    </Text>
                  </Group>
                </div>
              ))}
            </Stack>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

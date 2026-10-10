import { Alert, Badge, Paper, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconChartLine, IconScale, IconTargetArrow, IconTrendingUp } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { GraficoResultado } from '@/components/GraficoResultado';
import { Vacio } from '@/components/Vacio';
import { numero } from '@/lib/formato';
import { equilibrio, useResultadoGestion, type ResultadoMes } from '@/lib/consultasCostos';
import { useVistaMoneda } from './vistaMoneda';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}-${iso.slice(2, 4)}`;
const pct = (v: number) => `${numero(v * 100, 1)} %`;

/** Las magnitudes del mes en la moneda elegida (los porcentajes no cambian). */
function convertirMes(r: ResultadoMes, conv: (v: number) => number | null) {
  const c = (v: number) => conv(v);
  const facturacion = c(r.facturacion);
  // Equilibrio con la nómina como fija y el margen sin mano de obra (D-48).
  const mc = c(r.margen_sin_mano_de_obra);
  const estructura = c(r.estructura_equilibrio);
  return {
    facturacion,
    costos: c(r.costos_totales),
    resultado: c(r.resultado),
    estructura,
    // Recalculado con los valores convertidos: mismo veredicto en las tres vistas.
    equilibrio: facturacion !== null && mc !== null && estructura !== null ? equilibrio(facturacion, mc, estructura) : null,
  };
}

/**
 * Resultado de gestión (Fase 3): facturación de facturas autorizadas contra
 * costos totales (costo de lo vendido + fijos + mano de obra no absorbida +
 * gastos operativos + amortizaciones), con el punto de equilibrio. No es el
 * resultado fiscal: ése lo hace el estudio contable.
 */
export function PaginaResultado() {
  const resultado = useResultadoGestion();
  const { convertir, leyenda, vista } = useVistaMoneda();
  const dinero = (v: number) => (vista === 'USD' ? `U$D ${numero(v, 0)}` : `$ ${numero(v, 0)}`);

  if (resultado.isLoading) return <Skeleton h={420} />;
  const filas = (resultado.data ?? []).slice(-12);
  const conDatos = filas.filter((r) => r.facturacion !== 0 || r.costos_totales !== 0);
  if (conDatos.length === 0) {
    return (
      <Stack>
        <EncabezadoPagina titulo="Resultado" descripcion="Resultado de gestión, no fiscal." />
        <Vacio
          icono={IconChartLine}
          titulo="Todavía no hay resultado para mostrar"
          descripcion="Hace falta facturación autorizada y los gastos del mes. Cargá primero los costos fijos y la nómina de producción en Costos › Gastos; la facturación sale sola de las facturas autorizadas."
        />
      </Stack>
    );
  }

  const mesAct = filas[filas.length - 1]!;
  // El mes en curso todavía no cerró: las tarjetas muestran el último mes con datos.
  const ultimo = [...conDatos].reverse()[0]!;
  const conv = (r: ResultadoMes) => convertirMes(r, (v) => convertir(v, r.mes, 'FLUJO').valor);
  const u = conv(ultimo);
  const faltaEquilibrio = u.equilibrio !== null && u.facturacion !== null ? u.equilibrio - u.facturacion : null;
  const sinComprobante12 = filas.reduce((s, r) => s + r.gastos_sin_comprobante, 0);
  const gastos12 = filas.reduce(
    (s, r) => s + r.costos_fijos + r.nomina_produccion + r.gastos_operativos,
    0,
  );
  const incompletos = filas.filter((r) => r.productos_sin_costo > 0 || r.productos_costo_incompleto > 0);

  return (
    <Stack gap="lg">
      <EncabezadoPagina
        titulo="Resultado"
        descripcion={`Resultado de gestión, no fiscal: lo valida el estudio contable. Montos ${leyenda}.`}
        acciones={<Badge variant="light" color="gray">Gestión, no fiscal</Badge>}
      />

      {incompletos.length ? (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          En {incompletos.length} {incompletos.length === 1 ? 'mes' : 'meses'} se vendieron productos sin costo completo:
          el costo de lo vendido de esos meses está subestimado. Completalos en Costos › Productos.
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <TarjetaIndicador
          etiqueta={`Resultado ${etiquetaMes(ultimo.mes)}`}
          icono={IconTrendingUp}
          valor={u.resultado === null ? '—' : `${u.resultado >= 0 ? '' : '−'}${dinero(Math.abs(u.resultado))}`}
          color={u.resultado !== null && u.resultado < 0 ? 'red' : 'green'}
          detalle={u.resultado === null ? 'Falta el tipo de cambio o el IPC del mes' : u.resultado >= 0 ? 'Ganancia' : 'Pérdida'}
        />
        <TarjetaIndicador
          etiqueta="Facturación"
          icono={IconChartLine}
          valor={u.facturacion === null ? '—' : dinero(u.facturacion)}
          detalle={
            ultimo.margen_contribucion_pct === null
              ? 'Sin margen de contribución'
              : `Margen de contribución ${pct(ultimo.margen_contribucion_pct)}`
          }
        />
        <TarjetaIndicador
          etiqueta="Punto de equilibrio"
          icono={IconScale}
          valor={u.equilibrio === null ? '—' : dinero(u.equilibrio)}
          detalle="(Fijos + nómina + gastos + amortizaciones) / margen sin mano de obra %"
        />
        <TarjetaIndicador
          etiqueta={faltaEquilibrio !== null && faltaEquilibrio > 0 ? 'Falta para el equilibrio' : 'Sobra sobre el equilibrio'}
          icono={IconTargetArrow}
          valor={faltaEquilibrio === null ? '—' : dinero(Math.abs(faltaEquilibrio))}
          color={faltaEquilibrio !== null && faltaEquilibrio > 0 ? 'red' : 'green'}
          detalle={`Con el mix de ventas de ${etiquetaMes(ultimo.mes)}`}
        />
      </SimpleGrid>

      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Title order={4} mb={4}>
          Facturación contra costos totales, {leyenda}
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Costos totales = costo de lo vendido + costos fijos + mano de obra no absorbida + gastos operativos +
          amortizaciones. {mesAct.mes === ultimo.mes ? '' : `${etiquetaMes(mesAct.mes)} todavía no tiene datos.`}
        </Text>
        <GraficoResultado
          titulo={`Facturación contra costos totales ${leyenda}`}
          formato={dinero}
          puntos={filas.map((r) => {
            const f = convertir(r.facturacion, r.mes, 'FLUJO');
            const c = convertir(r.costos_totales, r.mes, 'FLUJO');
            return {
              etiqueta: etiquetaMes(r.mes),
              facturacion: r.facturacion === 0 && r.costos_totales === 0 ? null : f.valor,
              costos: r.facturacion === 0 && r.costos_totales === 0 ? null : c.valor,
              provisorio: f.provisorio || c.provisorio,
            };
          })}
        />
      </Paper>

      <Text size="sm" c="dimmed">
        Gastos sin comprobante en los últimos 12 meses:{' '}
        <b>{gastos12 > 0 ? pct(sinComprobante12 / gastos12) : '—'}</b> del total de gastos cargados.
      </Text>

      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={980}>
          <Table verticalSpacing="xs" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mes</Table.Th>
                <Table.Th ta="right">Facturación</Table.Th>
                <Table.Th ta="right">Costo de lo vendido</Table.Th>
                <Table.Th ta="right">MC %</Table.Th>
                <Table.Th ta="right">Fijos</Table.Th>
                <Table.Th ta="right">MO no absorbida</Table.Th>
                <Table.Th ta="right">Operativos</Table.Th>
                <Table.Th ta="right">Amortizaciones</Table.Th>
                <Table.Th ta="right">Resultado</Table.Th>
                <Table.Th ta="right">Equilibrio</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...filas].reverse().map((r) => {
                const c = (v: number) => convertir(v, r.mes, 'FLUJO').valor;
                const m = (v: number) => {
                  const x = c(v);
                  return x === null ? '—' : dinero(x);
                };
                const e = conv(r).equilibrio;
                return (
                  <Table.Tr key={r.mes}>
                    <Table.Td>{etiquetaMes(r.mes)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{m(r.facturacion)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{m(r.costo_variable)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {r.margen_contribucion_pct === null ? '—' : pct(r.margen_contribucion_pct)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">{m(r.costos_fijos)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{m(r.mano_de_obra_no_absorbida)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{m(r.gastos_operativos)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">{m(r.amortizaciones)}</Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700} c={r.resultado < 0 ? 'red.7' : 'green.7'}>
                      {r.resultado < 0 ? '−' : ''}
                      {m(Math.abs(r.resultado))}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">{e === null ? '—' : dinero(e)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </Stack>
  );
}

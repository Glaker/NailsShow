import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Slider,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconBuildingWarehouse, IconCoin, IconPackage } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { GraficoLineas, type SerieLinea } from '@/components/GraficoLineas';
import { GraficoBarrasPareadas, type GrupoBarras } from '@/components/GraficoBarrasPareadas';
import { GraficoTorta } from '@/features/administracion/GraficoTorta';
import { Vacio } from '@/components/Vacio';
import { numero } from '@/lib/formato';
import {
  ETIQUETA_BANDA,
  margenSobrePrecio,
  sensibilidad,
  useCostosProducto,
  useDesgloseProducto,
  useFotosCosto,
  useHistoriaPrecios,
  useStockValorizadoInsumos,
  useStockValorizadoPt,
  useTomarFotoCostos,
  type Banda,
} from '@/lib/consultasCostos';
import { useVistaMoneda } from './vistaMoneda';
import { ORIGEN_PRECIO } from './comun';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const BANDAS: Banda[] = ['CONSUMIDOR_FINAL', 'MAYORISTA', 'MAYORISTA_PROMO'];
const COLOR_BANDA: Record<Banda, 2 | 3 | 4> = { CONSUMIDOR_FINAL: 2, MAYORISTA: 3, MAYORISTA_PROMO: 4 };

/** Los últimos 12 meses, 'AAAA-MM', del más viejo al actual. */
function ultimosMeses(n = 12): string[] {
  const hoy = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}
const etiquetaMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}-${m.slice(2, 4)}`;
const pct = (v: number) => `${numero(v * 100, 1)} %`;

/**
 * Panel de un producto (Fase 2): incidencia de cada componente, costo contra
 * precio de cada banda, evolución de costo y precios, desglose, stock
 * valorizado y sensibilidad. Todo sin IVA; los montos en la moneda que se elige
 * en la barra (los porcentajes no cambian con la moneda).
 */
export function PanelProducto() {
  const { id = null } = useParams();
  const desglose = useDesgloseProducto(id);
  const productos = useCostosProducto();
  const fotos = useFotosCosto(id);
  const precios = useHistoriaPrecios(id, 12);
  const stockPt = useStockValorizadoPt();
  const stockInsumos = useStockValorizadoInsumos();
  const { convertir, leyenda, vista } = useVistaMoneda();
  const tomarFoto = useTomarFotoCostos();
  const [componente, setComponente] = useState<string | null>(null);
  const [variacion, setVariacion] = useState(10);

  // La foto del mes en curso se toma al abrir (D-47); la historia se arma sola.
  const { mutate: fotografiar } = tomarFoto;
  useEffect(() => fotografiar(), [fotografiar]);

  const meses = useMemo(() => ultimosMeses(12), []);
  const mesActual = meses[meses.length - 1]!;
  const dinero = (v: number) => (vista === 'USD' ? `U$D ${numero(v, 2)}` : `$ ${numero(v, 2)}`);
  const enVista = (v: number | null, mes = mesActual) =>
    v === null ? null : convertir(v, mes, 'FLUJO').valor;

  const filas = useMemo(() => desglose.data ?? [], [desglose.data]);
  const total = filas.reduce((s, f) => s + (f.subtotal ?? 0), 0);
  const faltantes = filas.filter((f) => f.falta);
  const producto = (productos.data ?? []).find((p) => p.producto_id === id);

  const torta = useMemo(() => {
    const granel = filas.filter((f) => f.tipo === 'GRANEL').reduce((s, f) => s + (f.subtotal ?? 0), 0);
    return [
      ...(granel > 0 ? [{ nombre: 'Granel', valor: granel }] : []),
      ...filas
        .filter((f) => f.tipo !== 'GRANEL' && (f.subtotal ?? 0) > 0)
        .map((f) => ({ nombre: f.componente, valor: f.subtotal ?? 0 })),
    ];
  }, [filas]);

  const preciosActuales = useMemo(() => {
    const m = new Map<Banda, number>();
    for (const p of precios.data ?? []) if (p.mes.slice(0, 7) === mesActual) m.set(p.banda, p.precio_neto);
    return m;
  }, [precios.data, mesActual]);

  const barras: GrupoBarras[] = BANDAS.flatMap((b) => {
    const precio = preciosActuales.get(b);
    if (precio === undefined || total <= 0) return [];
    const p = enVista(precio);
    const c = enVista(total);
    if (p === null || c === null) return [];
    const m = margenSobrePrecio(precio, total);
    return [
      {
        etiqueta: ETIQUETA_BANDA[b],
        nota: m === null ? '' : `margen ${pct(m)}`,
        valores: [
          { nombre: 'Costo', valor: c, color: 1 as const },
          { nombre: 'Precio neto', valor: p, color: COLOR_BANDA[b] },
        ],
      },
    ];
  });

  // Sin useMemo: `convertir` cambia en cada render y la cuenta es chica.
  const lineas: SerieLinea[] = (() => {
    const porMes = new Map((fotos.data ?? []).map((f) => [f.mes.slice(0, 7), f.costo_unitario]));
    // El mes en curso sale del cálculo en vivo; los cerrados, de su foto.
    porMes.set(mesActual, total > 0 ? total : (porMes.get(mesActual) ?? null));
    const conv = (v: number | null | undefined, m: string) =>
      v === null || v === undefined ? { valor: null, provisorio: false } : convertir(v, m, 'FLUJO');
    const costo = meses.map((m) => conv(porMes.get(m), m));
    const series: SerieLinea[] = [
      {
        nombre: 'Costo',
        color: 1,
        valores: costo.map((c) => c.valor),
        provisorios: costo.map((c) => c.provisorio),
      },
    ];
    for (const b of BANDAS) {
      const precio = new Map(
        (precios.data ?? []).filter((p) => p.banda === b).map((p) => [p.mes.slice(0, 7), p.precio_neto]),
      );
      if (precio.size === 0) continue;
      const v = meses.map((m) => conv(precio.get(m), m));
      series.push({
        nombre: ETIQUETA_BANDA[b],
        color: COLOR_BANDA[b],
        punteada: true,
        valores: v.map((c) => c.valor),
        provisorios: v.map((c) => c.provisorio),
      });
    }
    return series;
  })();

  const insumosDelProducto = new Set(filas.map((f) => f.insumo_id).filter(Boolean));
  const valorPt = (stockPt.data ?? [])
    .filter((s) => s.producto_id === id)
    .reduce((a, s) => ({ saldo: a.saldo + s.saldo, valor: a.valor + (s.valor_ars ?? 0) }), { saldo: 0, valor: 0 });
  const valorInsumos = (stockInsumos.data ?? [])
    .filter((s) => insumosDelProducto.has(s.insumo_id))
    .reduce((a, s) => a + (s.valor_ars ?? 0), 0);
  const saldoEnVista = (v: number) => convertir(v, mesActual, 'SALDO').valor;

  const elegido = filas.find((f) => `${f.tipo}-${f.orden}` === componente);
  const impacto = elegido && elegido.subtotal ? sensibilidad(elegido.subtotal, total, variacion / 100) : null;

  if (desglose.isLoading) return <Skeleton h={400} />;
  if (!id || filas.length === 0) {
    return (
      <Vacio
        icono={IconPackage}
        titulo="Producto sin datos de costo"
        descripcion="Volvé a Costos › Productos y elegí un producto."
      />
    );
  }

  return (
    <Stack gap="lg">
      <EncabezadoPagina
        titulo={producto?.nombre ?? 'Producto'}
        descripcion={`Costo de gestión, sin IVA. Montos ${leyenda}.`}
        acciones={
          <Anchor component={Link} to="/costos" size="sm">
            Volver a Costos
          </Anchor>
        }
      />

      <Group gap="xs">
        {producto?.contenido_neto ? (
          <Badge variant="light">
            {numero(producto.contenido_neto, 0)} {producto.unidad_contenido}
          </Badge>
        ) : (
          <Badge color="orange" variant="light">
            sin contenido neto
          </Badge>
        )}
        {producto?.formula_estado && producto.formula_estado !== 'VIGENTE' ? (
          <Badge color="yellow" variant="light">
            costeado con fórmula en {producto.formula_estado.toLowerCase().replace(/_/g, ' ')}
          </Badge>
        ) : null}
        {faltantes.length ? (
          <Badge color="orange" variant="light">
            costo incompleto: {faltantes.length} {faltantes.length === 1 ? 'dato falta' : 'datos faltan'}
          </Badge>
        ) : null}
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <TarjetaIndicador
          etiqueta="Costo unitario"
          icono={IconCoin}
          valor={enVista(total) === null ? '—' : dinero(enVista(total)!)}
          detalle={faltantes.length ? 'Incompleto: ver «Falta» en el desglose' : 'Granel + acondicionamiento + mano de obra'}
        />
        <TarjetaIndicador
          etiqueta="Stock de este producto"
          icono={IconBuildingWarehouse}
          valor={saldoEnVista(valorPt.valor) === null ? '—' : dinero(saldoEnVista(valorPt.valor)!)}
          detalle={`${numero(valorPt.saldo)} unidades al costo vigente`}
        />
        <TarjetaIndicador
          etiqueta="Stock de sus insumos"
          icono={IconPackage}
          valor={saldoEnVista(valorInsumos) === null ? '—' : dinero(saldoEnVista(valorInsumos)!)}
          detalle="Saldo de cada lote × lo que costó ese lote"
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <GraficoTorta
          titulo="Incidencia de cada componente en el costo"
          datos={torta}
          aviso={faltantes.length ? 'Faltan datos: la torta reparte sólo lo costeado.' : undefined}
        />
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <Title order={4} mb={4}>
            Costo contra precio, por banda
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            Precio neto de IVA; margen sobre el precio, (P − C) / P. Montos {leyenda}.
          </Text>
          <GraficoBarrasPareadas grupos={barras} formato={dinero} titulo="Costo contra precio neto por banda" />
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Title order={4} mb={4}>
          Costo y precios en el tiempo, {leyenda}
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Cada mes cerrado sale de su foto; el mes en curso, del cálculo de hoy. Un mes sin foto queda como hueco. Los
          precios van punteados. Punto hueco: valor con IPC estimado (provisorio).
        </Text>
        <GraficoLineas
          etiquetas={meses.map(etiquetaMes)}
          series={lineas}
          formato={dinero}
          titulo={`Costo y precios de ${producto?.nombre ?? 'producto'} ${leyenda}`}
        />
      </Paper>

      <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Title order={4} mb="sm">
          Sensibilidad
        </Title>
        <Group align="flex-end" gap="lg" wrap="wrap">
          <Select
            label="Si sube el componente"
            placeholder="Elegí un componente"
            data={filas
              .filter((f) => (f.subtotal ?? 0) > 0)
              .map((f) => ({ value: `${f.tipo}-${f.orden}`, label: f.componente }))}
            value={componente}
            onChange={setComponente}
            searchable
            w={{ base: '100%', sm: 320 }}
          />
          <Stack gap={4} style={{ flex: 1, minWidth: 220 }}>
            <Text size="sm" fw={500}>
              un {variacion} %
            </Text>
            <Slider
              min={-50}
              max={100}
              step={5}
              value={variacion}
              onChange={setVariacion}
              label={(v) => `${v} %`}
              size="lg"
            />
          </Stack>
        </Group>
        {impacto !== null && elegido ? (
          <Text mt="md">
            el costo del producto {impacto >= 0 ? 'sube' : 'baja'} <b>{pct(Math.abs(impacto))}</b> (pesa{' '}
            {pct((elegido.subtotal ?? 0) / total)} del costo).
          </Text>
        ) : null}
      </Paper>

      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Componente</Table.Th>
                <Table.Th ta="right">Cantidad</Table.Th>
                <Table.Th ta="right">Costo unitario</Table.Th>
                <Table.Th>Origen</Table.Th>
                <Table.Th ta="right">Subtotal</Table.Th>
                <Table.Th ta="right">% del total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f) => {
                const cu = enVista(f.costo_unitario);
                const st = enVista(f.subtotal);
                return (
                  <Table.Tr key={`${f.tipo}-${f.orden}`}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {f.componente}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {f.tipo === 'GRANEL' ? 'Granel' : f.tipo === 'ACONDICIONAMIENTO' ? 'Acondicionamiento' : 'Mano de obra'}
                        {f.codigo_interno ? ` · ${f.codigo_interno}` : ''}
                      </Text>
                      {f.falta ? (
                        <Text size="xs" c="orange">
                          {f.falta}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {f.cantidad === null ? '—' : `${numero(f.cantidad, 4)} ${f.unidad ?? ''}`}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {cu === null ? '—' : vista === 'USD' ? `U$D ${numero(cu, 4)}` : `$ ${numero(cu, 4)}`}
                    </Table.Td>
                    <Table.Td>
                      {f.origen_costo ? (
                        <Badge variant="light" color={ORIGEN_PRECIO[f.origen_costo]?.color ?? 'gray'}>
                          {ORIGEN_PRECIO[f.origen_costo]?.label ?? f.origen_costo}
                        </Badge>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={600}>
                      {st === null ? '—' : dinero(st)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {f.subtotal && total > 0 ? pct(f.subtotal / total) : '—'}
                    </Table.Td>
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

import { Fragment, useState } from 'react';
import {
  Anchor,
  Badge,
  Group,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import {
  IconCircleCheck,
  IconCoin,
  IconSearch,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { fecha, numero } from '@/lib/formato';
import {
  ETIQUETA_BANDA,
  useAlertasPrecio,
  usePreciosProveedor,
  useRotacionInsumos,
  type PrecioProveedor,
  type RotacionInsumo,
} from '@/lib/consultasCostos';
import type { Naturaleza, VistaMoneda } from '@/lib/moneda';
import { useVistaMoneda } from './vistaMoneda';

const ESTILO_BORDE = { borderColor: 'var(--superficie-borde)' };

type Convertir = ReturnType<typeof useVistaMoneda>['convertir'];

/** Importe en la moneda elegida. «—» si no hay dato o falta el tipo de cambio o el IPC del mes. */
function formatoMonto(convertir: Convertir, vista: VistaMoneda) {
  const mes = new Date().toISOString().slice(0, 7);
  const prefijo = vista === 'USD' ? 'U$D ' : '$ ';
  return (valor: number | null, naturaleza: Naturaleza, decimales = 2): string => {
    if (valor === null) return '—';
    const r = convertir(valor, mes, naturaleza);
    return r.valor === null ? '—' : `${prefijo}${numero(r.valor, decimales)}`;
  };
}

// ---------------------------------------------------------------------------
// 1. Rotación de insumos
// ---------------------------------------------------------------------------

type FiltroRotacion = 'todos' | 'sin_consumo' | 'mas_6_meses';

function cumpleFiltro(f: RotacionInsumo, filtro: FiltroRotacion): boolean {
  if (filtro === 'sin_consumo') return f.dias_de_stock === null && (f.saldo ?? 0) > 0;
  if (filtro === 'mas_6_meses') return f.dias_de_stock !== null && f.dias_de_stock > 180;
  return true;
}

function celdaDias(f: RotacionInsumo) {
  if (f.dias_de_stock === null) {
    return f.saldo !== null && f.saldo > 0 ? (
      <Badge color="gray" variant="light">
        sin consumo
      </Badge>
    ) : (
      <Text span c="dimmed">
        —
      </Text>
    );
  }
  return (
    <Group gap={6} justify="flex-end" wrap="nowrap">
      <Text span ff="monospace">
        {numero(f.dias_de_stock, 0)}
      </Text>
      {f.dias_de_stock > 180 ? (
        <Badge color="orange" variant="filled" size="sm">
          más de 6 meses
        </Badge>
      ) : null}
    </Group>
  );
}

export function TablaRotacion() {
  const rotacion = useRotacionInsumos();
  const { convertir, vista } = useVistaMoneda();
  const [filtro, setFiltro] = useState<FiltroRotacion>('todos');

  if (rotacion.isLoading) return <Skeleton h={300} />;

  const money = formatoMonto(convertir, vista);
  const filas = rotacion.data ?? [];
  const conValor = filas.filter((f) => f.valor_ars !== null);
  const totalValor =
    conValor.length > 0 ? conValor.reduce((a, f) => a + (f.valor_ars ?? 0), 0) : null;
  const lotesSinCosto = filas.reduce((a, f) => a + f.lotes_sin_costo, 0);
  const visibles = filas.filter((f) => cumpleFiltro(f, filtro));

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          Capital inmovilizado: lo que vale hoy el stock de cada insumo (saldo de cada
          lote × lo que costó). Días de stock: cuánto dura al ritmo de consumo de los
          últimos 90 días.
        </Text>
        <TarjetaIndicador
          etiqueta="Capital inmovilizado"
          valor={money(totalValor, 'SALDO')}
          icono={IconCoin}
          detalle={`${filas.length} insumos con stock, ${lotesSinCosto} lotes sin costo`}
        />
      </Stack>

      <SegmentedControl
        value={filtro}
        onChange={(v) => setFiltro(v as FiltroRotacion)}
        data={[
          { label: 'Todos', value: 'todos' },
          { label: 'Sin consumo', value: 'sin_consumo' },
          { label: 'Más de 6 meses', value: 'mas_6_meses' },
        ]}
      />

      {filas.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconCoin}
            titulo="Todavía no hay insumos con stock"
            descripcion="Aparecen cuando hay lotes con saldo."
          />
        </Paper>
      ) : visibles.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconSearch}
            titulo="Ningún insumo coincide con el filtro"
            descripcion="Probá con otra opción."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ ...ESTILO_BORDE, overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Insumo</Table.Th>
                  <Table.Th ta="right">Saldo</Table.Th>
                  <Table.Th ta="right">Valor</Table.Th>
                  <Table.Th ta="right">Consumo por día</Table.Th>
                  <Table.Th ta="right">Días de stock</Table.Th>
                  <Table.Th ta="right">Rotación anual</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.map((f) => (
                  <Table.Tr key={f.insumo_id}>
                    <Table.Td>
                      <Text span ff="monospace" size="sm" c="dimmed">
                        {f.codigo_interno}
                      </Text>{' '}
                      <Text span fw={600}>
                        {f.insumo}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {f.saldo === null
                        ? '—'
                        : `${numero(f.saldo, 2)} ${f.unidad_medida ?? ''}`}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      <Group gap={6} justify="flex-end" wrap="nowrap">
                        {money(f.valor_ars, 'SALDO')}
                        {f.lotes_sin_costo > 0 ? (
                          <Badge color="orange" variant="filled" size="sm">
                            {`${f.lotes_sin_costo} ${f.lotes_sin_costo === 1 ? 'lote sin costo' : 'lotes sin costo'}`}
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {`${numero(f.consumo_diario, 2)} ${f.unidad_medida ?? ''}`}
                    </Table.Td>
                    <Table.Td ta="right">{celdaDias(f)}</Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(f.rotacion_anual, 1)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// 2. Precios por proveedor
// ---------------------------------------------------------------------------

interface GrupoPrecios {
  insumo_id: string;
  codigo_interno: string;
  insumo: string;
  unidad: string;
  filas: PrecioProveedor[];
  /** Proveedor con menor precio promedio de hoy; null si hay menos de dos con precio. */
  masBarato: string | null;
}

function masBaratoDe(filas: PrecioProveedor[]): string | null {
  const conPrecio = filas.filter(
    (f): f is PrecioProveedor & { precio_promedio_hoy: number } =>
      f.precio_promedio_hoy !== null,
  );
  if (conPrecio.length < 2) return null;
  return conPrecio.reduce((a, b) =>
    b.precio_promedio_hoy < a.precio_promedio_hoy ? b : a,
  ).proveedor_id;
}

function agruparPrecios(filas: PrecioProveedor[]): GrupoPrecios[] {
  const porInsumo = new Map<string, PrecioProveedor[]>();
  for (const f of filas) {
    const g = porInsumo.get(f.insumo_id) ?? [];
    g.push(f);
    porInsumo.set(f.insumo_id, g);
  }
  const grupos: GrupoPrecios[] = [];
  for (const g of porInsumo.values()) {
    const primera = g[0];
    if (!primera) continue;
    grupos.push({
      insumo_id: primera.insumo_id,
      codigo_interno: primera.codigo_interno,
      insumo: primera.insumo,
      unidad: primera.unidad_medida ?? '',
      filas: g,
      masBarato: masBaratoDe(g),
    });
  }
  return grupos;
}

export function TablaPreciosProveedor() {
  const precios = usePreciosProveedor();
  const { convertir, vista } = useVistaMoneda();
  const [texto, setTexto] = useDebouncedState('', 250);

  if (precios.isLoading) return <Skeleton h={300} />;

  const money = formatoMonto(convertir, vista);
  const filas = precios.data ?? [];
  const grupos = agruparPrecios(filas);

  const busqueda = texto.trim().toLowerCase();
  const visibles = grupos
    .map((g) => ({
      ...g,
      filas: g.filas.filter(
        (f) =>
          !busqueda ||
          f.insumo.toLowerCase().includes(busqueda) ||
          f.proveedor.toLowerCase().includes(busqueda),
      ),
    }))
    .filter((g) => g.filas.length > 0);

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Precio unitario neto de cada compra (sin flete ni accesorios). El promedio y el
        mínimo están llevados a pesos de hoy con el IPC, para comparar compras de meses
        distintos.
      </Text>

      <TextInput
        placeholder="Insumo o proveedor"
        leftSection={<IconSearch size={17} />}
        defaultValue={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        w={{ base: '100%', sm: 340 }}
      />

      {filas.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconTruckDelivery}
            titulo="Todavía no hay compras con precio"
            descripcion="Aparecen cuando se registran recepciones de insumos con proveedor."
          />
        </Paper>
      ) : visibles.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconSearch}
            titulo="Ningún insumo coincide"
            descripcion="Probá con otro texto."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ ...ESTILO_BORDE, overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Proveedor</Table.Th>
                  <Table.Th ta="right">Compras</Table.Th>
                  <Table.Th>Última compra</Table.Th>
                  <Table.Th ta="right">Último precio</Table.Th>
                  <Table.Th ta="right">Promedio en pesos de hoy</Table.Th>
                  <Table.Th ta="right">Mínimo en pesos de hoy</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.map((g) => (
                  <Fragment key={g.insumo_id}>
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text span ff="monospace" size="sm" c="dimmed">
                          {g.codigo_interno}
                        </Text>{' '}
                        <Text span fw={700}>
                          {g.insumo}
                        </Text>{' '}
                        <Text span size="sm" c="dimmed">
                          {g.unidad}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                    {g.filas.map((f) => (
                      <Table.Tr key={`${f.insumo_id}-${f.proveedor_id}`}>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            <Text span>{f.proveedor}</Text>
                            {g.masBarato === f.proveedor_id ? (
                              <Badge color="green" variant="light" size="sm">
                                más barato
                              </Badge>
                            ) : null}
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {numero(f.compras, 0)}
                        </Table.Td>
                        <Table.Td>
                          {f.ultima_compra ? fecha(`${f.ultima_compra}T12:00:00`) : '—'}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {money(f.ultimo_precio, 'FLUJO', 4)}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {money(f.precio_promedio_hoy, 'FLUJO', 4)}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {money(f.precio_minimo_hoy, 'FLUJO', 4)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Fragment>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// 3. Alertas de precio
// ---------------------------------------------------------------------------

export function TablaAlertasPrecio() {
  const alertas = useAlertasPrecio();
  const { convertir, vista } = useVistaMoneda();

  if (alertas.isLoading) return <Skeleton h={300} />;

  const money = formatoMonto(convertir, vista);
  const filas = alertas.data ?? [];

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        Bandas de precio (netas de IVA) por debajo del costo del producto o con un margen
        sobre el precio menor que el mínimo que fijó Finanzas.
      </Text>

      {filas.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconCircleCheck}
            titulo="Ninguna banda está por debajo del costo ni del margen mínimo."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ ...ESTILO_BORDE, overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={960}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Banda</Table.Th>
                  <Table.Th ta="right">Precio neto</Table.Th>
                  <Table.Th ta="right">Costo</Table.Th>
                  <Table.Th ta="right">Margen</Table.Th>
                  <Table.Th>Alerta</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((f) => (
                  <Table.Tr key={`${f.producto_id}-${f.banda}`}>
                    <Table.Td>
                      <Text span fw={600}>
                        {f.producto}
                      </Text>{' '}
                      <Text span ff="monospace" size="sm" c="dimmed">
                        {f.codigo_interno}
                      </Text>
                    </Table.Td>
                    <Table.Td>{ETIQUETA_BANDA[f.banda]}</Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {money(f.precio_neto, 'FLUJO')}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {money(f.costo_unitario, 'FLUJO')}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {f.margen_pct < 0 ? (
                        <Text span c="red" fw={700}>
                          {`${numero(f.margen_pct, 1)} %`}
                        </Text>
                      ) : (
                        `${numero(f.margen_pct, 1)} %`
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        {f.alerta === 'BAJO_COSTO' ? (
                          <Badge color="red" variant="filled" size="sm">
                            Debajo del costo
                          </Badge>
                        ) : (
                          <Badge color="orange" variant="filled" size="sm">
                            Margen bajo el mínimo
                          </Badge>
                        )}
                        {f.costo_incompleto ? (
                          <Badge color="gray" variant="light" size="sm">
                            costo incompleto
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Anchor
                        component={Link}
                        to={`/costos/producto/${f.producto_id}`}
                        size="sm"
                      >
                        Ver panel
                      </Anchor>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}

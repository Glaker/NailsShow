import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconBuildingWarehouse,
  IconCoin,
  IconPackage,
  IconSearch,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import { numero } from '@/lib/formato';
import {
  useStockValorizadoInsumos,
  useStockValorizadoPt,
  type StockInsumoValorizado,
  type StockPtValorizado,
} from '@/lib/consultasCostos';
import { useVistaMoneda } from './vistaMoneda';

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Suma de los que tienen valor; null si ninguno lo tiene (un total en cero no es lo mismo que un total sin costo). */
const sumaParcial = (xs: (number | null)[]) => {
  const datos = xs.filter((x): x is number => x !== null);
  return datos.length > 0 ? suma(datos) : null;
};

/** Suma estricta: null si falta algún dato, porque un saldo parcial sería falso. */
const sumaEstricta = (xs: (number | null)[]) => {
  const datos = xs.filter((x): x is number => x !== null);
  return datos.length === xs.length ? suma(datos) : null;
};

interface GrupoInsumo {
  insumo_id: string;
  codigo_interno: string;
  insumo: string;
  unidad: string;
  saldo: number | null;
  valor: number | null;
  lotes: number;
  sinCosto: number;
}

interface GrupoPt {
  producto_id: string;
  producto: string;
  saldo: number;
  retenido: number;
  costo: number | null;
  valor: number | null;
  faltantes: number;
}

function agruparInsumos(filas: StockInsumoValorizado[]): GrupoInsumo[] {
  const porInsumo = new Map<string, StockInsumoValorizado[]>();
  for (const f of filas) {
    const g = porInsumo.get(f.insumo_id) ?? [];
    g.push(f);
    porInsumo.set(f.insumo_id, g);
  }
  const grupos: GrupoInsumo[] = [];
  for (const g of porInsumo.values()) {
    const primera = g[0];
    if (!primera) continue;
    grupos.push({
      insumo_id: primera.insumo_id,
      codigo_interno: primera.codigo_interno,
      insumo: primera.insumo,
      unidad: primera.unidad_medida ?? '',
      saldo: sumaEstricta(g.map((f) => f.saldo_unidad_catalogo)),
      valor: sumaParcial(g.map((f) => f.valor_ars)),
      lotes: g.length,
      sinCosto: g.filter((f) => f.valor_ars === null).length,
    });
  }
  return grupos.sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1));
}

function agruparPt(filas: StockPtValorizado[]): GrupoPt[] {
  const porProducto = new Map<string, StockPtValorizado[]>();
  for (const f of filas) {
    const g = porProducto.get(f.producto_id) ?? [];
    g.push(f);
    porProducto.set(f.producto_id, g);
  }
  const grupos: GrupoPt[] = [];
  for (const g of porProducto.values()) {
    const primera = g[0];
    if (!primera) continue;
    grupos.push({
      producto_id: primera.producto_id,
      producto: primera.producto,
      saldo: suma(g.map((f) => f.saldo)),
      retenido: suma(g.map((f) => f.retenido)),
      costo: g.find((f) => f.costo_unitario !== null)?.costo_unitario ?? null,
      valor: sumaParcial(g.map((f) => f.valor_ars)),
      faltantes: suma(g.map((f) => f.faltantes ?? 0)),
    });
  }
  return grupos;
}

const ESTILO_BORDE = { borderColor: 'var(--superficie-borde)' };

export function PestaniaStock() {
  const insumos = useStockValorizadoInsumos();
  const pt = useStockValorizadoPt();
  const { vista, convertir, leyenda } = useVistaMoneda();
  const navigate = useNavigate();
  const [seccion, setSeccion] = useState<string>('insumos');
  const [texto, setTexto] = useDebouncedState('', 250);

  if (insumos.isLoading || pt.isLoading) return <Skeleton h={300} />;

  const mesActual = new Date().toISOString().slice(0, 7);
  const ver = (valor: number | null) => {
    if (valor === null) {
      return (
        <Tooltip label="Sin costo cargado" withArrow>
          <Text span c="dimmed">
            —
          </Text>
        </Tooltip>
      );
    }
    const r = convertir(valor, mesActual, 'SALDO');
    if (r.valor === null) {
      return (
        <Tooltip label="Falta el tipo de cambio o el IPC de este mes" withArrow>
          <Text span c="dimmed">
            —
          </Text>
        </Tooltip>
      );
    }
    const formateado =
      vista === 'USD' ? `U$D ${numero(r.valor, 2)}` : `$ ${numero(r.valor, 2)}`;
    return r.provisorio ? (
      <>
        {formateado}{' '}
        <Badge size="xs" variant="light" color="gray">
          prov.
        </Badge>
      </>
    ) : (
      formateado
    );
  };

  const lotesIns = insumos.data ?? [];
  const productosPt = pt.data ?? [];
  const sinCostoIns = lotesIns.filter((f) => f.valor_ars === null).length;
  const totalIns = sumaParcial(lotesIns.map((f) => f.valor_ars));
  const totalPt = sumaParcial(productosPt.map((f) => f.valor_ars));
  const gruposIns = agruparInsumos(lotesIns);
  const gruposPt = agruparPt(productosPt);

  const busqueda = texto.trim().toLowerCase();
  const visiblesIns = gruposIns.filter(
    (g) =>
      !busqueda ||
      g.insumo.toLowerCase().includes(busqueda) ||
      g.codigo_interno.toLowerCase().includes(busqueda),
  );
  const visiblesPt = gruposPt.filter(
    (g) => !busqueda || g.producto.toLowerCase().includes(busqueda),
  );

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text fw={600}>{`Stock valorizado ${leyenda}`}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TarjetaIndicador
            etiqueta="Insumos"
            valor={ver(totalIns)}
            icono={IconCoin}
            detalle={`${lotesIns.length} lotes con saldo, ${sinCostoIns} sin costo`}
          />
          <TarjetaIndicador
            etiqueta="Producto terminado"
            valor={ver(totalPt)}
            icono={IconPackage}
            detalle={`${gruposPt.length} productos`}
          />
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          Insumos: saldo de cada lote × lo que costó ese lote (identificación específica).
          Producto terminado: saldo × costo unitario vigente del producto. Es un valor de
          gestión, no la valuación contable.
        </Text>
      </Stack>

      {sinCostoIns > 0 ? (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          {`${sinCostoIns} ${sinCostoIns === 1 ? 'lote con saldo no tiene' : 'lotes con saldo no tienen'} costo. Cargales el costo en Costos › Lotes.`}
        </Alert>
      ) : null}

      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder={seccion === 'insumos' ? 'Insumo o código' : 'Producto'}
          leftSection={<IconSearch size={17} />}
          defaultValue={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          w={{ base: '100%', sm: 340 }}
        />
        <SegmentedControl
          value={seccion}
          onChange={setSeccion}
          data={[
            { label: 'Insumos', value: 'insumos' },
            { label: 'Producto terminado', value: 'pt' },
          ]}
        />
      </Group>

      {seccion === 'insumos' ? (
        lotesIns.length === 0 ? (
          <Paper withBorder style={ESTILO_BORDE}>
            <Vacio
              icono={IconBuildingWarehouse}
              titulo="Todavía no hay stock con costo"
              descripcion="Se valoriza solo cuando los lotes tienen costo cargado (Costos › Lotes)."
            />
          </Paper>
        ) : visiblesIns.length === 0 ? (
          <Paper withBorder style={ESTILO_BORDE}>
            <Vacio
              icono={IconSearch}
              titulo="Ningún insumo coincide"
              descripcion="Probá con otro texto."
            />
          </Paper>
        ) : (
          <Paper withBorder style={{ ...ESTILO_BORDE, overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Insumo</Table.Th>
                    <Table.Th ta="right">Saldo</Table.Th>
                    <Table.Th ta="right">Valor</Table.Th>
                    <Table.Th>Lotes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {visiblesIns.map((g) => (
                    <Table.Tr key={g.insumo_id}>
                      <Table.Td ff="monospace">{g.codigo_interno}</Table.Td>
                      <Table.Td fw={600}>{g.insumo}</Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {g.saldo === null ? '—' : `${numero(g.saldo, 2)} ${g.unidad}`}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" fw={700}>
                        {ver(g.valor)}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text span size="sm">
                            {g.lotes}
                          </Text>
                          {g.sinCosto > 0 ? (
                            <Badge color="orange" variant="filled" size="sm">
                              {`${g.sinCosto} sin costo`}
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )
      ) : productosPt.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconBuildingWarehouse}
            titulo="Todavía no hay stock con costo"
            descripcion="Se valoriza solo cuando los lotes tienen costo cargado (Costos › Lotes)."
          />
        </Paper>
      ) : visiblesPt.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconSearch}
            titulo="Ningún producto coincide"
            descripcion="Probá con otro texto."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ ...ESTILO_BORDE, overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th ta="right">Saldo (unidades)</Table.Th>
                  <Table.Th>Retenido</Table.Th>
                  <Table.Th ta="right">Costo unitario</Table.Th>
                  <Table.Th ta="right">Valor</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visiblesPt.map((g) => {
                  const incompleto = g.faltantes > 0 || g.costo === null;
                  return (
                    <Table.Tr key={g.producto_id}>
                      <Table.Td fw={600}>{g.producto}</Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {numero(g.saldo, 0)}
                      </Table.Td>
                      <Table.Td>
                        {g.retenido > 0 ? (
                          <Badge color="gray" variant="light">
                            {`${numero(g.retenido, 0)} sin liberar`}
                          </Badge>
                        ) : (
                          <Text span c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        <Group gap={6} justify="flex-end" wrap="nowrap">
                          {ver(g.costo)}
                          {incompleto ? (
                            <Badge color="orange" variant="filled" size="sm">
                              costo incompleto
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace" fw={700}>
                        {ver(g.valor)}
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={() =>
                            void navigate(`/costos/producto/${g.producto_id}`)
                          }
                        >
                          Ver panel
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}

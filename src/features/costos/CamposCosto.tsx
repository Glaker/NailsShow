import { Badge, Grid, Group, NumberInput, SegmentedControl, Select, Switch, Text } from '@mantine/core';
import { numero } from '@/lib/formato';
import {
  ALICUOTAS,
  COMPROBANTES,
  UNIDADES_COSTO,
  convertirCantidad,
  netoArs,
  type Comprobante,
  type CostoReferencia,
  type Moneda,
} from '@/lib/consultasCostos';

/** Lo que se tipea al cargar el costo de un lote o un accesorio. */
export type ValorCosto = {
  tipo_comprobante: Comprobante;
  importe: number | null;
  incluye_iva: boolean;
  alicuota_iva: number;
  moneda: Moneda;
  tipo_cambio: number | null;
  cantidad: number | null;
  unidad: string;
};

export const COSTO_VACIO: ValorCosto = {
  tipo_comprobante: 'FACTURA_A',
  importe: null,
  incluye_iva: true,
  alicuota_iva: 21,
  moneda: 'ARS',
  tipo_cambio: null,
  cantidad: null,
  unidad: 'kg',
};

/** Completo para guardar: importe, cantidad y, en dólares, tipo de cambio. */
export const costoCompleto = (v: ValorCosto) =>
  v.importe !== null &&
  v.importe >= 0 &&
  (v.cantidad ?? 0) > 0 &&
  (v.moneda === 'ARS' || (v.tipo_cambio ?? 0) > 0);

const pesos = (v: number) => `$ ${numero(v, 2)}`;

/**
 * «Pagué $X por N unidades, con o sin IVA». Muestra el neto y el unitario
 * resultantes en la unidad del catálogo, y la variación contra el costo de
 * referencia vigente. La base recalcula todo (comercial.importe_neto_ars); acá
 * es para que quien carga vea qué se entendió.
 */
export function CamposCosto({
  valor,
  onChange,
  unidadCatalogo,
  referencia,
  comprobanteFijo = false,
  sinCantidad = false,
}: {
  valor: ValorCosto;
  onChange: (v: ValorCosto) => void;
  unidadCatalogo?: string | null;
  referencia?: CostoReferencia | null;
  /** En la recepción el comprobante sale del que se cargó arriba. */
  comprobanteFijo?: boolean;
  /** Accesorios: no tienen cantidad. */
  sinCantidad?: boolean;
}) {
  const set = (cambio: Partial<ValorCosto>) => onChange({ ...valor, ...cambio });
  const esA = valor.tipo_comprobante === 'FACTURA_A';
  const tc = valor.moneda === 'ARS' ? 1 : (valor.tipo_cambio ?? 0);
  const neto =
    valor.importe !== null && tc > 0
      ? netoArs(valor.importe, valor.tipo_comprobante, esA ? valor.incluye_iva : null, valor.alicuota_iva, tc)
      : null;
  const cantCatalogo =
    !sinCantidad && valor.cantidad && unidadCatalogo
      ? convertirCantidad(valor.cantidad, valor.unidad, unidadCatalogo)
      : null;
  const unitario = neto !== null && cantCatalogo ? neto / cantCatalogo : null;
  const variacion =
    unitario !== null && referencia?.costo_unitario_ars
      ? unitario / referencia.costo_unitario_ars - 1
      : null;

  return (
    <Grid gutter="sm">
      {comprobanteFijo ? null : (
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Comprobante"
            data={COMPROBANTES}
            value={valor.tipo_comprobante}
            onChange={(v) => v && set({ tipo_comprobante: v as Comprobante })}
            allowDeselect={false}
          />
        </Grid.Col>
      )}
      <Grid.Col span={{ base: 12, sm: comprobanteFijo ? 4 : 6 }}>
        <Text size="sm" fw={500} mb={6}>
          Moneda
        </Text>
        <SegmentedControl
          fullWidth
          data={[
            { label: 'Pesos', value: 'ARS' },
            { label: 'Dólares', value: 'USD' },
          ]}
          value={valor.moneda}
          onChange={(v) => set({ moneda: v as Moneda })}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 6, sm: 4 }}>
        <NumberInput
          label={sinCantidad ? 'Importe' : 'Pagué'}
          prefix={valor.moneda === 'USD' ? 'U$D ' : '$ '}
          thousandSeparator="."
          decimalSeparator=","
          decimalScale={4}
          min={0}
          value={valor.importe ?? ''}
          onChange={(v) => set({ importe: v === '' ? null : Number(v) })}
        />
      </Grid.Col>
      {sinCantidad ? null : (
        <>
          <Grid.Col span={{ base: 3, sm: 2 }}>
            <NumberInput
              label="Por"
              min={0}
              decimalScale={4}
              decimalSeparator=","
              value={valor.cantidad ?? ''}
              onChange={(v) => set({ cantidad: v === '' ? null : Number(v) })}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 3, sm: 2 }}>
            <Select
              label="Unidad"
              data={UNIDADES_COSTO}
              value={valor.unidad}
              onChange={(v) => v && set({ unidad: v })}
              allowDeselect={false}
            />
          </Grid.Col>
        </>
      )}
      {valor.moneda === 'USD' ? (
        <Grid.Col span={{ base: 6, sm: 4 }}>
          <NumberInput
            label="Tipo de cambio ($ por U$D)"
            min={0}
            decimalScale={4}
            thousandSeparator="."
            decimalSeparator=","
            value={valor.tipo_cambio ?? ''}
            onChange={(v) => set({ tipo_cambio: v === '' ? null : Number(v) })}
          />
        </Grid.Col>
      ) : null}
      {esA ? (
        <>
          <Grid.Col span={{ base: 6, sm: 4 }} pt={{ base: 'sm', sm: 34 }}>
            <Switch
              size="md"
              label="El importe incluye IVA"
              checked={valor.incluye_iva}
              onChange={(e) => set({ incluye_iva: e.currentTarget.checked })}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <Select
              label="Alícuota"
              data={ALICUOTAS.map((a) => ({ value: a, label: a === '0' ? 'Exento' : `${a.replace('.', ',')} %` }))}
              value={String(valor.alicuota_iva)}
              onChange={(v) => v && set({ alicuota_iva: Number(v) })}
              allowDeselect={false}
            />
          </Grid.Col>
        </>
      ) : null}
      <Grid.Col span={12}>
        <Group gap="md" wrap="wrap">
          {valor.tipo_comprobante === 'SIN_COMPROBANTE' ? (
            <Badge color="orange" variant="light">
              Sin comprobante: sin crédito fiscal, el total es costo
            </Badge>
          ) : !esA ? (
            <Badge color="gray" variant="light">
              IVA no discriminado: el total es costo
            </Badge>
          ) : null}
          {neto !== null ? (
            <Text size="sm">
              Neto: <b>{pesos(neto)}</b>
            </Text>
          ) : null}
          {unitario !== null && unidadCatalogo ? (
            <Text size="sm">
              Unitario: <b>{pesos(unitario)}</b> por {unidadCatalogo}
            </Text>
          ) : !sinCantidad && valor.cantidad && unidadCatalogo && cantCatalogo === null ? (
            <Text size="sm" c="orange">
              No se puede pasar {valor.unidad} a {unidadCatalogo} sin densidad: cargalo en{' '}
              {unidadCatalogo}.
            </Text>
          ) : null}
          {variacion !== null ? (
            <Text size="sm" c={Math.abs(variacion) > 0.05 ? 'orange' : 'dimmed'}>
              {variacion >= 0 ? '+' : ''}
              {numero(variacion * 100, 1)} % contra el costo de referencia (
              {pesos(referencia!.costo_unitario_ars!)})
            </Text>
          ) : null}
        </Group>
      </Grid.Col>
    </Grid>
  );
}

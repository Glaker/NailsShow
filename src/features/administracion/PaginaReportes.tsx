import { useState } from 'react';
import { Alert, Badge, Paper, Skeleton, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { fecha } from '@/lib/formato';
import {
  mes,
  pesos,
  useCashFlowProyectado,
  useCashFlowReal,
  useComprasTrazadas,
  useIvaMensual,
  useResultadoMensual,
  useVentasMensuales,
} from '@/lib/consultasAdministracion';

/**
 * Reportes de Administración (§3 del documento): se arman solos con la
 * operatoria diaria. Son de gestión: la liquidación de IVA y los estados
 * contables los hace el estudio (D-34).
 */
export function PaginaReportes() {
  const [vista, setVista] = useState<string | null>('iva');
  return (
    <>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="IVA, ventas, resultado y flujo de fondos, armados con lo que se carga día a día."
      />
      <Tabs value={vista} onChange={setVista} color="violeta" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="iva">IVA Compras vs. Ventas</Tabs.Tab>
          <Tabs.Tab value="ventas">Ventas</Tabs.Tab>
          <Tabs.Tab value="resultado">Resultado mensual</Tabs.Tab>
          <Tabs.Tab value="real">Cash flow real</Tabs.Tab>
          <Tabs.Tab value="proyectado">Cash flow proyectado</Tabs.Tab>
          <Tabs.Tab value="compras">Compras</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="iva">
          <Iva />
        </Tabs.Panel>
        <Tabs.Panel value="ventas">
          <Ventas />
        </Tabs.Panel>
        <Tabs.Panel value="resultado">
          <Resultado />
        </Tabs.Panel>
        <Tabs.Panel value="real">
          <CashReal />
        </Tabs.Panel>
        <Tabs.Panel value="proyectado">
          <CashProyectado />
        </Tabs.Panel>
        <Tabs.Panel value="compras">
          <Compras />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

function Tabla({
  cabeza,
  children,
  ancho = 720,
}: {
  cabeza: string[];
  children: React.ReactNode;
  ancho?: number;
}) {
  return (
    <Paper
      withBorder
      style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
    >
      <Table.ScrollContainer minWidth={ancho}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              {cabeza.map((c, i) => (
                <Table.Th key={c} ta={i === 0 ? undefined : 'right'}>
                  {c}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{children}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

const Num = ({ v, fuerte }: { v: number | null | undefined; fuerte?: boolean }) => (
  <Table.Td ta="right" ff="monospace" fw={fuerte ? 700 : 400}>
    {pesos(v)}
  </Table.Td>
);

const Nota = ({ children }: { children: React.ReactNode }) => (
  <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
    {children}
  </Alert>
);

function Iva() {
  const iva = useIvaMensual();
  if (iva.isLoading) return <Skeleton h={200} />;
  const filas = iva.data ?? [];
  const homologacion = filas.some((f) => Number(f.debito_homologacion) > 0);
  return (
    <Stack gap="md">
      <Nota>
        Débito: IVA de las facturas autorizadas en producción. Crédito: IVA de las
        facturas y notas de crédito A de proveedores. Es una estimación para anticipar la
        posición antes del cierre; la liquidación la hace el estudio. Las compras sin
        factura no dan crédito fiscal.
        {homologacion ? ' Las facturas de homologación no cuentan.' : ''}
      </Nota>
      <Tabla
        cabeza={[
          'Mes',
          'Débito fiscal',
          'Crédito fiscal',
          'Posición',
          'Compras B y C',
          'Sin factura',
        ]}
      >
        {filas.map((f) => (
          <Table.Tr key={f.periodo}>
            <Table.Td tt="capitalize">{mes(f.periodo ?? '')}</Table.Td>
            <Num v={f.debito_fiscal} />
            <Num v={f.credito_fiscal} />
            <Table.Td ta="right">
              <Badge
                color={Number(f.posicion) > 0 ? 'red' : 'estadoAprobado'}
                variant="light"
                size="lg"
              >
                {Number(f.posicion) > 0 ? 'a pagar ' : 'a favor '}
                {pesos(Math.abs(Number(f.posicion)))}
              </Badge>
            </Table.Td>
            <Num v={f.compras_sin_iva_discriminado} />
            <Num v={f.compras_sin_factura} />
          </Table.Tr>
        ))}
      </Tabla>
    </Stack>
  );
}

function Ventas() {
  const ventas = useVentasMensuales();
  if (ventas.isLoading) return <Skeleton h={200} />;
  const filas = (ventas.data ?? []).filter((v) => v.ambiente === 'PRODUCCION');
  const porMes = new Map<string, { neto: number; facturas: number; clientes: number }>();
  for (const v of filas) {
    const m = porMes.get(v.periodo ?? '') ?? { neto: 0, facturas: 0, clientes: 0 };
    porMes.set(v.periodo ?? '', {
      neto: m.neto + Number(v.neto),
      facturas: m.facturas + Number(v.facturas),
      clientes: m.clientes + 1,
    });
  }
  return (
    <Stack gap="md">
      {filas.length === 0 ? (
        <Nota>
          Todavía no hay facturas autorizadas en producción: la facturación está en
          homologación.
        </Nota>
      ) : null}
      <Tabla cabeza={['Mes', 'Facturado neto', 'Facturas', 'Clientes']}>
        {[...porMes].map(([periodo, m]) => (
          <Table.Tr key={periodo}>
            <Table.Td tt="capitalize">{mes(periodo)}</Table.Td>
            <Num v={m.neto} fuerte />
            <Table.Td ta="right">{m.facturas}</Table.Td>
            <Table.Td ta="right">{m.clientes}</Table.Td>
          </Table.Tr>
        ))}
      </Tabla>
      <Text fw={600}>Por cliente</Text>
      <Tabla cabeza={['Mes · cliente', 'Neto', 'IVA', 'Total']}>
        {filas.map((v) => (
          <Table.Tr key={`${v.periodo}-${v.cliente_id}`}>
            <Table.Td>
              <Text size="sm" tt="capitalize">
                {mes(v.periodo ?? '')}
              </Text>
              <Text size="xs" c="dimmed">
                {v.cliente}
              </Text>
            </Table.Td>
            <Num v={v.neto} />
            <Num v={v.iva} />
            <Num v={v.total} fuerte />
          </Table.Tr>
        ))}
      </Tabla>
    </Stack>
  );
}

function Resultado() {
  const r = useResultadoMensual();
  if (r.isLoading) return <Skeleton h={200} />;
  return (
    <Stack gap="md">
      <Nota>
        Resultado de gestión: ventas netas facturadas menos compras netas menos otros
        egresos de caja. No es un estado contable: no tiene costo de lo vendido ni
        devengamiento (el sistema todavía no tiene costos, D-36).
      </Nota>
      <Tabla cabeza={['Mes', 'Ventas netas', 'Compras', 'Otros egresos', 'Resultado']}>
        {(r.data ?? []).map((f) => (
          <Table.Tr key={f.periodo}>
            <Table.Td tt="capitalize">{mes(f.periodo ?? '')}</Table.Td>
            <Num v={f.ventas_netas} />
            <Num v={f.compras} />
            <Num v={f.otros_egresos} />
            <Table.Td
              ta="right"
              ff="monospace"
              fw={700}
              c={Number(f.resultado) < 0 ? 'red.7' : 'estadoAprobado.7'}
            >
              {pesos(f.resultado)}
            </Table.Td>
          </Table.Tr>
        ))}
      </Tabla>
    </Stack>
  );
}

function CashReal() {
  const r = useCashFlowReal();
  if (r.isLoading) return <Skeleton h={200} />;
  return (
    <Stack gap="md">
      <Nota>
        Lo que entró y salió de verdad, por mes y cuenta. Las transferencias entre cuentas
        no cuentan.
      </Nota>
      <Tabla cabeza={['Mes · cuenta', 'Ingresos', 'Egresos', 'Neto']}>
        {(r.data ?? []).map((f) => (
          <Table.Tr key={`${f.periodo}-${f.cuenta_id}`}>
            <Table.Td>
              <Text size="sm" tt="capitalize">
                {mes(f.periodo ?? '')}
              </Text>
              <Text size="xs" c="dimmed">
                {f.cuenta}
                {f.de_tercero ? ' · cuenta de tercero' : ''}
              </Text>
            </Table.Td>
            <Num v={f.ingresos} />
            <Num v={f.egresos} />
            <Num v={f.neto} fuerte />
          </Table.Tr>
        ))}
      </Tabla>
    </Stack>
  );
}

function CashProyectado() {
  const r = useCashFlowProyectado();
  if (r.isLoading) return <Skeleton h={200} />;
  const filas = r.data ?? [];
  const conFecha = filas.filter((f) => f.fecha);
  const sinFecha = filas.filter((f) => !f.fecha);
  const tipo: Record<string, string> = {
    PAGO_PROVEEDOR: 'Pago a proveedor',
    SOLICITUD_PAGO: 'Solicitud de pago',
    COBRANZA: 'Cobranza',
  };
  return (
    <Stack gap="md">
      <Nota>
        Compromisos con fecha: vencimientos de proveedores y solicitudes de pago. Las
        cobranzas pendientes van aparte porque las facturas no tienen vencimiento cargado.
        Sueldos e impuestos esperan su módulo (D-34).
      </Nota>
      <Tabla cabeza={['Fecha · concepto', 'Importe']} ancho={520}>
        {conFecha.map((f) => (
          <Table.Tr key={`${f.tipo}-${f.origen_id}`}>
            <Table.Td>
              <Text size="sm">{fecha(f.fecha)}</Text>
              <Text size="xs" c="dimmed">
                {f.tipo && tipo[f.tipo]} · {f.detalle}
              </Text>
            </Table.Td>
            <Num v={f.importe} />
          </Table.Tr>
        ))}
      </Tabla>
      {sinFecha.length > 0 ? (
        <>
          <Text fw={600}>
            Sin fecha: {pesos(sinFecha.reduce((a, f) => a + Number(f.importe), 0))} a
            cobrar y{' '}
            {pesos(
              -sinFecha
                .filter((f) => Number(f.importe) < 0)
                .reduce((a, f) => a + Number(f.importe), 0),
            )}{' '}
            a pagar
          </Text>
          <Tabla cabeza={['Concepto', 'Importe']} ancho={520}>
            {sinFecha.map((f) => (
              <Table.Tr key={`${f.tipo}-${f.origen_id}`}>
                <Table.Td>
                  {f.tipo && tipo[f.tipo]} · {f.detalle}
                </Table.Td>
                <Num v={f.importe} />
              </Table.Tr>
            ))}
          </Tabla>
        </>
      ) : null}
    </Stack>
  );
}

const SITUACION: Record<string, { texto: string; color: string }> = {
  SIN_RECIBIR: { texto: 'Sin recibir', color: 'gray' },
  SIN_COMPROBANTE: { texto: 'Recibida sin factura cargada', color: 'estadoCuarentena' },
  IMPAGA: { texto: 'Impaga', color: 'red' },
  CERRADA: { texto: 'Pagada', color: 'estadoAprobado' },
  DESCARTADA: { texto: 'Descartada', color: 'gray' },
  SIN_COMPRA: { texto: 'Recepción sin compra anotada', color: 'violeta' },
};

/** Traza de cada compra: pedido de Producción → recepción → factura → pago. */
function Compras() {
  const c = useComprasTrazadas();
  if (c.isLoading) return <Skeleton h={200} />;
  return (
    <Stack gap="md">
      <Nota>
        Cada compra que anota Producción, con su recepción, su factura y lo que falta
        pagar. Un dato se carga una vez y alimenta todo.
      </Nota>
      <Tabla
        cabeza={[
          'Insumo · proveedor',
          'Pedida',
          'Recepción',
          'Factura',
          'Falta pagar',
          'Situación',
        ]}
        ancho={900}
      >
        {(c.data ?? []).map((f, i) => (
          <Table.Tr key={f.aviso_id ?? `r${i}`}>
            <Table.Td>
              <Text size="sm" fw={600}>
                {f.insumo ?? '—'}
              </Text>
              <Text size="xs" c="dimmed">
                {f.proveedor ?? 'sin proveedor'}
              </Text>
            </Table.Td>
            <Table.Td ta="right">{fecha(f.pedida_en)}</Table.Td>
            <Table.Td ta="right">{f.recepcion_numero ?? '—'}</Table.Td>
            <Table.Td ta="right">
              {f.importe_total ? pesos(f.importe_total) : '—'}
            </Table.Td>
            <Table.Td ta="right" ff="monospace">
              {f.pendiente ? pesos(f.pendiente) : '—'}
            </Table.Td>
            <Table.Td ta="right">
              <Badge
                color={SITUACION[f.situacion ?? '']?.color ?? 'gray'}
                variant="light"
              >
                {SITUACION[f.situacion ?? '']?.texto ?? f.situacion}
              </Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Tabla>
    </Stack>
  );
}

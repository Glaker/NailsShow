import { useState } from 'react';
import { Badge, Button, Group, Paper, Select, Skeleton, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconChartBar, IconDownload, IconFileSpreadsheet, IconTable } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { useProductos } from '@/lib/consultas';
import { useProduccionSemanal, useTrabajoOperarias } from '@/lib/consultasTareasProduccion';
import { descargarXlsx } from '@/lib/xlsx';
import { GraficoProductividad } from './GraficoProductividad';
import { filasMensual, limitesMes, matrizAnual, mesesAtras } from './informes';

const nombreMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Vista previa de una tabla de Excel: las primeras filas. */
function Previa({ filas, max = 30 }: { filas: (string | number | boolean | null)[][]; max?: number }) {
  const [enc, ...resto] = filas;
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped verticalSpacing={4} fz="xs">
        <Table.Thead>
          <Table.Tr>
            {(enc ?? []).map((c, i) => (
              <Table.Th key={i} style={{ whiteSpace: 'nowrap' }}>
                {String(c)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {resto.slice(0, max).map((f, i) => (
            <Table.Tr key={i}>
              {f.map((c, j) => (
                <Table.Td key={j} style={{ whiteSpace: 'nowrap' }}>
                  {c === null ? '' : String(c)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Informe mensual: quién hizo qué, cuándo y con quién. Dos años hacia atrás. */
function InformeMensual() {
  const meses = mesesAtras(24);
  const [mes, setMes] = useState(meses[0]!);
  const [desde, hasta] = limitesMes(mes);
  const trabajo = useTrabajoOperarias(desde, hasta);
  const filas = filasMensual(trabajo.data ?? []);
  const enCurso = mes === meses[0];
  return (
    <Stack gap="md">
      <Group align="flex-end" justify="space-between">
        <Group align="flex-end">
          <Select
            label="Mes"
            data={meses.map((m) => ({ value: m, label: nombreMes(m) }))}
            value={mes}
            onChange={(v) => v && setMes(v)}
            allowDeselect={false}
            w={220}
          />
          <Badge variant="light" color={enCurso ? 'yellow' : 'green'} size="lg" radius="sm">
            {enCurso ? 'En curso: se actualiza solo' : 'Cerrado'}
          </Badge>
        </Group>
        <Button
          leftSection={<IconDownload size={18} />}
          disabled={filas.length <= 1}
          onClick={() => descargarXlsx(filas, `Produccion ${mes}`, 'Producción')}
        >
          Descargar Excel
        </Button>
      </Group>
      {trabajo.isLoading ? (
        <Skeleton h={200} />
      ) : filas.length <= 1 ? (
        <Text c="dimmed">No hay tareas registradas en {nombreMes(mes).toLowerCase()}.</Text>
      ) : (
        <Previa filas={filas} />
      )}
    </Stack>
  );
}

/** Informe anual: SKU × viernes, cerrado el 31 de diciembre. Cuatro años atrás. */
function InformeAnual() {
  const este = new Date().getFullYear();
  const anios = Array.from({ length: 5 }, (_, i) => este - i);
  const [anio, setAnio] = useState(este);
  const productos = useProductos();
  const semanal = useProduccionSemanal(`${anio}-01-01`, `${anio}-12-31`);
  const catalogo = (productos.data ?? []).filter((p) => p.activo);
  const filas = matrizAnual(anio, catalogo, semanal.data ?? []);
  return (
    <Stack gap="md">
      <Group align="flex-end" justify="space-between">
        <Group align="flex-end">
          <Select
            label="Año"
            data={anios.map((a) => ({ value: String(a), label: String(a) }))}
            value={String(anio)}
            onChange={(v) => v && setAnio(Number(v))}
            allowDeselect={false}
            w={140}
          />
          <Badge variant="light" color={anio === este ? 'yellow' : 'green'} size="lg" radius="sm">
            {anio === este ? 'En curso: cierra el 31 de diciembre' : 'Cerrado'}
          </Badge>
        </Group>
        <Button
          leftSection={<IconDownload size={18} />}
          disabled={catalogo.length === 0}
          onClick={() => descargarXlsx(filas, `Produccion anual ${anio}`, String(anio))}
        >
          Descargar Excel
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Cada columna es la semana que cierra ese viernes; sale de las órdenes de producción
        terminadas (lo rechazado no cuenta).
      </Text>
      {semanal.isLoading || productos.isLoading ? <Skeleton h={200} /> : <Previa filas={filas} max={60} />}
    </Stack>
  );
}

/**
 * Informes y estadísticas (D-tareas-1, pedido del 2026-10-23): productividad
 * por operaria, el informe mensual de tareas y el anual por SKU. Se
 * actualizan solos; los meses y años pasados quedan cerrados.
 */
export function PaginaInformes() {
  const [vista, setVista] = useState<string | null>('productividad');
  const meses = mesesAtras(24);
  const [mes, setMes] = useState(meses[0]!);
  const [desde, hasta] = limitesMes(mes);
  return (
    <>
      <EncabezadoPagina
        titulo="Informes y estadísticas"
        descripcion="Productividad de planta y los informes de producción, para mirar o bajar a Excel."
      />
      <Tabs value={vista} onChange={setVista} keepMounted={false} color="azul">
        <Tabs.List mb="lg">
          <Tabs.Tab value="productividad" leftSection={<IconChartBar size={18} />}>
            Productividad
          </Tabs.Tab>
          <Tabs.Tab value="mensual" leftSection={<IconTable size={18} />}>
            Informe mensual
          </Tabs.Tab>
          <Tabs.Tab value="anual" leftSection={<IconFileSpreadsheet size={18} />}>
            Informe anual
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="productividad">
          <Stack gap="md">
            <Select
              label="Mes"
              data={meses.map((m) => ({ value: m, label: nombreMes(m) }))}
              value={mes}
              onChange={(v) => v && setMes(v)}
              allowDeselect={false}
              w={220}
            />
            <GraficoProductividad desde={desde} hasta={hasta} />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="mensual">
          <Paper withBorder p="md" radius="md" style={{ borderColor: 'var(--superficie-borde)' }}>
            <InformeMensual />
          </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="anual">
          <Paper withBorder p="md" radius="md" style={{ borderColor: 'var(--superficie-borde)' }}>
            <InformeAnual />
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

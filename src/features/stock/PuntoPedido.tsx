import { Badge, Paper, SegmentedControl, Skeleton, Table, Text } from '@mantine/core';
import { IconChecks } from '@tabler/icons-react';
import { useState } from 'react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { faltaTotal, useStockSeguridad } from '@/lib/consultasStockSeguridad';
import { numero } from '@/lib/formato';

const ACTIVO = ['Activo', 'Nuevo (<12m)'];

/**
 * Punto de pedido (pedido del 2026-10-23): pestaña de Stock, al lado de Stock
 * de seguridad. Los SKU activos por debajo del punto de pedido, lo más
 * urgente primero, con lo que ya calcula Stock de seguridad.
 */
export function PuntoPedido() {
  const filas = useStockSeguridad();
  const [accion, setAccion] = useState<'todas' | 'PRODUCIR' | 'COMPRAR'>('todas');
  const bajo = (filas.data ?? [])
    .filter(
      (f) =>
        f.aplica_stock &&
        f.bajo_punto_de_pedido &&
        ACTIVO.includes(f.estado_demanda ?? '') &&
        faltaTotal(f) > 0 &&
        (accion === 'todas' || f.accion === accion),
    )
    .sort((a, b) => faltaTotal(b) - faltaTotal(a));

  return (
    <>
      <EncabezadoPagina
        titulo="Punto de pedido"
        descripcion="Los SKU que están por debajo del punto de pedido y cuánto falta para volver a cubrirlo. Lo más urgente arriba."
        acciones={
          <SegmentedControl
            value={accion}
            onChange={(v) => setAccion(v as typeof accion)}
            data={[
              { value: 'todas', label: 'Todo' },
              { value: 'PRODUCIR', label: 'A producir' },
              { value: 'COMPRAR', label: 'A comprar' },
            ]}
          />
        }
      />
      {filas.isLoading ? (
        <Skeleton h={240} />
      ) : bajo.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconChecks}
            titulo="Nada por debajo del punto de pedido"
            descripcion="Todo está cubierto."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th ta="right">Disponible</Table.Th>
                  <Table.Th ta="right">En producción</Table.Th>
                  <Table.Th ta="right">Punto de pedido</Table.Th>
                  <Table.Th ta="right">Falta</Table.Th>
                  <Table.Th>Qué hacer</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {bajo.map((f) => (
                  <Table.Tr key={f.sku_id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {f.descripcion}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {f.sku_cod}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(f.disponible ?? 0)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(f.en_produccion ?? 0)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(f.rop_meta ?? f.rop_planilla ?? 0)}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {numero(faltaTotal(f))}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={f.accion === 'COMPRAR' ? 'blue' : 'grape'}
                        radius="sm"
                      >
                        {f.accion === 'COMPRAR' ? 'Comprar' : 'Producir'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </>
  );
}

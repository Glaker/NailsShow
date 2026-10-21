import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Paper, Skeleton, Table, Text } from '@mantine/core';
import { IconClipboardCheck } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import {
  useFormulasConsultadas,
  type FormulaConsultada,
} from '@/lib/consultasEtiquetado';
import { fechaHora } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';
import { FormularioNuevaFormula } from './PaginaFormulas';

/**
 * Fórmulas que Gerencia de Producción no sabe y derivó con «No la sé»
 * (D-etiquetado-2). Salen solas de la lista en cuanto el producto tiene una.
 */
export function FormulasPendientes() {
  const pendientes = useFormulasConsultadas();
  const puedeCargar = useTieneRol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION');
  const navegar = useNavigate();
  const [cargando, setCargando] = useState<FormulaConsultada | null>(null);
  const filas = pendientes.data ?? [];

  if (pendientes.isLoading) return <Skeleton h={200} />;
  if (filas.length === 0)
    return (
      <Vacio
        icono={IconClipboardCheck}
        titulo="No hay fórmulas pendientes"
        descripcion="Cuando Gerencia de Producción no sepa la fórmula de un producto, aparece acá."
      />
    );

  return (
    <Paper
      withBorder
      style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
    >
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th>La pidió</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f) => (
              <Table.Tr key={f.producto_id}>
                <Table.Td>
                  <Text fw={600}>{f.nombre}</Text>
                  <Text size="xs" c="dimmed" ff="monospace">
                    {f.codigo_interno}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{f.consultada_por ?? '—'}</Text>
                  <Text size="xs" c="dimmed">
                    {fechaHora(f.formula_consultada_en)}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  {puedeCargar ? (
                    <Button variant="light" onClick={() => setCargando(f)}>
                      Cargar fórmula
                    </Button>
                  ) : null}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Modal
        opened={cargando !== null}
        onClose={() => setCargando(null)}
        title={<Text fw={700}>Nueva fórmula de {cargando?.nombre}</Text>}
        size="lg"
      >
        {cargando ? (
          <FormularioNuevaFormula
            productoInicial={cargando.producto_id}
            onListo={(id) => {
              setCargando(null);
              void navegar(`/formulas/${id}`);
            }}
          />
        ) : null}
      </Modal>
    </Paper>
  );
}

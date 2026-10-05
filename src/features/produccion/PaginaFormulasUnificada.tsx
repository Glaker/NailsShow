import { Button, Drawer, Group, Tabs } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Navigate, useSearchParams } from 'react-router-dom';
import { IconCalculator, IconClipboardList, IconPackages } from '@tabler/icons-react';
import { PaginaFormulas } from './PaginaFormulas';
import { PaginaCalculadoraLote } from './PaginaCalculadoraLote';
import { PaginaListaMateriales } from '@/features/comercial/PaginaListaMateriales';

const VISTAS = ['formulas', 'calculadora'] as const;
type VistaFormulas = (typeof VISTAS)[number];

/** `/calculadora-lote` y `/lista-materiales` llevan a la calculadora. */
export function RedirigirACalculadora() {
  return <Navigate to="/formulas?vista=calculadora" replace />;
}

/**
 * Fórmulas y calculadora de lote en una sola página (pedido del 2026-10-01).
 * «Qué lleva cada producto» no es sección: es un botón de la calculadora que
 * abre la lista de materiales en un panel lateral.
 */
export function PaginaFormulasUnificada() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('vista') as VistaFormulas | null;
  const vista = pedida && VISTAS.includes(pedida) ? pedida : 'formulas';
  const [materiales, panel] = useDisclosure(false);

  return (
    <>
      <Tabs
        value={vista}
        onChange={(v) => v && setParams({ vista: v }, { replace: true })}
        keepMounted={false}
        color="azul"
      >
        <Group justify="space-between" mb="lg" wrap="wrap" gap="sm">
          <Tabs.List>
            <Tabs.Tab value="formulas" leftSection={<IconClipboardList size={18} />}>
              Fórmulas
            </Tabs.Tab>
            <Tabs.Tab value="calculadora" leftSection={<IconCalculator size={18} />}>
              Calculadora de lote
            </Tabs.Tab>
          </Tabs.List>
          {vista === 'calculadora' ? (
            <Button
              variant="light"
              leftSection={<IconPackages size={18} />}
              onClick={panel.open}
            >
              Qué lleva cada producto
            </Button>
          ) : null}
        </Group>
        <Tabs.Panel value="formulas">
          <PaginaFormulas />
        </Tabs.Panel>
        <Tabs.Panel value="calculadora">
          <PaginaCalculadoraLote />
        </Tabs.Panel>
      </Tabs>
      <Drawer
        opened={materiales}
        onClose={panel.close}
        position="right"
        size="xl"
        title="Qué lleva cada producto"
      >
        <PaginaListaMateriales />
      </Drawer>
    </>
  );
}

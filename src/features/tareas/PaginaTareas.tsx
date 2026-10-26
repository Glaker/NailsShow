import { Tabs } from '@mantine/core';
import { useTieneRol } from '@/features/auth/sesion';
import { MisTareas } from './MisTareas';
import { TableroTareasProduccion } from './TableroTareasProduccion';

/**
 * «Mis tareas». Quien gestiona (Naza, DT y la encargada de stock,
 * gmp.es_gestor_tareas) además asigna desde acá: Agustina no ve
 * Planificación, donde Naza tiene el tablero (D-tareas-agustina-1).
 */
export function PaginaTareas() {
  const gestiona = useTieneRol(
    'GERENCIA_PRODUCCION',
    'DIRECCION_TECNICA',
    'ENCARGADA_STOCK',
  );
  if (!gestiona) return <MisTareas />;
  return (
    <Tabs defaultValue="mias" color="azul" keepMounted={false}>
      <Tabs.List mb="lg">
        <Tabs.Tab value="mias">Mis tareas</Tabs.Tab>
        <Tabs.Tab value="asignar">Asignar tareas</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="mias">
        <MisTareas />
      </Tabs.Panel>
      <Tabs.Panel value="asignar">
        <TableroTareasProduccion />
      </Tabs.Panel>
    </Tabs>
  );
}

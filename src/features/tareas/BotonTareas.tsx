import { useState } from 'react';
import { ActionIcon, Button, Modal, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPinned } from '@tabler/icons-react';
import { useSesion } from '@/features/auth/sesion';
import { MatrizTareas } from './MatrizTareas';

/**
 * «Tareas»: un botón, no una sección (pedido del 2026-10-14: que no cambie el
 * aspecto de la app ni se ponga delante de lo de cada uno). Abre la matriz en
 * grande. Todos menos los operarios, que tienen sus tareas de planta.
 */
export function BotonTareas({ compacto = false }: { compacto?: boolean }) {
  const { claims } = useSesion();
  const [abierta, setAbierta] = useState(false);
  const movil = useMediaQuery('(max-width: 48em)');
  if (!claims?.rol || claims.rol === 'OPERARIO') return null;

  return (
    <>
      {compacto ? (
        <Tooltip label="Tareas">
          <ActionIcon
            variant="light"
            size="lg"
            aria-label="Abrir Tareas"
            onClick={() => setAbierta(true)}
          >
            <IconPinned size={20} />
          </ActionIcon>
        </Tooltip>
      ) : (
        <Button
          fullWidth
          variant="light"
          leftSection={<IconPinned size={18} />}
          onClick={() => setAbierta(true)}
        >
          Tareas
        </Button>
      )}
      <Modal
        opened={abierta}
        onClose={() => setAbierta(false)}
        title={
          <Text fw={700} fz="lg">
            Tareas
          </Text>
        }
        size="min(1280px, 96vw)"
        fullScreen={Boolean(movil)}
      >
        {abierta ? <MatrizTareas /> : null}
      </Modal>
    </>
  );
}

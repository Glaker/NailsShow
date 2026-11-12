import { Badge, Box, Group, Modal, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconHandFinger,
  IconMinus,
  IconPackage,
  IconPlus,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-react';
import Stepper, { Step } from '@/vendor/reactbits/Stepper';

const CLAVE = 'nailshow.cliente.tutorial-visto';

/**
 * Si ya vio el tutorial en este teléfono. Es una comodidad de la pantalla, no
 * un dato de negocio: si el navegador no deja guardar, se vuelve a mostrar.
 */
export function tutorialVisto(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

function marcarVisto() {
  try {
    localStorage.setItem(CLAVE, '1');
  } catch {
    /* sin almacenamiento: se vuelve a mostrar, no pasa nada */
  }
}

function Paso({
  icono,
  titulo,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Stack align="center" ta="center" gap="md" py="md">
      <ThemeIcon size={84} radius={999} variant="light" color="grape">
        {icono}
      </ThemeIcon>
      <Title order={3}>{titulo}</Title>
      {children}
    </Stack>
  );
}

/** Cuatro pasos para el primer ingreso; se vuelve a ver desde el menú. */
export function Tutorial({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const cerrar = () => {
    marcarVisto();
    onCerrar();
  };
  return (
    <Modal
      opened={abierto}
      onClose={cerrar}
      fullScreen
      title={<Text fw={800}>Así se arma tu pedido</Text>}
      transitionProps={{ transition: 'slide-up', duration: 250 }}
    >
      <Box maw={460} mx="auto">
        <Stepper
          initialStep={1}
          onFinalStepCompleted={cerrar}
          backButtonText="Atrás"
          nextButtonText="Siguiente"
          completeButtonText="¡Empezar!"
          accentColor="#be4bdb"
          indicator="dots"
          width="100%"
          radius={18}
          theme="light"
        >
          <Step>
            <Paso icono={<IconSearch size={42} />} titulo="Buscá lo que necesitás">
              <Text>
                Escribí el nombre o el código arriba, o tocá una categoría para ver solo
                eso.
              </Text>
            </Paso>
          </Step>
          <Step>
            <Paso icono={<IconPlus size={42} />} titulo="Sumá cantidades">
              <Group gap={6} justify="center">
                <ThemeIcon radius="xl" variant="light" color="gray">
                  <IconMinus size={16} />
                </ThemeIcon>
                <Text fw={800}>12</Text>
                <ThemeIcon radius="xl" color="grape">
                  <IconPlus size={16} />
                </ThemeIcon>
              </Group>
              <Text>
                Tocá + y − o escribí el número. Donde dice{' '}
                <Badge
                  size="sm"
                  color="grape"
                  variant="light"
                  leftSection={<IconPackage size={12} />}
                >
                  + Pack
                </Badge>{' '}
                sumás un pack entero de una.
              </Text>
            </Paso>
          </Step>
          <Step>
            <Paso icono={<IconSparkles size={42} />} titulo="Mirá tu descuento">
              <Text>
                Abajo ves el total y el % de descuento que vas logrando. Te avisamos
                cuánto te falta para llegar al siguiente.
              </Text>
              <span className="cli-descuento">−25 %</span>
            </Paso>
          </Step>
          <Step>
            <Paso icono={<IconHandFinger size={42} />} titulo="Deslizá para enviar">
              <Text>
                Tocá «Ver pedido», revisalo y deslizá el botón para enviarlo. Mientras
                Ventas lo revisa, lo podés corregir o cancelar desde «Mis pedidos».
              </Text>
            </Paso>
          </Step>
        </Stepper>
      </Box>
    </Modal>
  );
}

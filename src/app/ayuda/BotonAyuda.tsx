import { useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { Accordion, Alert, Button, List, Modal, Stack, Text } from '@mantine/core';
import { IconHelpCircle, IconInfoCircle } from '@tabler/icons-react';
import { useSesion, type Rol } from '@/features/auth/sesion';
import type { AyudaPantalla, MapaAyuda } from './tipos';
import { AYUDA_PRODUCCION } from './produccion';
import { AYUDA_COMERCIAL } from './comercial';
import { AYUDA_COSTOS } from './costos';

const AYUDA: MapaAyuda = { ...AYUDA_PRODUCCION, ...AYUDA_COMERCIAL, ...AYUDA_COSTOS };

export const NOMBRE_ROL: Record<Rol, string> = {
  OPERARIO: 'Operario',
  CONTROL_CALIDAD: 'Control de Calidad',
  DIRECCION_TECNICA: 'Dirección Técnica',
  ADMINISTRACION: 'Administración',
  GERENCIA_PRODUCCION: 'Gerencia de Producción',
  GERENCIA: 'Gerencia',
  ENCARGADA_STOCK: 'Encargada de stock',
  VENTAS: 'Ventas',
  ADMINISTRADOR_SISTEMA: 'Administrador del sistema',
  FINANZAS: 'Finanzas',
};

/** La ayuda de la ruta actual, si hay. Clave = `path` de routes.tsx. */
export function ayudaDe(pathname: string): AyudaPantalla | null {
  const clave = Object.keys(AYUDA).find((p) => matchPath(p, pathname));
  return clave ? AYUDA[clave]! : null;
}

/**
 * «¿Cómo funciona?»: qué es la pantalla y qué hace cada rol en ella. Los roles
 * del usuario van primero y abiertos; los demás quedan plegados debajo, para
 * entender qué hace el compañero.
 */
export function BotonAyuda({ titulo }: { titulo: string }) {
  const { pathname } = useLocation();
  const { claims } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const ayuda = ayudaDe(pathname);
  if (!ayuda) return null;

  const mios = claims?.roles ?? [];
  const roles = (Object.keys(ayuda.porRol) as Rol[]).sort(
    (a, b) => Number(mios.includes(b)) - Number(mios.includes(a)),
  );

  return (
    <>
      <Button
        variant="light"
        size="md"
        leftSection={<IconHelpCircle size={20} />}
        onClick={() => setAbierto(true)}
      >
        ¿Cómo funciona?
      </Button>
      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title={<Text fw={700}>{titulo}: cómo funciona</Text>}
        size="lg"
      >
        <Stack gap="md">
          <Text>{ayuda.queEs}</Text>
          <Accordion
            multiple
            variant="separated"
            defaultValue={roles.filter((r) => mios.includes(r))}
          >
            {roles.map((r) => (
              <Accordion.Item key={r} value={r}>
                <Accordion.Control>
                  <Text fw={600}>
                    {NOMBRE_ROL[r]}
                    {mios.includes(r) ? ' · tu rol' : ''}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <List type="ordered" spacing="xs">
                    {ayuda.porRol[r]!.map((paso, i) => (
                      <List.Item key={i}>{paso}</List.Item>
                    ))}
                  </List>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
          {ayuda.aTener?.length ? (
            <Alert variant="light" color="gray" icon={<IconInfoCircle size={18} />}>
              <List spacing="xs">
                {ayuda.aTener.map((t, i) => (
                  <List.Item key={i}>{t}</List.Item>
                ))}
              </List>
            </Alert>
          ) : null}
        </Stack>
      </Modal>
    </>
  );
}

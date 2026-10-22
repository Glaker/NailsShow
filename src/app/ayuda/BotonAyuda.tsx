import { useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { Alert, Button, List, Modal, Stack, Text } from '@mantine/core';
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
  RECEPCION: 'Recepción',
};

/**
 * La ayuda de la ruta actual, si hay. Clave = `path` de routes.tsx, o una
 * pestaña con su propia ayuda (`/stock?vista=depositos`), que gana sobre la de
 * la página.
 */
export function ayudaDe(pathname: string, search = ''): AyudaPantalla | null {
  const vista = new URLSearchParams(search).get('vista');
  const pestania = vista ? AYUDA[`${pathname}?vista=${vista}`] : undefined;
  if (pestania) return pestania;
  const clave = Object.keys(AYUDA).find(
    (p) => !p.includes('?') && matchPath(p, pathname),
  );
  return clave ? AYUDA[clave]! : null;
}

/**
 * «¿Cómo funciona?»: qué es la pantalla y qué hace en ella el usuario. Solo se
 * muestran sus roles: los pasos de los demás sobrecargaban sin servirle.
 */
export function BotonAyuda({ titulo }: { titulo: string }) {
  const { pathname, search } = useLocation();
  const { claims } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const ayuda = ayudaDe(pathname, search);
  if (!ayuda) return null;

  const mios = claims?.roles ?? [];
  const roles = (Object.keys(ayuda.porRol) as Rol[]).filter((r) => mios.includes(r));

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
          {roles.map((r) => (
            <Stack key={r} gap={6}>
              {roles.length > 1 ? <Text fw={700}>{NOMBRE_ROL[r]}</Text> : null}
              <List type="ordered" spacing="xs">
                {ayuda.porRol[r]!.map((paso, i) => (
                  <List.Item key={i}>{paso}</List.Item>
                ))}
              </List>
            </Stack>
          ))}
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

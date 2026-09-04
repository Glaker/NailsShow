import { type ReactNode } from 'react';
import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Drawer,
  Group,
  Menu,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { NavLink as EnlaceRuta, useLocation } from 'react-router-dom';
import {
  IconChevronRight,
  IconLogout,
  IconPlus,
  IconRefresh,
  IconShieldLock,
} from '@tabler/icons-react';
import { Marca } from '@/components/Marca';
import { itemsVisibles, type ItemNavegacion } from './navegacion';
import { useSesion } from '@/features/auth/sesion';
import { etiquetaEnum } from '@/lib/formato';
import { SUPERFICIE } from './theme';

const ANCHO_BARRA = 250;

function ItemLateral({
  item,
  onNavegar,
}: {
  item: ItemNavegacion;
  onNavegar?: (() => void) | undefined;
}) {
  const { pathname } = useLocation();
  const activo = item.ruta === '/' ? pathname === '/' : pathname.startsWith(item.ruta);
  const Icono = item.icono;

  return (
    <EnlaceRuta
      to={item.ruta}
      className="nav-item"
      data-activo={activo}
      onClick={onNavegar}
    >
      <Icono size={20} stroke={1.7} />
      <span>{item.etiqueta}</span>
    </EnlaceRuta>
  );
}

/** Tarjeta de usuario del pie de la barra: quién está firmando lo que se carga. */
function TarjetaUsuario({ compacto = false }: { compacto?: boolean }) {
  const { claims, salir, refrescar } = useSesion();
  if (!claims) return null;

  const iniciales = (claims.nombre ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  return (
    <Menu
      position={compacto ? 'bottom-end' : 'right-end'}
      withArrow
      shadow="md"
      width={230}
    >
      <Menu.Target>
        <UnstyledButton
          style={{
            width: '100%',
            padding: 10,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.05)',
            transition: 'background-color var(--transicion)',
          }}
        >
          <Group gap="sm" wrap="nowrap">
            <Avatar radius="xl" size={36} color="rosa" variant="filled">
              {iniciales}
            </Avatar>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600} c="#fff" truncate>
                {claims.nombre}
              </Text>
              <Text size="xs" c={SUPERFICIE.barraTexto} truncate>
                {etiquetaEnum(claims.rol)}
              </Text>
            </div>
            <IconChevronRight size={16} color={SUPERFICIE.barraTexto} />
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{claims.nombre}</Menu.Label>
        <Menu.Item leftSection={<IconShieldLock size={16} />} disabled>
          <Text size="xs">
            {claims.roles.map(etiquetaEnum).join(' · ')}
            {claims.es_dt_titular ? ' · DT titular' : ''}
          </Text>
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconRefresh size={16} />}
          onClick={() => void refrescar()}
        >
          Actualizar permisos
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={16} />}
          onClick={() => void salir()}
        >
          Cerrar sesión
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function ContenidoBarra({ onNavegar }: { onNavegar?: (() => void) | undefined }) {
  const { claims } = useSesion();
  const items = itemsVisibles(claims?.roles ?? []);

  return (
    <Stack h="100%" gap={0} style={{ background: SUPERFICIE.barra }}>
      <Group gap="sm" px="md" py="lg" wrap="nowrap">
        <Marca size={34} />
        <div>
          <Text c="#fff" fw={800} fz={17} lh={1.1} style={{ letterSpacing: 0.5 }}>
            NAIL SHOW
          </Text>
          <Text
            c={SUPERFICIE.barraTexto}
            fz={9.5}
            fw={600}
            style={{ letterSpacing: 1.4 }}
          >
            TRAZABILIDAD · BPF
          </Text>
        </div>
      </Group>

      <ScrollArea flex={1} px="sm" type="never">
        <Stack gap={4} pb="md">
          {items.map((item) => (
            <ItemLateral key={item.ruta} item={item} onNavegar={onNavegar} />
          ))}
        </Stack>
      </ScrollArea>

      <Box p="sm">
        <TarjetaUsuario />
      </Box>
    </Stack>
  );
}

/**
 * Barra inferior del teléfono.
 *
 * Las cuatro pantallas de uso diario, más un botón que despliega el resto. En
 * planta el teléfono se usa con una mano, así que los objetivos están abajo,
 * donde llega el pulgar, y el botón que abre el resto queda del lado derecho.
 */
function BarraInferior({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { claims } = useSesion();
  const { pathname } = useLocation();
  const principales = itemsVisibles(claims?.roles ?? []).filter((i) => i.principal);

  return (
    <>
      <Paper
        shadow="md"
        radius={0}
        className="no-imprimir"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 190,
          borderTop: `1px solid ${SUPERFICIE.borde}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <Group gap={0} wrap="nowrap">
          {principales.map((item) => {
            const activo =
              item.ruta === '/' ? pathname === '/' : pathname.startsWith(item.ruta);
            const Icono = item.icono;
            return (
              <EnlaceRuta
                key={item.ruta}
                to={item.ruta}
                className="nav-inferior"
                data-activo={activo}
              >
                <Icono size={21} stroke={activo ? 2 : 1.6} />
                <span>{item.etiquetaCorta}</span>
              </EnlaceRuta>
            );
          })}
          {/* Hueco reservado para que el botón flotante no tape ningún ítem. */}
          <Box w={64} />
        </Group>
      </Paper>

      <Tooltip label="Todas las secciones" position="left">
        <ActionIcon
          size={56}
          radius="xl"
          variant="gradient"
          gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
          onClick={onAbrirMenu}
          aria-label="Abrir menú de secciones"
          className="no-imprimir"
          style={{
            position: 'fixed',
            right: 16,
            bottom: `calc(14px + env(safe-area-inset-bottom))`,
            zIndex: 200,
            boxShadow: '0 6px 20px rgba(90, 30, 90, 0.35)',
          }}
        >
          <IconPlus size={26} stroke={2.2} />
        </ActionIcon>
      </Tooltip>
    </>
  );
}

/**
 * Cascarón de la aplicación.
 *
 * Dos formas según el ancho:
 *  - escritorio y tablet apaisada: barra lateral fija;
 *  - teléfono: barra inferior con las secciones de uso diario y un botón «+»
 *    abajo a la derecha que despliega la navegación completa en un panel.
 */
export function Layout({ children }: { children: ReactNode }) {
  const esMovil = useMediaQuery('(max-width: 62em)');
  const [panelAbierto, panel] = useDisclosure(false);
  const { claims } = useSesion();

  return (
    <AppShell
      layout="alt"
      navbar={{
        width: ANCHO_BARRA,
        breakpoint: 'md',
        collapsed: { mobile: true, desktop: false },
      }}
      padding={esMovil ? 'md' : 'xl'}
      styles={{
        main: {
          background: SUPERFICIE.fondo,
          paddingBottom: esMovil ? 'calc(76px + env(safe-area-inset-bottom))' : undefined,
        },
      }}
    >
      <AppShell.Navbar
        withBorder={false}
        className="no-imprimir"
        style={{ background: SUPERFICIE.barra }}
      >
        <ContenidoBarra />
      </AppShell.Navbar>

      <AppShell.Main>
        {esMovil ? (
          <Group justify="space-between" mb="md" className="no-imprimir" wrap="nowrap">
            <Group gap={8} wrap="nowrap">
              <Marca size={28} />
              <Text fw={800} fz={15} c="ciruela.8" style={{ letterSpacing: 0.4 }}>
                NAIL SHOW
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              {claims?.rol ? (
                <Badge variant="light" color="violeta" radius="sm">
                  {etiquetaEnum(claims.rol)}
                </Badge>
              ) : null}
              <Burger opened={panelAbierto} onClick={panel.toggle} size="sm" />
            </Group>
          </Group>
        ) : null}

        <div className="entrada">{children}</div>
      </AppShell.Main>

      {esMovil ? (
        <>
          <BarraInferior onAbrirMenu={panel.open} />
          <Drawer
            opened={panelAbierto}
            onClose={panel.close}
            position="right"
            size={280}
            withCloseButton={false}
            padding={0}
            styles={{ content: { background: SUPERFICIE.barra } }}
          >
            <ContenidoBarra onNavegar={panel.close} />
          </Drawer>
        </>
      ) : null}
    </AppShell>
  );
}

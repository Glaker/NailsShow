import { type ReactNode } from 'react';
import { flushSync } from 'react-dom';
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
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { NavLink as EnlaceRuta, Link, useLocation } from 'react-router-dom';
import {
  IconBooks,
  IconChevronRight,
  IconLogout,
  IconMoon,
  IconMenu2,
  IconRefresh,
  IconShieldLock,
  IconSun,
} from '@tabler/icons-react';
import { Marca } from '@/components/Marca';
import { ROLES_CATALOGOS, useItemsVisibles, type ItemNavegacion } from './navegacion';
import { useSesion } from '@/features/auth/sesion';
import { etiquetaEnum } from '@/lib/formato';
import { SUPERFICIE } from './theme';
import { MODO_PRACTICA } from '@/lib/practica';

/** Cartel fijo de la app de práctica: datos inventados, nada se factura. */
export function CartelPractica() {
  return (
    <div className="cartel-practica no-imprimir" role="status">
      <b>MODO PRÁCTICA</b> · Base de prueba con datos inventados. Nada de lo que cargues
      acá es real ni se factura.
    </div>
  );
}

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
      <Icono size={20} stroke={1.6} />
      <span>{item.etiqueta}</span>
    </EnlaceRuta>
  );
}

/**
 * Modo claro u oscuro. Mantine lo recuerda en este navegador. El cambio se
 * funde en vez de saltar (View Transitions, global.css), salvo con reducción de
 * movimiento o en navegadores que no lo soportan.
 */
function useAlternarEsquema() {
  const { setColorScheme } = useMantineColorScheme();
  const actual = useComputedColorScheme('light');
  const cambiar = () => setColorScheme(actual === 'dark' ? 'light' : 'dark');
  return {
    oscuro: actual === 'dark',
    alternar: () => {
      const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!document.startViewTransition || reducido) cambiar();
      else document.startViewTransition(() => flushSync(cambiar));
    },
  };
}

/** Tarjeta de usuario del pie de la barra: quién está firmando lo que se carga. */
function TarjetaUsuario({ compacto = false }: { compacto?: boolean }) {
  const { claims, salir, refrescar } = useSesion();
  const esquema = useAlternarEsquema();
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
            border: '1px solid var(--app-barra-borde)',
            transition: 'background-color var(--transicion)',
          }}
        >
          <Group gap="sm" wrap="nowrap">
            <Avatar radius="xl" size={36} color="azul" variant="light">
              {iniciales}
            </Avatar>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={650} truncate>
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
        {claims.roles.some(
          (r) => r === 'ADMINISTRADOR_SISTEMA' || ROLES_CATALOGOS.includes(r),
        ) ? (
          <Menu.Item
            component={Link}
            to="/catalogos"
            leftSection={<IconBooks size={16} />}
          >
            Catálogos
            <Text size="xs" c="dimmed">
              Productos, insumos, proveedores y depósitos
            </Text>
          </Menu.Item>
        ) : null}
        <Menu.Item
          leftSection={esquema.oscuro ? <IconSun size={16} /> : <IconMoon size={16} />}
          onClick={esquema.alternar}
          closeMenuOnClick={false}
        >
          {esquema.oscuro ? 'Modo claro' : 'Modo oscuro'}
        </Menu.Item>
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
  const items = useItemsVisibles();

  return (
    <Stack h="100%" gap={0} style={{ background: SUPERFICIE.barra }}>
      <Group gap={12} px="md" pt="lg" pb="md" wrap="nowrap">
        <Marca size={44} />
        <div style={{ minWidth: 0 }}>
          <Text fw={650} fz={16} lh={1.15} style={{ letterSpacing: '-0.015em' }}>
            Trazabilidad
          </Text>
          <Text c={SUPERFICIE.barraTexto} fz={12.5} lh={1.3}>
            Nail Show SRL
          </Text>
        </div>
      </Group>

      <ScrollArea flex={1} px="sm" type="never">
        <Stack gap={2} pb="md">
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
  const { pathname } = useLocation();
  const principales = useItemsVisibles().filter((i) => i.principal);

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
          variant="filled"
          onClick={onAbrirMenu}
          aria-label="Abrir menú de secciones"
          className="no-imprimir"
          style={{
            position: 'fixed',
            right: 16,
            bottom: `calc(14px + env(safe-area-inset-bottom))`,
            zIndex: 200,
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.2)',
          }}
        >
          <IconMenu2 size={24} stroke={2} />
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
  const { pathname } = useLocation();

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
        style={{
          background: SUPERFICIE.barra,
          borderRight: '1px solid var(--app-barra-borde)',
        }}
      >
        <ContenidoBarra />
      </AppShell.Navbar>

      <AppShell.Main>
        {MODO_PRACTICA ? <CartelPractica /> : null}
        {esMovil ? (
          <Group justify="space-between" mb="md" className="no-imprimir" wrap="nowrap">
            <Group gap={8} wrap="nowrap">
              <Marca size={32} />
              <Text fw={650} fz={16} style={{ letterSpacing: '-0.015em' }}>
                Trazabilidad
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              {claims?.rol ? (
                <Badge variant="light" color="azul">
                  {etiquetaEnum(claims.rol)}
                </Badge>
              ) : null}
              <Burger opened={panelAbierto} onClick={panel.toggle} size="sm" />
            </Group>
          </Group>
        ) : null}

        {/* La clave por ruta repite la entrada suave en cada cambio de pantalla. */}
        <div className="entrada entrada-pagina" key={pathname}>
          {children}
        </div>
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

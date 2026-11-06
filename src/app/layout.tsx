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
import { NavLink as EnlaceRuta, Link, useLocation, useNavigate } from 'react-router-dom';
import BranchedMenu from '@/vendor/reactbits/BranchedMenu';
import Iridescence from '@/vendor/reactbits/Iridescence';
import ShapeBlur from '@/vendor/reactbits/ShapeBlur';
import type { ItemRama } from '@/vendor/reactbits/tipos';
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
import { useItemsVisibles, type ItemNavegacion } from './navegacion';
import { useAvisosTareas } from '@/lib/consultasTareas';
import { BotonTareas } from '@/features/tareas/BotonTareas';

/** Puntito de aviso: planta terminó tareas que Producción no vio (Tablero). */
function PuntoAviso({ ruta }: { ruta: string }) {
  const n = useAvisosTareas().length;
  if (ruta !== '/' || n === 0) return null;
  return (
    <span
      role="status"
      aria-label={`${n} ${n === 1 ? 'tarea terminada' : 'tareas terminadas'} sin ver`}
      style={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: 'var(--mantine-color-estadoRechazado-6)',
        flexShrink: 0,
        marginLeft: 'auto',
      }}
    />
  );
}
import { useSesion } from '@/features/auth/sesion';
import { etiquetaEnum } from '@/lib/formato';
import { SUPERFICIE } from './theme';
import { MODO_PRACTICA } from '@/lib/practica';
import { SelectorMoneda } from '@/features/costos/vistaMoneda';
import { Giorgio } from './giorgio/Giorgio';

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

const esActiva = (ruta: string, pathname: string) =>
  ruta === '/' ? pathname === '/' : pathname.startsWith(ruta);

/*
 * Menú en ramas (pedido del codirector técnico, 2026-11-06): las pantallas se
 * agrupan por área y cada rama se despliega con líneas que se dibujan hacia
 * sus hojas. Una rama con una sola pantalla visible para el rol se muestra
 * suelta. Lo que no está en ninguna rama va al final, suelto.
 */
const RAMAS: { etiqueta: string; rutas: string[] }[] = [
  { etiqueta: 'Inicio', rutas: ['/', '/mis-tareas', '/descargas'] },
  {
    etiqueta: 'Ventas',

    rutas: ['/ventas', '/armado', '/pedidos', '/clientes', '/precios', '/cotizaciones'],
  },
  {
    etiqueta: 'Producción',

    rutas: ['/planificacion', '/formulas', '/tercerizados'],
  },
  {
    etiqueta: 'Stock',

    rutas: ['/stock', '/lotes', '/catalogos', '/compras'],
  },
  {
    etiqueta: 'Calidad',

    rutas: ['/liberacion', '/especificaciones', '/estabilidad'],
  },
  {
    etiqueta: 'Administración y finanzas',

    rutas: [
      '/administracion',
      '/facturas',
      '/cuentas-proveedores',
      '/cuentas-clientes',
      '/tesoreria',
      '/solicitudes-pago',
      '/costos',
      '/resultado',
      '/eficiencia',
    ],
  },
  {
    etiqueta: 'Gerencia e informes',

    rutas: ['/gerencia', '/reportes', '/informes'],
  },
  {
    etiqueta: 'Sistema',

    rutas: ['/usuarios', '/visibilidad', '/auditoria'],
  },
];

function MenuRamas({
  items,
  onNavegar,
}: {
  items: ItemNavegacion[];
  onNavegar?: (() => void) | undefined;
}) {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const porRuta = new Map(items.map((i) => [i.ruta, i]));
  const hoja = (i: ItemNavegacion) => {
    const Icono = i.icono;
    return {
      value: i.ruta,
      label: (
        <>
          {i.etiqueta}
          <PuntoAviso ruta={i.ruta} />
        </>
      ),
      icon: <Icono size={18} stroke={1.6} />,
    };
  };
  const secciones: ItemRama[] = [
    ...RAMAS.flatMap((r): ItemRama[] => {
      const hijos = r.rutas.flatMap((x) => porRuta.get(x) ?? []);
      if (hijos.length === 0) return [];
      // Una sola pantalla visible: va suelta, sin rama.
      if (hijos.length === 1)
        return [{ value: hijos[0]!.ruta, label: hijos[0]!.etiqueta }];
      return [{ label: r.etiqueta, children: hijos.map(hoja) }];
    }),
    ...items
      .filter((i) => !RAMAS.some((r) => r.rutas.includes(i.ruta)))
      .map((i) => ({ value: i.ruta, label: i.etiqueta })),
  ];
  const activa =
    items
      .filter((i) => esActiva(i.ruta, pathname))
      .sort((a, b) => b.ruta.length - a.ruta.length)[0]?.ruta ?? '';
  const abierta = secciones.findIndex((s) => s.children?.some((h) => h.value === activa));

  return (
    <Box pb="md" pl={4}>
      {/* La clave reinicia el menú al llegar a una pantalla por otro camino. */}
      <BranchedMenu
        key={activa}
        items={secciones}
        defaultOpen={abierta}
        defaultActive={activa}
        onSelect={(ruta) => {
          void navegar(ruta);
          onNavegar?.();
        }}
        color="var(--app-barra-activa-texto)"
        accentColor="var(--mantine-color-azul-filled)"
        lineColor="var(--superficie-borde)"
        width={226}
        rowHeight={40}
        indent={38}
        fontSize={14.5}
      />
    </Box>
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
        {/* Para todos los roles: la base deja consultar los catálogos a
            cualquiera (§3.3). Quién edita lo decide RLS. */}
        <Menu.Item component={Link} to="/catalogos" leftSection={<IconBooks size={16} />}>
          Catálogos
          <Text size="xs" c="dimmed">
            Productos, insumos, proveedores y depósitos
          </Text>
        </Menu.Item>
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
        {/* Aro con lente (ShapeBlur de React Bits, 2026-11-06): se desenfoca
            cuando el cursor se acerca al logo. */}
        <Box pos="relative" w={44} h={44} style={{ flexShrink: 0 }}>
          <ShapeBlur
            shape="circle"
            size={0.92}
            thickness={1.6}
            color="#cc5de8"
            blur={7}
            lensSize={0.55}
            chroma={0.6}
            idle={false}
            style={{ position: 'absolute', inset: -8, width: 60, height: 60 }}
          />
          <Marca size={44} />
        </Box>
        <div style={{ minWidth: 0 }}>
          <Text fw={650} fz={16} lh={1.15} style={{ letterSpacing: '-0.015em' }}>
            Wandel
          </Text>
          <Text c={SUPERFICIE.barraTexto} fz={12.5} lh={1.3}>
            Nail Show SRL
          </Text>
        </div>
      </Group>

      <ScrollArea flex={1} px="sm" type="never">
        <MenuRamas items={items} onNavegar={onNavegar} />
      </ScrollArea>

      <Box p="sm">
        <Box mb="sm" px={4}>
          <BotonTareas />
        </Box>
        <Box mb="sm" px={4}>
          <SelectorMoneda />
        </Box>
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
                <PuntoAviso ruta={item.ruta} />
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
  const esquema = useComputedColorScheme('light');

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
        {/* Fondo iridiscente muy leve (React Bits, 2026-11-06), con los rosas y
            lilas de Nail Show. En el teléfono no: cuida la batería en planta. */}
        {esMovil ? null : (
          <Iridescence
            className="fondo-iridiscente no-imprimir"
            color="#f3b6dc"
            saturation={0.55}
            brightness={1.35}
            speed={0.18}
            scale={1.4}
            detail={6}
            mouseReact={false}
            clickSwirl={false}
            opacity={esquema === 'dark' ? 0.07 : 0.16}
            resolution={0.35}
            style={{ position: 'fixed' }}
          />
        )}
        {MODO_PRACTICA ? <CartelPractica /> : null}
        {esMovil ? (
          <Group justify="space-between" mb="md" className="no-imprimir" wrap="nowrap">
            <Group gap={8} wrap="nowrap">
              <Marca size={32} />
              <Text fw={650} fz={16} style={{ letterSpacing: '-0.015em' }}>
                Wandel
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <BotonTareas compacto />
              {claims?.rol ? (
                <Badge variant="light" color="azul">
                  {etiquetaEnum(claims.rol)}
                </Badge>
              ) : null}
              <Burger opened={panelAbierto} onClick={panel.toggle} size="sm" />
            </Group>
          </Group>
        ) : null}
        {esMovil ? (
          <Box mb="md" className="no-imprimir">
            <SelectorMoneda compacto />
          </Box>
        ) : null}

        {/* La clave por ruta repite la entrada suave en cada cambio de pantalla. */}
        <div className="entrada entrada-pagina" key={pathname}>
          {children}
        </div>
      </AppShell.Main>

      <Giorgio />

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

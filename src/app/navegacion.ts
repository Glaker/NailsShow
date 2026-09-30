import {
  IconLayoutDashboard,
  IconPackages,
  IconScale,
  IconFlask,
  IconPackage,
  IconBuildingWarehouse,
  IconAddressBook,
  IconUsers,
  IconHistory,
  IconCalculator,
  IconClipboardList,
  IconShoppingCart,
  IconBuildingStore,
  IconListCheck,
  IconFileInvoice,
  IconUsersGroup,
  IconBuildingFactory2,
  IconBriefcase,
  IconBuildingBank,
  IconCash,
  IconReceipt,
  IconReportAnalytics,
  IconUsers as IconClientes,
  IconTag,
  IconCalendarTime,
  IconEye,
  IconFileCertificate,
  IconClipboardText,
  type Icon,
} from '@tabler/icons-react';
import { useSesion, type Rol } from '@/features/auth/sesion';
import { useVisibilidad, type VisibilidadRow } from '@/lib/consultasVisibilidad';

export interface ItemNavegacion {
  ruta: string;
  etiqueta: string;
  /** Etiqueta corta para la barra inferior del teléfono. */
  etiquetaCorta: string;
  icono: Icon;
  /**
   * Roles que ven el ítem. `undefined` = todos los usuarios con sesión activa.
   * Espeja lo que las políticas RLS permiten: la interfaz esconde lo que la
   * base va a negar igual, para no ofrecer un camino que termina en error.
   */
  roles?: Rol[];
  /** Aparece en la barra inferior del teléfono. */
  principal?: boolean;
}

export const NAVEGACION: ItemNavegacion[] = [
  {
    ruta: '/',
    etiqueta: 'Tablero',
    etiquetaCorta: 'Tablero',
    icono: IconLayoutDashboard,
    principal: true,
  },
  {
    // Recepciones, stock de seguridad, stock en fábrica y conteo son pestañas.
    ruta: '/stock',
    etiqueta: 'Stock y recepciones',
    etiquetaCorta: 'Stock',
    icono: IconScale,
    principal: true,
  },
  {
    ruta: '/lotes',
    etiqueta: 'Lotes de insumo',
    etiquetaCorta: 'Lotes',
    icono: IconPackages,
    principal: true,
  },
  {
    ruta: '/insumos',
    etiqueta: 'Catálogo de insumos',
    etiquetaCorta: 'Insumos',
    icono: IconFlask,
    principal: true,
  },
  {
    ruta: '/formulas',
    etiqueta: 'Fórmulas de fabricación',
    etiquetaCorta: 'Fórmulas',
    icono: IconClipboardList,
  },
  {
    ruta: '/ordenes',
    etiqueta: 'Órdenes de producción',
    etiquetaCorta: 'Órdenes',
    icono: IconClipboardText,
    roles: [
      'GERENCIA_PRODUCCION',
      'DIRECCION_TECNICA',
      'OPERARIO',
      'CONTROL_CALIDAD',
      'GERENCIA',
    ],
  },
  {
    ruta: '/especificaciones',
    etiqueta: 'Especificaciones',
    etiquetaCorta: 'Especif.',
    icono: IconFileCertificate,
    roles: ['GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA'],
  },
  {
    ruta: '/calculadora-lote',
    etiqueta: 'Calculadora de lote',
    etiquetaCorta: 'Calculadora',
    icono: IconCalculator,
  },
  {
    ruta: '/pedidos',
    etiqueta: 'Pedidos',
    etiquetaCorta: 'Pedidos',
    icono: IconShoppingCart,
    principal: true,
  },
  {
    ruta: '/planificacion',
    etiqueta: 'Planificación',
    etiquetaCorta: 'Plan',
    icono: IconCalendarTime,
    roles: [
      'GERENCIA_PRODUCCION',
      'DIRECCION_TECNICA',
      'VENTAS',
      'ADMINISTRACION',
      'GERENCIA',
    ],
  },
  {
    ruta: '/tercerizados',
    etiqueta: 'Tercerizados',
    etiquetaCorta: 'Tercer.',
    icono: IconBuildingFactory2,
  },
  {
    ruta: '/compras',
    etiqueta: 'Compras pendientes',
    etiquetaCorta: 'Compras',
    icono: IconListCheck,
  },
  {
    ruta: '/clientes',
    etiqueta: 'Clientes',
    etiquetaCorta: 'Clientes',
    icono: IconUsersGroup,
  },
  {
    ruta: '/precios',
    etiqueta: 'Precios y descuentos',
    etiquetaCorta: 'Precios',
    icono: IconTag,
  },
  {
    ruta: '/facturas',
    etiqueta: 'Facturas',
    etiquetaCorta: 'Facturas',
    icono: IconFileInvoice,
  },
  {
    ruta: '/administracion',
    etiqueta: 'Administración',
    etiquetaCorta: 'Admin.',
    icono: IconBriefcase,
    roles: ['ADMINISTRACION', 'GERENCIA'],
  },
  {
    ruta: '/cuentas-proveedores',
    etiqueta: 'Cuentas de proveedores',
    etiquetaCorta: 'Ctas. prov.',
    icono: IconCash,
    roles: ['ADMINISTRACION', 'GERENCIA'],
  },
  {
    ruta: '/cuentas-clientes',
    etiqueta: 'Cuentas de clientes',
    etiquetaCorta: 'Ctas. cli.',
    icono: IconClientes,
    roles: ['ADMINISTRACION', 'GERENCIA'],
  },
  {
    ruta: '/tesoreria',
    etiqueta: 'Tesorería',
    etiquetaCorta: 'Tesorería',
    icono: IconBuildingBank,
    roles: ['ADMINISTRACION', 'GERENCIA'],
  },
  {
    // Cualquier área pide un pago; cada una ve las suyas.
    ruta: '/solicitudes-pago',
    etiqueta: 'Solicitudes de pago',
    etiquetaCorta: 'Pagos',
    icono: IconReceipt,
  },
  {
    ruta: '/reportes',
    etiqueta: 'Reportes',
    etiquetaCorta: 'Reportes',
    icono: IconReportAnalytics,
    roles: ['ADMINISTRACION', 'GERENCIA'],
  },
  {
    ruta: '/lista-materiales',
    etiqueta: 'Qué lleva cada producto',
    etiquetaCorta: 'Materiales',
    icono: IconPackages,
  },
  {
    ruta: '/punto-venta',
    etiqueta: 'Calle 5 — punto de venta',
    etiquetaCorta: 'Calle 5',
    icono: IconBuildingStore,
  },
  {
    ruta: '/productos',
    etiqueta: 'Catálogo de productos',
    etiquetaCorta: 'Productos',
    icono: IconPackage,
  },
  {
    ruta: '/proveedores',
    etiqueta: 'Proveedores',
    etiquetaCorta: 'Proveed.',
    icono: IconAddressBook,
  },
  {
    ruta: '/depositos',
    etiqueta: 'Depósitos',
    etiquetaCorta: 'Depósitos',
    icono: IconBuildingWarehouse,
  },
  {
    ruta: '/usuarios',
    etiqueta: 'Usuarios',
    etiquetaCorta: 'Usuarios',
    icono: IconUsers,
    roles: ['ADMINISTRADOR_SISTEMA'],
  },
  {
    ruta: '/visibilidad',
    etiqueta: 'Quién ve qué',
    etiquetaCorta: 'Visibilidad',
    icono: IconEye,
    roles: ['ADMINISTRADOR_SISTEMA'],
  },
  {
    ruta: '/auditoria',
    etiqueta: 'Auditoría',
    etiquetaCorta: 'Auditoría',
    icono: IconHistory,
    roles: ['DIRECCION_TECNICA', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'],
  },
];

/** Pestañas que también se pueden mostrar u ocultar por rol. */
export const PESTANIAS: { ruta: string; etiqueta: string; de: string; roles?: Rol[] }[] =
  [
    {
      ruta: '/stock?vista=insumos',
      etiqueta: 'Stock › Insumos (materia prima)',
      de: '/stock',
    },
    { ruta: '/stock?vista=recepciones', etiqueta: 'Stock › Recepciones', de: '/stock' },
    {
      ruta: '/stock?vista=seguridad',
      etiqueta: 'Stock › Stock de seguridad',
      de: '/stock',
    },
    { ruta: '/stock?vista=fabrica', etiqueta: 'Stock › En fábrica', de: '/stock' },
    {
      ruta: '/stock?vista=conteo',
      etiqueta: 'Stock › Conteo',
      de: '/stock',
      roles: ['DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'],
    },
  ];

/** Roles que se configuran (el Administrador del sistema ve todo). */
export const ROLES_CONFIGURABLES: Rol[] = [
  'OPERARIO',
  'CONTROL_CALIDAD',
  'DIRECCION_TECNICA',
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
  'GERENCIA',
  'ENCARGADA_STOCK',
  'VENTAS',
];

/** Lo que el código dice por defecto: sin `roles`, la ven todos. */
export const visiblePorDefecto = (roles: Rol[] | undefined, rol: Rol) =>
  !roles || roles.includes(rol);

/**
 * Si un rol ve una pantalla: la excepción cargada por el administrador, o el
 * valor por defecto. Solo menú: la autoridad sobre los datos es RLS.
 */
export function veRol(
  ruta: string,
  rolesDefecto: Rol[] | undefined,
  rol: Rol,
  excepciones: VisibilidadRow[],
): boolean {
  const e = excepciones.find((x) => x.pantalla === ruta && x.rol === rol);
  return e ? e.visible : visiblePorDefecto(rolesDefecto, rol);
}

/** Si un usuario (con todos sus roles) ve una pantalla. El administrador ve todo. */
export function ve(
  ruta: string,
  rolesDefecto: Rol[] | undefined,
  roles: Rol[],
  excepciones: VisibilidadRow[],
): boolean {
  if (roles.includes('ADMINISTRADOR_SISTEMA')) return true;
  return roles.some((r) => veRol(ruta, rolesDefecto, r, excepciones));
}

export function itemsVisibles(
  roles: Rol[],
  excepciones: VisibilidadRow[] = [],
): ItemNavegacion[] {
  return NAVEGACION.filter((item) => ve(item.ruta, item.roles, roles, excepciones));
}

/** Menú del usuario con sesión, con las excepciones configuradas. */
export function useItemsVisibles(): ItemNavegacion[] {
  const { claims } = useSesion();
  const excepciones = useVisibilidad();
  return itemsVisibles(claims?.roles ?? [], excepciones.data ?? []);
}

/** Si el usuario ve una pestaña (`/stock?vista=insumos`). */
export function usePuedeVerPestania(ruta: string): boolean {
  const { claims } = useSesion();
  const excepciones = useVisibilidad();
  const p = PESTANIAS.find((x) => x.ruta === ruta);
  return ve(ruta, p?.roles, claims?.roles ?? [], excepciones.data ?? []);
}

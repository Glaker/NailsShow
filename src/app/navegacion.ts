import {
  IconBooks,
  IconLayoutDashboard,
  IconPackages,
  IconPackage,
  IconScale,
  IconUsers,
  IconHistory,
  IconClipboardList,
  IconShoppingCart,
  IconShoppingBag,
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
  IconRosetteDiscountCheck,
  IconCoin,
  IconChartLine,
  IconChartHistogram,
  IconCalculator,
  IconPresentation,
  type Icon,
} from '@tabler/icons-react';
import { FINANZAS, useSesion, type Rol } from '@/features/auth/sesion';
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

/*
 * Reparto por rol (pedido del 2026-10-01): cada uno ve lo suyo y nada más.
 * Los catálogos (productos, insumos, proveedores, depósitos) son una sola
 * sección (`/catalogos`), también en el menú del usuario. La calculadora y «qué
 * lleva cada producto» viven dentro de Fórmulas.
 */
/*
 * Los operarios no están: ven solo sus tareas de planta en el Tablero
 * (pedido del 2026-10-14). Se les puede abrir una pantalla en «Quién ve qué».
 */
const PRODUCCION: Rol[] = ['GERENCIA_PRODUCCION', 'GERENCIA'];

export const NAVEGACION: ItemNavegacion[] = [
  {
    // El contenido cambia según el rol principal (PaginaTablero). Recepción no
    // lo tiene: ve solo recepciones, stock de insumos y su catálogo
    // (pedido del 2026-10-20); PaginaTablero la manda a Recepciones.
    ruta: '/',
    etiqueta: 'Tablero',
    etiquetaCorta: 'Tablero',
    icono: IconLayoutDashboard,
    roles: [
      'OPERARIO',
      'CONTROL_CALIDAD',
      'DIRECCION_TECNICA',
      'ADMINISTRACION',
      'GERENCIA_PRODUCCION',
      'GERENCIA',
      'ENCARGADA_STOCK',
      'VENTAS',
      FINANZAS,
    ],
    principal: true,
  },
  {
    ruta: '/ventas',
    etiqueta: 'Ventas',
    etiquetaCorta: 'Ventas',
    icono: IconShoppingBag,
    roles: ['VENTAS', 'ADMINISTRACION', 'GERENCIA'],
    principal: true,
  },
  {
    ruta: '/armado',
    etiqueta: 'Pedidos a armar',
    etiquetaCorta: 'Armado',
    icono: IconPackage,
    roles: ['ENCARGADA_STOCK', 'GERENCIA'],
    principal: true,
  },
  {
    ruta: '/pedidos',
    etiqueta: 'Pedidos',
    etiquetaCorta: 'Pedidos',
    icono: IconShoppingCart,
    roles: [...PRODUCCION, 'ADMINISTRACION'],
    principal: true,
  },
  {
    ruta: '/planificacion',
    etiqueta: 'Planificación',
    etiquetaCorta: 'Plan',
    icono: IconCalendarTime,
    roles: ['GERENCIA_PRODUCCION', 'GERENCIA'],
  },
  {
    ruta: '/ordenes',
    etiqueta: 'Órdenes de producción',
    etiquetaCorta: 'Órdenes',
    icono: IconClipboardText,
    roles: [...PRODUCCION, 'CONTROL_CALIDAD'],
  },
  {
    ruta: '/formulas',
    etiqueta: 'Fórmulas y calculadora',
    etiquetaCorta: 'Fórmulas',
    icono: IconClipboardList,
    roles: [...PRODUCCION, 'DIRECCION_TECNICA', 'CONTROL_CALIDAD'],
  },
  {
    // Recepciones, stock de seguridad, en fábrica, Calle 5 y conteo son
    // pestañas. Ventas entra sólo a la de Calle 5.
    ruta: '/stock',
    etiqueta: 'Stock y recepciones',
    etiquetaCorta: 'Stock',
    icono: IconScale,
    roles: [
      ...PRODUCCION,
      'ADMINISTRACION',
      'DIRECCION_TECNICA',
      'CONTROL_CALIDAD',
      'VENTAS',
      'RECEPCION',
    ],
    principal: true,
  },
  {
    ruta: '/lotes',
    etiqueta: 'Lotes de insumo',
    etiquetaCorta: 'Lotes',
    icono: IconPackages,
    roles: [...PRODUCCION, 'DIRECCION_TECNICA', 'CONTROL_CALIDAD'],
    principal: true,
  },
  {
    // Para todos menos operarios (pedido del 2026-10-21: en el menú del
    // usuario no lo encontraban). Quién edita lo decide RLS.
    ruta: '/catalogos',
    etiqueta: 'Catálogos',
    etiquetaCorta: 'Catálogos',
    icono: IconBooks,
    roles: [
      'CONTROL_CALIDAD',
      'DIRECCION_TECNICA',
      'ADMINISTRACION',
      'GERENCIA_PRODUCCION',
      'GERENCIA',
      'ENCARGADA_STOCK',
      'VENTAS',
      FINANZAS,
      'RECEPCION',
    ],
  },
  {
    // Lo que la DT libera: lotes de producto terminado y su batch record.
    ruta: '/liberacion',
    etiqueta: 'Liberación de lotes',
    etiquetaCorta: 'Liberación',
    icono: IconRosetteDiscountCheck,
    roles: ['DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA'],
  },
  {
    ruta: '/especificaciones',
    etiqueta: 'Especificaciones',
    etiquetaCorta: 'Especif.',
    icono: IconFileCertificate,
    // Gerencia de Producción ya no la ve (D-ventas-pedidos-2). La escritura en
    // la base se le quita con la migración del bloque 2.
    roles: ['DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA'],
  },
  {
    ruta: '/tercerizados',
    etiqueta: 'Tercerizados',
    etiquetaCorta: 'Tercer.',
    icono: IconBuildingFactory2,
    roles: ['GERENCIA_PRODUCCION', 'GERENCIA'],
  },
  {
    ruta: '/compras',
    etiqueta: 'Compras pendientes',
    etiquetaCorta: 'Compras',
    icono: IconListCheck,
    roles: ['GERENCIA_PRODUCCION', 'ADMINISTRACION', 'GERENCIA'],
  },
  {
    ruta: '/facturas',
    etiqueta: 'Facturas',
    etiquetaCorta: 'Facturas',
    icono: IconFileInvoice,
    roles: ['ADMINISTRACION', 'VENTAS', 'GERENCIA'],
  },
  {
    ruta: '/clientes',
    etiqueta: 'Clientes',
    etiquetaCorta: 'Clientes',
    icono: IconUsersGroup,
    roles: ['ADMINISTRACION', 'VENTAS', 'GERENCIA'],
  },
  {
    ruta: '/precios',
    etiqueta: 'Precios y descuentos',
    etiquetaCorta: 'Precios',
    icono: IconTag,
    roles: ['ADMINISTRACION', 'VENTAS', 'GERENCIA'],
  },
  {
    // Para Administración es su Tablero; acá queda para Gerencia.
    ruta: '/administracion',
    etiqueta: 'Administración',
    etiquetaCorta: 'Admin.',
    icono: IconBriefcase,
    roles: ['GERENCIA'],
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
    // Cada área pide sus pagos.
    ruta: '/solicitudes-pago',
    etiqueta: 'Solicitudes de pago',
    etiquetaCorta: 'Pagos',
    icono: IconReceipt,
    roles: ['ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS'],
  },
  {
    // Módulo de costos (D-38): Finanzas, Gerencia, Administración y
    // Gerencia de Producción. Los operarios no ven costos.
    ruta: '/costos',
    etiqueta: 'Costos',
    etiquetaCorta: 'Costos',
    icono: IconCoin,
    roles: [FINANZAS, 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'],
  },
  {
    // Resultado de gestión y punto de equilibrio (Fase 3 de costos).
    ruta: '/resultado',
    etiqueta: 'Resultado',
    etiquetaCorta: 'Resultado',
    icono: IconChartLine,
    roles: [FINANZAS, 'GERENCIA', 'ADMINISTRACION'],
  },
  {
    // Pareto ABC y herramientas de eficiencia (Fase 4 de costos).
    ruta: '/eficiencia',
    etiqueta: 'Eficiencia',
    etiquetaCorta: 'Eficiencia',
    icono: IconChartHistogram,
    roles: [FINANZAS, 'GERENCIA', 'ADMINISTRACION'],
  },
  {
    // Cotizador (Fase 5 de costos, D-52).
    ruta: '/cotizaciones',
    etiqueta: 'Cotizaciones',
    etiquetaCorta: 'Cotizar',
    icono: IconCalculator,
    roles: [FINANZAS, 'GERENCIA', 'GERENCIA_PRODUCCION'],
  },
  {
    // Vista de gerencia: pocos números, grandes (Fase 5 de costos).
    ruta: '/gerencia',
    etiqueta: 'Resumen de gerencia',
    etiquetaCorta: 'Resumen',
    icono: IconPresentation,
    roles: [FINANZAS, 'GERENCIA'],
  },
  {
    ruta: '/reportes',
    etiqueta: 'Reportes',
    etiquetaCorta: 'Reportes',
    icono: IconReportAnalytics,
    roles: ['ADMINISTRACION', 'GERENCIA'],
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
      roles: [...PRODUCCION, 'CONTROL_CALIDAD', 'RECEPCION'],
    },
    {
      // La DT mira la recepción para aprobar calidad y cantidad.
      ruta: '/stock?vista=recepciones',
      etiqueta: 'Stock › Recepciones',
      de: '/stock',
      roles: [...PRODUCCION, 'DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'RECEPCION'],
    },
    {
      ruta: '/stock?vista=seguridad',
      etiqueta: 'Stock › Stock de seguridad',
      de: '/stock',
      roles: PRODUCCION,
    },
    {
      // Fábrica, Calle 5 y Berna (2026-10-22; antes «En fábrica» y «Calle 5»).
      ruta: '/stock?vista=depositos',
      etiqueta: 'Stock › Depósitos',
      de: '/stock',
      roles: [...PRODUCCION, 'ADMINISTRACION', 'VENTAS'],
    },
    {
      ruta: '/stock?vista=conteo',
      etiqueta: 'Stock › Conteo',
      de: '/stock',
      roles: ['GERENCIA_PRODUCCION', 'GERENCIA'],
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
  FINANZAS,
  'RECEPCION',
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

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
  type Icon,
} from '@tabler/icons-react';
import type { Rol } from '@/features/auth/sesion';

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
    ruta: '/auditoria',
    etiqueta: 'Auditoría',
    etiquetaCorta: 'Auditoría',
    icono: IconHistory,
    roles: ['DIRECCION_TECNICA', 'GERENCIA', 'ADMINISTRADOR_SISTEMA'],
  },
];

export function itemsVisibles(roles: Rol[]): ItemNavegacion[] {
  return NAVEGACION.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
  );
}

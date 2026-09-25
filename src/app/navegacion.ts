import {
  IconLayoutDashboard,
  IconTruckDelivery,
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
  IconClipboardCheck,
  IconFileInvoice,
  IconUsersGroup,
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
    ruta: '/recepciones',
    etiqueta: 'Recepciones',
    etiquetaCorta: 'Recepción',
    icono: IconTruckDelivery,
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
    ruta: '/stock',
    etiqueta: 'Stock',
    etiquetaCorta: 'Stock',
    icono: IconScale,
  },
  {
    ruta: '/conteo',
    etiqueta: 'Conteo de inventario',
    etiquetaCorta: 'Conteo',
    icono: IconClipboardCheck,
    roles: ['DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'],
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

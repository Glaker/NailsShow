import {
  IconLayoutDashboard,
  IconTruckDelivery,
  IconPackages,
  IconScale,
  IconFlask,
  IconBuildingWarehouse,
  IconAddressBook,
  IconUsers,
  IconHistory,
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
    ruta: '/existencias',
    etiqueta: 'Material en planta',
    etiquetaCorta: 'Material',
    icono: IconScale,
  },
  {
    ruta: '/insumos',
    etiqueta: 'Catálogo de insumos',
    etiquetaCorta: 'Insumos',
    icono: IconFlask,
    principal: true,
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

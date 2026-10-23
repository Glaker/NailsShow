import { Tabs } from '@mantine/core';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  IconAddressBook,
  IconBuildingWarehouse,
  IconFlask,
  IconPackage,
  IconSquarePlus,
} from '@tabler/icons-react';
import { PaginaProductos } from './PaginaProductos';
import { PaginaInsumos } from './PaginaInsumos';
import { PaginaProveedores } from './PaginaProveedores';
import { PaginaDepositos } from './PaginaDepositos';
import { useSesion, useTieneRol } from '@/features/auth/sesion';
import { PaginaNuevoProducto } from '@/features/produccion/PaginaNuevoProducto';

const VISTAS = ['productos', 'nuevo', 'insumos', 'proveedores', 'depositos'] as const;
type VistaCatalogo = (typeof VISTAS)[number];

/** Las rutas viejas (`/insumos`, `/productos`…) llevan a su pestaña. */
export function RedirigirACatalogo({ vista }: { vista: VistaCatalogo }) {
  return <Navigate to={`/catalogos?vista=${vista}`} replace />;
}

/**
 * Catálogos en una sola página (pedido del 2026-10-01): están disponibles
 * pero no ocupan una sección cada uno. Se abren desde el menú del usuario.
 * Quién puede editar cada uno lo sigue diciendo la base (RLS).
 */
export function PaginaCatalogos() {
  const [params, setParams] = useSearchParams();
  const { claims } = useSesion();
  /* Nuevo producto: lo carga GP y lo aprueba DT (D-nuevo-producto-1). */
  const veNuevo = useTieneRol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION');
  const pedida = params.get('vista') as VistaCatalogo | null;
  const vista =
    pedida && VISTAS.includes(pedida) && (pedida !== 'nuevo' || veNuevo)
      ? pedida
      : 'productos';

  /* Recepción ve solo el catálogo de insumos (pedido del 2026-10-20). */
  if (claims?.roles.every((r) => r === 'RECEPCION')) return <PaginaInsumos />;

  return (
    <Tabs
      value={vista}
      onChange={(v) => v && setParams({ vista: v }, { replace: true })}
      keepMounted={false}
      color="azul"
    >
      <Tabs.List mb="lg">
        <Tabs.Tab value="productos" leftSection={<IconPackage size={18} />}>
          Productos
        </Tabs.Tab>
        {veNuevo ? (
          <Tabs.Tab value="nuevo" leftSection={<IconSquarePlus size={18} />}>
            Nuevo producto
          </Tabs.Tab>
        ) : null}
        <Tabs.Tab value="insumos" leftSection={<IconFlask size={18} />}>
          Insumos
        </Tabs.Tab>
        <Tabs.Tab value="proveedores" leftSection={<IconAddressBook size={18} />}>
          Proveedores
        </Tabs.Tab>
        <Tabs.Tab value="depositos" leftSection={<IconBuildingWarehouse size={18} />}>
          Depósitos
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="productos">
        <PaginaProductos />
      </Tabs.Panel>
      {veNuevo ? (
        <Tabs.Panel value="nuevo">
          <PaginaNuevoProducto />
        </Tabs.Panel>
      ) : null}
      <Tabs.Panel value="insumos">
        <PaginaInsumos />
      </Tabs.Panel>
      <Tabs.Panel value="proveedores">
        <PaginaProveedores />
      </Tabs.Panel>
      <Tabs.Panel value="depositos">
        <PaginaDepositos />
      </Tabs.Panel>
    </Tabs>
  );
}

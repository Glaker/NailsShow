import { Tabs } from '@mantine/core';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  IconBox,
  IconClipboardCheck,
  IconScale,
  IconShieldCheck,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { PaginaRecepciones } from '@/features/recepcion/PaginaRecepciones';
import { PaginaStockFabrica } from '@/features/comercial/PaginaPuntoVenta';
import { PaginaStock } from './PaginaStock';
import { PaginaStockSeguridad } from './PaginaStockSeguridad';
import { PaginaConteo } from './PaginaConteo';

const VISTAS = ['insumos', 'recepciones', 'seguridad', 'fabrica', 'conteo'] as const;
type VistaStock = (typeof VISTAS)[number];

/** Las rutas viejas siguen andando: llevan a su pestaña (`/stock?vista=…`). */
export function RedirigirAStock({ vista }: { vista: VistaStock }) {
  return <Navigate to={`/stock?vista=${vista}`} replace />;
}

/**
 * Stock en una sola página (ítems 9 y 17 de la cola): lo que hay de insumos, lo
 * que entra por recepción, lo que falta para el stock de seguridad y el
 * producto terminado en fábrica. Cada pestaña es la pantalla de siempre, con
 * sus acciones; la pestaña va en la URL para que un enlace lleve a ella.
 */
export function PaginaStockUnificada() {
  const [params, setParams] = useSearchParams();
  const puedeContar = useTieneRol(
    'DIRECCION_TECNICA',
    'ADMINISTRACION',
    'GERENCIA_PRODUCCION',
  );
  const pedida = params.get('vista') as VistaStock | null;
  const vista: VistaStock =
    pedida && VISTAS.includes(pedida) && (pedida !== 'conteo' || puedeContar)
      ? pedida
      : 'insumos';

  return (
    <Tabs
      value={vista}
      onChange={(v) => v && setParams({ vista: v }, { replace: true })}
      keepMounted={false}
      color="violeta"
    >
      <Tabs.List mb="lg">
        <Tabs.Tab value="insumos" leftSection={<IconScale size={18} />}>
          Insumos
        </Tabs.Tab>
        <Tabs.Tab value="recepciones" leftSection={<IconTruckDelivery size={18} />}>
          Recepciones
        </Tabs.Tab>
        <Tabs.Tab value="seguridad" leftSection={<IconShieldCheck size={18} />}>
          Stock de seguridad
        </Tabs.Tab>
        <Tabs.Tab value="fabrica" leftSection={<IconBox size={18} />}>
          En fábrica
        </Tabs.Tab>
        {puedeContar ? (
          <Tabs.Tab value="conteo" leftSection={<IconClipboardCheck size={18} />}>
            Conteo
          </Tabs.Tab>
        ) : null}
      </Tabs.List>

      <Tabs.Panel value="insumos">
        <PaginaStock />
      </Tabs.Panel>
      <Tabs.Panel value="recepciones">
        <PaginaRecepciones />
      </Tabs.Panel>
      <Tabs.Panel value="seguridad">
        <PaginaStockSeguridad />
      </Tabs.Panel>
      <Tabs.Panel value="fabrica">
        <PaginaStockFabrica />
      </Tabs.Panel>
      {puedeContar ? (
        <Tabs.Panel value="conteo">
          <PaginaConteo />
        </Tabs.Panel>
      ) : null}
    </Tabs>
  );
}

import { Tabs } from '@mantine/core';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  IconBox,
  IconClipboardCheck,
  IconScale,
  IconShieldCheck,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { usePuedeVerPestania } from '@/app/navegacion';
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
 * sus acciones; la pestaña va en la URL para que un enlace lleve a ella. Qué
 * pestañas ve cada rol se configura en «Quién ve qué».
 */
export function PaginaStockUnificada() {
  const [params, setParams] = useSearchParams();
  const puede: Record<VistaStock, boolean> = {
    insumos: usePuedeVerPestania('/stock?vista=insumos'),
    recepciones: usePuedeVerPestania('/stock?vista=recepciones'),
    seguridad: usePuedeVerPestania('/stock?vista=seguridad'),
    fabrica: usePuedeVerPestania('/stock?vista=fabrica'),
    conteo: usePuedeVerPestania('/stock?vista=conteo'),
  };
  const visibles = VISTAS.filter((v) => puede[v]);
  const pedida = params.get('vista') as VistaStock | null;
  const vista: VistaStock | undefined =
    pedida && visibles.includes(pedida) ? pedida : visibles[0];

  if (!vista) return null;

  return (
    <Tabs
      value={vista}
      onChange={(v) => v && setParams({ vista: v }, { replace: true })}
      keepMounted={false}
      color="azul"
    >
      <Tabs.List mb="lg">
        {puede.insumos ? (
          <Tabs.Tab value="insumos" leftSection={<IconScale size={18} />}>
            Insumos
          </Tabs.Tab>
        ) : null}
        {puede.recepciones ? (
          <Tabs.Tab value="recepciones" leftSection={<IconTruckDelivery size={18} />}>
            Recepciones
          </Tabs.Tab>
        ) : null}
        {puede.seguridad ? (
          <Tabs.Tab value="seguridad" leftSection={<IconShieldCheck size={18} />}>
            Stock de seguridad
          </Tabs.Tab>
        ) : null}
        {puede.fabrica ? (
          <Tabs.Tab value="fabrica" leftSection={<IconBox size={18} />}>
            En fábrica
          </Tabs.Tab>
        ) : null}
        {puede.conteo ? (
          <Tabs.Tab value="conteo" leftSection={<IconClipboardCheck size={18} />}>
            Conteo
          </Tabs.Tab>
        ) : null}
      </Tabs.List>

      <Tabs.Panel value="insumos">{puede.insumos ? <PaginaStock /> : null}</Tabs.Panel>
      <Tabs.Panel value="recepciones">
        {puede.recepciones ? <PaginaRecepciones /> : null}
      </Tabs.Panel>
      <Tabs.Panel value="seguridad">
        {puede.seguridad ? <PaginaStockSeguridad /> : null}
      </Tabs.Panel>
      <Tabs.Panel value="fabrica">
        {puede.fabrica ? <PaginaStockFabrica /> : null}
      </Tabs.Panel>
      <Tabs.Panel value="conteo">{puede.conteo ? <PaginaConteo /> : null}</Tabs.Panel>
    </Tabs>
  );
}

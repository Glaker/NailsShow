import { useState } from 'react';
import { Button, Group, Tabs } from '@mantine/core';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconBuildingStore,
  IconClipboardCheck,
  IconScale,
  IconShieldCheck,
  IconTag,
  IconTags,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { usePuedeVerPestania } from '@/app/navegacion';
import { useTieneRol } from '@/features/auth/sesion';
import { PlanillaRotulosProduccion } from '@/features/rotulos/RotulosProduccion';
import { PuntoPedido } from './PuntoPedido';
import { PaginaRecepciones } from '@/features/recepcion/PaginaRecepciones';
import { PaginaDepositos } from '@/features/comercial/PaginaPuntoVenta';
import { PaginaStock } from './PaginaStock';
import { PaginaStockSeguridad } from './PaginaStockSeguridad';
import { PaginaConteo } from './PaginaConteo';
import { PaginaInsumosEtiquetados } from './PaginaInsumosEtiquetados';

const VISTAS = [
  'insumos',
  'recepciones',
  'seguridad',
  'pedido',
  'depositos',
  'conteo',
  'etiquetados',
] as const;
type VistaStock = (typeof VISTAS)[number];

/** Fábrica y Calle 5 eran pestañas; desde el 2026-10-22 son cuadraditos de «Depósitos». */
const LEGADO = { fabrica: 'PTF', calle5: 'C5' } as const;
type VistaLegada = keyof typeof LEGADO;

/** Las rutas viejas siguen andando: llevan a su pestaña (`/stock?vista=…`). */
export function RedirigirAStock({ vista }: { vista: VistaStock | VistaLegada }) {
  const destino =
    vista in LEGADO
      ? `/stock?vista=depositos&dep=${LEGADO[vista as VistaLegada]}`
      : `/stock?vista=${vista}`;
  return <Navigate to={destino} replace />;
}

/**
 * Stock en una sola página (ítems 9 y 17 de la cola): lo que hay de insumos, lo
 * que entra por recepción, lo que falta para el stock de seguridad y el
 * producto terminado en fábrica y en Calle 5. Cada pestaña es la pantalla de siempre, con
 * sus acciones; la pestaña va en la URL para que un enlace lleve a ella. Qué
 * pestañas ve cada rol se configura en «Quién ve qué».
 */
export function PaginaStockUnificada() {
  const [params, setParams] = useSearchParams();
  const puede: Record<VistaStock, boolean> = {
    insumos: usePuedeVerPestania('/stock?vista=insumos'),
    recepciones: usePuedeVerPestania('/stock?vista=recepciones'),
    seguridad: usePuedeVerPestania('/stock?vista=seguridad'),
    pedido: usePuedeVerPestania('/stock?vista=pedido'),
    depositos: usePuedeVerPestania('/stock?vista=depositos'),
    conteo: usePuedeVerPestania('/stock?vista=conteo'),
    etiquetados: usePuedeVerPestania('/stock?vista=etiquetados'),
  };
  /* Rótulos de producto terminado (D-rotulos-3): también los imprime stock. */
  const imprimeRotulos = useTieneRol(
    'ENCARGADA_STOCK',
    'RECEPCION',
    'GERENCIA_PRODUCCION',
    'DIRECCION_TECNICA',
  );
  const [rotulos, setRotulos] = useState(false);
  const visibles = VISTAS.filter((v) => puede[v]);
  const pedida = params.get('vista') as VistaStock | null;
  if (pedida && pedida in LEGADO) return <RedirigirAStock vista={pedida} />;
  const vista: VistaStock | undefined =
    pedida && visibles.includes(pedida) ? pedida : visibles[0];

  if (!vista) return null;
  // La pestaña siempre en la URL: la ayuda de Calle 5 depende de ella.
  if (pedida !== vista) return <RedirigirAStock vista={vista} />;

  return (
    <>
      {imprimeRotulos ? (
        <Group justify="flex-end" mb="xs">
          <Button
            variant="light"
            leftSection={<IconTag size={16} />}
            onClick={() => setRotulos(true)}
          >
            Rótulos
          </Button>
        </Group>
      ) : null}
      {/* Se monta al abrir: cada vez arranca con las órdenes del día. */}
      {rotulos ? (
        <PlanillaRotulosProduccion abierto onCerrar={() => setRotulos(false)} />
      ) : null}
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
          {puede.pedido ? (
            <Tabs.Tab value="pedido" leftSection={<IconAlertTriangle size={18} />}>
              Punto de pedido
            </Tabs.Tab>
          ) : null}
          {puede.depositos ? (
            <Tabs.Tab value="depositos" leftSection={<IconBuildingStore size={18} />}>
              Depósitos
            </Tabs.Tab>
          ) : null}
          {puede.conteo ? (
            <Tabs.Tab value="conteo" leftSection={<IconClipboardCheck size={18} />}>
              Conteo
            </Tabs.Tab>
          ) : null}
          {puede.etiquetados ? (
            <Tabs.Tab value="etiquetados" leftSection={<IconTags size={18} />}>
              Etiquetados
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
        <Tabs.Panel value="pedido">{puede.pedido ? <PuntoPedido /> : null}</Tabs.Panel>
        <Tabs.Panel value="depositos">
          {puede.depositos ? <PaginaDepositos /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="conteo">{puede.conteo ? <PaginaConteo /> : null}</Tabs.Panel>
        <Tabs.Panel value="etiquetados">
          {puede.etiquetados ? <PaginaInsumosEtiquetados /> : null}
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

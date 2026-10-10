import { useEffect, useState } from 'react';
import { Tabs } from '@mantine/core';
import {
  IconAdjustments,
  IconBell,
  IconBuildingWarehouse,
  IconCoin,
  IconPackage,
  IconReceipt,
  IconReceipt2,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { FINANZAS, useTieneRol } from '@/features/auth/sesion';
import { useAvisosCosto, useTomarFotoCostos } from '@/lib/consultasCostos';
import { PestaniaInsumos } from './PestaniaInsumos';
import { PestaniaLotes } from './PestaniaLotes';
import { PestaniaRecepciones } from './PestaniaRecepciones';
import { PestaniaProductos } from './PestaniaProductos';
import { PestaniaStock } from './PestaniaStock';
import { PestaniaAvisos } from './PestaniaAvisos';
import { PestaniaParametros } from './PestaniaParametros';
import { PestaniaGastos } from './PestaniaGastos';

/** Pestaña de avisos con el contador de no vistos. Sólo se monta para quien la ve. */
function EtiquetaAvisos() {
  const avisos = useAvisosCosto();
  const noVistos = (avisos.data ?? []).filter((a) => a.visto_en === null).length;
  return <>Avisos ({noVistos})</>;
}

export function PaginaCostos() {
  const [vista, setVista] = useState<string | null>('insumos');
  const puedeAvisos = useTieneRol(FINANZAS, 'GERENCIA');
  // La foto del mes (D-47) se toma al abrir costos: valoriza el stock de
  // producto terminado y arma la historia mensual sin tarea programada.
  const { mutate: fotografiar } = useTomarFotoCostos();
  useEffect(() => fotografiar(), [fotografiar]);

  return (
    <>
      <EncabezadoPagina
        titulo="Costos"
        descripcion="Costo de gestión, sin IVA: lo que se pagó por cada lote y el costo de referencia que se usa para costear productos. No es la valuación contable."
      />
      <Tabs value={vista} onChange={setVista} color="azul" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="insumos" leftSection={<IconCoin size={17} />}>
            Insumos
          </Tabs.Tab>
          <Tabs.Tab value="lotes" leftSection={<IconReceipt size={17} />}>
            Lotes
          </Tabs.Tab>
          <Tabs.Tab value="recepciones" leftSection={<IconTruckDelivery size={17} />}>
            Recepciones
          </Tabs.Tab>
          <Tabs.Tab value="productos" leftSection={<IconPackage size={17} />}>
            Productos
          </Tabs.Tab>
          <Tabs.Tab value="stock" leftSection={<IconBuildingWarehouse size={17} />}>
            Stock valorizado
          </Tabs.Tab>
          <Tabs.Tab value="gastos" leftSection={<IconReceipt2 size={17} />}>
            Gastos
          </Tabs.Tab>
          {puedeAvisos ? (
            <Tabs.Tab value="avisos" leftSection={<IconBell size={17} />}>
              <EtiquetaAvisos />
            </Tabs.Tab>
          ) : null}
          <Tabs.Tab value="parametros" leftSection={<IconAdjustments size={17} />}>
            Parámetros
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="insumos">
          <PestaniaInsumos />
        </Tabs.Panel>
        <Tabs.Panel value="lotes">
          <PestaniaLotes />
        </Tabs.Panel>
        <Tabs.Panel value="recepciones">
          <PestaniaRecepciones />
        </Tabs.Panel>
        <Tabs.Panel value="productos">
          <PestaniaProductos />
        </Tabs.Panel>
        <Tabs.Panel value="stock">
          <PestaniaStock />
        </Tabs.Panel>
        <Tabs.Panel value="gastos">
          <PestaniaGastos />
        </Tabs.Panel>
        {puedeAvisos ? (
          <Tabs.Panel value="avisos">
            <PestaniaAvisos />
          </Tabs.Panel>
        ) : null}
        <Tabs.Panel value="parametros">
          <PestaniaParametros />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

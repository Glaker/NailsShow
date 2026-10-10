import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import { useSesion, useTieneRol } from '@/features/auth/sesion';
import { ROLES_VEN_COSTOS, useParametrosCosto, useSeriesMacro } from '@/lib/consultasCostos';
import {
  convertir,
  leyendaVista,
  mesBasePorDefecto,
  type Naturaleza,
  type PuntoSerie,
  type SeriesMacro,
  type VistaMoneda,
} from '@/lib/moneda';

/*
 * Selector global de moneda (pesos corrientes / dólares / pesos constantes).
 * Un solo control, en la barra; se recuerda por usuario en este navegador. Es
 * una preferencia de pantalla, no un dato de negocio (CLAUDE.md §6): si el
 * almacenamiento falla, rige «pesos corrientes».
 */

interface ValorVista {
  vista: VistaMoneda;
  setVista: (v: VistaMoneda) => void;
}

const Contexto = createContext<ValorVista>({ vista: 'CORRIENTE', setVista: () => {} });

const clave = (usuario: string | null | undefined) => `nailshow-vista-moneda-${usuario ?? 'anonimo'}`;

function leer(usuario: string | null | undefined): VistaMoneda {
  try {
    const v = window.localStorage.getItem(clave(usuario));
    return v === 'USD' || v === 'CONSTANTE' ? v : 'CORRIENTE';
  } catch {
    return 'CORRIENTE';
  }
}

export function ProveedorVistaMoneda({ children }: { children: ReactNode }) {
  const { claims } = useSesion();
  const usuario = claims?.usuario_id;
  // Una entrada por usuario; al cambiar de sesión se relee.
  const [porUsuario, setPorUsuario] = useState<Record<string, VistaMoneda>>({});
  const k = clave(usuario);
  const vista = porUsuario[k] ?? leer(usuario);
  const setVista = useCallback(
    (v: VistaMoneda) => {
      setPorUsuario((p) => ({ ...p, [k]: v }));
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* sin almacenamiento: vale para esta pestaña */
      }
    },
    [k],
  );
  const valor = useMemo(() => ({ vista, setVista }), [vista, setVista]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

const aMes = (iso: string) => iso.slice(0, 7);

/**
 * La vista activa y una función para convertir: todos los gráficos de costos
 * pasan por acá (y por `convertir` de src/lib/moneda.ts), nunca por su cuenta.
 */
export function useVistaMoneda() {
  const { vista, setVista } = useContext(Contexto);
  const series = useSeriesMacro();
  const parametros = useParametrosCosto();
  const macro = useMemo<SeriesMacro>(() => {
    const de = (s: string): PuntoSerie[] =>
      (series.data ?? [])
        .filter((p) => p.serie === s)
        .map((p) => ({ mes: aMes(p.mes), valor: p.valor, provisorio: p.es_provisorio }));
    return {
      ipc: de('IPC'),
      tcPromedio: de('TC_A3500_PROMEDIO'),
      tcCierre: de('TC_A3500_CIERRE'),
    };
  }, [series.data]);
  const mesBase = mesBasePorDefecto(macro.ipc);
  const serieTc = parametros.data?.serie_tipo_cambio ?? 'A3500';
  return {
    vista,
    setVista,
    /** Para el título del gráfico: «en pesos constantes de sep-2026». */
    leyenda: leyendaVista(vista, mesBase, serieTc),
    /** `mes` en 'AAAA-MM' o fecha ISO. Flujo: promedio del mes; saldo: cierre. */
    convertir: (importe: number, mes: string, naturaleza: Naturaleza) =>
      convertir(importe, aMes(mes), vista, naturaleza, macro, mesBase),
  };
}

/** Control de la barra. Sólo para quien ve costos. */
export function SelectorMoneda({ compacto = false }: { compacto?: boolean }) {
  const ve = useTieneRol(...ROLES_VEN_COSTOS);
  const { vista, setVista } = useContext(Contexto);
  if (!ve) return null;
  return (
    <Stack gap={4}>
      {compacto ? null : (
        <Text size="xs" c="dimmed" fw={500}>
          Montos en
        </Text>
      )}
      <SegmentedControl
        size="xs"
        fullWidth
        value={vista}
        onChange={(v) => setVista(v as VistaMoneda)}
        data={[
          { label: '$', value: 'CORRIENTE' },
          { label: 'U$D', value: 'USD' },
          { label: '$ const.', value: 'CONSTANTE' },
        ]}
        aria-label="Moneda de los gráficos: pesos corrientes, dólares o pesos constantes"
      />
    </Stack>
  );
}

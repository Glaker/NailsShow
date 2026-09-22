/**
 * Temperatura ambiente sugerida para la calculadora de lote.
 *
 * Qué hace. Consulta la temperatura exterior en Romero, La Plata, y le suma un
 * offset fijo: adentro de la planta suele estar más caliente que afuera.
 *
 * QUÉ NO ES. No es una medición. Es una estimación a partir de un dato
 * meteorológico de una estación que no está en la planta, más una constante que
 * nadie calibró. Sirve para que la calculadora arranque en un número razonable
 * en vez de en 20 °C fijos, y para que el usuario lo corrija.
 *
 * Por eso la función devuelve el valor exterior, el offset y la hora de la
 * medición por separado, y no solo el número final: la pantalla tiene que poder
 * mostrar de dónde salió. Una hoja de pesada se emite con la temperatura
 * **medida** del producto o del ambiente, tomada con el instrumento calibrado
 * que corresponda (I.50.25). Si este valor termina alimentando un registro de
 * fabricación, eso es un desvío, no una funcionalidad.
 *
 * Proveedor: Open-Meteo. Sin clave de API, sin registro, sin cuota para uso no
 * comercial moderado, y no recibe ningún dato del negocio: se le manda una
 * coordenada pública y devuelve un número. No agrega dependencias al proyecto
 * (CLAUDE.md §7), usa `fetch`.
 */

import { useQuery } from '@tanstack/react-query';

/** Romero, partido de La Plata, Buenos Aires. */
export const UBICACION_PLANTA = {
  nombre: 'Romero, La Plata',
  latitud: -34.9667,
  longitud: -58.0667,
} as const;

/**
 * Cuánto más caliente está adentro que afuera, en °C.
 *
 * Valor provisorio informado por la conducción del proyecto, sin medición que
 * lo respalde. El día que haya registro de temperatura ambiente de planta, esto
 * se reemplaza por el dato propio y esta constante desaparece.
 */
export const OFFSET_INTERIOR_C = 2;

/** Límites del control de temperatura de la calculadora. */
export const TEMP_MIN_C = 0;
export const TEMP_MAX_C = 45;

export interface ClimaPlanta {
  /** Temperatura exterior informada, °C. */
  exteriorC: number;
  /** `exteriorC + OFFSET_INTERIOR_C`, acotada al rango operativo. */
  sugeridaC: number;
  /** Momento de la medición que informa el servicio, no el de la consulta. */
  medidaEn: Date;
  /** True si el offset empujó el valor fuera de rango y hubo que acotarlo. */
  acotada: boolean;
}

interface RespuestaOpenMeteo {
  current?: { time?: string; temperature_2m?: number };
}

export function acotarTemperatura(tempC: number): number {
  return Math.min(TEMP_MAX_C, Math.max(TEMP_MIN_C, tempC));
}

export async function obtenerClimaPlanta(signal?: AbortSignal): Promise<ClimaPlanta> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(UBICACION_PLANTA.latitud));
  url.searchParams.set('longitude', String(UBICACION_PLANTA.longitud));
  url.searchParams.set('current', 'temperature_2m');
  url.searchParams.set('timezone', 'America/Argentina/Buenos_Aires');

  const r = await fetch(url, signal ? { signal } : {});
  if (!r.ok) {
    throw new Error(`El servicio meteorológico respondió ${r.status}.`);
  }

  const datos = (await r.json()) as RespuestaOpenMeteo;
  const exteriorC = datos.current?.temperature_2m;
  if (typeof exteriorC !== 'number' || !Number.isFinite(exteriorC)) {
    throw new Error('El servicio meteorológico no devolvió una temperatura.');
  }

  const crudaC = exteriorC + OFFSET_INTERIOR_C;
  const sugeridaC = acotarTemperatura(crudaC);
  const horaTexto = datos.current?.time;
  const medidaEn = horaTexto ? new Date(horaTexto) : new Date();

  return {
    exteriorC,
    sugeridaC,
    medidaEn: Number.isNaN(medidaEn.getTime()) ? new Date() : medidaEn,
    acotada: sugeridaC !== crudaC,
  };
}

/**
 * Se refresca cada 15 minutos y no reintenta de más: si el servicio no está,
 * la calculadora tiene que seguir andando con la temperatura escrita a mano.
 * La planta trabaja con tablet y la conectividad no está garantizada.
 */
export function useClimaPlanta(habilitado = true) {
  return useQuery({
    queryKey: ['clima-planta'],
    enabled: habilitado,
    queryFn: ({ signal }) => obtenerClimaPlanta(signal),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  });
}

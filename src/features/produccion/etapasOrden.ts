/**
 * Qué se registra en cada etapa del batch record, tomado de R.40.26.1 /
 * R.40.27.1 (ME.40.xx). La misma configuración arma el formulario de la etapa
 * y el documento imprimible: lo que se carga es lo que se imprime.
 */

import type { EstadoOrden, EtapaOrden } from '@/lib/consultasOrdenes';

export const COLOR_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  ABIERTA: 'azul',
  TERMINADA: 'estadoEnAnalisis',
  LIBERADA: 'estadoAprobado',
  RECHAZADA: 'estadoRechazado',
  ANULADA: 'gray',
};

export type TipoCampo = 'texto' | 'numero' | 'hora' | 'fecha' | 'equipo' | 'si_no';

/**
 * Lo que completa el sistema y no se tipea (pedido del 2026-10-14):
 * inicio = cuando se empezó la tarea o se agregó el renglón; fin = cuando se
 * agregó el renglón siguiente o se registró; fecha y hora = al registrar;
 * nombre = quien registra; numero = número de renglón.
 */
export type Automatico = 'inicio' | 'fin' | 'fecha' | 'hora' | 'nombre' | 'numero';

export interface Columna {
  clave: string;
  titulo: string;
  tipo: TipoCampo;
  auto?: Automatico;
}

export interface Tabla {
  clave: string;
  titulo: string;
  columnas: Columna[];
}

export interface ConfigEtapa {
  /** Verificaciones previas SÍ/NO. Un NO obliga a observar el desvío. */
  verificaciones?: string[];
  tablas?: Tabla[];
  campos?: Columna[];
  /** Etapa de control con dictamen «APROBADO: SÍ / NO». */
  dictamen?: { registro: string };
  /** Resultados contra la especificación (control de producto terminado). */
  contraEspecificacion?: boolean;
  /** Texto del área según el ME. */
  area?: string;
}

const VESTIMENTA = 'Vestimenta e higiene del operario según protocolo';

export const CONFIG_ETAPAS: Record<EtapaOrden, ConfigEtapa> = {
  PESADA: {
    verificaciones: [
      'Área de pesada limpia',
      'Equipos y materiales limpios',
      'Verificación de la balanza y entorno',
      'Materias primas y semielaborados APROBADOS y VIGENTES',
      VESTIMENTA,
    ],
    tablas: [
      {
        clave: 'pesadas',
        titulo: 'Pesada de materias primas según I.40.16',
        columnas: [
          { clave: 'componente', titulo: 'Materia prima', tipo: 'texto' },
          { clave: 'lote', titulo: 'Lote y/o código interno', tipo: 'texto' },
          { clave: 'cantidad', titulo: 'Cantidad a pesar (kg)', tipo: 'numero' },
          { clave: 'balanza', titulo: 'Código balanza', tipo: 'equipo' },
          {
            clave: 'registro',
            titulo: 'Registro de pesada',
            tipo: 'numero',
            auto: 'numero',
          },
          { clave: 'realizo', titulo: 'Realizó', tipo: 'texto', auto: 'nombre' },
        ],
      },
    ],
  },
  ELABORACION: {
    area: 'Área de elaboración',
    verificaciones: [
      'Área y equipos limpios',
      'Ausencia de productos y materiales ajenos al proceso',
      'Materias primas y SE recepcionadas correctamente',
      VESTIMENTA,
    ],
    tablas: [
      {
        clave: 'proceso',
        titulo: 'Proceso de elaboración',
        columnas: [
          { clave: 'operario', titulo: 'Operario', tipo: 'texto', auto: 'nombre' },
          {
            clave: 'hora_inicio',
            titulo: 'Hora de inicio',
            tipo: 'hora',
            auto: 'inicio',
          },
          { clave: 'paso', titulo: 'Paso', tipo: 'texto' },
          { clave: 'equipo', titulo: 'Código equipo', tipo: 'equipo' },
          {
            clave: 'hora_fin',
            titulo: 'Hora de finalización',
            tipo: 'hora',
            auto: 'fin',
          },
        ],
      },
    ],
  },
  MUESTREO_GRANEL: {
    campos: [
      { clave: 'cantidad_muestra', titulo: 'Cantidad de muestra', tipo: 'texto' },
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', auto: 'fecha' },
      { clave: 'hora', titulo: 'Hora', tipo: 'hora', auto: 'hora' },
    ],
  },
  CC_GRANEL: { dictamen: { registro: 'R.50.10.1' } },
  FRACCIONAMIENTO: {
    area: 'Área de envasado',
    tablas: [
      {
        clave: 'insumos',
        titulo: 'Tipo de insumo a utilizar',
        columnas: [
          { clave: 'insumo', titulo: 'Envases / tapas', tipo: 'texto' },
          { clave: 'codigo', titulo: 'Código interno', tipo: 'texto' },
          { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero' },
        ],
      },
      {
        clave: 'proceso',
        titulo: 'Proceso de fraccionamiento',
        columnas: [
          { clave: 'operario', titulo: 'Operario', tipo: 'texto', auto: 'nombre' },
          {
            clave: 'hora_inicio',
            titulo: 'Hora de inicio',
            tipo: 'hora',
            auto: 'inicio',
          },
          { clave: 'balanza', titulo: 'Código balanza portátil', tipo: 'equipo' },
          {
            clave: 'hora_fin',
            titulo: 'Hora de finalización',
            tipo: 'hora',
            auto: 'fin',
          },
        ],
      },
    ],
    verificaciones: [
      'Área y equipos limpios',
      'Ausencia de productos y materiales ajenos al proceso',
      'Producto a granel recepcionado correctamente, APROBADO; el número de lote coincide con el registro',
      'Envase etiquetado correctamente',
      VESTIMENTA,
      'Balanza portátil en perfecto estado de funcionamiento',
    ],
    campos: [
      { clave: 'canastas', titulo: 'N° de canastas', tipo: 'numero' },
      { clave: 'por_canasta', titulo: 'N° de unidades por canasta', tipo: 'numero' },
    ],
  },
  MUESTREO_PT: {
    tablas: [
      {
        clave: 'muestras',
        titulo: 'Muestreo de producto terminado',
        columnas: [
          { clave: 'tamano', titulo: 'Tamaño de envase', tipo: 'texto' },
          { clave: 'n_muestra', titulo: 'N° de muestra', tipo: 'numero' },
          { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', auto: 'fecha' },
          { clave: 'hora', titulo: 'Hora', tipo: 'hora', auto: 'hora' },
        ],
      },
    ],
  },
  CC_PT: { dictamen: { registro: 'R.50.7.1' }, contraEspecificacion: true },
  CONTRAMUESTRA: {
    campos: [
      { clave: 'operario', titulo: 'Operario', tipo: 'texto', auto: 'nombre' },
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha', auto: 'fecha' },
      { clave: 'envases', titulo: 'N° envases', tipo: 'numero' },
    ],
  },
  REVISION: {
    campos: [
      { clave: 'no_conformidades', titulo: 'No conformidades observadas', tipo: 'texto' },
      {
        clave: 'rotulos_adjuntos',
        titulo: 'Rótulos y etiquetas adjuntos',
        tipo: 'si_no',
      },
    ],
  },
};

/** Unidades totales del recuento de fraccionamiento. */
export const unidadesRecuento = (datos: Record<string, unknown>) =>
  Number(datos.canastas ?? 0) * Number(datos.por_canasta ?? 0);

type Fila = Record<string, unknown>;
const vacio = (v: unknown) => v === undefined || v === null || v === '';

/** «HH:MM» y «AAAA-MM-DD» en hora local, como los inputs de hora y fecha. */
export const horaDe = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const fechaDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Completa lo automático de una etapa al registrarla, sin pisar lo que ya
 * tiene valor. Los horarios de una tabla se encadenan: el inicio de un
 * renglón es el fin del anterior; el del primero, cuando se empezó.
 */
export function completarAutomaticos(
  config: ConfigEtapa,
  datos: Record<string, unknown>,
  ctx: { ahora: Date; inicio: Date; nombre: string },
): Record<string, unknown> {
  const valor = (auto: Automatico | undefined, i: number): unknown => {
    switch (auto) {
      case 'fecha':
        return fechaDe(ctx.ahora);
      case 'hora':
        return horaDe(ctx.ahora);
      case 'nombre':
        return ctx.nombre;
      case 'numero':
        return i + 1;
      default:
        return undefined;
    }
  };
  const out: Record<string, unknown> = { ...datos };
  for (const t of config.tablas ?? []) {
    const filas = ((datos[t.clave] as Fila[] | undefined) ?? []).map((f) => ({ ...f }));
    filas.forEach((f, i) => {
      for (const c of t.columnas) {
        if (!c.auto || !vacio(f[c.clave])) continue;
        if (c.auto === 'inicio') {
          const fin = t.columnas.find((x) => x.auto === 'fin');
          const previo = i > 0 && fin ? filas[i - 1]![fin.clave] : undefined;
          f[c.clave] = vacio(previo) ? horaDe(i === 0 ? ctx.inicio : ctx.ahora) : previo;
        } else if (c.auto === 'fin') {
          f[c.clave] = horaDe(ctx.ahora);
        } else {
          f[c.clave] = valor(c.auto, i);
        }
      }
    });
    out[t.clave] = filas;
  }
  for (const c of config.campos ?? []) {
    if (c.auto && vacio(out[c.clave])) out[c.clave] = valor(c.auto, 0);
  }
  return out;
}

/** Renglón nuevo: cierra la hora de fin del anterior y abre la del nuevo. */
export function agregarRenglon(
  columnas: Columna[],
  filas: Fila[],
  ahora: Date,
  /** Inicio del primer renglón: cuando se empezó la tarea. */
  primerInicio: Date = ahora,
): Fila[] {
  const fin = columnas.find((c) => c.auto === 'fin');
  const inicio = columnas.find((c) => c.auto === 'inicio');
  const previas = filas.map((f, i) =>
    fin && i === filas.length - 1 && vacio(f[fin.clave])
      ? { ...f, [fin.clave]: horaDe(ahora) }
      : f,
  );
  const nueva: Fila = Object.fromEntries(columnas.map((c) => [c.clave, null]));
  if (inicio) nueva[inicio.clave] = horaDe(filas.length === 0 ? primerInicio : ahora);
  return [...previas, nueva];
}

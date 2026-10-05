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

export interface Columna {
  clave: string;
  titulo: string;
  tipo: TipoCampo;
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
          { clave: 'registro', titulo: 'Registro de pesada', tipo: 'numero' },
          { clave: 'realizo', titulo: 'Realizó', tipo: 'texto' },
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
          { clave: 'operario', titulo: 'Operario', tipo: 'texto' },
          { clave: 'hora_inicio', titulo: 'Hora de inicio', tipo: 'hora' },
          { clave: 'paso', titulo: 'Paso', tipo: 'texto' },
          { clave: 'equipo', titulo: 'Código equipo', tipo: 'equipo' },
          { clave: 'hora_fin', titulo: 'Hora de finalización', tipo: 'hora' },
        ],
      },
    ],
  },
  MUESTREO_GRANEL: {
    campos: [
      { clave: 'cantidad_muestra', titulo: 'Cantidad de muestra', tipo: 'texto' },
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
      { clave: 'hora', titulo: 'Hora', tipo: 'hora' },
    ],
  },
  CC_GRANEL: { dictamen: { registro: 'R.50.9.1' } },
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
          { clave: 'operario', titulo: 'Operario', tipo: 'texto' },
          { clave: 'hora_inicio', titulo: 'Hora de inicio', tipo: 'hora' },
          { clave: 'balanza', titulo: 'Código balanza portátil', tipo: 'equipo' },
          { clave: 'hora_fin', titulo: 'Hora de finalización', tipo: 'hora' },
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
          { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { clave: 'hora', titulo: 'Hora', tipo: 'hora' },
        ],
      },
    ],
  },
  CC_PT: { dictamen: { registro: 'R.50.7.1' }, contraEspecificacion: true },
  CONTRAMUESTRA: {
    campos: [
      { clave: 'operario', titulo: 'Operario', tipo: 'texto' },
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
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

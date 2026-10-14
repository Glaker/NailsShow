import { Alert } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { EspecParametro, EtapaOrden, EtapaRegistrada } from '@/lib/consultasOrdenes';
import type { RegistroAnalisis } from '@/lib/consultasAnalisis';
import { DocumentoBatchRecord, type Espec } from './BatchRecord';

/*
 * Batch record de ejemplo para conocer el documento antes de liberar un lote
 * real (pedido del 2026-10-14). Todo es ficticio y vive solo en esta pantalla:
 * no hay orden en la base, nada se registra ni se firma. Sale con marca de
 * agua «SOLO EJEMPLO — NO VÁLIDO ANMAT» en pantalla y en el PDF.
 */

const DT = 'dt-ejemplo';
const OPERARIO = 'operario-ejemplo';
const CC = 'cc-ejemplo';
const NOMBRES: Record<string, string> = {
  [DT]: 'Anabella Gregorini (ejemplo)',
  [OPERARIO]: 'Operario de ejemplo',
  [CC]: 'Control de Calidad (ejemplo)',
};

const DIA = '2026-10-01';
const a = (hora: string) => `${DIA}T${hora}:00-03:00`;

function etapa(
  e: EtapaOrden,
  realizo: string,
  hora: string,
  datos: Record<string, unknown>,
  observaciones: string | null = null,
): EtapaRegistrada {
  return {
    id: `ej-${e}`,
    orden_id: 'ejemplo',
    etapa: e,
    datos,
    observaciones,
    realizo_por: realizo,
    realizo_en: a(hora),
    controlo_por: DT,
    controlo_en: a(hora),
  };
}

const sí = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [i, true]));

const ETAPAS: EtapaRegistrada[] = [
  etapa('PESADA', OPERARIO, '08:30', {
    verificaciones: sí(5),
    pesadas: [
      {
        componente: 'Aceite de jojoba',
        lote: 'MP-0412 · 0001/2026',
        cantidad: 2.4,
        balanza: 'BAL-01',
        registro: 1,
        realizo: 'Operario de ejemplo',
      },
      {
        componente: 'Aceite de almendras',
        lote: 'MP-0398 · 0002/2026',
        cantidad: 2.4,
        balanza: 'BAL-01',
        registro: 2,
        realizo: 'Operario de ejemplo',
      },
      {
        componente: 'Tocoferol acetato',
        lote: 'MP-0377 · 0003/2026',
        cantidad: 0.1,
        balanza: 'BAL-02',
        registro: 3,
        realizo: 'Operario de ejemplo',
      },
      {
        componente: 'Fragancia Amor',
        lote: 'MP-0450 · 0004/2026',
        cantidad: 0.05,
        balanza: 'BAL-02',
        registro: 4,
        realizo: 'Operario de ejemplo',
      },
    ],
  }),
  etapa('ELABORACION', OPERARIO, '09:15', {
    verificaciones: sí(4),
    proceso: [
      {
        operario: 'Operario de ejemplo',
        hora_inicio: '09:15',
        paso: 'Mezcla de aceites base',
        equipo: 'AGI-01',
        hora_fin: '09:40',
      },
      {
        operario: 'Operario de ejemplo',
        hora_inicio: '09:40',
        paso: 'Incorporación de tocoferol y fragancia',
        equipo: 'AGI-01',
        hora_fin: '09:55',
      },
    ],
  }),
  etapa('MUESTREO_GRANEL', CC, '10:00', {
    cantidad_muestra: '100 ml',
    fecha: '01/10/2026',
    hora: '10:00',
  }),
  etapa('CC_GRANEL', CC, '10:30', { aprobado: true }),
  etapa('FRACCIONAMIENTO', OPERARIO, '11:00', {
    verificaciones: sí(6),
    insumos: [
      { insumo: 'Frasco gotero 15 ml', codigo: 'ENV-015', cantidad: 330 },
      { insumo: 'Pincel para aceite', codigo: 'PIN-ACE', cantidad: 330 },
    ],
    proceso: [
      {
        operario: 'Operario de ejemplo',
        hora_inicio: '11:00',
        balanza: 'BAL-03',
        hora_fin: '13:10',
      },
    ],
    canastas: 11,
    por_canasta: 30,
  }),
  etapa('MUESTREO_PT', CC, '13:30', {
    muestras: [{ tamano: '15 ml', n_muestra: 3, fecha: '01/10/2026', hora: '13:30' }],
  }),
  etapa('CC_PT', CC, '14:30', {
    aprobado: true,
    resultados: {
      p1: { valor: 'Líquido oleoso, límpido', cumple: true },
      p2: { valor: 'Rosado suave', cumple: true },
      p3: { valor: 'Según patrón', cumple: true },
      p4: { valor: 0.92, cumple: true },
    },
  }),
  etapa('CONTRAMUESTRA', CC, '15:00', {
    operario: 'Control de Calidad (ejemplo)',
    fecha: '01/10/2026',
    envases: 2,
  }),
  etapa(
    'REVISION',
    DT,
    '16:00',
    {
      no_conformidades: 'Ninguna',
      rotulos_adjuntos: true,
    },
    'Documentación completa.',
  ),
];

const parametro = (
  id: string,
  orden: number,
  p: Partial<EspecParametro> & Pick<EspecParametro, 'nombre' | 'grupo' | 'tipo_criterio'>,
): EspecParametro => ({
  id,
  especificacion_id: 'ejemplo',
  orden,
  valor_min: null,
  valor_max: null,
  valor_texto: null,
  unidad: null,
  metodo_ensayo: null,
  condicion_ensayo: null,
  referencia_norma: null,
  obligatorio: true,
  quitado: false,
  ...p,
});

const ESPEC = {
  especificacion: { codigo_poe: 'I-E.50.28', version: '00' },
  formula: [],
  parametros: [
    parametro('p1', 1, {
      nombre: 'Aspecto',
      grupo: 'ORGANOLEPTICO',
      tipo_criterio: 'VALOR_TEXTO',
      valor_texto: 'Líquido oleoso, límpido',
    }),
    parametro('p2', 2, {
      nombre: 'Color',
      grupo: 'ORGANOLEPTICO',
      tipo_criterio: 'CONTRA_PATRON',
      valor_texto: 'Según patrón',
    }),
    parametro('p3', 3, {
      nombre: 'Olor',
      grupo: 'ORGANOLEPTICO',
      tipo_criterio: 'CONTRA_PATRON',
      valor_texto: 'Característico según patrón',
    }),
    parametro('p4', 4, {
      nombre: 'Densidad',
      grupo: 'FISICOQUIMICO',
      tipo_criterio: 'RANGO',
      valor_min: 0.9,
      valor_max: 0.95,
      unidad: 'g/ml',
    }),
  ],
} as unknown as Espec;

function analisis(
  registro: string,
  numero: string,
  descripcion: string,
  extra: Partial<RegistroAnalisis> = {},
): RegistroAnalisis {
  return {
    id: `an-${numero}`,
    registro,
    numero,
    fecha: '2026-09-28',
    lote_insumo_id: null,
    orden_id: null,
    tamano_muestra: '50 g',
    descripcion,
    conclusiones: 'Cumple con lo esperado. Se aprueba.',
    aprobado: true,
    rectifica_a: null,
    motivo: null,
    controlo_por: CC,
    controlo_en: a('10:30'),
    controlo_nombre: 'Control de Calidad (ejemplo)',
    lote_interno: null,
    vigente: true,
    ...extra,
  };
}

const GRANEL = analisis(
  'R.50.10.1',
  '001/2026',
  'Líquido oleoso, límpido, rosado suave, olor característico según patrón. Sin partículas extrañas.',
  {
    fecha: DIA,
    tamano_muestra: '100 ml',
    conclusiones: 'Densidad 0,92 g/ml, dentro de especificación. Se aprueba el granel.',
  },
);

const INSUMOS = [
  {
    lote_interno: '0001/2026',
    articulo: 'Aceite de jojoba',
    registro: analisis(
      'R.50.5.1',
      '014/2026',
      'Líquido amarillo claro, límpido, sin olor extraño.',
    ),
  },
  {
    lote_interno: '0002/2026',
    articulo: 'Aceite de almendras',
    registro: analisis('R.50.5.1', '015/2026', 'Líquido amarillo pálido, límpido.'),
  },
  {
    lote_interno: '0003/2026',
    articulo: 'Tocoferol acetato',
    registro: analisis('R.50.5.1', '016/2026', 'Líquido viscoso, incoloro.'),
  },
  {
    lote_interno: '0004/2026',
    articulo: 'Fragancia Amor',
    registro: analisis('R.50.5.1', '017/2026', 'Líquido incoloro, olor según patrón.'),
  },
  {
    lote_interno: '0005/2026',
    articulo: 'Frasco gotero 15 ml',
    registro: analisis(
      'R.50.5.1',
      '018/2026',
      'Envases sin fisuras ni suciedad; cierre correcto.',
      { tamano_muestra: '13 unidades' },
    ),
  },
];

export function BatchRecordEjemplo() {
  return (
    <>
      <Alert
        color="estadoRechazado"
        variant="light"
        icon={<IconInfoCircle size={18} />}
        mb="md"
        className="no-imprimir"
      >
        Este es un batch record de ejemplo, con datos inventados, para ver cómo es el
        documento que se descarga antes de liberar un lote. No existe en la base, no se
        firma y no es válido ante ANMAT.
      </Alert>
      <DocumentoBatchRecord
        ejemplo
        orden={{
          numero: 'OP-EJEMPLO',
          numero_lote: 'EJ-0001',
          vencimiento_texto: '10/2028',
          estado: 'LIBERADA',
          presentacion_texto: 'Frasco gotero 15 ml',
          cantidad_teorica: 4.95,
          unidad: 'kg',
          jornada: DIA,
          cantidad_obtenida: 4.9,
          unidades_obtenidas: 330,
          liberada_por: DT,
          liberada_en: a('17:00'),
          motivo_cierre: null,
        }}
        etapas={ETAPAS}
        producto={{
          nombre: 'Aceite para cutículas y uñas Amor 15 ml',
          codigo_interno: '378',
        }}
        formula={{ version: '01', codigo_me: 'ME.40.32' }}
        procedimiento={{
          version: 1,
          texto:
            'Ejemplo: pesar las materias primas según I.40.16, mezclar los aceites base, incorporar tocoferol y fragancia, muestrear el granel y fraccionar en frasco gotero.',
        }}
        espec={ESPEC}
        quien={(uid) => (uid ? (NOMBRES[uid] ?? '') : '')}
        trazabilidad={
          <p className="nota">
            En un lote real, acá va el anexo con cada lote de insumo consumido y adónde
            salió el producto.
          </p>
        }
        volver={{ a: '/liberacion', texto: 'Volver a liberación' }}
        analisisGranel={GRANEL}
        analisisInsumos={INSUMOS}
      />
    </>
  );
}

import { expect, test } from 'vitest';
import {
  agregarRenglon,
  estadoOrdenVisible,
  completarAutomaticos,
  CONFIG_ETAPAS,
  configDe,
} from './etapasOrden';

const inicio = new Date(2026, 9, 14, 9, 5);
const ahora = new Date(2026, 9, 14, 11, 40);

test('elaboración: los horarios se encadenan y el nombre lo pone el sistema', () => {
  const d = completarAutomaticos(
    CONFIG_ETAPAS.ELABORACION,
    { proceso: [{ paso: 'Mezcla', hora_fin: '10:00' }, { paso: 'Fragancia' }] },
    { ahora, inicio, nombre: 'Juan' },
  );
  expect(d.proceso).toEqual([
    { paso: 'Mezcla', hora_inicio: '09:05', hora_fin: '10:00', operario: 'Juan' },
    { paso: 'Fragancia', hora_inicio: '10:00', hora_fin: '11:40', operario: 'Juan' },
  ]);
});

test('pesada: número de pesada y quién la hizo; no pisa lo cargado', () => {
  const d = completarAutomaticos(
    CONFIG_ETAPAS.PESADA,
    { pesadas: [{ componente: 'A' }, { componente: 'B', realizo: 'Naza' }] },
    { ahora, inicio, nombre: 'Juan' },
  );
  expect(d.pesadas).toEqual([
    { componente: 'A', registro: 1, realizo: 'Juan' },
    { componente: 'B', registro: 2, realizo: 'Naza' },
  ]);
});

test('muestreo de granel: fecha y hora al registrar', () => {
  const d = completarAutomaticos(
    CONFIG_ETAPAS.MUESTREO_GRANEL,
    { cantidad_muestra: '100 ml' },
    { ahora, inicio, nombre: 'X' },
  );
  expect(d).toEqual({ cantidad_muestra: '100 ml', fecha: '2026-10-14', hora: '11:40' });
});

test('agregar renglón cierra el anterior y abre el nuevo', () => {
  const cols = CONFIG_ETAPAS.ELABORACION.tablas![0]!.columnas;
  const filas = agregarRenglon(cols, [{ hora_inicio: '09:05', hora_fin: null }], ahora);
  expect(filas[0]!.hora_fin).toBe('11:40');
  expect(filas[1]!.hora_inicio).toBe('11:40');
});

test('fraccionamiento: sin insumos ni cajas a mano; el registro anterior se sigue viendo', () => {
  const nuevo = configDe('FRACCIONAMIENTO', {});
  expect(nuevo.campos).toBeUndefined();
  expect(nuevo.tablas?.map((t) => t.clave)).toEqual(['proceso']);
  const viejo = configDe('FRACCIONAMIENTO', { canastas: 11, por_canasta: 30 });
  expect(viejo.tablas?.map((t) => t.clave)).toEqual(['insumos', 'proceso']);
  expect(viejo.campos?.map((c) => c.clave)).toEqual([
    'canastas',
    'por_canasta',
    'ultima_caja',
  ]);
  expect(configDe('PESADA', { canastas: 1 })).toBe(CONFIG_ETAPAS.PESADA);
});

test('liberada antes de cerrar el envasado: falta cargar unidades; cerrada: finalizada', () => {
  expect(estadoOrdenVisible({ estado: 'LIBERADA', terminada_en: null }).texto).toBe('falta cargar unidades');
  expect(estadoOrdenVisible({ estado: 'LIBERADA', terminada_en: '2026-11-04T12:00:00Z' }).texto).toBe('finalizada');
  expect(estadoOrdenVisible({ estado: 'ABIERTA', terminada_en: null }).texto).toBe('abierta');
});

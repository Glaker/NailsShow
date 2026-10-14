import { expect, test } from 'vitest';
import { agregarRenglon, completarAutomaticos, CONFIG_ETAPAS } from './etapasOrden';

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

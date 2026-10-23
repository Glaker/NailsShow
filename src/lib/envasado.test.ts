import { describe, expect, it } from 'vitest';
import {
  MINUTOS_JORNADA,
  aMmss,
  deMmss,
  diasRecomendados,
  horasMinutos,
  minutosReloj,
  recomendacion,
  tiempoDe,
} from './envasado';

describe('tiempo de envasado', () => {
  const sanitizante = { minutosUnidad: 1, margenPct: 10, personas: 1 };

  it('la jornada de 8 a 15 con media hora de descanso son 390 minutos', () => {
    expect(MINUTOS_JORNADA).toBe(390);
  });

  it('1000 sanitizantes a 1 minuto, con 10 %, una persona: 1100 min y 3 días', () => {
    expect(minutosReloj(1000, sanitizante)).toBeCloseTo(1100);
    expect(diasRecomendados(1100)).toBe(3);
  });

  it('con tres personas, un día', () => {
    expect(diasRecomendados(minutosReloj(1000, { ...sanitizante, personas: 3 }))).toBe(1);
  });

  it('una jornada justa es un día, no dos', () => {
    expect(diasRecomendados(390)).toBe(1);
    expect(diasRecomendados(391)).toBe(2);
  });

  it('sin tiempo cargado no recomienda', () => {
    expect(tiempoDe({ minutos_envasado_unidad: null })).toBeNull();
    expect(recomendacion([{ cantidad: 10, tiempo: null }])).toBeNull();
  });

  it('varios productos suman y avisan los que faltan', () => {
    const r = recomendacion([
      { cantidad: 1000, tiempo: sanitizante },
      { cantidad: 5, tiempo: null },
    ]);
    expect(r?.dias).toBe(3);
    expect(r?.minutos).toBeCloseTo(1100);
    expect(r?.faltan).toBe(1);
  });

  it('formatea horas y minutos', () => {
    expect(horasMinutos(1100)).toBe('18 h 20 min');
    expect(horasMinutos(45)).toBe('45 min');
    expect(horasMinutos(120)).toBe('2 h');
  });
});

describe('tiempo en MM:SS (D-ajustes-2)', () => {
  it('lee minutos y segundos, y segundos solos', () => {
    expect(deMmss('1:30')).toBeCloseTo(1.5);
    expect(deMmss('0:45')).toBeCloseTo(0.75);
    expect(deMmss('45')).toBeCloseTo(0.75);
    expect(deMmss('')).toBeNull();
    expect(deMmss('1:75')).toBeNaN();
    expect(deMmss('1,5')).toBeNaN();
  });

  it('escribe y vuelve igual', () => {
    expect(aMmss(1.5)).toBe('1:30');
    expect(aMmss(0.75)).toBe('0:45');
    expect(aMmss(null)).toBe('');
    expect(deMmss(aMmss(2 / 60))).toBeCloseTo(2 / 60);
  });

  it('el tiempo por unidad es envasado + etiquetado', () => {
    expect(
      tiempoDe({ minutos_envasado_unidad: '0.5', minutos_etiquetado_unidad: 0.25 })
        ?.minutosUnidad,
    ).toBeCloseTo(0.75);
    expect(tiempoDe({ minutos_etiquetado_unidad: 0.25 })?.minutosUnidad).toBeCloseTo(
      0.25,
    );
  });
});

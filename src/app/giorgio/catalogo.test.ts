import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAVEGACION, ROLES_CONFIGURABLES, ve } from '@/app/navegacion';
import type { Rol } from '@/features/auth/sesion';
import type { VisibilidadRow } from '@/lib/consultasVisibilidad';
import { SUGERENCIAS, sugerenciasDe } from '@/app/ayuda/sugerencias';
import { pantallasPermitidas } from '../../../supabase/functions/_shared/giorgio';
import { SUBRUTAS, SUBRUTAS_EXCLUIDAS, armarCatalogo } from './catalogo';

const RUTA_JSON = 'supabase/functions/giorgio/catalogo.json';

describe('catálogo de Giorgio', () => {
  it('el JSON de la Edge Function está al día con el menú y la ayuda', () => {
    const esperado = JSON.stringify(armarCatalogo(), null, 2) + '\n';
    let actual = '';
    try {
      actual = readFileSync(RUTA_JSON, 'utf8').replace(/\r\n/g, '\n');
    } catch {
      /* no existe todavía */
    }
    if (actual !== esperado) {
      // Lo regenera para que baste con revisar el diff y commitearlo.
      writeFileSync(RUTA_JSON, esperado);
      throw new Error(
        `${RUTA_JSON} estaba desactualizado: lo regeneré, revisalo y commitealo.`,
      );
    }
  });

  it('toda ruta con parámetro del router está en SUBRUTAS o excluida a propósito', () => {
    const rutas = readFileSync('src/app/routes.tsx', 'utf8');
    const conParametro = [...rutas.matchAll(/path="([^"]*:[^"]*)"/g)].map((m) => m[1]);
    const conocidas = [...SUBRUTAS.map((s) => s.patron), ...SUBRUTAS_EXCLUIDAS];
    expect(conParametro.filter((r) => !conocidas.includes(r!))).toEqual([]);
  });

  it('las sugerencias de Giorgio son de rutas que existen', () => {
    const rutas = [
      ...readFileSync('src/app/routes.tsx', 'utf8').matchAll(/path="([^"]+)"/g),
    ].map((m) => m[1]);
    const pantallas = armarCatalogo().pantallas.map((p) => p.ruta);
    const sueltas = Object.keys(SUGERENCIAS).filter(
      (k) => !rutas.includes(k) && !pantallas.includes(k),
    );
    expect(sueltas).toEqual([]);
  });

  it('sugerencias: la página de detalle tiene las suyas, una ruta sin sugerencias ninguna', () => {
    expect(
      sugerenciasDe('/costos/producto/3f2b8c1e-7a4d-4e2f-9b6a-1c2d3e4f5a6b'),
    ).toEqual(SUGERENCIAS['/costos/producto/:id']);
    expect(sugerenciasDe('/costos', '?vista=insumos')).toEqual(SUGERENCIAS['/costos']);
    expect(sugerenciasDe('/inexistente')).toEqual([]);
  });

  it('cada subruta depende de una pantalla del catálogo', () => {
    const rutas = armarCatalogo().pantallas.map((p) => p.ruta);
    expect(SUBRUTAS.filter((s) => !rutas.includes(s.de))).toEqual([]);
  });

  it('la lista cerrada de Giorgio coincide con el menú para todo rol', () => {
    const catalogo = armarCatalogo();
    const fila = { motivo: null, cambiado_en: '' };
    const excepciones: VisibilidadRow[] = [
      { pantalla: '/costos', rol: 'GERENCIA_PRODUCCION', visible: false, ...fila },
      { pantalla: '/ordenes', rol: 'OPERARIO', visible: true, ...fila },
    ];
    const roles: Rol[][] = [
      ...ROLES_CONFIGURABLES.map((r) => [r]),
      ['ADMINISTRADOR_SISTEMA'],
      ['VENTAS', 'ADMINISTRACION'],
    ];
    for (const r of roles) {
      const menu = NAVEGACION.filter((i) => ve(i.ruta, i.roles, r, excepciones)).map(
        (i) => i.ruta,
      );
      const giorgio = pantallasPermitidas(catalogo, r, excepciones)
        .map((p) => p.ruta)
        .filter((ruta) => NAVEGACION.some((i) => i.ruta === ruta));
      expect(giorgio, r.join('+')).toEqual(menu);
    }
  });

  it('un operario no tiene costos en su lista; Finanzas sí', () => {
    const catalogo = armarCatalogo();
    const de = (rol: Rol) => pantallasPermitidas(catalogo, [rol], []).map((p) => p.ruta);
    expect(de('OPERARIO')).not.toContain('/costos');
    expect(de('VENTAS')).not.toContain('/costos');
    expect(de('FINANZAS')).toContain('/costos');
  });
});

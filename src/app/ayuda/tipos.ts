import type { Rol } from '@/features/auth/sesion';

/**
 * Ayuda de una pantalla, para alguien que nunca usó el sistema. Se abre con
 * «¿Cómo funciona?» en el encabezado (EncabezadoPagina).
 */
export interface AyudaPantalla {
  /** Para qué sirve la pantalla, en una o dos oraciones. */
  queEs: string;
  /** Qué hace cada rol acá, paso a paso. Solo los roles que la usan. */
  porRol: Partial<Record<Rol, string[]>>;
  /** Avisos que valen para todos: qué no se puede deshacer, qué POE aplica. */
  aTener?: string[];
}

/** Clave: el `path` de la ruta tal como está en routes.tsx («/lotes/:id»). */
export type MapaAyuda = Record<string, AyudaPantalla>;

import type { CSSProperties } from 'react';

/*
 * Sobre tarjetas blancas, la luz de MagicBento al 3,5 % y el borde al 50 % no
 * se veían (2026-11-06): se suben para los dos temas.
 */
export const VISIBLE = {
  '--mb-spot-alpha': 0.16,
  '--mb-glow-alpha': 1,
} as CSSProperties;

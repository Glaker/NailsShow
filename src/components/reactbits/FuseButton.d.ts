import type { ReactElement, ReactNode } from 'react';

export type FuseButtonFase = 'idle' | 'armed' | 'settled';

export interface PropsFuseButton {
  label?: string;
  undoLabel?: string;
  doneLabel?: string;
  icon?: ReactNode;
  color?: string;
  background?: string;
  fuseColor?: string;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  undoWindow?: number;
  fuse?: 'outline' | 'bottom' | 'top';
  fuseThickness?: number;
  crossfadeMs?: number;
  commitOn?: 'press' | 'fuseEnd';
  pauseOnHover?: boolean;
  settle?: 'reset' | 'stay';
  disabled?: boolean;
  /** Con la pestaña oculta o al salir de la página, cancela (no pausa). */
  cancelarAlOcultar?: boolean;
  /** Nombre accesible del botón en reposo (cuando el texto se oculta). */
  ariaLabel?: string;
  /** Nombre accesible de «Deshacer». */
  undoAriaLabel?: string;
  onCommit?: (reason: 'press' | 'fuseEnd') => void;
  onUndo?: () => void;
  onFuseEnd?: () => void;
  onPhaseChange?: (phase: FuseButtonFase) => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

declare const FuseButton: (props: PropsFuseButton) => ReactElement;
export default FuseButton;

import type { ReactElement, ReactNode } from 'react';

export interface PropsFlipCard {
  front?: ReactNode;
  back?: ReactNode;
  flipped?: boolean;
  defaultFlipped?: boolean;
  onFlipChange?: (flipped: boolean) => void;
  axis?: 'y' | 'x';
  flipOnClick?: boolean;
  draggable?: boolean;
  dragDistance?: number;
  tilt?: boolean;
  tiltMax?: number;
  glare?: boolean;
  glareOpacity?: number;
  hoverScale?: number;
  perspective?: number;
  stiffness?: number;
  damping?: number;
  /** Número (px) o texto CSS ('100%'). */
  width?: number | string;
  radius?: number;
  background?: string;
  color?: string;
  shadow?: boolean;
  shadowColor?: string;
  shadowOpacity?: number;
  disabled?: boolean;
  /** Nombre accesible; solo se usa si flipOnClick es true (la raíz es un botón). */
  ariaLabel?: string;
  className?: string;
}

declare const FlipCard: (props: PropsFlipCard) => ReactElement;
export default FlipCard;

/*
 * Tipos de los componentes de React Bits copiados en esta carpeta (JavaScript
 * tal cual, 2026-11-06). Solo las props que usa Wandel o que documenta React
 * Bits; el código no se tipa ni se lintea, como el resto de vendor.
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react';

export interface ItemRama {
  value?: string;
  label: string;
  icon?: ReactElement;
  children?: { value: string; label: ReactNode; icon?: ReactElement }[];
}

export interface PropsBranchedMenu {
  items: ItemRama[];
  defaultOpen?: number | number[];
  defaultActive?: string;
  onSelect?: (value: string, item: ItemRama) => void;
  onToggle?: (index: number, open: boolean) => void;
  color?: string;
  accentColor?: string;
  lineColor?: string;
  width?: number;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
  className?: string;
}

export interface PropsSlideCommit {
  label?: ReactNode;
  doneLabel?: ReactNode;
  errorLabel?: ReactNode;
  onConfirm?: () => void | Promise<unknown>;
  onDone?: () => void;
  onError?: (reason: unknown) => void;
  trackColor?: string;
  handleColor?: string;
  successColor?: string;
  dangerColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  speed?: number;
  returnBounce?: number;
  landingDip?: number;
  holdMs?: number;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
}

export interface PropsRubberSegment {
  items: (string | { value: string; label: ReactNode; icon?: ReactNode })[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  trackColor?: string;
  thumbColor?: string;
  textColor?: string;
  activeTextColor?: string;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  inset?: number;
  equalSlots?: boolean;
  stretch?: number;
  squash?: number;
  speed?: number;
  glide?: number;
  draggable?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export interface PropsHoldButton {
  children?: ReactNode;
  doneLabel?: ReactNode;
  icon?: ReactNode;
  doneIcon?: ReactNode;
  backgroundColor?: string;
  fillColor?: string;
  textColor?: string;
  fillTextColor?: string;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  fillDirection?: 'right' | 'up';
  holdTime?: number;
  releaseTime?: number;
  pressScale?: number;
  wave?: boolean;
  waveAmplitude?: number;
  glow?: boolean;
  resetAfter?: number;
  disabled?: boolean;
  onHold?: () => void;
  onTap?: () => void;
  className?: string;
}

export interface PropsOrb {
  colors?: string[];
  hue?: number;
  backgroundColor?: string;
  size?: number;
  glow?: number;
  bleed?: number;
  wobble?: number;
  highlight?: number;
  trail?: number;
  speed?: number;
  hoverIntensity?: number;
  rotateOnHover?: boolean;
  forceHoverState?: boolean;
  followCursor?: boolean;
  clickPulse?: boolean;
  intro?: boolean;
  opacity?: number;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

export interface PropsIridescence {
  color?: string | number[];
  hueShift?: number;
  saturation?: number;
  brightness?: number;
  contrast?: number;
  speed?: number;
  scale?: number;
  detail?: number;
  warp?: number;
  rotation?: number;
  mouseReact?: boolean;
  amplitude?: number;
  stir?: number;
  sheen?: number;
  clickSwirl?: boolean;
  grain?: number;
  fade?: number;
  opacity?: number;
  resolution?: number;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
}

export interface PropsShapeBlur {
  shape?: 'rect' | 'circle' | 'polygon' | 'star';
  src?: string;
  sides?: number;
  size?: number;
  roundness?: number;
  thickness?: number;
  fill?: boolean;
  echoes?: number;
  spacing?: number;
  color?: string;
  blur?: number;
  lensSize?: number;
  lensSoftness?: number;
  focus?: boolean;
  chroma?: number;
  rotation?: number;
  spin?: number;
  idle?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

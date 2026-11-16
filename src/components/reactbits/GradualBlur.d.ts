import type { CSSProperties, ReactElement, RefObject } from 'react';

export interface PropsGradualBlur {
  position?: 'top' | 'bottom' | 'left' | 'right';
  target?: 'parent' | 'page';
  height?: string | number;
  width?: string | number;
  strength?: number;
  layers?: number;
  curve?: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out';
  exponential?: boolean;
  opacity?: number;
  saturation?: number;
  tint?: string;
  autoHide?: boolean;
  container?: string | HTMLElement | RefObject<HTMLElement>;
  hoverIntensity?: number;
  duration?: number | string;
  easing?: string;
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
}

declare const GradualBlur: (props: PropsGradualBlur) => ReactElement;
export default GradualBlur;

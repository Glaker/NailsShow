# Fuentes de React Bits (copia textual)

Texto original de los componentes elegidos por Agus en reactbits.dev, variante JavaScript + CSS. Este archivo es de solo consulta: no se edita. Las adaptaciones que exige Wandel (React 18 e `inert`, íconos, FlipCard con formularios, configuración de cada uno) están en `docs/PROMPT_PEDIDOS_HADA.md`, paquetes P4 y P5. Antes de copiar cualquier componente al repo, verificar la licencia vigente en el repositorio oficial de React Bits.

Índice completo de la librería: https://reactbits.dev/llms.txt

---

## 1. FuseButton

Dependencias: `@hugeicons/react`, `@hugeicons/core-free-icons`

### Ejemplo de uso

```jsx
import FuseButton from './FuseButton';

<FuseButton
  label="Archive"
  doneLabel="Archived"
  undoLabel="Undo"
  color="#f5f5f5"
  background="#27272a"
  fuseColor="#f5a524"
  size="md"
  radius={22}
  undoWindow={4000}
  fuse="outline"
  fuseThickness={1.5}
  crossfadeMs={200}
  commitOn="press"
  pauseOnHover
  settle="reset"
  onCommit={() => archive(item)}
  onUndo={() => restore(item)}
  onFuseEnd={() => purge(item)}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| label | string | "Archive" | The idle action. |
| undoLabel | string | "Undo" | The label while the fuse burns; the whole pill is the Undo button. |
| doneLabel | string | "Archived" | Shown with a check once the fuse burns out and settle is stay; announced to screen readers on arm. |
| icon | ReactNode | undefined | The idle glyph; an archive icon when omitted. |
| color | string | "#f5f5f5" | Ink for labels and icons; the seam and tints derive from it. |
| background | string | "#27272a" | The pill surface. |
| fuseColor | string | "#f5a524" | The lit line or ring. |
| size | "sm" \| "md" \| "lg" | "md" | Height 36, 44 or 52 pixels with matching type and icons. |
| radius | number | 22 | Corner radius in pixels; 22 is a full pill at the medium size. |
| undoWindow | number | 4000 | How long the fuse burns and Undo stays on offer, in milliseconds. |
| fuse | "outline" \| "bottom" \| "top" | "outline" | The pill rim burning down clockwise, or a line along the bottom or top edge. |
| fuseThickness | number | 1.5 | Line height or rim stroke in pixels. |
| crossfadeMs | number | 200 | Blur crossfade between faces after a pointer press. Keyboard commits swap instantly. |
| commitOn | "press" \| "fuseEnd" | "press" | When onCommit fires: at the press, with Undo as the revert, or only once the fuse burns out. |
| pauseOnHover | boolean | true | Leaving and coming back with a mouse freezes the fuse until the pointer leaves again. |
| settle | "reset" \| "stay" | "reset" | After the fuse ends: return to the idle face, or stay on a terminal done face until remounted. |
| disabled | boolean | false | Dims the idle face and ignores presses. Undo stays available while armed. |
| onCommit | (reason: "press" \| "fuseEnd") => void | - | The action. |
| onUndo | () => void | - | Called when Undo or Escape runs the action back. |
| onFuseEnd | () => void | - | Called when the window closes without an undo. |
| onPhaseChange | (phase: "idle" \| "armed" \| "settled") => void | - | Called on every phase change. |
| type | "button" \| "submit" \| "reset" | "button" | Type of the idle button. |
| className | string | "" | Extra classes for the pill. |

### FuseButton.jsx

```jsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Archive02Icon, Tick02Icon, Undo02Icon } from '@hugeicons/core-free-icons';

import './FuseButton.css';

const LINE = [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }];
const OUTLINE = [{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }];
const SIZES = {
  sm: { height: 36, font: 13, icon: 14, px: 16 },
  md: { height: 44, font: 14, icon: 15, px: 20 },
  lg: { height: 52, font: 15, icon: 17, px: 24 }
};

export default function FuseButton({
  label = 'Archive',
  undoLabel = 'Undo',
  doneLabel = 'Archived',
  icon,
  color = '#f5f5f5',
  background = '#27272a',
  fuseColor = '#f5a524',
  size = 'md',
  radius = 22,
  undoWindow = 4000,
  fuse = 'outline',
  fuseThickness = 1.5,
  crossfadeMs = 200,
  commitOn = 'press',
  pauseOnHover = true,
  settle = 'reset',
  disabled = false,
  onCommit,
  onUndo,
  onFuseEnd,
  onPhaseChange,
  className = '',
  type = 'button'
}) {
  const [phase, setPhase] = useState('idle');
  const [instant, setInstant] = useState(false);
  const rootRef = useRef(null);
  const idleRef = useRef(null);
  const undoRef = useRef(null);
  const lineRef = useRef(null);
  const rimRef = useRef(null);
  const anim = useRef(null);
  const pause = useRef({ hover: false, hidden: false, canHoverPause: false });
  const lastInput = useRef('pointer');
  const windowRef = useRef(undoWindow);
  const latest = useRef({ commitOn, settle });
  latest.current = { onCommit, onUndo, onFuseEnd, onPhaseChange, commitOn, settle };
  const statusId = useId();
  const preset = SIZES[size] || SIZES.md;

  const go = next => {
    setInstant(lastInput.current === 'keyboard');
    setPhase(next);
    latest.current.onPhaseChange?.(next);
  };

  const syncPlayState = () => {
    const a = anim.current;
    if (!a) return;
    const { hover, hidden } = pause.current;
    if (hover || hidden) {
      if (a.playState === 'running') a.pause();
    } else if (a.playState === 'paused') {
      a.play();
    }
  };

  const light = (from = 0) => {
    const el = fuse === 'outline' ? rimRef.current : lineRef.current;
    if (!el) return;
    anim.current?.cancel();
    const a = el.animate(fuse === 'outline' ? OUTLINE : LINE, {
      duration: windowRef.current,
      easing: 'linear',
      fill: 'forwards'
    });
    if (from) a.currentTime = from;
    a.onfinish = () => {
      const l = latest.current;
      l.onFuseEnd?.();
      if (l.commitOn === 'fuseEnd') l.onCommit?.('fuseEnd');
      lastInput.current = 'pointer';
      go(l.settle === 'stay' ? 'settled' : 'idle');
    };
    anim.current = a;
    syncPlayState();
  };

  const arm = () => {
    if (disabled || phase !== 'idle') return;
    windowRef.current = undoWindow;
    light();
    pause.current.canHoverPause = false;
    pause.current.hover = false;
    if (commitOn === 'press') onCommit?.('press');
    go('armed');
  };

  const undo = () => {
    if (phase !== 'armed') return;
    const a = anim.current;
    if (a) {
      a.onfinish = null;
      a.pause();
    }
    onUndo?.();
    go('idle');
  };

  useEffect(() => {
    const inside = rootRef.current?.contains(document.activeElement);
    if (phase === 'armed') undoRef.current?.focus({ preventScroll: true });
    else if (inside) (phase === 'idle' ? idleRef.current : rootRef.current)?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    const onVisibility = () => {
      pause.current.hidden = document.hidden;
      syncPlayState();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      anim.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const a = anim.current;
    if (!a || phase !== 'armed') return;
    light(Number(a.currentTime) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuse]);

  useEffect(() => {
    if (pauseOnHover) return;
    pause.current.hover = false;
    syncPlayState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseOnHover]);

  const handlePointerDown = e => {
    lastInput.current = 'pointer';
    const pressable = phase === 'armed' || (phase === 'idle' && !disabled);
    if (e.button === 0 && pressable && rootRef.current) rootRef.current.dataset.pressed = '';
  };
  const release = () => {
    if (rootRef.current) delete rootRef.current.dataset.pressed;
  };
  const handlePointerEnter = e => {
    if (pauseOnHover && e.pointerType === 'mouse' && pause.current.canHoverPause) {
      pause.current.hover = true;
      syncPlayState();
    }
  };
  const handlePointerLeave = e => {
    release();
    if (e.pointerType !== 'mouse') return;
    pause.current.canHoverPause = true;
    pause.current.hover = false;
    syncPlayState();
  };
  const handleKeyDown = e => {
    if (e.key === 'Enter' || e.key === ' ') lastInput.current = 'keyboard';
    if (e.key === 'Escape' && phase === 'armed') {
      e.preventDefault();
      lastInput.current = 'keyboard';
      undo();
    }
  };

  const actionIcon = icon ?? <HugeiconsIcon icon={Archive02Icon} size={preset.icon} strokeWidth={1.8} />;
  const line = <i ref={lineRef} className="fuse-button__fuse" aria-hidden="true" />;

  return (
    <span
      ref={rootRef}
      tabIndex={-1}
      className={`fuse-button${className ? ` ${className}` : ''}`}
      data-phase={phase}
      data-fuse={fuse}
      data-instant={instant ? '' : undefined}
      aria-disabled={phase === 'settled' || undefined}
      style={{
        '--fb-ink': color,
        '--fb-bg': background,
        '--fb-fuse': fuseColor,
        '--fb-fuse-h': `${fuseThickness}px`,
        '--fb-radius': `${radius}px`,
        '--fb-fade': `${crossfadeMs}ms`,
        '--fb-h': `${preset.height}px`,
        '--fb-fs': `${preset.font}px`,
        '--fb-icon': `${preset.icon}px`,
        '--fb-px': `${preset.px}px`
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={idleRef}
        type={type}
        className="fuse-button__face fuse-button__idle"
        disabled={disabled}
        inert={phase !== 'idle'}
        onClick={arm}
      >
        <span className="fuse-button__icon" aria-hidden="true">
          {actionIcon}
        </span>
        {label}
      </button>
      <button
        ref={undoRef}
        type="button"
        className="fuse-button__face fuse-button__undo"
        aria-describedby={statusId}
        aria-keyshortcuts="Escape"
        inert={phase !== 'armed'}
        onClick={undo}
      >
        <span className="fuse-button__icon fuse-button__icon--undo" aria-hidden="true">
          <HugeiconsIcon icon={Undo02Icon} size={preset.icon} strokeWidth={2} />
        </span>
        {undoLabel}
        {fuse !== 'outline' ? line : null}
      </button>
      <span className="fuse-button__face fuse-button__settled" inert={phase !== 'settled'}>
        <span className="fuse-button__icon" aria-hidden="true">
          <HugeiconsIcon icon={Tick02Icon} size={preset.icon} strokeWidth={2.2} />
        </span>
        {doneLabel}
      </span>
      {fuse === 'outline' ? (
        <svg className="fuse-button__rim" aria-hidden="true">
          <rect ref={rimRef} pathLength="1" />
        </svg>
      ) : null}
      <span className="fuse-button__status" id={statusId} role="status" aria-live="polite">
        {phase === 'idle' ? '' : doneLabel}
      </span>
    </span>
  );
}
```

### FuseButton.css

```css
.fuse-button {
  --fb-ink: #f5f5f5;
  --fb-bg: #27272a;
  --fb-fuse: #f5a524;
  --fb-fuse-h: 1.5px;
  --fb-radius: 22px;
  --fb-fade: 200ms;
  --fb-press: 0.97;
  --fb-h: 44px;
  --fb-fs: 14px;
  --fb-icon: 15px;
  --fb-px: 20px;
  --fb-ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  position: relative;
  display: inline-grid;
  grid-template-columns: minmax(0, 1fr);
  height: var(--fb-h);
  border-radius: var(--fb-radius);
  background: var(--fb-bg);
  color: var(--fb-ink);
  font-family: inherit;
  font-size: var(--fb-fs);
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
  overflow: hidden;
  isolation: isolate;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform 160ms var(--fb-ease-out);
}

.fuse-button[data-pressed] {
  transform: scale(var(--fb-press));
}

.fuse-button:has(:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--fb-ink) 60%, transparent);
  outline-offset: 3px;
}

.fuse-button__idle:focus-visible,
.fuse-button__undo:focus-visible {
  outline: none;
}

@supports not selector(:has(a)) {
  .fuse-button__idle:focus-visible,
  .fuse-button__undo:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--fb-ink) 60%, transparent);
    outline-offset: -3px;
  }
}

.fuse-button__face {
  position: relative;
  grid-area: 1 / 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-width: 0;
  margin: 0;
  padding: 0 var(--fb-px);
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  white-space: nowrap;
  cursor: pointer;
  opacity: 0;
  filter: blur(2px);
  visibility: hidden;
  transition:
    opacity var(--fb-fade) ease,
    filter var(--fb-fade) ease,
    visibility 0s linear var(--fb-fade),
    background-color 160ms ease;
}

.fuse-button[data-phase='idle'] .fuse-button__idle,
.fuse-button[data-phase='armed'] .fuse-button__undo,
.fuse-button[data-phase='settled'] .fuse-button__settled {
  opacity: 1;
  filter: blur(0);
  visibility: visible;
  transition-delay: 0s;
}

.fuse-button[data-instant] .fuse-button__face {
  transition-duration: 0s;
}

.fuse-button__idle:disabled,
.fuse-button__settled {
  cursor: default;
}

.fuse-button[data-phase='idle']:has(.fuse-button__idle:disabled) {
  opacity: 0.55;
}

.fuse-button__icon {
  display: inline-flex;
  width: var(--fb-icon);
  height: var(--fb-icon);
}

.fuse-button__icon svg {
  width: 100%;
  height: 100%;
}

.fuse-button__icon--undo {
  transform: rotate(-70deg);
  transition: transform var(--fb-fade) var(--fb-ease-out);
}

.fuse-button[data-phase='armed'] .fuse-button__icon--undo {
  transform: rotate(0deg);
}

.fuse-button__fuse {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--fb-fuse-h);
  background: var(--fb-fuse);
  box-shadow: 0 0 6px color-mix(in srgb, var(--fb-fuse) 55%, transparent);
  transform-origin: left center;
  pointer-events: none;
}

.fuse-button[data-fuse='top'] .fuse-button__fuse {
  bottom: auto;
  top: 0;
}

.fuse-button__rim {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  opacity: 0;
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--fb-fuse) 60%, transparent));
  transition: opacity var(--fb-fade) ease;
}

.fuse-button[data-phase='armed'] .fuse-button__rim {
  opacity: 1;
}

.fuse-button[data-instant] .fuse-button__rim {
  transition-duration: 0s;
}

.fuse-button__rim rect {
  x: calc(var(--fb-fuse-h) / 2);
  y: calc(var(--fb-fuse-h) / 2);
  width: calc(100% - var(--fb-fuse-h));
  height: calc(100% - var(--fb-fuse-h));
  rx: max(0px, calc(var(--fb-radius) - var(--fb-fuse-h) / 2));
  fill: none;
  stroke: var(--fb-fuse);
  stroke-width: var(--fb-fuse-h);
  stroke-linecap: round;
  stroke-dasharray: 1;
}

.fuse-button__status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (hover: hover) and (pointer: fine) {
  .fuse-button__idle:not(:disabled):hover,
  .fuse-button__undo:hover {
    background: color-mix(in srgb, var(--fb-ink) 7%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fuse-button[data-pressed] {
    transform: none;
  }

  .fuse-button .fuse-button__face {
    filter: none;
    transition:
      opacity var(--fb-fade) ease,
      visibility 0s linear var(--fb-fade);
  }

  .fuse-button .fuse-button__icon--undo {
    transform: none;
    transition: none;
  }
}

@media (prefers-contrast: more) {
  .fuse-button {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fb-ink) 40%, transparent);
  }
}

@media (forced-colors: active) {
  .fuse-button__fuse {
    background: Highlight;
  }

  .fuse-button__rim rect {
    stroke: Highlight;
  }
}
```

---

## 2. FlipCard

Dependencias: `motion`

### Ejemplo de uso

```jsx
import FlipCard from './FlipCard';

<FlipCard
  front={<img src="/landscape.jpg" alt="Wooded landscape" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
  back={
    <div style={{ padding: 24 }}>
      <h3>Wooded Landscape</h3>
      <p>17th century · Rijksmuseum</p>
    </div>
  }
  axis="y"
  flipOnClick
  draggable
  dragDistance={0}
  tilt
  tiltMax={12}
  glare
  glareOpacity={0.22}
  hoverScale={1.03}
  perspective={1100}
  stiffness={170}
  damping={20}
  width={300}
  height={400}
  radius={22}
  background="#27272a"
  color="#f5f5f5"
  shadow
  shadowColor="#000000"
  shadowOpacity={0.45}
  onFlipChange={flipped => console.log(flipped)}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| front | ReactNode | null | Content of the front face. |
| back | ReactNode | null | Content of the back face. |
| flipped | boolean | - | Controlled state: true shows the back. Omit it to let the card manage itself. |
| defaultFlipped | boolean | false | Start on the back face. |
| onFlipChange | (flipped: boolean) => void | - | Fires when a click, drag, flick or key lands on the other face. |
| axis | 'y' \| 'x' | 'y' | y turns the card sideways and drags horizontally. x turns it over the top and drags vertically. |
| flipOnClick | boolean | true | A press without movement flips the card. |
| draggable | boolean | true | Drag to turn the card by hand. On release it springs to the nearest face, carrying the flick velocity. |
| dragDistance | number | 0 | Pixels of drag for a half turn. 0 uses the card width, or its height on the x axis. |
| tilt | boolean | true | The card leans toward the cursor on hover. |
| tiltMax | number | 12 | Largest tilt angle in degrees. |
| glare | boolean | true | A soft sheen that follows the cursor. |
| glareOpacity | number | 0.22 | Strength of the sheen at its centre. |
| hoverScale | number | 1.03 | Lift while hovered or held. |
| perspective | number | 1100 | Viewing distance in px. Smaller is more dramatic. |
| stiffness | number | 170 | Stiffness of the flip spring. |
| damping | number | 20 | Damping of the flip spring. Lower overshoots more. |
| width | number | 300 | Card width in px, capped at the parent. |
| height | number | 400 | Card height in px. |
| radius | number | 22 | Corner radius in px. |
| background | string | "#27272a" | Surface of both faces. |
| color | string | "#f5f5f5" | Text colour of both faces. |
| shadow | boolean | true | A soft shadow beneath the card that narrows as it turns edge on. |
| shadowColor | string | "#000000" | Shadow colour. |
| shadowOpacity | number | 0.45 | Shadow strength. |
| disabled | boolean | false | Dimmed, flat and inert. |
| ariaLabel | string | "Flip card" | Accessible name. The face is carried by aria-pressed. |
| className | string | "" | Extra classes for the root. |

### FlipCard.jsx

```jsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform
} from 'motion/react';

import './FlipCard.css';

const SLOP = { fine: 4, coarse: 8 };
const TILT_SPRING = { stiffness: 240, damping: 24, mass: 0.6 };
const LIFT_SPRING = { stiffness: 320, damping: 26 };
const FLING = 0.16;
const HISTORY_MS = 90;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snap = deg => Math.round(deg / 180) * 180;
const isBack = deg => Math.abs(Math.round(deg / 180)) % 2 === 1;

export default function FlipCard({
  front = null,
  back = null,
  flipped,
  defaultFlipped = false,
  onFlipChange,
  axis = 'y',
  flipOnClick = true,
  draggable = true,
  dragDistance = 0,
  tilt = true,
  tiltMax = 12,
  glare = true,
  glareOpacity = 0.22,
  hoverScale = 1.03,
  perspective = 1100,
  stiffness = 170,
  damping = 20,
  width = 300,
  height = 400,
  radius = 22,
  background = '#27272a',
  color = '#f5f5f5',
  shadow = true,
  shadowColor = '#000000',
  shadowOpacity = 0.45,
  disabled = false,
  ariaLabel = 'Flip card',
  className = ''
}) {
  const reduce = useReducedMotion();
  const controlled = flipped !== undefined;
  const [inner, setInner] = useState(defaultFlipped);
  const [dragging, setDragging] = useState(false);
  const shown = controlled ? flipped : inner;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const rootRef = useRef(null);
  const grip = useRef(null);
  const spin = useRef(null);
  const target = useRef(shown ? 180 : 0);

  const turn = useMotionValue(shown ? 180 : 0);
  const tiltX = useSpring(0, TILT_SPRING);
  const tiltY = useSpring(0, TILT_SPRING);
  const lift = useSpring(1, LIFT_SPRING);
  const sheen = useSpring(0, LIFT_SPRING);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);

  const sumX = useTransform([turn, tiltX], ([t, x]) => t + x);
  const sumY = useTransform([turn, tiltY], ([t, y]) => t + y);
  const turnY = useMotionTemplate`perspective(${perspective}px) scale(${lift}) rotateX(${tiltX}deg) rotateY(${sumY}deg)`;
  const turnX = useMotionTemplate`perspective(${perspective}px) scale(${lift}) rotateY(${tiltY}deg) rotateX(${sumX}deg)`;
  const facing = useTransform(turn, t => Math.abs(Math.cos((t * Math.PI) / 180)));
  const spread = useTransform(facing, f => 0.08 + 0.92 * f);
  const shade = useTransform(facing, f => 0.1 + 0.9 * f * f);
  const gxPct = useMotionTemplate`${gx}%`;
  const gyPct = useMotionTemplate`${gy}%`;

  const settle = (to, velocity, instant) => {
    spin.current?.stop();
    target.current = to;
    if (instant || reduce) turn.jump(to);
    else spin.current = animate(turn, to, { type: 'spring', stiffness, damping, velocity, restDelta: 0.05 });
    const next = isBack(to);
    if (next === shownRef.current) return;
    shownRef.current = next;
    if (!controlled) setInner(next);
    onFlipChange?.(next);
  };
  const flip = instant => {
    const base = snap(turn.get());
    settle(isBack(base) ? base - 180 : base + 180, 0, instant);
  };
  const rest = () => {
    tiltX.set(0);
    tiltY.set(0);
    sheen.set(0);
    lift.set(1);
  };

  useEffect(() => {
    if (!controlled || isBack(target.current) === flipped) return;
    const base = target.current;
    spin.current?.stop();
    target.current = isBack(base) ? base - 180 : base + 180;
    if (reduce) turn.jump(target.current);
    else spin.current = animate(turn, target.current, { type: 'spring', stiffness, damping, restDelta: 0.05 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);
  useEffect(() => () => spin.current?.stop(), []);
  useEffect(() => {
    if (disabled) rest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const onPointerDown = e => {
    if (disabled || e.button !== 0 || grip.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    spin.current?.stop();
    grip.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      base: turn.get(),
      moved: false,
      slop: e.pointerType === 'touch' ? SLOP.coarse : SLOP.fine,
      hist: []
    };
    if (!reduce) lift.set(hoverScale);
  };
  const onPointerMove = e => {
    const g = grip.current;
    if (g && g.id === e.pointerId) {
      const d = axis === 'x' ? e.clientY - g.y : e.clientX - g.x;
      if (!g.moved) {
        if (Math.abs(d) < g.slop || !draggable || reduce) return;
        g.moved = true;
        setDragging(true);
        tiltX.set(0);
        tiltY.set(0);
        sheen.set(0);
      }
      const span = dragDistance > 0 ? dragDistance : axis === 'x' ? height : width;
      const deg = g.base + (axis === 'x' ? -1 : 1) * (d / span) * 180;
      turn.set(deg);
      const now = performance.now();
      g.hist.push({ t: now, v: deg });
      while (g.hist.length > 2 && now - g.hist[0].t > HISTORY_MS) g.hist.shift();
      return;
    }
    if (!tilt || reduce || disabled || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = clamp((e.clientY - r.top) / r.height, 0, 1);
    tiltX.set((0.5 - py) * 2 * tiltMax);
    tiltY.set((px - 0.5) * 2 * tiltMax);
    gx.set(px * 100);
    gy.set(py * 100);
    sheen.set(1);
  };
  const release = (e, cancelled) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    grip.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setDragging(false);
    if (e.pointerType === 'touch' || !rootRef.current?.matches(':hover')) rest();
    if (!g.moved) {
      if (!cancelled && flipOnClick) flip(false);
      else settle(target.current, 0, false);
      return;
    }
    const here = turn.get();
    let velocity = 0;
    const a = g.hist[0];
    const b = g.hist[g.hist.length - 1];
    if (!cancelled && a && b && b.t > a.t && performance.now() - b.t < 60)
      velocity = ((b.v - a.v) / (b.t - a.t)) * 1000;
    const to = cancelled ? snap(g.base) : clamp(snap(here + velocity * FLING), snap(here) - 180, snap(here) + 180);
    settle(to, velocity, false);
  };
  const onKeyDown = e => {
    if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (!e.repeat) flip(true);
  };
  const onClick = e => {
    if (!disabled && e.detail === 0) flip(true);
  };

  const rotorStyle = {
    transform: axis === 'x' ? turnX : turnY,
    '--fc-gx': gxPct,
    '--fc-gy': gyPct,
    '--fc-sheen': sheen
  };

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={shown}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={`flip-card${className ? ` ${className}` : ''}`}
      data-axis={axis}
      data-draggable={draggable && !disabled && !reduce ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-fade={reduce ? (shown ? 'back' : 'front') : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => release(e, false)}
      onPointerCancel={e => release(e, true)}
      onLostPointerCapture={e => release(e, true)}
      onPointerEnter={e => {
        if (!reduce && !disabled && e.pointerType !== 'touch') lift.set(hoverScale);
      }}
      onPointerLeave={() => {
        if (!grip.current) rest();
      }}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDragStart={e => e.preventDefault()}
      style={{
        '--fc-w': `${width}px`,
        '--fc-h': `${height}px`,
        '--fc-radius': `${radius}px`,
        '--fc-bg': background,
        '--fc-ink': color,
        '--fc-shadow': shadowColor,
        '--fc-shadow-o': shadowOpacity,
        '--fc-glare': glareOpacity
      }}
    >
      {shadow ? (
        <motion.span
          className="flip-card__shadow"
          aria-hidden="true"
          style={axis === 'x' ? { scaleY: spread, opacity: shade } : { scaleX: spread, opacity: shade }}
        />
      ) : null}
      <motion.div className="flip-card__rotor" style={reduce ? undefined : rotorStyle}>
        <div className="flip-card__face flip-card__face--front" aria-hidden={shown} inert={shown}>
          {front}
          {glare ? <span className="flip-card__glare" aria-hidden="true" /> : null}
        </div>
        <div className="flip-card__face flip-card__face--back" aria-hidden={!shown} inert={!shown}>
          {back}
          {glare ? <span className="flip-card__glare" aria-hidden="true" /> : null}
        </div>
      </motion.div>
    </div>
  );
}
```

### FlipCard.css

```css
.flip-card {
  --fc-w: 300px;
  --fc-h: 400px;
  --fc-radius: 22px;
  --fc-bg: #27272a;
  --fc-ink: #f5f5f5;
  --fc-shadow: #000000;
  --fc-shadow-o: 0.45;
  --fc-glare: 0.22;

  position: relative;
  display: inline-block;
  width: var(--fc-w);
  max-width: 100%;
  height: var(--fc-h);
  border-radius: var(--fc-radius);
  outline: none;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: pan-y;
}

.flip-card[data-axis='x'] {
  touch-action: pan-x;
}

.flip-card[data-draggable] {
  cursor: grab;
}

.flip-card[data-dragging] {
  cursor: grabbing;
}

.flip-card[data-disabled] {
  cursor: default;
  opacity: 0.6;
}

.flip-card__shadow {
  position: absolute;
  inset: 12% 9% -5%;
  border-radius: var(--fc-radius);
  background: color-mix(in srgb, var(--fc-shadow) calc(var(--fc-shadow-o) * 100%), transparent);
  filter: blur(22px);
  pointer-events: none;
}

.flip-card__rotor {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}

.flip-card__face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--fc-radius);
  background: var(--fc-bg);
  color: var(--fc-ink);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.flip-card__face img {
  -webkit-user-drag: none;
}

.flip-card__face--back {
  transform: rotateY(180deg);
}

.flip-card[data-axis='x'] .flip-card__face--back {
  transform: rotateX(180deg);
}

.flip-card__glare {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle farthest-side at var(--fc-gx, 50%) var(--fc-gy, 50%),
    rgba(255, 255, 255, var(--fc-glare)) 0%,
    rgba(255, 255, 255, calc(var(--fc-glare) * 0.76)) 12%,
    rgba(255, 255, 255, calc(var(--fc-glare) * 0.5)) 26%,
    rgba(255, 255, 255, calc(var(--fc-glare) * 0.28)) 42%,
    rgba(255, 255, 255, calc(var(--fc-glare) * 0.12)) 60%,
    rgba(255, 255, 255, calc(var(--fc-glare) * 0.04)) 78%,
    rgba(255, 255, 255, 0) 100%
  );
  opacity: var(--fc-sheen, 0);
  pointer-events: none;
}

.flip-card[data-fade] .flip-card__face {
  transform: none;
  opacity: 0;
  backface-visibility: visible;
  -webkit-backface-visibility: visible;
  transition: opacity 200ms ease;
}

.flip-card[data-fade='front'] .flip-card__face--front,
.flip-card[data-fade='back'] .flip-card__face--back {
  opacity: 1;
}
```

---

## 3. GradualBlur

Dependencias: ninguna

### Ejemplo de uso

```jsx
// Component added by Ansh - github.com/ansh-dhanani

import GradualBlur from './GradualBlur';

<section style={{ position: 'relative', height: 500, overflow: 'hidden' }}>
  <div style={{ height: '100%', overflowY: 'auto' }}>
    {/* Scrolling content */}
  </div>

  <GradualBlur
    position="bottom"
    height="6rem"
    strength={2}
    layers={8}
    curve="linear"
    exponential
    tint="rgba(18, 15, 23, 0.6)"
    autoHide
  />
</section>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| position | 'top' \| 'bottom' \| 'left' \| 'right' | 'bottom' | Edge the blur grows toward. |
| target | 'parent' \| 'page' | 'parent' | Sit inside the nearest positioned parent, or stay fixed to the edge of the viewport. |
| height | string \| number | '6rem' | How far the blur reaches in from the edge. For left and right this is its width. Numbers are px. |
| width | string \| number | - | For top and bottom, a narrower centered band. For left and right, overrides height. |
| strength | number | 2 | How blurry the very edge gets. Each step adds about 12px of blur. |
| layers | number | 8 | Blur layers stacked across the ramp. More layers give a smoother falloff, fewer show visible steps. |
| curve | 'linear' \| 'bezier' \| 'ease-in' \| 'ease-out' \| 'ease-in-out' | 'linear' | How the blur builds across the ramp. bezier is a smooth S-curve. |
| exponential | boolean | true | Doubles the blur toward the edge so it starts gently. Turn off for an even ramp. |
| opacity | number | 1 | Opacity of the blur layers. Lower values let the sharp content show through. |
| saturation | number | 1 | Color boost of the blurred content, building toward the edge, for a glassy look. |
| tint | string | 'transparent' | Color the content fades into at the edge, such as your page background. Use rgba for a lighter wash. |
| autoHide | boolean | false | Fades the blur out when the scroll container reaches this edge, so it only shows while there is more to scroll. |
| container | string \| HTMLElement \| RefObject | - | Scroll container watched by autoHide. Defaults to a scrollable sibling or the parent, or the page when target is page. |
| hoverIntensity | number | 1 | Multiplies the blur while the cursor is over it. 0 clears it on hover, 2 doubles it. |
| duration | number \| string | 0.3 | Length of the hover and autoHide transitions, in seconds or as a CSS time. |
| easing | string | 'ease-out' | CSS easing of those transitions. |
| zIndex | number | 1000 | Stacking order of the overlay. |
| className | string | '' | Extra class names for the overlay. |
| style | CSSProperties | - | Inline styles for the overlay. |

### GradualBlur.jsx

```jsx
'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import './GradualBlur.css';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const CURVES = {
  linear: t => t,
  bezier: t => t * t * (3 - 2 * t),
  'ease-in': t => t * t,
  'ease-out': t => 1 - (1 - t) * (1 - t),
  'ease-in-out': t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
};

const DIRECTIONS = { top: 'to top', bottom: 'to bottom', left: 'to left', right: 'to right' };

const clamp01 = value => Math.min(Math.max(value, 0), 1);

const toLength = value => (typeof value === 'number' ? `${value}px` : value);

const toTime = value => (typeof value === 'number' ? `${value}s` : value);

const findScroller = (container, root, target, vertical) => {
  if (container) {
    if (typeof container === 'string') return document.querySelector(container);
    return 'current' in container ? container.current : container;
  }
  if (target === 'page') return window;
  const parent = root.parentElement;
  if (!parent) return null;
  const scrolls = node => {
    const style = getComputedStyle(node);
    return /(auto|scroll|overlay)/.test(vertical ? style.overflowY : style.overflowX);
  };
  const sibling = Array.from(parent.children).find(child => child !== root && scrolls(child));
  return sibling || (scrolls(parent) ? parent : null);
};

const GradualBlur = ({
  position = 'bottom',
  target = 'parent',
  height = '6rem',
  width,
  strength = 2,
  layers = 8,
  curve = 'linear',
  exponential = true,
  opacity = 1,
  saturation = 1,
  tint = 'transparent',
  autoHide = false,
  container,
  hoverIntensity = 1,
  duration = 0.3,
  easing = 'ease-out',
  zIndex = 1000,
  className = '',
  style
}) => {
  const rootRef = useRef(null);
  const edge = DIRECTIONS[position] ? position : 'bottom';
  const vertical = edge === 'top' || edge === 'bottom';

  const stack = useMemo(() => {
    const count = Math.min(Math.max(Math.round(layers) || 1, 1), 16);
    const shape = CURVES[curve] || CURVES.linear;
    const maxBlur = Math.max(strength, 0) * 12;
    const level = u => {
      const t = shape(clamp01(u));
      return maxBlur * (exponential ? (Math.pow(2, 4 * t) - 1) / 15 : t);
    };
    const boost = Math.pow(Math.max(saturation, 0), 1 / count);
    const fade = `${toTime(duration)} ${easing}`;
    const direction = DIRECTIONS[edge];
    const steps = [];
    for (let i = 0; i < count; i++) {
      const from = level(i / count);
      const to = level((i + 1) / count);
      const radius = Math.sqrt(Math.max(to * to - from * from, 0));
      const filter = [
        `blur(calc(${radius.toFixed(3)}px * var(--gradual-blur-reveal, 1) * var(--gradual-blur-hover, 1)))`,
        boost !== 1 ? `saturate(calc(1 + ${(boost - 1).toFixed(4)} * var(--gradual-blur-reveal, 1)))` : ''
      ]
        .filter(Boolean)
        .join(' ');
      const mask = `linear-gradient(${direction}, transparent ${((i / count) * 100).toFixed(2)}%, #000 ${(((i + 1) / count) * 100).toFixed(2)}%)`;
      steps.push({
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        backdropFilter: filter,
        WebkitBackdropFilter: filter,
        maskImage: mask,
        WebkitMaskImage: mask,
        opacity,
        transition: `backdrop-filter ${fade}, -webkit-backdrop-filter ${fade}`
      });
    }
    const stops = Array.from({ length: 9 }, (_, k) => {
      const u = k / 8;
      const t = shape(u);
      const alpha = t * t * t * (t * (t * 6 - 15) + 10);
      return `rgba(0, 0, 0, ${alpha.toFixed(3)}) ${(u * 100).toFixed(1)}%`;
    }).join(', ');
    const tintMask = `linear-gradient(${direction}, ${stops})`;
    const wash =
      tint && tint !== 'transparent'
        ? {
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background: tint,
            maskImage: tintMask,
            WebkitMaskImage: tintMask,
            opacity: 'calc(var(--gradual-blur-reveal, 1) * min(var(--gradual-blur-hover, 1), 1))',
            transition: `opacity ${fade}`
          }
        : null;
    return { steps, wash };
  }, [layers, curve, strength, exponential, saturation, duration, easing, edge, opacity, tint]);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    if (!autoHide) {
      root.style.removeProperty('--gradual-blur-reveal');
      return undefined;
    }
    const scroller = findScroller(container, root, target, vertical);
    if (!scroller) return undefined;
    const element = scroller instanceof Element ? scroller : null;
    const start = edge === 'top' || edge === 'left';

    const update = () => {
      const page = document.documentElement;
      const offset = element
        ? vertical
          ? element.scrollTop
          : element.scrollLeft
        : vertical
          ? window.scrollY
          : window.scrollX;
      const limit = element
        ? vertical
          ? element.scrollHeight - element.clientHeight
          : element.scrollWidth - element.clientWidth
        : vertical
          ? page.scrollHeight - window.innerHeight
          : page.scrollWidth - window.innerWidth;
      const box = root.getBoundingClientRect();
      const reach = Math.max(vertical ? box.height : box.width, 1);
      const room = start ? offset : limit - offset;
      root.style.setProperty('--gradual-blur-reveal', clamp01(room / reach).toFixed(3));
    };

    update();
    const source = element ?? window;
    source.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = element && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (observer && element) {
      observer.observe(element);
      if (element.firstElementChild) observer.observe(element.firstElementChild);
    }
    return () => {
      source.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [autoHide, container, target, edge, vertical]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || hoverIntensity === 1) return undefined;
    let frame = 0;
    let inside = false;
    let point = null;

    const check = () => {
      frame = 0;
      if (!point) return;
      const box = root.getBoundingClientRect();
      const now = point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
      if (now === inside) return;
      inside = now;
      root.style.setProperty('--gradual-blur-hover', inside ? String(Math.max(hoverIntensity, 0)) : '1');
    };

    const onMove = event => {
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(check);
    };

    const onLeave = () => {
      point = null;
      inside = false;
      root.style.setProperty('--gradual-blur-hover', '1');
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      root.style.removeProperty('--gradual-blur-hover');
    };
  }, [hoverIntensity]);

  const depth = toLength(vertical ? height : (width ?? height));
  const span = vertical && width != null ? toLength(width) : null;

  const rounded = target !== 'page' && !span;
  const corner = (a, b) => (rounded && (edge === a || edge === b) ? 'inherit' : undefined);

  const rootStyle = {
    position: target === 'page' ? 'fixed' : 'absolute',
    zIndex,
    borderTopLeftRadius: corner('top', 'left'),
    borderTopRightRadius: corner('top', 'right'),
    borderBottomLeftRadius: corner('bottom', 'left'),
    borderBottomRightRadius: corner('bottom', 'right'),
    top: edge === 'bottom' ? undefined : 0,
    bottom: edge === 'top' ? undefined : 0,
    left: edge === 'right' ? undefined : 0,
    right: edge === 'left' ? undefined : 0,
    height: vertical ? depth : undefined,
    width: vertical ? (span ?? undefined) : depth,
    marginInline: span ? 'auto' : undefined,
    ...style
  };

  return (
    <div ref={rootRef} className={`gradual-blur ${className}`.trim()} style={rootStyle} aria-hidden="true">
      {stack.steps.map((layer, index) => (
        <div key={index} style={layer} />
      ))}
      {stack.wash && <div style={stack.wash} />}
    </div>
  );
};

export default GradualBlur;
```

### GradualBlur.css

```css
.gradual-blur {
  pointer-events: none;
}
```
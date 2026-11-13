'use client';

// React Bits — FlipCard (JavaScript + CSS), copiado de reactbits.dev el 2026-11-13;
// licencia MIT + Commons Clause (verificada el 2026-11-13: uso dentro de la app, sin redistribuir).
// Tipos en FlipCard.d.ts. Adaptado (P5 de docs/PROMPT_PEDIDOS_HADA.md):
//  - Eventos de puntero y teclado cuyo origen sea input, textarea, select, button, a o
//    [data-no-flip] se ignoran: no se captura el puntero ni se cancela Espacio/Enter ahí.
//  - Sin flipOnClick, la raíz no es role="button" ni tiene tabIndex (no hay controles
//    anidados dentro de un botón); cada cara es role="group".
//  - Altura variable: se quitó la prop height; cada cara toma su alto y la raíz mide la
//    visible con ResizeObserver.
//  - tilt y glare se apagan con (hover: none) y con prefers-reduced-motion.
//  - React 18: inert={cond ? '' : undefined}. shownRef se sincroniza en un efecto, no en el render.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';

import './FlipCard.css';

const SLOP = { fine: 4, coarse: 8 };
const TILT_SPRING = { stiffness: 240, damping: 24, mass: 0.6 };
const LIFT_SPRING = { stiffness: 320, damping: 26 };
const FLING = 0.16;
const HISTORY_MS = 90;
const INTERACTIVO = 'input, textarea, select, button, a, [data-no-flip]';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snap = (deg) => Math.round(deg / 180) * 180;
const isBack = (deg) => Math.abs(Math.round(deg / 180)) % 2 === 1;
const deInteractivo = (e) =>
  e.target instanceof Element && e.target.closest(INTERACTIVO) !== null;

function useSinHover() {
  const [sin, setSin] = useState(() => window.matchMedia('(hover: none)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    const alCambiar = () => setSin(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return sin;
}

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
  radius = 22,
  background = '#27272a',
  color = '#f5f5f5',
  shadow = true,
  shadowColor = '#000000',
  shadowOpacity = 0.45,
  disabled = false,
  ariaLabel = 'Flip card',
  className = '',
}) {
  const reduce = useReducedMotion();
  const sinHover = useSinHover();
  // Sin movimiento o sin cursor: nada de inclinación ni brillo.
  const efectos = !reduce && !sinHover;
  const useTilt = tilt && efectos;
  const useGlare = glare && efectos;
  const controlled = flipped !== undefined;
  const [inner, setInner] = useState(defaultFlipped);
  const [dragging, setDragging] = useState(false);
  const [alto, setAlto] = useState(undefined);
  const shown = controlled ? flipped : inner;
  const shownRef = useRef(shown);
  const rootRef = useRef(null);
  const frontRef = useRef(null);
  const backRef = useRef(null);
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
  const facing = useTransform(turn, (t) => Math.abs(Math.cos((t * Math.PI) / 180)));
  const spread = useTransform(facing, (f) => 0.08 + 0.92 * f);
  const shade = useTransform(facing, (f) => 0.1 + 0.9 * f * f);
  const gxPct = useMotionTemplate`${gx}%`;
  const gyPct = useMotionTemplate`${gy}%`;

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  // Altura variable: la raíz mide la cara que se ve (las caras son absolutas y no ocupan lugar).
  useLayoutEffect(() => {
    const el = (shown ? backRef : frontRef).current;
    if (!el) return undefined;
    const medir = () => setAlto(el.offsetHeight);
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  const settle = (to, velocity, instant) => {
    spin.current?.stop();
    target.current = to;
    if (instant || reduce) turn.jump(to);
    else
      spin.current = animate(turn, to, {
        type: 'spring',
        stiffness,
        damping,
        velocity,
        restDelta: 0.05,
      });
    const next = isBack(to);
    if (next === shownRef.current) return;
    shownRef.current = next;
    if (!controlled) setInner(next);
    onFlipChange?.(next);
  };
  const flip = (instant) => {
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
    else
      spin.current = animate(turn, target.current, {
        type: 'spring',
        stiffness,
        damping,
        restDelta: 0.05,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);
  useEffect(() => () => spin.current?.stop(), []);
  useEffect(() => {
    if (disabled) rest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // Solo se agarra el puntero si la tarjeta se arrastra o se da vuelta al tocarla, y nunca desde un control.
  const agarra = draggable || flipOnClick;
  const onPointerDown = (e) => {
    if (!agarra || deInteractivo(e)) return;
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
      hist: [],
    };
    if (efectos) lift.set(hoverScale);
  };
  const onPointerMove = (e) => {
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
      const medida = rootRef.current?.getBoundingClientRect();
      const span =
        dragDistance > 0
          ? dragDistance
          : (axis === 'x' ? medida?.height : medida?.width) || 300;
      const deg = g.base + (axis === 'x' ? -1 : 1) * (d / span) * 180;
      turn.set(deg);
      const now = performance.now();
      g.hist.push({ t: now, v: deg });
      while (g.hist.length > 2 && now - g.hist[0].t > HISTORY_MS) g.hist.shift();
      return;
    }
    if (!useTilt || disabled || e.pointerType === 'touch' || deInteractivo(e)) return;
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
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
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
    const to = cancelled
      ? snap(g.base)
      : clamp(snap(here + velocity * FLING), snap(here) - 180, snap(here) + 180);
    settle(to, velocity, false);
  };
  // Solo la raíz enfocada (flipOnClick) da vuelta con teclado; lo que viene de adentro no se toca.
  const onKeyDown = (e) => {
    if (
      !flipOnClick ||
      disabled ||
      e.target !== e.currentTarget ||
      (e.key !== 'Enter' && e.key !== ' ')
    )
      return;
    e.preventDefault();
    if (!e.repeat) flip(true);
  };
  const onClick = (e) => {
    if (flipOnClick && !disabled && e.target === e.currentTarget && e.detail === 0)
      flip(true);
  };

  const rotorStyle = {
    transform: axis === 'x' ? turnX : turnY,
    '--fc-gx': gxPct,
    '--fc-gy': gyPct,
    '--fc-sheen': sheen,
  };
  const botonRaiz = flipOnClick
    ? {
        role: 'button',
        tabIndex: disabled ? -1 : 0,
        'aria-pressed': shown,
        'aria-label': ariaLabel,
      }
    : {};

  return (
    <div
      ref={rootRef}
      {...botonRaiz}
      aria-disabled={disabled || undefined}
      className={`flip-card${className ? ` ${className}` : ''}`}
      data-axis={axis}
      data-draggable={draggable && !disabled && !reduce ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-fade={reduce ? (shown ? 'back' : 'front') : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => release(e, false)}
      onPointerCancel={(e) => release(e, true)}
      onLostPointerCapture={(e) => release(e, true)}
      onPointerEnter={(e) => {
        if (efectos && !disabled && e.pointerType !== 'touch') lift.set(hoverScale);
      }}
      onPointerLeave={() => {
        if (!grip.current) rest();
      }}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDragStart={(e) => e.preventDefault()}
      style={{
        '--fc-w': typeof width === 'number' ? `${width}px` : width,
        height: alto,
        '--fc-radius': `${radius}px`,
        '--fc-bg': background,
        '--fc-ink': color,
        '--fc-shadow': shadowColor,
        '--fc-shadow-o': shadowOpacity,
        '--fc-glare': glareOpacity,
      }}
    >
      {shadow ? (
        <motion.span
          className="flip-card__shadow"
          aria-hidden="true"
          style={
            axis === 'x'
              ? { scaleY: spread, opacity: shade }
              : { scaleX: spread, opacity: shade }
          }
        />
      ) : null}
      <motion.div className="flip-card__rotor" style={reduce ? undefined : rotorStyle}>
        <div
          ref={frontRef}
          role="group"
          className="flip-card__face flip-card__face--front"
          aria-hidden={shown}
          inert={shown ? '' : undefined}
        >
          {front}
          {useGlare ? <span className="flip-card__glare" aria-hidden="true" /> : null}
        </div>
        <div
          ref={backRef}
          role="group"
          className="flip-card__face flip-card__face--back"
          aria-hidden={!shown}
          inert={!shown ? '' : undefined}
        >
          {back}
          {useGlare ? <span className="flip-card__glare" aria-hidden="true" /> : null}
        </div>
      </motion.div>
    </div>
  );
}

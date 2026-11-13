'use client';

// React Bits — FuseButton (JavaScript + CSS), copiado de reactbits.dev el 2026-11-13;
// licencia MIT + Commons Clause (verificada el 2026-11-13: uso dentro de la app, sin redistribuir). Tipos en FuseButton.d.ts.
// Adaptado:
//  - Íconos de Hugeicons reemplazados por @tabler/icons-react
//    (IconTrash, IconArrowBackUp, IconCheck); no hay segunda librería de íconos.
//  - React 18: inert={cond ? '' : undefined} (un booleano no se renderiza).
//  - Escape deshace con la mecha encendida (listener en window, en captura) y no se
//    propaga: dentro de un Drawer no lo cierra a la vez.
//  - Se respeta prefers-reduced-motion también en el cambio de cara (sin fundido).
//  - Props nuevas: cancelarAlOcultar (con la pestaña oculta o al salir de la página
//    se cancela en vez de pausar), ariaLabel / undoAriaLabel (nombre accesible
//    cuando el texto se oculta en pantallas chicas). Al desmontar se cancela sin
//    llamar a onFuseEnd.
//  - La etiqueta va en <span class="fuse-button__label">.
'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconArrowBackUp, IconCheck, IconTrash } from '@tabler/icons-react';

import './FuseButton.css';

const LINE = [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }];
const OUTLINE = [{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }];
const SIZES = {
  sm: { height: 36, font: 13, icon: 14, px: 16 },
  md: { height: 44, font: 14, icon: 15, px: 20 },
  lg: { height: 52, font: 15, icon: 17, px: 24 },
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
  cancelarAlOcultar = false,
  ariaLabel,
  undoAriaLabel,
  onCommit,
  onUndo,
  onFuseEnd,
  onPhaseChange,
  className = '',
  type = 'button',
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
  const phaseRef = useRef('idle');
  const latest = useRef({ commitOn, settle });
  // Adaptado: se actualiza después del render, no durante (react-doctor no-ref-current-in-render).
  useLayoutEffect(() => {
    latest.current = {
      cancelarAlOcultar,
      onCommit,
      onUndo,
      onFuseEnd,
      onPhaseChange,
      commitOn,
      settle,
    };
  });
  const statusId = useId();
  const preset = SIZES[size] || SIZES.md;

  const go = (next) => {
    setInstant(
      lastInput.current === 'keyboard' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    phaseRef.current = next;
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
      fill: 'forwards',
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

  // Solo usa refs: se llama también desde listeners de window/document.
  const abort = () => {
    if (phaseRef.current !== 'armed') return;
    const a = anim.current;
    if (a) {
      a.onfinish = null;
      a.pause();
    }
    latest.current.onUndo?.();
    go('idle');
  };
  const undo = abort;

  useEffect(() => {
    const inside = rootRef.current?.contains(document.activeElement);
    if (phase === 'armed') undoRef.current?.focus({ preventScroll: true });
    else if (inside)
      (phase === 'idle' ? idleRef.current : rootRef.current)?.focus({
        preventScroll: true,
      });
  }, [phase]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && latest.current.cancelarAlOcultar) abort();
      pause.current.hidden = document.hidden;
      syncPlayState();
    };
    const onPageHide = () => {
      if (latest.current.cancelarAlOcultar) abort();
    };
    // Escape deshace estando donde esté el foco, y no llega a un Drawer/Modal de arriba.
    const onEscape = (e) => {
      if (e.key !== 'Escape' || phaseRef.current !== 'armed') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      lastInput.current = 'keyboard';
      abort();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('keydown', onEscape, true);
      const a = anim.current;
      if (a) {
        a.onfinish = null;
        a.cancel();
      }
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

  const handlePointerDown = (e) => {
    lastInput.current = 'pointer';
    const pressable = phase === 'armed' || (phase === 'idle' && !disabled);
    if (e.button === 0 && pressable && rootRef.current)
      rootRef.current.dataset.pressed = '';
  };
  const release = () => {
    if (rootRef.current) delete rootRef.current.dataset.pressed;
  };
  const handlePointerEnter = (e) => {
    if (pauseOnHover && e.pointerType === 'mouse' && pause.current.canHoverPause) {
      pause.current.hover = true;
      syncPlayState();
    }
  };
  const handlePointerLeave = (e) => {
    release();
    if (e.pointerType !== 'mouse') return;
    pause.current.canHoverPause = true;
    pause.current.hover = false;
    syncPlayState();
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') lastInput.current = 'keyboard';
    if (e.key === 'Escape' && phase === 'armed') {
      e.preventDefault();
      e.stopPropagation();
      lastInput.current = 'keyboard';
      undo();
    }
  };

  const actionIcon = icon ?? <IconTrash size={preset.icon} stroke={1.8} />;
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
        '--fb-px': `${preset.px}px`,
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
        aria-label={ariaLabel}
        inert={phase !== 'idle' ? '' : undefined}
        onClick={arm}
      >
        <span className="fuse-button__icon" aria-hidden="true">
          {actionIcon}
        </span>
        <span className="fuse-button__label">{label}</span>
      </button>
      <button
        ref={undoRef}
        type="button"
        className="fuse-button__face fuse-button__undo"
        aria-label={undoAriaLabel}
        aria-describedby={statusId}
        aria-keyshortcuts="Escape"
        inert={phase !== 'armed' ? '' : undefined}
        onClick={undo}
      >
        <span className="fuse-button__icon fuse-button__icon--undo" aria-hidden="true">
          <IconArrowBackUp size={preset.icon} stroke={2} />
        </span>
        <span className="fuse-button__label">{undoLabel}</span>
        {fuse !== 'outline' ? line : null}
      </button>
      <span
        className="fuse-button__face fuse-button__settled"
        inert={phase !== 'settled' ? '' : undefined}
      >
        <span className="fuse-button__icon" aria-hidden="true">
          <IconCheck size={preset.icon} stroke={2.2} />
        </span>
        <span className="fuse-button__label">{doneLabel}</span>
      </span>
      {fuse === 'outline' ? (
        <svg className="fuse-button__rim" aria-hidden="true">
          <rect ref={rimRef} pathLength="1" />
        </svg>
      ) : null}
      <span
        className="fuse-button__status"
        id={statusId}
        role="status"
        aria-live="polite"
      >
        {phase === 'idle' ? '' : doneLabel}
      </span>
    </span>
  );
}

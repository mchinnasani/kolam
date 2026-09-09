'use client';

import { useEffect, useRef } from 'react';

/**
 * Normalised cursor position in [-1, 1] on each axis, as a ref for the render
 * loop. Only the raw target is tracked here; the scene smooths toward it so
 * the easing stays frame-rate independent.
 *
 * Skipped entirely on coarse pointers — a finger has no hover position, and
 * reading one would fight the scroll gesture.
 */
export function usePointerParallax(enabled: boolean) {
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) { target.current = { x: 0, y: 0 }; return; }

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    };
    const reset = () => { target.current = { x: 0, y: 0 }; };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
    };
  }, [enabled]);

  return target;
}

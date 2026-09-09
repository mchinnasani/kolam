'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { clamp01 } from '../../lib/ease';

/**
 * Progress through a sticky scroll track, 0 when its top reaches the viewport
 * top and 1 when its bottom does.
 *
 * Returns a ref rather than state on purpose: the render loop reads it every
 * frame, and routing scroll through React state would re-render the tree sixty
 * times a second for a value only the canvas consumes.
 */
export function useScrollProgress(track: RefObject<HTMLElement | null>) {
  const progress = useRef(0);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const element = track.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      progress.current = span > 8 ? clamp01(-rect.top / span) : rect.top <= 0 ? 1 : 0;
    };

    const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };

    measure();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    window.addEventListener('orientationchange', queue);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      window.removeEventListener('orientationchange', queue);
    };
  }, [track]);

  return progress;
}

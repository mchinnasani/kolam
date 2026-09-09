import { generateRadialKolam } from './lib/kolam-radial';
import { flattenKolam } from './lib/kolam-path';
import { approach, clamp01 } from './lib/ease';
import { createScene, drawFrame, type Frame, type Palette } from './components/kolam/renderer';

export const defaultPalette: Palette = {
  line: [232, 244, 255], accents: [[237, 199, 144], [137, 203, 209], [118, 140, 222]],
  dot: [179, 196, 223], glow: [51, 85, 135],
};

export type KolamOptions = {
  seed?: string | number;
  rings?: number;
  particles?: number;
  motes?: number;
  palette?: Palette;
  /** Optional tall element containing the sticky canvas. */
  track?: HTMLElement;
  maxDpr?: number;
};
export type KolamPlayer = {
  /** Manual playback, from 0 (dispersed) to 1 (settled). */
  setProgress(progress: number): void;
  pause(): void;
  resume(): void;
  destroy(): void;
};

function count(value: number, name: string, max: number) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new RangeError(`${name} must be an integer between 1 and ${max}`);
  return value;
}

/** One independent player per canvas. The caller owns layout and page navigation. */
export function mountKolam(canvas: HTMLCanvasElement, options: KolamOptions = {}): KolamPlayer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A Canvas 2D context is required.');
  const lite = matchMedia('(pointer: coarse)').matches || canvas.clientWidth < 640;
  const maxDpr = options.maxDpr ?? 2;
  if (!Number.isFinite(maxDpr) || maxDpr <= 0 || maxDpr > 4) throw new RangeError('maxDpr must be greater than 0 and at most 4');
  const kolam = generateRadialKolam({ seed: options.seed ?? 'kolam', rings: options.rings ?? (lite ? 3 : 5), spokes: 6, symmetric: true });
  const scene = createScene(flattenKolam(kolam), count(options.particles ?? (lite ? 620 : 1600), 'particles', 20000), count(options.motes ?? (lite ? 90 : 220), 'motes', 5000), true);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0 }, targetPointer = { x: 0, y: 0 };
  const frame: Frame = { ctx, width: 1, height: 1, dpr: 1, progress: 0, seconds: 0, pointer, palette: options.palette ?? defaultPalette, quality: lite ? 'lite' : 'full', optimized: true };
  let target = 0, progress = 0, raf = 0, paused = false, destroyed = false, visible = true;
  let last = performance.now(), elapsed = 0, dirty = true, slow = 0, resolutionScale = 1;

  function wake() {
    if (!raf && !destroyed && !paused && visible && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    frame.width = Math.max(1, rect.width); frame.height = Math.max(1, rect.height);
    frame.dpr = Math.min(devicePixelRatio || 1, maxDpr) * resolutionScale;
    canvas.width = Math.round(frame.width * frame.dpr); canvas.height = Math.round(frame.height * frame.dpr);
    dirty = true; readScroll(); wake();
  }
  function readScroll() {
    if (options.track) {
      const rect = options.track.getBoundingClientRect();
      target = clamp01(-rect.top / Math.max(1, rect.height - frame.height));
    }
    wake();
  }
  function tick(now: number) {
    raf = 0;
    if (destroyed || paused || document.hidden || !visible) return;
    const delta = Math.min(64, now - last); last = now; elapsed += delta / 1000;
    const before = progress, px = pointer.x, py = pointer.y;
    progress = reduced.matches ? 1 : approach(progress, target, 145, delta);
    pointer.x = reduced.matches ? 0 : approach(pointer.x, targetPointer.x, 170, delta);
    pointer.y = reduced.matches ? 0 : approach(pointer.y, targetPointer.y, 170, delta);
    const moving = Math.abs(progress - target) > .00001 || Math.abs(pointer.x - targetPointer.x) > .001 || Math.abs(pointer.y - targetPointer.y) > .001;
    if (dirty || progress < .92 || before !== progress || px !== pointer.x || py !== pointer.y) {
      frame.progress = progress; frame.seconds = elapsed;
      drawFrame(scene, frame); dirty = false;
    }
    slow = delta > 28 && progress < .92 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 90 && resolutionScale === 1) { resolutionScale = .65; resize(); }
    if (!reduced.matches && (progress < .92 || moving)) wake();
  }
  function move(event: PointerEvent) {
    if (lite || reduced.matches) return;
    const rect = canvas.getBoundingClientRect();
    targetPointer.x = clamp01((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    targetPointer.y = clamp01((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    wake();
  }
  function leave() { targetPointer.x = 0; targetPointer.y = 0; wake(); }
  function visibility() { if (document.hidden) stop(); else wake(); }
  function motion() { dirty = true; wake(); }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) wake(); else stop(); });
  intersection.observe(canvas);
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointermove', move, { passive: true });
  canvas.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', motion);
  resize();

  return {
    setProgress(value) {
      if (!Number.isFinite(value)) throw new RangeError('progress must be finite');
      target = clamp01(value); wake();
    },
    pause() { paused = true; stop(); },
    resume() { paused = false; wake(); },
    destroy() {
      destroyed = true; stop(); resizeObserver.disconnect(); intersection.disconnect();
      window.removeEventListener('scroll', readScroll); window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion);
    },
  };
}

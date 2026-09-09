'use client';

import { optimizedAnimation, registerLayer, reportLayer } from '../animation/performance';
import { portalSources } from '../stars/scene-bridge';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { generateRadialKolam } from '../../lib/kolam-radial';
import { flattenKolam } from '../../lib/kolam-path';
import { approach } from '../../lib/ease';
import { kolamJourney } from '../../lib/kolam-journey';
import { createScene, drawFrame, type Quality, type Scene, type Frame } from './renderer';
import { useScrollProgress } from './useScrollProgress';
import { usePointerParallax } from './usePointerParallax';
import { useThemePalette } from './useThemePalette';

type Props = {
  seed?: string | number;
  /** The tall element whose scroll span drives the animation. */
  track: RefObject<HTMLElement | null>;
  /** The sticky stage. Receives the state attributes the copy animates on. */
  stage: RefObject<HTMLElement | null>;
  onReady?: (info: { dots: number; seed: string }) => void;
  onFail?: () => void;
};

/** Rings of pulli around the centre. Denser patterns need room to stay legible. */
function ringCount(width: number) {
  if (width < 640) return 3;
  if (width < 1024) return 4;
  return 5;
}

export default function KolamScene({ track, stage, onReady, onFail, seed: seedOption }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [quality, setQuality] = useState<Quality>('full');
  const [reduced, setReduced] = useState(false);

  const progress = useScrollProgress(track);
  const pointerTarget = usePointerParallax(!reduced && quality === 'full');
  const palette = useThemePalette();

  // ---- build the circuit once ----------------------------------------
  // Never rebuilt on resize: re-seeding mid-session would silently swap the
  // pattern out from under the reader.
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const lite = coarse.matches || window.innerWidth < 640;
    setReduced(motion.matches);
    setQuality(lite ? 'lite' : 'full');

    const onMotion = () => setReduced(motion.matches);
    motion.addEventListener('change', onMotion);

    try {
      const supplied = seedOption === undefined ? new URLSearchParams(window.location.search).get('seed') : String(seedOption);
      const entropy = new Uint32Array(4);
      if (supplied === null) crypto.getRandomValues(entropy);
      const seed = supplied ?? Array.from(entropy, v => v.toString(16).padStart(8, '0')).join('');

      const rings = ringCount(window.innerWidth);
      const kolam = generateRadialKolam({ seed, rings, spokes: 6, symmetric: true });
      const path = flattenKolam(kolam);

      // Particle budget: dense enough that the settled field reads as a
      // continuous thread, low enough to stay comfortably inside a frame budget
      // on a phone.
      setScene(createScene(path, lite ? 620 : 1600, lite ? 90 : 220, optimizedAnimation()));
      onReady?.({ dots: kolam.dots.length, seed: seed.slice(0, 8) });
    } catch (error) {
      console.error('Kolam hero: the circuit failed its invariants; not rendering a broken pattern.', error);
      onFail?.();
    }

    return () => motion.removeEventListener('change', onMotion);
  }, [onFail, onReady, seedOption]);

  // ---- render loop ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) { onFail?.(); return; }

    const optimized = optimizedAnimation();
    const stats = registerLayer('kolam');
    const main = canvas.closest('main');
    const size = { w: 0, h: 0, dpr: 1 };
    const pointer = { x: 0, y: 0 };
    const draw: Frame = { ctx, width: 1, height: 1, dpr: 1, progress: 0, seconds: 0, pointer, palette: palette.current, quality, optimized };
    const bridge = { positions: scene.portalStars, width: 1, height: 1 };
    if (stage.current) portalSources.set(stage.current,bridge);
    let slowFrames = 0, resolutionScale = 1;
    let raf = 0;
    let last = performance.now();
    const born = last;
    let visible = true;
    // Scroll is smoothed rather than read raw. The wheel arrives in coarse
    // discrete jumps; easing toward it is the difference between the camera
    // stepping and the camera gliding.
    let smoothed = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * resolutionScale;
      size.w = Math.max(1, Math.round(rect.width));
      size.h = Math.max(1, Math.round(rect.height));
      size.dpr = dpr;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
    };

    // Copy visibility is two boolean states, so the DOM is touched only when
    // one of them flips — not on every frame.
    let started = false;
    let revealed = false;

    const journeyEvent = new Event('journeyframe');
    const paint = (p: number, seconds: number) => {
      const element = stage.current;
      if (element) {
        const nextStarted = p > 0.02;
        const timeline = kolamJourney(p);
        const nextRevealed = timeline.revealed;
        element.style.setProperty('--journey', String(p));
        element.style.setProperty('--scene-opacity', String(timeline.opacity));
        if (nextStarted !== started) { started = nextStarted; element.toggleAttribute('data-started', nextStarted); }
        if (nextRevealed !== revealed) { revealed = nextRevealed; element.toggleAttribute('data-revealed', nextRevealed); }
      }
      bridge.width = size.w; bridge.height = size.h;
      draw.width = size.w; draw.height = size.h; draw.dpr = size.dpr;
      draw.progress = p; draw.seconds = seconds; draw.palette = palette.current;
      const began = performance.now();
      const calls = drawFrame(scene, draw) ?? 0;
      reportLayer(stats,began,calls,scene.particles.length+scene.motes.length,size.dpr);
      if (optimized && element) element.dispatchEvent(journeyEvent);

    };

    resize();

    // Reduced motion gets the finished pattern and no loop at all.
    if (reduced) {
      paint(1, 0);
      const observer = new ResizeObserver(() => { resize(); paint(1, 0); });
      observer.observe(canvas);
      return () => observer.disconnect();
    }

    let lastPaintProgress = -1, lastPaintX = 0, lastPaintY = 0;
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden || !visible || (optimized && main?.inert)) return;
      const delta = Math.min(64, now - last);
      last = now;
      // Half-life smoothing keeps both the parallax and the scroll identical at
      // 60 and 120 Hz rather than running twice as fast on a fast display.
      pointer.x = approach(pointer.x, pointerTarget.current.x, 170, delta);
      pointer.y = approach(pointer.y, pointerTarget.current.y, 170, delta);
      smoothed = approach(smoothed, progress.current, 145, delta);
      // Preserve the settled canvas until scroll or pointer movement changes it.
      if (smoothed < (optimized ? .92 : .94) || draw.palette !== palette.current || Math.abs(smoothed-lastPaintProgress) > .00001 || Math.abs(pointer.x-lastPaintX) > .001 || Math.abs(pointer.y-lastPaintY) > .001) {
        paint(smoothed, (now - born) / 1000);
        lastPaintProgress = smoothed; lastPaintX = pointer.x; lastPaintY = pointer.y;
      }
      if (optimized && delta > 28 && smoothed < .92) slowFrames++; else slowFrames = Math.max(0,slowFrames-1);
      if (optimized && slowFrames > 90 && resolutionScale > .65) { resolutionScale = .65; slowFrames=0;resize(); }
      const moving = Math.abs(smoothed-progress.current) > .00001 || Math.abs(pointer.x-pointerTarget.current.x) > .001 || Math.abs(pointer.y-pointerTarget.current.y) > .001;
      if (!optimized || smoothed < .92 || moving) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || document.hidden || !visible) return;
      last = performance.now();
      // Snap on resume so a backgrounded tab does not replay the whole scroll.
      smoothed = progress.current;
      raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && visible && !document.hidden) { last=performance.now();raf=requestAnimationFrame(frame); } };
    if (optimized) {
      window.addEventListener('scroll',wake,{passive:true});
      window.addEventListener('pointermove',wake,{passive:true});
      window.addEventListener('pointerleave',wake);
      window.addEventListener('blur',wake);
    }
    const themeObserver = new MutationObserver(wake);
    if (optimized) themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});
    const inertObserver = new MutationObserver(wake);
    if (optimized && main) inertObserver.observe(main,{attributes:true,attributeFilter:['inert']});
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    const observer = new ResizeObserver(() => { resize(); if (!document.hidden && visible) paint(smoothed, (performance.now() - born) / 1000); });
    observer.observe(canvas);

    // Idle cost drops to zero once the hero scrolls away.
    const inView = new IntersectionObserver(
      entries => {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      },
      { threshold: 0 },
    );
    if (track.current) inView.observe(track.current);

    const onVisibility = () => {
      if (document.hidden || !visible) stop(); else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    start();
    return () => {
      stop(); inertObserver.disconnect(); themeObserver.disconnect();
      window.removeEventListener('scroll',wake); window.removeEventListener('pointermove',wake);
      window.removeEventListener('pointerleave',wake); window.removeEventListener('blur',wake);
      observer.disconnect();
      inView.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scene, quality, reduced, palette, pointerTarget, progress, stage, track, onFail]);

  return (
    <canvas
      ref={canvasRef}
      className="kolam-canvas"
      role="img"
      aria-label="A field of drifting points that gathers into a single continuous kolam"
    />
  );
}

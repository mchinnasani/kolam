/** Opt-in A/B instrumentation. Normal visits allocate no frame-history arrays. */
export function optimizedAnimation() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('animation') !== 'baseline';
}
export type LayerStats = { calls: number; particles: number; dpr: number; cpu: number; updated: number };
export const animationStats = new Map<string, LayerStats>();
let enabled = false;
export function enablePerformance() { enabled = true; return () => { enabled = false; animationStats.clear(); }; }
export function registerLayer(name: string) {
  const stats = { calls: 0, particles: 0, dpr: 1, cpu: 0, updated: 0 };
  animationStats.set(name, stats);
  return stats;
}
export function reportLayer(stats: LayerStats, start: number, calls: number, particles: number, dpr: number) {
  if (!enabled) return;
  stats.calls += calls; stats.particles = particles; stats.dpr = dpr;
  stats.cpu += performance.now() - start; stats.updated = performance.now();
}

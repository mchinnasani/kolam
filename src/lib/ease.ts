/** Shared interpolation helpers. Every scroll-driven value is continuous in the
 *  scroll position, so the scene never snaps between states. */

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite ramp between two scroll positions. Zero slope at both ends. */
export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Ken Perlin's smootherstep. Zero first AND second derivative at both ends, so
 * a particle leaves rest and arrives at rest with no visible kick. This is the
 * curve that makes the formation read as drawn by a field rather than keyframed.
 */
export function smootherstep(t: number) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Frame-rate independent exponential approach, for pointer smoothing. */
export function approach(current: number, target: number, halfLifeMs: number, deltaMs: number) {
  return target + (current - target) * Math.pow(2, -deltaMs / halfLifeMs);
}

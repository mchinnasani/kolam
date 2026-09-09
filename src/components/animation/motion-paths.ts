import { placeParticle, type Particle, type Placed } from '../kolam/formation';
import { clamp01, smootherstep } from '../../lib/ease';

/** Per-particle spatial curve knots, not rendered frames. Timing remains independent. */
export type MotionPaths = { knots: Float32Array; segments: number; particles: Particle[] };
export function prepareMotionPaths(particles: Particle[], segments = 64): MotionPaths {
  const knots = new Float32Array(particles.length * (segments + 1) * 3);
  const out = { x: 0, y: 0, z: 0, formed: 0 };
  for (let i = 0; i < particles.length; i++) {
    const particle = { ...particles[i], drift: 0 };
    for (let k = 0; k <= segments; k++) {
      placeParticle(particle, particle.delay + particle.span * k / segments, 0, out);
      const index = (i * (segments + 1) + k) * 3;
      knots[index] = out.x; knots[index + 1] = out.y; knots[index + 2] = out.z;
    }
  }
  return { knots, segments, particles };
}
export function sampleMotionPath(paths: MotionPaths, index: number, progress: number, seconds: number, out: Placed) {
  const particle = paths.particles[index];
  const local = clamp01((progress - particle.delay) / particle.span);
  const position = local * paths.segments;
  const knot = Math.min(paths.segments - 1, Math.floor(position));
  const fraction = position - knot;
  const offset = (index * (paths.segments + 1) + knot) * 3;
  const data = paths.knots;
  const formed = smootherstep(local);
  const wobble = particle.drift * (1 - formed);
  const t = seconds * particle.speed + particle.phase;
  out.x = data[offset] + (data[offset + 3] - data[offset]) * fraction + Math.cos(t) * wobble;
  out.y = data[offset + 1] + (data[offset + 4] - data[offset + 1]) * fraction + Math.sin(t * .8) * wobble;
  out.z = data[offset + 2] + (data[offset + 5] - data[offset + 2]) * fraction + Math.sin(t * .6) * wobble * .6;
  out.formed = formed;
}

/** Upload once: seed-derived bends and timing used to be recomputed for every vertex. */
export function preparePlanetPaths(points: Float32Array) {
  const paths = new Float32Array(points.length / 8 * 4);
  for (let i = 0, j = 0; i < points.length; i += 8, j += 4) {
    const seed = points[i + 6] * 431 + points[i + 1] * 17;
    paths[j] = Math.sin(seed * 17.13); paths[j + 1] = Math.cos(seed * 31.7);
    paths[j + 2] = points[i + 6] * .3;
    paths[j + 3] = Math.floor(points[i + 6] * 23.999);
  }
  return paths;
}

/**
 * The dot field that becomes the kolam.
 *
 * Every particle owns one point on the circuit — particle i targets arc length
 * i/N — so the field is a resampling of the curve rather than a decoration
 * sitting near it. Because index order is arc order, the same array can later
 * be walked in sequence to thread a line through the settled particles.
 *
 * Two decisions do most of the work:
 *
 * Interpolation happens in POLAR coordinates, not Cartesian. A straight lerp
 * flies every dot along its own chord and reads as a machine placing parts;
 * interpolating radius and angle instead makes them fall inward along spirals,
 * which is what reads as being pulled by a field. The angle is eased slightly
 * behind the radius so the turn tightens as the dot closes, rather than
 * sweeping a wide fast arc while it is still far out.
 *
 * Position is a pure function of (progress, seconds). Nothing integrates, so
 * scrubbing the scroll backwards is exact, a dropped frame costs nothing, and a
 * backgrounded tab cannot accumulate drift.
 */
import { clamp01, smootherstep } from '../../lib/ease';
import { headAt, type FlatPath } from '../../lib/kolam-path';

const TAU = Math.PI * 2;

export type Particle = {
  /** Scatter origin, polar. */
  r0: number; a0: number; z0: number;
  /** Target on the circuit, polar. */
  r1: number; a1: number; z1: number;
  /** Where in the scroll this particle wakes, and how long it takes. */
  delay: number;
  span: number;
  /** Idle wander, scaled down to nothing as the particle locks on. */
  drift: number;
  phase: number;
  speed: number;
  /** 0 at the centre, 1 at the rim. Drives the accent ramp. */
  tint: number;
  size: number;
};

export type FormationOptions = {
  count: number;
  extent: number;
  seed?: number;
  /** Height of the gentle dome lifting the middle of the figure off the plane. */
  dome?: number;
};

/**
 * The last particle must be settled by here, leaving the tail of the scroll to
 * hold the finished figure. Every delay/span pair below is budgeted against it:
 * max delay + max span must not exceed this, or the slowest particles are still
 * in flight when the track runs out and the figure never actually closes.
 */
const COMPLETE_BY = 0.88;
const DELAY_SPREAD = 0.34;
const DELAY_JITTER = 0.10;
const SPAN_MIN = 0.28;
const SPAN_RANGE = 0.14;

export function createFormation(path: FlatPath, { count, extent, seed = 7, dome = 0.09 }: FormationOptions): Particle[] {
  if (DELAY_SPREAD + DELAY_JITTER + SPAN_MIN + SPAN_RANGE > COMPLETE_BY) {
    throw new Error('Formation schedule overruns the scroll track; some particles could never land.');
  }

  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const domeHeight = extent * dome;
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const arc = i / count;
    const head = headAt(path, arc);

    const r1 = Math.hypot(head.x, head.y);
    const a1 = Math.atan2(head.y, head.x);
    // Raised in the middle, flat at the rim: enough to catch the camera as it
    // tilts, not enough to stop reading as a kolam.
    const z1 = domeHeight * Math.cos(Math.min(1, r1 / extent) * (Math.PI / 2));

    // A filled volume, with no ring or target-bearing correlation at the start.
    // Depth extends past the opening camera so the viewer begins among dots.
    const r0 = extent * Math.sqrt(rand()) * 5;
    const a0 = rand() * TAU;
    const z0 = (rand() * 15 - 2) * extent;

    // The wave of activation follows arc order, so the figure assembles the way
    // the line is drawn. A jittered head start on a few keeps it from reading as
    // a hard sweeping wavefront.
    const early = rand() < 0.08;
    const base = arc * DELAY_SPREAD + rand() * DELAY_JITTER;
    const delay = early ? base * 0.2 : base;

    particles.push({
      r0, a0, z0,
      r1, a1, z1,
      delay,
      span: SPAN_MIN + rand() * SPAN_RANGE,
      drift: extent * (0.02 + rand() * 0.05),
      phase: rand() * TAU,
      speed: 0.25 + rand() * 0.5,
      tint: Math.min(1, r1 / extent),
      // World-space radius. Sized so a dot is a couple of pixels across at the
      // OPENING camera distance, not the closing one — at the old scale the
      // whole field projected sub-pixel and the first frame rendered empty.
      size: 0.034 + rand() * 0.034,
    });
  }

  return particles;
}

export type Placed = { x: number; y: number; z: number; formed: number };

/**
 * Resolve one particle at a scroll position and a clock. Returns how settled it
 * is in `formed` (0 loose, 1 locked), which the renderer uses for size, opacity
 * and for deciding whether the thread may pass through it yet.
 */
export function placeParticle(p: Particle, progress: number, seconds: number, out: Placed) {
  const local = clamp01((progress - p.delay) / p.span);
  const e = smootherstep(local);

  // Shortest way round. Scatter bearings are already near their targets, so
  // this is a modest arc, not a sweep across the figure.
  const delta = ((p.a1 - p.a0 + Math.PI) % TAU + TAU) % TAU - Math.PI;

  // The angle lags the radius slightly, so most of the turning happens once the
  // particle is already close in. Same landing (both reach 1 together), but the
  // path becomes a tightening spiral instead of a wide fast arc — which is both
  // prettier and far slower in world units at the moment of peak speed.
  const swing = Math.pow(e, 1.4);
  const angle = p.a0 + delta * swing;
  const radius = p.r0 + (p.r1 - p.r0) * e;
  const z = p.z0 + (p.z1 - p.z0) * e;

  // Wander fades out as the particle locks on, so the settled figure is still.
  const wobble = p.drift * (1 - e);
  const t = seconds * p.speed + p.phase;

  out.x = Math.cos(angle) * radius + Math.cos(t) * wobble;
  out.y = Math.sin(angle) * radius + Math.sin(t * 0.8) * wobble;
  out.z = z + Math.sin(t * 0.6) * wobble * 0.6;
  out.formed = e;
  return e;
}

/**
 * Turns the verified kolam circuit into a flat polyline with cumulative arc
 * length, which is what lets the stroke grow along its real path instead of
 * fading in: at any progress p we draw every point up to p * totalLength and
 * interpolate the final partial step.
 *
 * The walk order from `generateKolam` is preserved exactly — the pen follows
 * the same single circuit the invariant checks proved closed.
 */
import type { Kolam, Point, Segment } from './kolam';

export type FlatPath = {
  xs: Float64Array;
  ys: Float64Array;
  /** cum[i] is the arc length from the start of the circuit to point i. */
  cum: Float64Array;
  count: number;
  total: number;
};

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Adaptive de Casteljau subdivision. The control polygon's distance from the
 * chord bounds the true curve error, so a flat-enough span can stop early and
 * a tight corner keeps subdividing. Same test `lib/kolam.ts` uses to verify.
 */
function flattenCubic(a: Point, c1: Point, c2: Point, d: Point, tolerance: number, into: Point[], depth = 0) {
  const flatness = Math.max(distanceToSegment(c1, a, d), distanceToSegment(c2, a, d));
  if (flatness <= tolerance || depth >= 16) { into.push(d); return; }
  const ab = mid(a, c1), bc = mid(c1, c2), cd = mid(c2, d);
  const abc = mid(ab, bc), bcd = mid(bc, cd), centre = mid(abc, bcd);
  flattenCubic(a, ab, abc, centre, tolerance, into, depth + 1);
  flattenCubic(centre, bcd, cd, d, tolerance, into, depth + 1);
}

/**
 * Grid space to world space, applied once so every consumer agrees.
 *
 * Two things happen here. SVG y grows downward while world y grows toward the
 * camera's up vector, so the sign flips. And the lattice is turned 45°: a sikku
 * is drawn with its strokes running diagonally across the pulli grid, and
 * leaving it axis-aligned makes the gates read as a rectangular chain-link
 * instead of a woven pattern.
 */
const TILT = Math.PI / 4;
const TILT_COS = Math.cos(TILT);
const TILT_SIN = Math.sin(TILT);

export function toWorld(x: number, y: number): [number, number] {
  const flipped = -y;
  return [x * TILT_COS - flipped * TILT_SIN, x * TILT_SIN + flipped * TILT_COS];
}

export function flattenKolam(kolam: Kolam, tolerance = 0.0018): FlatPath {
  const points: Point[] = [kolam.segments[0].from];
  for (const segment of kolam.segments as Segment[]) {
    flattenCubic(segment.from, segment.c1, segment.c2, segment.to, tolerance, points);
  }

  const count = points.length;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const cum = new Float64Array(count);
  let total = 0;

  for (let i = 0; i < count; i++) {
    const [wx, wy] = toWorld(points[i].x, points[i].y);
    xs[i] = wx;
    ys[i] = wy;
    if (i > 0) total += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    cum[i] = total;
  }

  return { xs, ys, cum, count, total };
}

export type Head = { index: number; x: number; y: number };

/**
 * Where the pen has reached at `t` (0..1 of total arc length). `index` is the
 * last fully drawn point; (x, y) is the interpolated tip beyond it.
 */
export function headAt(path: FlatPath, t: number): Head {
  const target = t * path.total;
  if (target <= 0) return { index: 0, x: path.xs[0], y: path.ys[0] };
  const last = path.count - 1;
  if (target >= path.total) return { index: last, x: path.xs[last], y: path.ys[last] };

  // Binary search the cumulative length table.
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const midIndex = (lo + hi) >> 1;
    if (path.cum[midIndex] < target) lo = midIndex + 1; else hi = midIndex;
  }
  const index = Math.max(0, lo - 1);
  const span = path.cum[index + 1] - path.cum[index];
  const f = span > 1e-12 ? (target - path.cum[index]) / span : 0;
  return {
    index,
    x: path.xs[index] + (path.xs[index + 1] - path.xs[index]) * f,
    y: path.ys[index] + (path.ys[index + 1] - path.ys[index]) * f,
  };
}

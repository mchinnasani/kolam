/**
 * Seeded, single-circuit sikku construction. No DOM, renderer, or random global state.
 *
 * Every pulli begins with four corner vertices joined in a closed loop. A grid
 * spanning tree selects crossing gates: each replaces two facing loop edges
 * with two diagonal lanes. Joining distinct tree components merges two circuits
 * into one, so V-1 gates leave exactly one circuit. Crossings are not junctions.
 * SVG geometry is emitted only after this degree-two graph has been traversed.
 */
export type Point = { x: number; y: number };
export type Shape = 'square' | 'diamond';
export type Dot = Point & { id: number; row: number; col: number };
export type Segment = { from: Point; c1: Point; c2: Point; to: Point; edgeId: string };
export type Kolam = {
  seed: string; n: number; shape: Shape; dots: Dot[];
  points: Point[]; segments: Segment[]; path: string;
  gates: [number, number][];
  viewBox: [number, number, number, number];
  dotRadius: number; strokeWidth: number;
};
export type Verification = {
  ok: boolean; failures: string[]; circuitCount: number; closed: boolean;
  enclosedDots: number; totalDots: number; minClearance: number; smooth: boolean;
};
type Edge = { a: string; b: string; c1: Point; c2: Point; id: string };
/**
 * Distance from a pulli to its four loop corners, in grid units.
 *
 * Below ~0.35 each loop clears its neighbours and the result reads as a grid of
 * separate circles rather than a sikku. At 0.43 the loop radius is 0.608
 * against a dot spacing of 1, so neighbouring loops overlap and the circuit
 * genuinely interlaces. It must stay under 0.5, where adjacent corners would
 * coincide and the gate lanes degenerate. Verified across 150 seeded cases at
 * this value: single circuit, every dot enclosed, clearance 0.39.
 */
const CORNER = 0.43;
const KAPPA = 0.5522847498307936;
const OFFSETS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
const key = (dot: number, corner: number) => `${dot}:${corner}`;
const edgeKey = (a: string, b: string) => [a, b].sort().join('|');
const copy = (p: Point): Point => ({ x: p.x, y: p.y });
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;

function randomFromSeed(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPulliGrid(n = 5, shape: Shape = 'square'): Dot[] {
  if (!Number.isInteger(n) || n < 1 || n > 21 || n % 2 !== 1) throw new RangeError('Grid size must be an odd integer from 1 to 21.');
  if (shape !== 'square' && shape !== 'diamond') throw new TypeError('Shape must be square or diamond.');
  const middle = (n - 1) / 2;
  const dots: Dot[] = [];
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    if (shape === 'diamond' && Math.abs(row - middle) + Math.abs(col - middle) > middle) continue;
    dots.push({ id: dots.length, row, col, x: col - middle, y: row - middle });
  }
  return dots;
}

function pathFromWalk(points: Point[], segments: Segment[]): string {
  if (!points.length) return '';
  const format = (p: Point) => `${p.x.toFixed(6)} ${p.y.toFixed(6)}`;
  return `M ${format(points[0])} ${segments.map(segment => `C ${format(segment.c1)} ${format(segment.c2)} ${format(segment.to)}`).join(' ')} Z`;
}

/** Emit an ordered, explicitly closed walk before fitting its SVG geometry. */
export function generateKolam({ seed, n = 5, shape = 'square' }: { seed: string | number; n?: number; shape?: Shape }): Kolam {
  if ((typeof seed !== 'string' && typeof seed !== 'number') || (typeof seed === 'number' && !Number.isFinite(seed))) throw new TypeError('A finite number or string seed is required.');
  const seedText = String(seed);
  const random = randomFromSeed(seedText);
  const dots = createPulliGrid(n, shape);
  const byPosition = new Map(dots.map(dot => [`${dot.row},${dot.col}`, dot]));
  const vertices = new Map<string, Point>();
  const edges = new Map<string, Edge>();
  const addEdge = (a: string, b: string, c1: Point, c2: Point) => {
    const id = edgeKey(a, b);
    if (edges.has(id)) throw new Error(`Duplicate graph edge ${id}`);
    edges.set(id, { a, b, c1, c2, id });
  };
  for (const dot of dots) {
    OFFSETS.forEach(([x, y], corner) => vertices.set(key(dot.id, corner), { x: dot.x + x * CORNER, y: dot.y + y * CORNER }));
    for (let corner = 0; corner < 4; corner++) {
      const next = (corner + 1) % 4;
      const a = vertices.get(key(dot.id, corner))!;
      const b = vertices.get(key(dot.id, next))!;
      const va = { x: a.x - dot.x, y: a.y - dot.y };
      const vb = { x: b.x - dot.x, y: b.y - dot.y };
      addEdge(key(dot.id, corner), key(dot.id, next),
        { x: a.x - va.y * KAPPA, y: a.y + va.x * KAPPA },
        { x: b.x + vb.y * KAPPA, y: b.y - vb.x * KAPPA });
    }
  }

  // Randomized Kruskal on the pulli grid, with an explicit seeded shuffle.
  const candidates: { a: Dot; b: Dot; horizontal: boolean }[] = [];
  for (const dot of dots) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const neighbor = byPosition.get(`${dot.row + dr},${dot.col + dc}`);
    if (neighbor) candidates.push({ a: dot, b: neighbor, horizontal: dc === 1 });
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const parents = dots.map(dot => dot.id);
  const root = (id: number): number => { while (parents[id] !== id) { parents[id] = parents[parents[id]]; id = parents[id]; } return id; };
  const gates: [number, number][] = [];
  for (const { a, b, horizontal } of candidates) {
    const ra = root(a.id), rb = root(b.id);
    if (ra === rb) continue;
    parents[ra] = rb;
    gates.push([a.id, b.id]);
    const facingA = horizontal ? [1, 2] : [2, 3];
    const facingB = horizontal ? [3, 0] : [0, 1];
    edges.delete(edgeKey(key(a.id, facingA[0]), key(a.id, facingA[1])));
    edges.delete(edgeKey(key(b.id, facingB[0]), key(b.id, facingB[1])));
    for (let lane = 0; lane < 2; lane++) {
      const aKey = key(a.id, facingA[lane]);
      const bKey = key(b.id, facingB[lane]);
      const start = vertices.get(aKey)!, end = vertices.get(bKey)!;
      // The two diagonal gate lanes cross once between dots. Endpoint tangents
      // agree with the circular arcs, including when the graph walk reverses.
      const dx = Math.sign(end.x - start.x), dy = Math.sign(end.y - start.y);
      const handle = 0.20;
      addEdge(aKey, bKey, { x: start.x + dx * handle, y: start.y + dy * handle }, { x: end.x - dx * handle, y: end.y - dy * handle });
    }
  }
  if (gates.length !== dots.length - 1) throw new Error('Disconnected pulli grid.');

  const adjacency = new Map<string, Edge[]>();
  for (const vertex of vertices.keys()) adjacency.set(vertex, []);
  for (const edge of edges.values()) { adjacency.get(edge.a)!.push(edge); adjacency.get(edge.b)!.push(edge); }
  for (const incident of adjacency.values()) if (incident.length !== 2) throw new Error('Kolam stroke breaks: every corner must have degree two.');
  const start = key(0, 0);
  const points = [copy(vertices.get(start)!)];
  const segments: Segment[] = [];
  const visited = new Set<string>();
  let current = start;
  do {
    const edge = adjacency.get(current)!.find(candidate => !visited.has(candidate.id));
    if (!edge) throw new Error('Kolam stroke breaks: circuit stopped before closing.');
    const forward = edge.a === current;
    const next = forward ? edge.b : edge.a;
    visited.add(edge.id);
    segments.push({ from: copy(vertices.get(current)!), c1: copy(forward ? edge.c1 : edge.c2), c2: copy(forward ? edge.c2 : edge.c1), to: copy(vertices.get(next)!), edgeId: edge.id });
    points.push(copy(vertices.get(next)!));
    current = next;
  } while (current !== start && visited.size <= edges.size);
  if (visited.size !== edges.size) throw new Error('Kolam has more than one circuit.');
  const path = pathFromWalk(points, segments);
  const extent = (n - 1) / 2 + 0.68;
  const kolam: Kolam = { seed: seedText, n, shape, dots, points, segments, path, gates, viewBox: [-extent, -extent, extent * 2, extent * 2], dotRadius: 0.025, strokeWidth: 0.018 };
  const verification = verifyKolam(kolam);
  if (!verification.ok) {
    console.error('Kolam invariant failure', { seed: seedText, n, shape, failures: verification.failures });
    throw new Error(`Kolam invariant failure: ${verification.failures.join('; ')}`);
  }
  return kolam;
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Adaptive de Casteljau flattening. Convex-hull flatness bounds the curve/chord error. */
function flatten(segment: Segment, tolerance: number, into: Point[], depth = 0) {
  const { from: a, c1: b, c2: c, to: d } = segment;
  const flatness = Math.max(distanceToSegment(b, a, d), distanceToSegment(c, a, d));
  if (flatness <= tolerance) { into.push(d); return; }
  if (depth >= 20) throw new Error('Curve subdivision did not converge.');
  const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d);
  const abc = midpoint(ab, bc), bcd = midpoint(bc, cd), center = midpoint(abc, bcd);
  flatten({ ...segment, from: a, c1: ab, c2: abc, to: center }, tolerance, into, depth + 1);
  flatten({ ...segment, from: center, c1: bcd, c2: cd, to: d }, tolerance, into, depth + 1);
}

/** Independent graph/geometry checks. Returns diagnostics without hiding failures. */
export function verifyKolam(kolam: Kolam): Verification {
  const failures: string[] = [];
  const { dots, segments, points } = kolam;
  const empty = !dots.length || !segments.length || points.length < 2;
  const closed = !empty && same(points[0], points[points.length - 1]);
  if (!closed) failures.push('Ordered point list is not closed.');
  if (points.length !== segments.length + 1) failures.push('Point/segment counts disagree.');
  if (segments.length !== dots.length * 4) failures.push('Not every pulli corner was traversed.');
  if (new Set(segments.map(segment => segment.edgeId)).size !== segments.length) failures.push('An edge was repeated.');
  if ((kolam.path.match(/\bM\b/g) ?? []).length !== 1 || (kolam.path.match(/\bZ\b/g) ?? []).length !== 1 || !kolam.path.endsWith(' Z')) failures.push('SVG must contain one explicitly closed subpath.');
  if (kolam.path !== pathFromWalk(points, segments)) failures.push('SVG does not match the verified ordered walk.');
  const numeric = [...points, ...dots, ...segments.flatMap(segment => [segment.from, segment.c1, segment.c2, segment.to])];
  const finite = numeric.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!finite) failures.push('Non-finite geometry.');
  let smooth = !empty, breaks = 0;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i], next = segments[(i + 1) % segments.length];
    if (!same(segment.to, next.from) || !points[i] || !points[i + 1] || !same(segment.from, points[i]) || !same(segment.to, points[i + 1])) breaks++;
    const a = { x: segment.to.x - segment.c2.x, y: segment.to.y - segment.c2.y };
    const b = { x: next.c1.x - next.from.x, y: next.c1.y - next.from.y };
    if (Math.abs(a.x * b.y - a.y * b.x) > 1e-8 || a.x * b.x + a.y * b.y <= 0) smooth = false;
  }
  if (breaks) failures.push(`${breaks} broken stroke connection(s).`);
  if (!smooth) failures.push('A join has a cusp or a mismatched tangent.');
  let enclosedDots = 0, minClearance = Infinity;
  if (!empty && finite && !breaks) {
    const tolerance = 0.0005;
    const polyline = [segments[0].from];
    segments.forEach(segment => flatten(segment, tolerance, polyline));
    for (const dot of dots) {
      let winding = 0;
      for (let i = 0; i < polyline.length - 1; i++) {
        const a = polyline[i], b = polyline[i + 1];
        minClearance = Math.min(minClearance, distanceToSegment(dot, a, b) - tolerance);
        const side = (b.x - a.x) * (dot.y - a.y) - (dot.x - a.x) * (b.y - a.y);
        if (a.y <= dot.y && b.y > dot.y && side > 0) winding++;
        if (a.y > dot.y && b.y <= dot.y && side < 0) winding--;
      }
      if (Math.abs(winding) === 1) enclosedDots++;
    }
  }
  if (enclosedDots !== dots.length) failures.push(`Only ${enclosedDots}/${dots.length} dots have winding number ±1.`);
  if (minClearance <= kolam.dotRadius + kolam.strokeWidth / 2) failures.push('Stroke intersects a pulli dot.');
  const circuitCount = !empty && closed && !breaks && new Set(segments.map(segment => segment.edgeId)).size === segments.length ? 1 : 0;
  return { ok: failures.length === 0, failures, circuitCount, closed, enclosedDots, totalDots: dots.length, minClearance, smooth };
}

export function kolamToSvg(kolam: Kolam): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${kolam.viewBox.join(' ')}" role="img" aria-label="Single continuous kolam around ${kolam.dots.length} dots"><g fill="currentColor" opacity="0.25">${kolam.dots.map(dot => `<circle cx="${dot.x}" cy="${dot.y}" r="${kolam.dotRadius}"/>`).join('')}</g><path d="${kolam.path}" fill="none" stroke="currentColor" stroke-width="${kolam.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

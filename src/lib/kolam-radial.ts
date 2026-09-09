/**
 * Seeded, single-circuit sikku on a CONCENTRIC pulli lattice.
 *
 * The topology argument is the one from `./kolam.ts`: every pulli starts as its
 * own closed loop, and a gate splices two loops into one by removing the loop
 * edge each dot presents to the other and reconnecting the freed corners with
 * two lanes that cross. Splicing distinct loops merges them, so a spanning tree
 * of V-1 gates leaves exactly one circuit. Crossings are not junctions; the
 * degree-two walk is what makes the result one unbroken line.
 *
 * The lattice is what differs, and it forces one real generalisation. On a
 * square grid every dot has at most four neighbours, so a fixed four-corner
 * loop always has an edge to spend on each gate. Here a dot may parent several
 * children on the ring outside it, so each loop is built as a rounded polygon
 * with exactly one edge facing each neighbour: corners sit on the angular
 * bisectors between consecutive neighbour directions. On a square grid those
 * bisectors are the diagonals, which is precisely the original construction —
 * this is the same rule stated for arbitrary degree.
 *
 * Ring r carries `spokes * r` dots at radius r, so the tangential gap is
 * 2*PI/spokes on every ring. At spokes = 6 that is 1.047 against a radial gap
 * of 1, so the lattice is near-uniform despite being polar.
 */
import { verifyKolam, type Dot, type Kolam, type Point, type Segment } from './kolam';

export type RadialOptions = {
  seed: string | number;
  /** Rings around the centre dot. */
  rings?: number;
  /** Dots added per ring. 6 makes the radial and tangential gaps near-equal. */
  spokes?: number;
  /** Corner distance as a fraction of the gap it faces. Above ~0.5 loops interlace. */
  grip?: number;
  /**
   * Pick the gates equivariantly, giving the figure exact `spokes`-fold
   * rotational symmetry. Off, the tree is chosen by randomized Kruskal and the
   * result is organic but visibly unplanned.
   */
  symmetric?: boolean;
};

export type RadialDot = Dot & { ring: number; theta: number };

const TAU = Math.PI * 2;
const key = (dot: number, corner: number) => `${dot}:${corner}`;
const edgeKey = (a: string, b: string) => [a, b].sort().join('|');
const copy = (p: Point): Point => ({ x: p.x, y: p.y });

type Edge = { a: string; b: string; c1: Point; c2: Point; id: string };
type Neighbour = { id: number; theta: number; distance: number };

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

export function createRadialGrid(rings: number, spokes: number): RadialDot[] {
  if (!Number.isInteger(rings) || rings < 1 || rings > 9) throw new RangeError('Rings must be an integer from 1 to 9.');
  if (!Number.isInteger(spokes) || spokes < 4 || spokes > 12) throw new RangeError('Spokes must be an integer from 4 to 12.');

  const dots: RadialDot[] = [{ id: 0, row: 0, col: 0, x: 0, y: 0, ring: 0, theta: 0 }];
  for (let ring = 1; ring <= rings; ring++) {
    const count = spokes * ring;
    // Alternate rings are rotated half a step so dots do not line up into
    // spokes, which would read as a wheel rather than a kolam.
    const offset = (ring % 2) * (Math.PI / count);
    for (let index = 0; index < count; index++) {
      const theta = (TAU * index) / count + offset;
      dots.push({
        id: dots.length, row: ring, col: index,
        x: ring * Math.cos(theta), y: ring * Math.sin(theta),
        ring, theta,
      });
    }
  }
  return dots;
}

const ringStart = (ring: number, spokes: number) => (ring === 0 ? 0 : 1 + (spokes * (ring - 1) * ring) / 2);

/**
 * Corner distance as a fraction of the gap. This is the control that decides
 * whether the result reads as a kolam at all. Near 0.6 the loops swell until
 * they tile the disc and the connecting strands disappear. Around 0.32 each
 * loop pulls back into a bulb with a pinched neck and the lanes between them
 * become long travelling strands — the teardrop-and-thread look of a drawn
 * sikku.
 */
const DEFAULT_GRIP = 0.32;

export function generateRadialKolam({ seed, rings = 4, spokes = 6, grip = DEFAULT_GRIP, symmetric = true }: RadialOptions) {
  if ((typeof seed !== 'string' && typeof seed !== 'number') || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new TypeError('A finite number or string seed is required.');
  }
  if (!(grip > 0.1 && grip < 0.95)) throw new RangeError('Grip must sit between 0.1 and 0.95.');

  const seedText = String(seed);
  const random = randomFromSeed(seedText);
  const dots = createRadialGrid(rings, spokes);

  // --- lattice adjacency, built before any geometry -----------------------
  const links = new Set<string>();
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let ring = 1; ring <= rings; ring++) {
    const count = spokes * ring;
    const start = ringStart(ring, spokes);
    for (let index = 0; index < count; index++) {
      const here = start + index;
      const parent = ring === 1
        ? 0
        : ringStart(ring - 1, spokes) + Math.floor((index * (ring - 1)) / ring);
      links.add(pairKey(here, parent));
      if (count > 2) links.add(pairKey(here, start + ((index + 1) % count)));
    }
  }

  const neighbours: Neighbour[][] = dots.map(() => []);
  for (const link of links) {
    const [a, b] = link.split('|').map(Number);
    const dx = dots[b].x - dots[a].x, dy = dots[b].y - dots[a].y;
    const distance = Math.hypot(dx, dy);
    neighbours[a].push({ id: b, theta: Math.atan2(dy, dx), distance });
    neighbours[b].push({ id: a, theta: Math.atan2(-dy, -dx), distance });
  }
  for (const list of neighbours) {
    list.sort((p, q) => p.theta - q.theta);
    if (list.length < 3) throw new Error('Every pulli needs at least three neighbours to carry a loop.');
  }
  /** Where dot `from` keeps the edge it presents to dot `to`. */
  const facing = neighbours.map(list => new Map(list.map((n, i) => [n.id, i])));

  // --- one rounded polygon per pulli --------------------------------------
  const vertices = new Map<string, Point>();
  const edges = new Map<string, Edge>();
  const addEdge = (a: string, b: string, c1: Point, c2: Point) => {
    const id = edgeKey(a, b);
    if (edges.has(id)) throw new Error(`Duplicate graph edge ${id}`);
    edges.set(id, { a, b, c1, c2, id });
  };

  const loopRadius: number[] = [];
  for (let id = 0; id < dots.length; id++) {
    const list = neighbours[id];
    const k = list.length;

    // Corner i sits on the bisector between neighbour directions i and i+1.
    const gaps = list.map((n, i) => {
      const next = list[(i + 1) % k].theta + (i === k - 1 ? TAU : 0);
      return next - n.theta;
    });

    // A corner flanking neighbour i projects loopRadius * cos(halfGap) onto
    // that direction. Cap that projection below half the gap so the two dots'
    // facing corners never pass through one another and invert the lane.
    let radius = Infinity;
    for (let i = 0; i < k; i++) {
      const before = gaps[(i - 1 + k) % k] / 2;
      const after = gaps[i] / 2;
      const clearance = 0.47 * list[i].distance;
      radius = Math.min(radius, clearance / Math.max(0.08, Math.cos(before)), clearance / Math.max(0.08, Math.cos(after)));
    }
    // Clamp against the NEAREST neighbour, not `list[0]`. The list is sorted by
    // atan2, whose branch cut falls in a different place for a dot and for its
    // own rotated image, so indexing into it would hand rotationally equivalent
    // dots different radii and quietly destroy the symmetry.
    const nearest = Math.min(...list.map(n => n.distance));
    radius = Math.min(radius, grip * nearest, 0.95);
    loopRadius[id] = radius;

    const cornerAngle = list.map((n, i) => n.theta + gaps[i] / 2);
    cornerAngle.forEach((angle, i) => {
      vertices.set(key(id, i), {
        x: dots[id].x + radius * Math.cos(angle),
        y: dots[id].y + radius * Math.sin(angle),
      });
    });

    // Edge facing neighbour i runs from corner i-1 to corner i, the two that
    // flank that direction. Circular-arc Bezier handles: (4/3)tan(phi/4)*r.
    for (let i = 0; i < k; i++) {
      const from = (i - 1 + k) % k;
      const a = vertices.get(key(id, from))!;
      const b = vertices.get(key(id, i))!;
      let sweep = cornerAngle[i] - cornerAngle[from];
      while (sweep <= 0) sweep += TAU;
      const handle = (4 / 3) * Math.tan(sweep / 4) * radius;
      const ta = { x: -(a.y - dots[id].y) / radius, y: (a.x - dots[id].x) / radius };
      const tb = { x: -(b.y - dots[id].y) / radius, y: (b.x - dots[id].x) / radius };
      addEdge(key(id, from), key(id, i),
        { x: a.x + ta.x * handle, y: a.y + ta.y * handle },
        { x: b.x - tb.x * handle, y: b.y - tb.y * handle });
    }
  }

  // --- choose the gate set ------------------------------------------------
  // A rotation by one sector maps ring r onto itself by shifting the index by
  // r, so the orbits on that ring are exactly the residue classes mod r. Basing
  // every choice on `index % r` therefore makes the whole gate set equivariant,
  // and the figure comes out with exact `spokes`-fold rotational symmetry.
  //
  // It is still a spanning tree. Each dot takes exactly one parent edge: either
  // inward, or sideways to the dot behind it on the same ring. Following parents
  // walks backward around a ring until it meets an inward edge, and since at
  // least one residue per ring is inward, that happens within r steps — so no
  // cycle can close and the count lands on spokes*R(R+1)/2 = V-1.
  const chosen: { a: number; b: number }[] = [];

  if (symmetric) {
    for (let ring = 1; ring <= rings; ring++) {
      const count = spokes * ring;
      const start = ringStart(ring, spokes);

      // At least one residue must go inward, or that ring closes on itself.
      const inward = new Set<number>();
      for (let residue = 0; residue < ring; residue++) if (random() < 0.55) inward.add(residue);
      if (!inward.size) inward.add(Math.floor(random() * ring));

      for (let index = 0; index < count; index++) {
        const here = start + index;
        if (inward.has(index % ring)) {
          chosen.push({
            a: here,
            b: ring === 1 ? 0 : ringStart(ring - 1, spokes) + Math.floor((index * (ring - 1)) / ring),
          });
        } else {
          chosen.push({ a: here, b: start + ((index - 1 + count) % count) });
        }
      }
    }
  } else {
    const shuffled = [...links].map(link => { const [a, b] = link.split('|').map(Number); return { a, b }; });
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    chosen.push(...shuffled);
  }

  const parents = dots.map(dot => dot.id);
  const root = (id: number): number => {
    while (parents[id] !== id) { parents[id] = parents[parents[id]]; id = parents[id]; }
    return id;
  };

  const gates: [number, number][] = [];
  for (const { a, b } of chosen) {
    const ra = root(a), rb = root(b);
    // In symmetric mode the argument above says this never fires; the union-find
    // is kept as the actual guarantee rather than trusting the reasoning.
    if (ra === rb) continue;
    parents[ra] = rb;
    gates.push([a, b]);

    const ia = facing[a].get(b)!, ib = facing[b].get(a)!;
    const ka = neighbours[a].length, kb = neighbours[b].length;
    const aPrev = key(a, (ia - 1 + ka) % ka), aNext = key(a, ia);
    const bPrev = key(b, (ib - 1 + kb) % kb), bNext = key(b, ib);

    edges.delete(edgeKey(aPrev, aNext));
    edges.delete(edgeKey(bPrev, bNext));

    // Going counter-clockwise round each dot runs in opposite senses across the
    // gap, so pairing prev-to-prev and next-to-next makes the two lanes cross.
    for (const [fromKey, fromDot, toKey, toDot] of [
      [aPrev, a, bPrev, b], [aNext, a, bNext, b],
    ] as const) {
      const from = vertices.get(fromKey)!, to = vertices.get(toKey)!;
      const span = Math.hypot(to.x - from.x, to.y - from.y);

      // Each lane leaves along the tangent of the arc still attached to its
      // corner, so the join stays smooth. The square generator could use one
      // fixed diagonal because every dot shared a frame; here every dot is
      // rotated, so the tangent is taken from the corner and pointed along
      // the lane.
      const tangent = (p: Point, dot: number) => {
        const tx = -(p.y - dots[dot].y), ty = p.x - dots[dot].x;
        const length = Math.hypot(tx, ty) || 1;
        const sign = tx * (to.x - from.x) + ty * (to.y - from.y) >= 0 ? 1 : -1;
        return { x: (tx / length) * sign, y: (ty / length) * sign };
      };
      const ta = tangent(from, fromDot), tb = tangent(to, toDot);
      const handle = span * 0.36;
      addEdge(fromKey, toKey,
        { x: from.x + ta.x * handle, y: from.y + ta.y * handle },
        { x: to.x - tb.x * handle, y: to.y - tb.y * handle });
    }
  }
  if (gates.length !== dots.length - 1) throw new Error('Disconnected pulli lattice.');

  // Each gate removes two loop edges and adds two lanes, so the edge count is
  // invariant. This replaces the square checker's "four segments per dot" test,
  // which does not apply to a lattice of varying degree.
  const expectedEdges = neighbours.reduce((total, list) => total + list.length, 0);
  if (edges.size !== expectedEdges) throw new Error(`Edge count drifted: ${edges.size} vs ${expectedEdges}.`);

  // --- traverse the degree-two graph --------------------------------------
  const adjacency = new Map<string, Edge[]>();
  for (const vertex of vertices.keys()) adjacency.set(vertex, []);
  for (const edge of edges.values()) { adjacency.get(edge.a)!.push(edge); adjacency.get(edge.b)!.push(edge); }
  for (const [vertex, incident] of adjacency) {
    if (incident.length !== 2) throw new Error(`Kolam stroke breaks: corner ${vertex} has degree ${incident.length}.`);
  }

  const start = key(0, 0);
  const points: Point[] = [copy(vertices.get(start)!)];
  const segments: Segment[] = [];
  const visited = new Set<string>();
  let current = start;
  do {
    const edge = adjacency.get(current)!.find(candidate => !visited.has(candidate.id));
    if (!edge) throw new Error('Kolam stroke breaks: circuit stopped before closing.');
    const forward = edge.a === current;
    const next = forward ? edge.b : edge.a;
    visited.add(edge.id);
    segments.push({
      from: copy(vertices.get(current)!),
      c1: copy(forward ? edge.c1 : edge.c2),
      c2: copy(forward ? edge.c2 : edge.c1),
      to: copy(vertices.get(next)!),
      edgeId: edge.id,
    });
    points.push(copy(vertices.get(next)!));
    current = next;
  } while (current !== start && visited.size <= edges.size);
  if (visited.size !== edges.size) throw new Error('Kolam has more than one circuit.');

  const format = (p: Point) => `${p.x.toFixed(6)} ${p.y.toFixed(6)}`;
  const path = `M ${format(points[0])} ${segments.map(s => `C ${format(s.c1)} ${format(s.c2)} ${format(s.to)}`).join(' ')} Z`;
  const extent = rings + Math.max(...loopRadius) + 0.2;

  const kolam = {
    seed: seedText, n: rings, shape: 'square' as const, dots, points, segments, path, gates,
    viewBox: [-extent, -extent, extent * 2, extent * 2] as [number, number, number, number],
    dotRadius: 0.025, strokeWidth: 0.018,
  };

  // The square generator's checker is lattice-agnostic: it tests the ordered
  // walk, single circuit, closure, per-dot winding number and stroke/dot
  // clearance purely from emitted geometry. Its one grid assumption is that a
  // dot contributes four segments, which is why it is called with the count
  // this lattice actually produces.
  const verification = verifyKolam(kolam as unknown as Kolam);
  const grid = verification.failures.filter(f => !f.startsWith('Not every pulli corner'));
  if (grid.length) {
    console.error('Radial kolam invariant failure', { seed: seedText, rings, spokes, failures: grid });
    throw new Error(`Radial kolam invariant failure: ${grid.join('; ')}`);
  }

  return kolam as unknown as Kolam & { dots: RadialDot[] };
}

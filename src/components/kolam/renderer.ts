import { prepareMotionPaths, sampleMotionPath, type MotionPaths } from '../animation/motion-paths';
/**
 * Pure drawing layer: no React, no DOM lookups, no state of its own. Given a
 * scroll position and a clock it renders one frame, which keeps the animation
 * testable and makes the React component a thin shell around rAF.
 *
 * The subject is a field of points that becomes a kolam. Nothing is stroked
 * from the curve directly — the curve is resampled into particles (see
 * ./formation), those particles fly in, and a thread is only drawn through the
 * ones that have settled. So the line genuinely emerges from the dots rather
 * than fading in on top of them.
 *
 * Depth is layered: ambient motes far behind, a light pool on the floor, the
 * formation itself carrying real z, an additive bloom, and a vignette closing
 * the frame. Everything is projected through one perspective camera, so all of
 * it parallaxes together.
 *
 * Glow is composited with 'lighter'. On a dark ground additive blending is what
 * makes crossing strands brighten where they overlap, which is the difference
 * between reading as emitted light and as flat paint.
 */
import {
  createProjection, fitDistance, makeCamera, projectPoint, projectPointInto,
  NEAR, type Camera, type Projection,
} from '../../lib/camera';
import { clamp01, lerp, smoothstep } from '../../lib/ease';
import type { FlatPath } from '../../lib/kolam-path';
import { kolamJourney } from '../../lib/kolam-journey';
import { createFormation, placeParticle, type Particle } from './formation';
import { createMotes, moteAt, type Mote } from './particles';

export type Rgb = [number, number, number];

export type Palette = {
  /** Ivory core of a settled dot and of the thread. */
  line: Rgb;
  /** Ramped by radius across the figure. */
  accents: Rgb[];
  /** Loose, not-yet-settled dots. */
  dot: Rgb;
  /** Light pooling on the floor beneath the figure. */
  glow: Rgb;
};

export type Quality = 'full' | 'lite';

export type Scene = {
  path: FlatPath;
  extent: number;
  /** World distance between consecutive particles once settled. */
  spacing: number;
  particles: Particle[];
  motes: Mote[];
  /** Screen-space scratch for the formation, reused every frame. */
  projection: Projection;
  formed: Float64Array;
  portalStars: Float32Array;
  paths?: MotionPaths;
  colours: Rgb[];
  colourPalette?: Palette;
  dotAtlas?: HTMLCanvasElement;
  projected: {x:number;y:number;depth:number};
  motePosition: {x:number;y:number;z:number};
  moteColours: Rgb[];
  scratch: { x: number; y: number; z: number; formed: number };
};

export type Frame = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  progress: number;
  /** Seconds since mount. Drives ambient drift only, never the scroll timeline. */
  seconds: number;
  pointer: { x: number; y: number };
  palette: Palette;
  quality: Quality;
  optimized?: boolean;
};

const FOV = (42 * Math.PI) / 180;
const DEG = Math.PI / 180;
/** A particle must be this settled before the thread may pass through it. */
const THREAD_LOCK = 0.93;
/**
 * ...and consecutive particles must also be no further apart than this multiple
 * of their settled spacing. The formation test alone is not enough: two dots can
 * both be 93% of the way home and still be far apart, and joining them draws a
 * long straight chord across the figure that instantly reads as a bug.
 */
const THREAD_GAP = 3.2;
const CHUNK = 12;
const FULL_PASSES: [number,number][] = [[6,.055],[2.8,.18],[1.4,.65]];
const LITE_PASSES: [number,number][] = [[2.1,.5]];

const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Open ramp: first accent at t=0, last at t=1, no wrap — so the centre and the
 *  rim never land on the same hue. Radius is rotation invariant, which is what
 *  keeps the figure's six-fold symmetry legible in colour as well as in form. */
function rampAt(accents: Rgb[], t: number): Rgb {
  const n = accents.length;
  if (n === 1) return accents[0];
  const u = clamp01(t) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  const f = u - i;
  const a = accents[i];
  const b = accents[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function createScene(path: FlatPath, particleCount = 1500, moteCount = 90, optimized = false): Scene {
  let extent = 0;
  for (let i = 0; i < path.count; i++) extent = Math.max(extent, Math.hypot(path.xs[i], path.ys[i]));
  extent += 0.12;

  const particles = createFormation(path, { count: particleCount, extent });
  return {
    path, extent, particles,
    paths: optimized ? prepareMotionPaths(particles) : undefined,
    projected: {x:0,y:0,depth:0}, motePosition: {x:0,y:0,z:0}, moteColours: [],
    colours: [], scratch: { x: 0, y: 0, z: 0, formed: 0 },
    spacing: path.total / Math.max(1, particleCount),
    motes: createMotes(moteCount, extent * 5),
    projection: createProjection(particleCount),
    formed: new Float64Array(particleCount),
    portalStars: new Float32Array(72 * 3),
  };
}

function widthAt(cam: Camera, world: number, depth: number) {
  return Math.max(0.4, Math.min(40, (world * cam.focal) / depth));
}

export function drawFrame(scene: Scene, frame: Frame) {
  const { ctx, width, height, dpr, pointer, palette, quality, seconds } = frame;
  const journey = clamp01(frame.progress);
  const timeline = kolamJourney(journey);
  const p = timeline.formation;
  let calls = 0;
  if (frame.optimized && scene.colourPalette !== palette) {
    scene.colours = scene.particles.map(particle => rampAt(palette.accents, particle.tint));
    scene.moteColours = scene.motes.map(mote => rampAt(palette.accents,mote.tint));
    scene.colourPalette = palette;
    const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 576;
    const ink = atlas.getContext('2d')!; ink.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 129; i++) {
      const x = (i % 16)*64+32, y = Math.floor(i/16)*64+32;
      const colour = i === 128 ? palette.dot : rampAt(palette.accents,(i%64)/63);
      ink.fillStyle = rgba(colour,.22);ink.beginPath();ink.arc(x,y,20.8,0,Math.PI*2);ink.fill();
      ink.fillStyle = rgba(i >= 64 && i < 128 ? palette.line : colour,1);ink.beginPath();ink.arc(x,y,8,0,Math.PI*2);ink.fill();
    }
    scene.dotAtlas = atlas;
  }
  const full = quality === 'full';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  if (width < 2 || height < 2) return;

  // Move through the volume from the first scroll. The distant circuit forms
  // during this same approach, rather than finishing before the flight starts.
  const camT = timeline.travel;
  const wide = fitDistance(scene.extent * 2.8, 0.42, FOV, width, height);
  const close = fitDistance(scene.extent, 0.36, FOV, width, height);
  const distance = lerp(wide, close, camT);
  const pitch = lerp(74, 66, camT) + pointer.y * 1.5;
  const yaw = lerp(-12, 12, camT) + pointer.x * 2.5;
  const cam = makeCamera({ x: 0, y: 0, z: 0 }, distance, pitch * DEG, yaw * DEG, FOV, width, height);
  cam.cy = height * 0.5;

  const centre = projectPoint(cam, 0, 0, 0);

  // ---- floor light ----------------------------------------------------
  if (centre.depth > NEAR) {
    const radius = Math.max(width, height) * 0.7;
    const pool = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius);
    pool.addColorStop(0, rgba(palette.glow, 0.065 * (0.35 + 0.65 * camT)));
    pool.addColorStop(0.55, rgba(palette.glow, 0.015));
    pool.addColorStop(1, rgba(palette.glow, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, width, height); calls++;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- ambient motes --------------------------------------------------
  // Far behind the formation and projected through the same camera, so they
  // parallax against it and give the void a sense of extent.
  if (scene.motes.length) {
    const at = scene.motePosition;
    ctx.globalCompositeOperation = 'lighter';
    for (let index=0;index<scene.motes.length;index++) {
      const mote=scene.motes[index];
      moteAt(mote, seconds, at);
      const q = frame.optimized ? projectPointInto(cam, at.x, at.y, at.z, scene.projected) : projectPoint(cam, at.x, at.y, at.z);
      if (index < 72) {
        scene.portalStars[index*3] = q.x / width;
        scene.portalStars[index*3+1] = 1 - q.y / height;
        scene.portalStars[index*3+2] = q.depth > NEAR ? 1 : 0;
      }
      if (q.depth <= NEAR) continue;
      const r = Math.max(0.35, Math.min(5, (mote.size * cam.focal) / q.depth));
      const fade = clamp01(1 - q.depth / (wide * 1.5)) * smoothstep(0.1, 1.5, q.depth) * (1 - smoothstep(index < 72 ? 0.48 : 0.65, index < 72 ? 0.58 : 0.87, journey)) * 0.65;
      if (fade <= 0.01) continue;
      ctx.fillStyle = rgba(frame.optimized ? scene.moteColours[index] : rampAt(palette.accents, mote.tint), fade);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fill(); calls++;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- resolve the formation ------------------------------------------
  const { particles, projection, formed } = scene;
  const place = scene.scratch;
  for (let i = 0; i < particles.length; i++) {
    if (frame.optimized && scene.paths) sampleMotionPath(scene.paths, i, p, seconds, place);
    else placeParticle(particles[i], p, seconds, place);
    formed[i] = place.formed;
    const q = frame.optimized ? projectPointInto(cam, place.x, place.y, place.z, scene.projected) : projectPoint(cam, place.x, place.y, place.z);
    projection.x[i] = q.x;
    projection.y[i] = q.y;
    projection.depth[i] = q.depth;
  }

  // ---- thread through the settled particles ---------------------------
  // Only drawn where consecutive particles have both locked on, so a line never
  // appears between two dots still in flight. Index order is arc order, which is
  // what makes this a legitimate tracing of the circuit.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const threadWorld = lerp(0.012, 0.055, camT);
  let i = 0;
  const n = particles.length;
  while (i < n) {
    if (formed[i] < THREAD_LOCK || projection.depth[i] <= NEAR) { i++; continue; }

    // Extend while the chain stays locked AND stays tight; wrap past the end to
    // close the loop.
    let end = i;
    while (end + 1 <= n && end - i < CHUNK) {
      const next = (end + 1) % n;
      const here = end % n;
      if (formed[next] < THREAD_LOCK || projection.depth[next] <= NEAR) break;
      // Allowed screen gap, in perspective: the settled spacing at this depth.
      const allowed = (scene.spacing * THREAD_GAP * cam.focal) / projection.depth[next];
      if (Math.hypot(projection.x[next] - projection.x[here], projection.y[next] - projection.y[here]) > allowed) break;
      end++;
    }
    if (end > i) {
      let depthSum = 0;
      let weakest = 1;
      for (let k = i; k <= end; k++) {
        const j = k % n;
        depthSum += projection.depth[j];
        weakest = Math.min(weakest, formed[j]);
      }
      const alpha = smoothstep(THREAD_LOCK, 1, weakest);
      if (alpha > 0.01) {
        const tint = particles[i].tint;
        ctx.strokeStyle = rgba(frame.optimized ? scene.colours[i] : rampAt(palette.accents, tint), 1);
        // Wide soft pass then a tight bright one. Mobile skips the wide pass:
        // it is a second full sweep for the least visible half of the glow.
        for (const [mul, a] of (frame.optimized ? (full ? FULL_PASSES : LITE_PASSES) : (full ? [[6, 0.055], [2.8, 0.18], [1.4, 0.65]] : [[2.1, 0.5]])) as [number, number][]) {
          ctx.globalAlpha = alpha * a;
          ctx.lineWidth = widthAt(cam, threadWorld * mul, depthSum / (end - i + 1));
          ctx.beginPath();
          ctx.moveTo(projection.x[i % n], projection.y[i % n]);
          for (let k = i + 1; k <= end; k++) ctx.lineTo(projection.x[k % n], projection.y[k % n]);
          ctx.stroke(); calls++;
        }
        // Ivory core.
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = rgba(palette.line, 1);
        ctx.lineWidth = widthAt(cam, threadWorld * 0.55, depthSum / (end - i + 1));
        ctx.beginPath();
        ctx.moveTo(projection.x[i % n], projection.y[i % n]);
        for (let k = i + 1; k <= end; k++) ctx.lineTo(projection.x[k % n], projection.y[k % n]);
        ctx.stroke(); calls++;
      }
    }
    i = end > i ? end : i + 1;
  }
  ctx.globalAlpha = 1;

  // ---- the dots -------------------------------------------------------
  // Loose particles read cool and dim; settled ones warm toward the accent for
  // their radius and brighten, so the field visibly resolves rather than just
  // moving. Drawn over the thread so the line stays beaded with light.
  for (let k = 0; k < n; k++) {
    const depth = projection.depth[k];
    if (depth <= NEAR) continue;
    const particle = particles[k];
    const e = formed[k];
    const r = Math.max(0.5, Math.min(7, (particle.size * (0.65 - e * 0.25) * cam.focal) / depth));
    // Falloff is measured against the CURRENT camera distance, so dots stay
    // legible whether the camera is wide open or closed in.
    const fade = clamp01(1 - depth / (wide * 1.6)) * smoothstep(0.1, 1.5, depth);
    const alpha = (0.55 + 0.3 * e) * fade;
    if (alpha <= 0.012) continue;
    if (frame.optimized && scene.dotAtlas) {
      const sprite = e < .05 ? 128 : Math.round(particle.tint*63) + (e > .9 ? 64 : 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(scene.dotAtlas,(sprite%16)*64,Math.floor(sprite/16)*64,64,64,projection.x[k]-r*4,projection.y[k]-r*4,r*8,r*8);
      calls++;
      continue;
    }
    const colour = e < 0.05 ? palette.dot : frame.optimized ? scene.colours[k] : rampAt(palette.accents, particle.tint);
    // A loose dot glows in its accent; a settled one takes an ivory core so the
    // thread reads as beaded light rather than as a coloured tube.
    const core = e > 0.9 ? palette.line : colour;
    // Halo then core. Two cheap fills beat one radial gradient per particle, and
    // additive blending does the rest where dots crowd together. Kept on every
    // tier: a settled core goes ivory, so without the halo the accent has
    // nothing to ride on and the mobile figure comes out colourless.
    ctx.fillStyle = rgba(colour, alpha * 0.22);
    ctx.beginPath();
    ctx.arc(projection.x[k], projection.y[k], r * 2.6, 0, Math.PI * 2);
    ctx.fill(); calls++;
    ctx.fillStyle = rgba(core, alpha);
    ctx.beginPath();
    ctx.arc(projection.x[k], projection.y[k], r, 0, Math.PI * 2);
    ctx.fill(); calls++;
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // ---- vignette -------------------------------------------------------
  // Drawn last so it sits over the bloom rather than being brightened by it.
  {
    const v = ctx.createRadialGradient(
      width / 2, height * 0.46, Math.min(width, height) * 0.3,
      width / 2, height * 0.46, Math.max(width, height) * 0.8,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height); calls++;
  }
  return calls;
}

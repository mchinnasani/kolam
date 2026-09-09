/**
 * A minimal pinhole camera with a look-at basis.
 *
 * The kolam is a planar curve, so a full scene graph buys nothing. Position,
 * an orthonormal basis and a focal length are enough for true perspective —
 * and projecting the same curve at two different heights is exactly what gives
 * the stroke its raised, extruded appearance as the camera moves.
 *
 * World convention: the pulli plane is z = 0 and +z points up out of it.
 */

export type Vec3 = { x: number; y: number; z: number };

export type Camera = {
  pos: Vec3;
  right: Vec3;
  up: Vec3;
  fwd: Vec3;
  /** Pixels per unit of (world / depth). Derived from the vertical field of view. */
  focal: number;
  cx: number;
  cy: number;
};

/** Anything closer than this is behind or on the lens and must not be drawn. */
export const NEAR = 0.05;

/**
 * @param pitch Radians above the pulli plane. 0 is edge-on, PI/2 is straight down
 *              (degenerate against the world up vector, so callers stay below it).
 * @param yaw   Radians around the plane normal.
 */
export function makeCamera(
  target: Vec3,
  distance: number,
  pitch: number,
  yaw: number,
  fov: number,
  width: number,
  height: number,
): Camera {
  const cp = Math.cos(pitch);
  const pos: Vec3 = {
    x: target.x + distance * cp * Math.cos(yaw),
    y: target.y + distance * cp * Math.sin(yaw),
    z: target.z + distance * Math.sin(pitch),
  };

  let fx = target.x - pos.x;
  let fy = target.y - pos.y;
  let fz = target.z - pos.z;
  const flen = Math.hypot(fx, fy, fz) || 1;
  fx /= flen; fy /= flen; fz /= flen;

  // right = forward x worldUp, with worldUp = (0, 0, 1)
  let rx = fy;
  let ry = -fx;
  const rlen = Math.hypot(rx, ry) || 1;
  rx /= rlen; ry /= rlen;

  // up = right x forward
  const ux = ry * fz;
  const uy = -rx * fz;
  const uz = rx * fy - ry * fx;

  return {
    pos,
    right: { x: rx, y: ry, z: 0 },
    up: { x: ux, y: uy, z: uz },
    fwd: { x: fx, y: fy, z: fz },
    focal: height / 2 / Math.tan(fov / 2),
    cx: width / 2,
    cy: height / 2,
  };
}

/** Scratch space so the render loop never allocates per point. */
export type Projection = {
  x: Float64Array;
  y: Float64Array;
  depth: Float64Array;
};

export function createProjection(capacity: number): Projection {
  return {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    depth: new Float64Array(capacity),
  };
}

/**
 * Project `count` planar points at a constant height, optionally displaced in
 * world XY. The displacement is how the cast shadow is built: it is a world
 * offset, not a screen offset, so it shifts correctly as the camera orbits.
 */
export function projectPlane(
  cam: Camera,
  xs: Float64Array,
  ys: Float64Array,
  count: number,
  z: number,
  offX: number,
  offY: number,
  out: Projection,
) {
  const { pos, right, up, fwd, focal, cx, cy } = cam;
  const dz = z - pos.z;
  for (let i = 0; i < count; i++) {
    const dx = xs[i] + offX - pos.x;
    const dy = ys[i] + offY - pos.y;
    const depth = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    out.depth[i] = depth;
    if (depth <= NEAR) { out.x[i] = 0; out.y[i] = 0; continue; }
    const scale = focal / depth;
    out.x[i] = cx + (dx * right.x + dy * right.y) * scale;
    out.y[i] = cy - (dx * up.x + dy * up.y + dz * up.z) * scale;
  }
}

/** Single-point variant, used for the drawing head. */
export function projectPoint(cam: Camera, x: number, y: number, z: number, offX = 0, offY = 0) {
  const { pos, right, up, fwd, focal, cx, cy } = cam;
  const dx = x + offX - pos.x;
  const dy = y + offY - pos.y;
  const dz = z - pos.z;
  const depth = dx * fwd.x + dy * fwd.y + dz * fwd.z;
  if (depth <= NEAR) return { x: 0, y: 0, depth };
  const scale = focal / depth;
  return {
    x: cx + (dx * right.x + dy * right.y) * scale,
    y: cy - (dx * up.x + dy * up.y + dz * up.z) * scale,
    depth,
  };
}

/**
 * Distance at which a disc of radius `extent` on the plane fills `fraction` of
 * the smaller viewport axis. Keeps the finished kolam framed identically on a
 * phone and an ultrawide.
 */
export function fitDistance(extent: number, fraction: number, fov: number, width: number, height: number) {
  const focal = height / 2 / Math.tan(fov / 2);
  return (extent * focal) / (fraction * Math.min(width, height));
}

/** Allocation-free projection for prepared particle playback. */
export function projectPointInto(cam: Camera, x: number, y: number, z: number, out: {x:number;y:number;depth:number}, offX = 0, offY = 0) {
  const { pos, right, up, fwd, focal, cx, cy } = cam;
  const dx = x + offX - pos.x;
  const dy = y + offY - pos.y;
  const dz = z - pos.z;
  const depth = dx * fwd.x + dy * fwd.y + dz * fwd.z;
  if (depth <= NEAR) { out.x=0;out.y=0;out.depth=depth;return out; }
  const scale = focal / depth;
  out.x = cx + (dx * right.x + dy * right.y) * scale;
  out.y = cy - (dx * up.x + dy * up.y + dz * up.z) * scale;
  out.depth = depth;
  return out;
}

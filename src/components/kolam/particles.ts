/**
 * Ambient motes suspended around the kolam.
 *
 * They exist to give the scene a foreground and a background. Because they are
 * projected through the same camera as the curve, they parallax against it for
 * free — near motes sweep past quickly while far ones barely move, which is
 * what stops the composition reading as one flat plane.
 *
 * Motion is a closed-form function of time rather than an integrated velocity,
 * so a dropped frame or a backgrounded tab can never accumulate drift.
 */

export type Mote = {
  /** Anchor position. The drift orbits this point. */
  x: number; y: number; z: number;
  radius: number;   // drift radius
  speed: number;    // radians per second
  phase: number;
  size: number;     // world-space radius
  tint: number;     // which accent it takes, 0..1
};

export function createMotes(count: number, spread: number, seed = 1): Mote[] {
  // Small deterministic PRNG: the field must be identical across reloads so the
  // scene is reproducible when debugging a frame.
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const motes: Mote[] = [];
  for (let i = 0; i < count; i++) {
    // Square-rooted radius spreads them evenly over the disc rather than
    // clumping them at the centre.
    const angle = rand() * Math.PI * 2;
    const distance = Math.sqrt(rand()) * spread;
    motes.push({
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      z: (rand() * 3 - 0.3) * spread,
      radius: 0.08 + rand() * 0.22,
      speed: 0.05 + rand() * 0.12,
      phase: rand() * Math.PI * 2,
      size: 0.02 + rand() * 0.04,
      tint: rand(),
    });
  }
  return motes;
}

/** Anchor plus a slow elliptical orbit. Writes into `out` to avoid allocating. */
export function moteAt(mote: Mote, seconds: number, out: { x: number; y: number; z: number }) {
  const a = mote.phase + seconds * mote.speed;
  out.x = mote.x + Math.cos(a) * mote.radius;
  out.y = mote.y + Math.sin(a * 0.85) * mote.radius;
  out.z = mote.z + Math.sin(a * 0.6) * mote.radius * 0.4;
}

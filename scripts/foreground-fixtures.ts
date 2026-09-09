import { deflateSync } from "node:zlib";
export type Fixture = {
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  expected: { x: number; y: number; width: number; height: number };
  strategy: string;
};
type Color = [number, number, number];
const mark = (
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: Color | null,
  fg: Color,
  glow = false,
  split = false,
): Fixture => {
  const pixels = new Uint8ClampedArray(width * height * 4),
    truth = new Uint8Array(width * height);
  if (bg) for (let i = 0; i < width * height; i++) pixels.set([...bg, 255], i * 4);
  for (let py = Math.max(0, Math.floor(y - 20)); py < Math.min(height, y + h + 20); py++)
    for (let px = Math.max(0, Math.floor(x - 20)); px < Math.min(width, x + w + 20); px++) {
      const nx = (px + 0.5 - x) / w,
        ny = (py + 0.5 - y) / h;
      let coverage = 0;
      if (split) {
        for (const c of [0.15, 0.5, 0.85]) {
          const d = Math.hypot((nx - c) * w, (ny - 0.5) * h) - Math.min(w * 0.1, h * 0.4);
          coverage = Math.max(coverage, Math.max(0, Math.min(1, 0.5 - d)));
        }
      } else {
        const dx = Math.abs((nx - 0.5) * w),
          dy = Math.abs((ny - 0.5) * h);
        const outer = Math.max(dx - w * 0.5, dy - h * 0.5),
          inner = Math.max(dx - w * 0.28, dy - h * 0.25);
        const d = Math.max(outer, -inner);
        coverage = Math.max(0, Math.min(1, 0.5 - d));
        if (glow && d > 0) coverage = Math.max(coverage, 0.35 * Math.exp((-d * d) / 32));
      }
      if (!coverage) continue;
      const a = Math.round(coverage * 255),
        i = (py * width + px) * 4;
      truth[py * width + px] = a;
      for (let c = 0; c < 3; c++)
        pixels[i + c] = bg ? Math.round(fg[c] * coverage + bg[c] * (1 - coverage)) : fg[c];
      pixels[i + 3] = bg ? 255 : a;
    }
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let i = 0; i < truth.length; i++)
    if (truth[i] >= 3) {
      const x = i % width,
        y = Math.floor(i / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  return {
    name: "",
    width,
    height,
    pixels,
    expected: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 },
    strategy: bg ? "border-color" : "alpha",
  };
};
export function makeFixtures(): Fixture[] {
  const cases: [string, Parameters<typeof mark>][] = [
    ["huge-transparent", [2048, 2048, 934, 944, 180, 160, null, [100, 210, 255]]],
    ["touching-edge", [400, 320, 0, 65, 155, 190, [245, 245, 245], [30, 40, 60]]],
    ["white-transparent", [700, 500, 230, 160, 210, 170, null, [255, 255, 255]]],
    ["black-white", [700, 500, 240, 170, 200, 160, [255, 255, 255], [0, 0, 0]]],
    ["color-black", [620, 420, 180, 120, 240, 170, [0, 0, 0], [200, 55, 150]]],
    ["soft-glow", [700, 500, 255, 175, 175, 150, null, [100, 160, 255], true]],
    ["very-wide", [1000, 350, 90, 135, 820, 65, null, [240, 130, 50]]],
    ["very-tall", [350, 1000, 140, 65, 65, 860, null, [130, 240, 140]]],
    ["disconnected", [800, 400, 140, 130, 510, 130, null, [160, 100, 240], false, true]],
    ["uneven-padding", [970, 810, 63, 515, 265, 165, null, [30, 190, 220]]],
    ["black-transparent", [600, 440, 170, 90, 200, 180, null, [0, 0, 0]]],
    ["close-background", [600, 440, 210, 145, 180, 130, [232, 234, 233], [224, 226, 225]]],
    ["light-dark", [600, 440, 140, 125, 320, 190, [12, 14, 18], [230, 236, 245]]],
  ];
  const result = cases.map(([name, args]) => ({ ...mark(...args), name }));
  const noise = mark(600, 500, 200, 150, 200, 170, null, [140, 230, 210]);
  noise.name = "isolated-noise";
  for (let i = 0; i < 25; i++) {
    const x = 7 + i * 19,
      y = 10 + (i % 3) * 8;
    noise.pixels.set([255, 255, 255, 255], (y * noise.width + x) * 4);
  }
  result.push(noise);
  const translucent = mark(600, 440, 170, 90, 200, 180, [255, 255, 255], [20, 25, 30]);
  translucent.name = "uniform-translucent";
  for (let i = 3; i < translucent.pixels.length; i += 4) translucent.pixels[i] = 160;
  result.push(translucent);
  const faint = mark(600, 440, 170, 90, 200, 180, null, [150, 190, 240]);
  faint.name = "faint-alpha-background";
  for (let i = 3; i < faint.pixels.length; i += 4)
    faint.pixels[i] = Math.round(20 + (faint.pixels[i] * 235) / 255);
  result.push(faint);
  const details = mark(600, 440, 170, 120, 200, 180, null, [200, 160, 230]);
  details.name = "small-detached-detail";
  for (let y = 105; y < 107; y++)
    for (let x = 268; x < 270; x++) details.pixels.set([200, 160, 230, 255], (y * 600 + x) * 4);
  details.expected.y = 105;
  details.expected.height = 195;
  result.push(details);
  let state = 819;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 15 + (state % 420);
  };
  for (let i = 0; i < 4; i++) {
    const left = random(),
      right = random(),
      top = random(),
      bottom = random();
    const f = mark(
      left + 160 + right,
      top + 140 + bottom,
      left,
      top,
      160,
      140,
      null,
      [200, 80, 150],
    );
    f.name = `random-padding-${i + 1}`;
    result.push(f);
  }
  return result;
}
function crc(bytes: Uint8Array) {
  let n = 0xffffffff;
  for (const b of bytes) {
    n ^= b;
    for (let j = 0; j < 8; j++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
/** Small PNG writer for deterministic RGBA fixtures; no image-library dependency. */
export function png(pixels: Uint8ClampedArray, width: number, height: number): Buffer {
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name),
      size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    rows.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

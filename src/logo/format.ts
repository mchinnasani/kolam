/** Portable input to the player. Positions are normalized; a seed recreates each path. */
export type LogoSettings = {
  palette: "original" | "aurora" | "ember" | "ice";
  size: number;
  glow: number;
  twinkle: number;
  duration: number;
};
export type LogoData = {
  version: 1;
  width: number;
  height: number;
  settings: LogoSettings;
  points: number[];
};
export const defaults: LogoSettings = {
  palette: "aurora",
  size: 2.3,
  glow: 0.85,
  twinkle: 0.6,
  duration: 3.5,
};
export const MAX_POINTS = 16000;
export function validateLogo(value: unknown): LogoData {
  const d = value as LogoData;
  if (
    !d ||
    d.version !== 1 ||
    !Number.isInteger(d.width) ||
    !Number.isInteger(d.height) ||
    d.width < 1 ||
    d.height < 1 ||
    d.width > 2048 ||
    d.height > 2048
  )
    throw new Error("Invalid logo dimensions or version.");
  if (
    !Array.isArray(d.points) ||
    !d.points.length ||
    d.points.length % 6 ||
    d.points.length > MAX_POINTS * 6
  )
    throw new Error("Invalid particle count.");
  for (let i = 0; i < d.points.length; i++) {
    const n = d.points[i],
      axis = i % 6;
    if (!Number.isFinite(n) || (axis < 2 ? n < -1 || n > 1 : n < 0 || n > 1))
      throw new Error("Invalid particle values.");
  }
  const s = d.settings;
  if (!s || !["original", "aurora", "ember", "ice"].includes(s.palette))
    throw new Error("Invalid palette.");
  for (const [key, min, max] of [
    ["size", 0.5, 6],
    ["glow", 0, 1],
    ["twinkle", 0, 1],
    ["duration", 1, 10],
  ] as const)
    if (!Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw new Error(`Invalid ${key}.`);
  return d;
}
export async function encodeLogo(data: LogoData): Promise<Uint8Array> {
  validateLogo(data);
  return new Uint8Array(
    await new Response(
      new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
}
export async function decodeLogo(bytes: Uint8Array): Promise<LogoData> {
  if (bytes.byteLength > 5_000_000) throw new Error("Animation file is too large.");
  const reader = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 8_000_000) {
        await reader.cancel();
        throw new Error("Animation expands beyond the supported size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return validateLogo(JSON.parse(new TextDecoder().decode(all)));
}

/** Sample one point per occupied grid cell, preserving the image aspect ratio. */
export function samplePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  spacing: number,
  removeWhite: boolean,
): LogoData {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    pixels.length !== width * height * 4
  )
    throw new Error("Invalid image data.");
  if (!Number.isInteger(spacing) || spacing < 2 || spacing > 24)
    throw new Error("Invalid dot spacing.");
  const points: number[] = [],
    scale = Math.max(width, height);
  for (let cy = 0; cy < height; cy += spacing)
    for (let cx = 0; cx < width; cx += spacing) {
      let weight = 0,
        sx = 0,
        sy = 0,
        red = 0,
        green = 0,
        blue = 0,
        occupied = 0;
      // Alpha-weighted cell centroids keep thin strokes and partial edge cells.
      // Sampling only the center can miss an entire narrow logo component.
      for (let y = cy; y < Math.min(height, cy + spacing); y++)
        for (let x = cx; x < Math.min(width, cx + spacing); x++) {
          const i = (y * width + x) * 4,
            a = pixels[i + 3] / 255;
          if (
            pixels[i + 3] < 3 ||
            (removeWhite && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 235)
          )
            continue;
          weight += a;
          sx += x * a;
          sy += y * a;
          red += pixels[i] * a;
          green += pixels[i + 1] * a;
          blue += pixels[i + 2] * a;
          occupied++;
        }
      if (!occupied) continue;
      points.push(
        Number((((sx / weight - width / 2) / scale) * 2).toFixed(5)),
        Number((((height / 2 - sy / weight) / scale) * 2).toFixed(5)),
        Number((red / weight / 255).toFixed(3)),
        Number((green / weight / 255).toFixed(3)),
        Number((blue / weight / 255).toFixed(3)),
        Number((weight / occupied).toFixed(3)),
      );
    }
  if (!points.length)
    throw new Error(
      "No visible dots found. Try closer spacing or turn off white-background removal.",
    );
  if (points.length / 6 > MAX_POINTS) throw new Error("Too many dots. Increase spacing.");
  return { version: 1, width, height, settings: { ...defaults }, points };
}

/** Prepared cubic control points; unchanged during playback. */
export function prepareLogoPaths(points: number[]): Float32Array {
  const buffer = new Float32Array((points.length / 6) * 8);
  let seed = 713;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0, j = 0; i < points.length; i += 6, j += 8) {
    const angle = random() * Math.PI * 2,
      radius = 1.1 + random() * 1.3;
    const x = points[i],
      y = points[i + 1];
    buffer[j] = Math.cos(angle) * radius;
    buffer[j + 1] = Math.sin(angle) * radius;
    buffer[j + 2] = buffer[j] * 0.8 - y * 0.3;
    buffer[j + 3] = buffer[j + 1] * 0.8 + x * 0.3;
    buffer[j + 4] = x * 1.12 + y * 0.2;
    buffer[j + 5] = y * 1.12 - x * 0.2;
    buffer[j + 6] = x;
    buffer[j + 7] = y;
  }
  return buffer;
}

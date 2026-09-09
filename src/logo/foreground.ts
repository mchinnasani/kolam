export type Bounds = { x: number; y: number; width: number; height: number };
export type ForegroundOptions = { mode?: "auto" | "alpha"; sensitivity?: number };
export type ForegroundInfo = {
  originalWidth: number;
  originalHeight: number;
  bounds: Bounds;
  strategy: "alpha" | "border-color" | "alpha-only";
  background: number[] | null;
  threshold: number;
  foregroundPercent: number;
  components: number;
  removedComponents: number;
  warning: string | null;
};
export type Foreground = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  info: ForegroundInfo;
};
function median(values: number[]) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

/** Deterministic alpha-first segmentation. Does not mutate the input. */
export function extractForeground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: ForegroundOptions = {},
): Foreground {
  const n = width * height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    n > 4_194_304 ||
    pixels.length !== n * 4
  )
    throw new Error("Unsupported image dimensions.");
  const sensitivity = options.sensitivity ?? 1;
  if (!Number.isFinite(sensitivity) || sensitivity < 0.5 || sensitivity > 2)
    throw new Error("Sensitivity must be between 0.5 and 2.");
  const border: number[] = [];
  const step = Math.max(1, Math.floor((width + height) / 4000));
  for (let x = 0; x < width; x += step) {
    border.push(x, (height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += step) {
    border.push(y * width, y * width + width - 1);
  }
  let peakAlpha = 0;
  for (let i = 0; i < n; i++) peakAlpha = Math.max(peakAlpha, pixels[i * 4 + 3]);
  let clearPixels = 0;
  for (let i = 0; i < n; i++) if (pixels[i * 4 + 3] <= Math.max(2, peakAlpha * 0.02)) clearPixels++;
  const borderAlpha = median(border.map((i) => pixels[i * 4 + 3]));
  // Uniform translucency is not an alpha silhouette: estimate its color background.
  const useAlpha =
    options.mode === "alpha" ||
    clearPixels > Math.max(4, n * 0.001) ||
    borderAlpha < peakAlpha * 0.25;
  const alphaFloor =
    options.mode === "alpha" || clearPixels > Math.max(4, n * 0.001) ? 0 : borderAlpha;
  let background: number[] | null = null,
    threshold = 3,
    warning: string | null = null;
  const alpha = new Uint8Array(n);
  if (useAlpha) {
    for (let i = 0; i < n; i++) {
      const a = ((pixels[i * 4 + 3] - alphaFloor) / (255 - alphaFloor)) * 255;
      alpha[i] = a >= 3 ? a : 0;
    }
  } else {
    // The most frequent border color cluster excludes a logo touching one edge.
    const bins = new Map<number, number[]>();
    for (const i of border) {
      const j = i * 4;
      const key = (pixels[j] >> 4) * 256 + (pixels[j + 1] >> 4) * 16 + (pixels[j + 2] >> 4);
      const b = bins.get(key);
      if (b) b.push(i);
      else bins.set(key, [i]);
    }
    let dominant: number[] = [];
    for (const b of bins.values()) if (b.length > dominant.length) dominant = b;
    background = [0, 1, 2].map((c) => median(dominant.map((i) => pixels[i * 4 + c])));
    const distance = (i: number) =>
      Math.hypot(
        pixels[i * 4] - background![0],
        pixels[i * 4 + 1] - background![1],
        pixels[i * 4 + 2] - background![2],
      );
    const distances = border.map(distance);
    const near = distances.filter((v) => v < 24);
    const middle = median([...near]),
      mad = median(near.map((v) => Math.abs(v - middle)));
    threshold = Math.max(1.5, Math.min(14, middle + 3 * mad + 1)) / sensitivity;
    if (near.length < border.length * 0.5)
      warning =
        "The border contains several colors. Check the crop; use Keep image colors if the background is part of the artwork.";
    const high = threshold + Math.max(2, threshold * 0.5);
    for (let i = 0; i < n; i++) {
      const d = distance(i),
        t = Math.max(0, Math.min(1, (d - threshold) / (high - threshold)));
      alpha[i] = Math.round(pixels[i * 4 + 3] * t * t * (3 - 2 * t));
    }
  }
  // Label all eight-connected regions, including weak edge/glow pixels. Filter
  // by area and brightness rather than keeping only the largest region (letters split).
  const labels = new Uint32Array(n),
    queue = new Uint32Array(n);
  const regions: { area: number; mass: number; peak: number }[] = [{ area: 0, mass: 0, peak: 0 }];
  let biggest = 0;
  for (let i = 0; i < n; i++) {
    if (alpha[i] < 3 || labels[i]) continue;
    const id = regions.length;
    let head = 0,
      tail = 1,
      mass = 0,
      peak = 0;
    queue[0] = i;
    labels[i] = id;
    while (head < tail) {
      const p = queue[head++],
        x = p % width,
        y = Math.floor(p / width);
      mass += alpha[p] / 255;
      peak = Math.max(peak, alpha[p]);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height)
            continue;
          const q = p + dy * width + dx;
          if (!labels[q] && alpha[q] >= 3) {
            labels[q] = id;
            queue[tail++] = q;
          }
        }
    }
    regions.push({ area: tail, mass, peak });
    biggest = Math.max(biggest, tail);
  }
  const minArea = 2; // Keep small detached details; reject truly isolated single-pixel specks.
  const keep = regions.map(
    (r, i) => i > 0 && r.area >= minArea && r.peak >= Math.min(16, peakAlpha * 0.5),
  );
  // A legitimately tiny input is allowed; isolated specks around larger artwork aren't.
  if (biggest > 0 && biggest < minArea)
    for (let i = 1; i < regions.length; i++) keep[i] = regions[i].area === biggest;
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    count = 0;
  for (let i = 0; i < n; i++)
    if (keep[labels[i]]) {
      const x = i % width,
        y = Math.floor(i / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      count++;
    }
  if (!count)
    throw new Error("No clear foreground found. Try higher sensitivity or Keep image colors.");
  const bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  // Return the tight masked crop, not a second full-sized canvas.
  const cropped = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++)
    for (let x = 0; x < bounds.width; x++) {
      const from = (y + top) * width + x + left,
        to = (y * bounds.width + x) * 4;
      if (!keep[labels[from]]) continue;
      cropped[to] = pixels[from * 4];
      cropped[to + 1] = pixels[from * 4 + 1];
      cropped[to + 2] = pixels[from * 4 + 2];
      cropped[to + 3] = alpha[from];
    }
  return {
    pixels: cropped,
    width: bounds.width,
    height: bounds.height,
    info: {
      originalWidth: width,
      originalHeight: height,
      bounds,
      strategy: options.mode === "alpha" ? "alpha-only" : useAlpha ? "alpha" : "border-color",
      background,
      threshold,
      foregroundPercent: (count / n) * 100,
      components: keep.filter(Boolean).length,
      removedComponents: regions.length - 1 - keep.filter(Boolean).length,
      warning,
    },
  };
}

/** Pad in object units, then normalize using premultiplied bilinear sampling. */
export function normalizeForeground(foreground: Foreground, padding = 0.06, size = 480) {
  if (
    !Number.isFinite(padding) ||
    padding < 0 ||
    padding > 0.25 ||
    !Number.isInteger(size) ||
    size < 24 ||
    size > 1024
  )
    throw new Error("Invalid normalization settings.");
  const inset = Math.max(foreground.width, foreground.height) * padding;
  const paddedWidth = foreground.width + 2 * inset,
    paddedHeight = foreground.height + 2 * inset;
  const scale = size / Math.max(paddedWidth, paddedHeight);
  const width = Math.max(1, Math.round(paddedWidth * scale)),
    height = Math.max(1, Math.round(paddedHeight * scale));
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = (x + 0.5) / scale - inset - 0.5,
        sy = (y + 0.5) / scale - inset - 0.5,
        x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      let a = 0,
        r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const px = x0 + dx,
            py = y0 + dy;
          if (px < 0 || py < 0 || px >= foreground.width || py >= foreground.height) continue;
          const weight = (dx ? sx - x0 : 1 - sx + x0) * (dy ? sy - y0 : 1 - sy + y0),
            i = (py * foreground.width + px) * 4,
            opacity = (foreground.pixels[i + 3] / 255) * weight;
          a += opacity;
          r += foreground.pixels[i] * opacity;
          g += foreground.pixels[i + 1] * opacity;
          b += foreground.pixels[i + 2] * opacity;
        }
      const i = (y * width + x) * 4;
      if (a > 0) {
        pixels[i] = r / a;
        pixels[i + 1] = g / a;
        pixels[i + 2] = b / a;
        pixels[i + 3] = a * 255;
      }
    }
  return { pixels, width, height, scale, padding };
}

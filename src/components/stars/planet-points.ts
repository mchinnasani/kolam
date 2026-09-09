import type { StarKind } from './StarObject';
type PlanetKind = Exclude<StarKind, 'name'>;
const cache = new Map<string, Promise<Float32Array>>();

/** Validate and expand compact point data once, never inside the animation loop. */
export function decodePlanetPoints(buffer: ArrayBuffer, stride = 1) {
  const view = new DataView(buffer);
  if (view.byteLength < 8 || view.getUint32(0, false) !== 0x4b504c31) throw new Error('Invalid planet data header');
  const count = view.getUint32(4, true);
  if (count > 100000 || view.byteLength !== 8 + count * 12 || ![1, 2].includes(stride)) throw new Error('Invalid planet data length');
  const output = new Float32Array(Math.ceil(count / stride) * 8);
  for (let i = 0, target = 0; i < count; i += stride, target += 8) {
    const offset = 8 + i * 12;
    for (let axis = 0; axis < 3; axis++) output[target + axis] = view.getInt16(offset + axis * 2, true) / 10000;
    for (let channel = 0; channel < 3; channel++) output[target + 3 + channel] = view.getUint8(offset + 6 + channel) / 255;
    output[target + 6] = view.getUint16(offset + 9, true) / 65535;
    output[target + 7] = view.getUint8(offset + 11) / 10;
  }
  return output;
}

export function loadPlanetPoints(kind: PlanetKind, lite: boolean, assetBase = '/planets') {
  const key = `${assetBase}:${kind}:${lite}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch(`${assetBase.replace(/\/$/, "")}/${kind}.points.gz`).then(async response => {
      if (!response.ok) throw new Error(`Planet data request failed (${response.status})`);
      const compressed = await response.arrayBuffer();
      const bytes = new Uint8Array(compressed);
      // Some hosts transparently decode gzip; accept either transport behavior.
      const data = bytes[0] === 0x1f && bytes[1] === 0x8b
        ? await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : compressed;
      return decodePlanetPoints(data, lite ? 2 : 1);
    }).catch(error => { cache.delete(key); throw error; });
    cache.set(key, pending);
  }
  return pending;
}

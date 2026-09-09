/** Reused projected ambient stars: both renderers refer to the same fly-through points. */
export const portalSources = new WeakMap<HTMLElement, { positions: Float32Array; width: number; height: number }>();

'use client';

import { useEffect, useRef } from 'react';
import type { Palette, Rgb } from './renderer';

/**
 * Canvas cannot resolve `var(--kolam-line)`, and the renderer needs numeric
 * channels to interpolate the accent ramp, so the hero's tokens are read off
 * the document and parsed to RGB triples. Keeping them in CSS means the whole
 * scheme stays tunable in `src/space.css` without touching the renderer,
 * and the header's `data-theme` switch is observed so a theme change re-reads
 * rather than being captured once at mount.
 */

const FALLBACK: Palette = {
  line: [246, 241, 232],   // ivory
  accents: [
    [245, 166, 35],        // saffron
    [45, 212, 191],        // teal
    [168, 85, 247],        // violet
  ],
  dot: [236, 197, 122],
  glow: [120, 78, 190],
};

/** #rgb / #rrggbb / #rrggbbaa, or `r g b` / `r, g, b`, to channels. */
function parseRgb(value: string, fallback: Rgb): Rgb {
  const text = value.trim();
  if (!text) return fallback;

  if (text.startsWith('#')) {
    const body = text.slice(1);
    const full = body.length === 3 || body.length === 4
      ? body.slice(0, 3).split('').map(c => c + c).join('')
      : body.slice(0, 6);
    if (full.length !== 6) return fallback;
    const n = Number.parseInt(full, 16);
    if (!Number.isFinite(n)) return fallback;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const parts = text.replace(/[(),]/g, ' ').split(/\s+/).map(Number).filter(Number.isFinite);
  return parts.length >= 3 ? [parts[0], parts[1], parts[2]] : fallback;
}

export function useThemePalette() {
  const palette = useRef<Palette>(FALLBACK);

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: Rgb) => parseRgb(style.getPropertyValue(name), fallback);
      palette.current = {
        line: token('--kolam-line', FALLBACK.line),
        accents: [
          token('--kolam-accent-1', FALLBACK.accents[0]),
          token('--kolam-accent-2', FALLBACK.accents[1]),
          token('--kolam-accent-3', FALLBACK.accents[2]),
        ],
        dot: token('--kolam-dot', FALLBACK.dot),
        glow: token('--kolam-glow', FALLBACK.glow),
      };
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', read);
    return () => { observer.disconnect(); media.removeEventListener('change', read); };
  }, []);

  return palette;
}

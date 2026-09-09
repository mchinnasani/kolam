/** All choreography is scroll-owned. Elapsed time only moves the loose dots. */
export function kolamJourney(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const ease = (from: number, to: number) => {
    const t = Math.max(0, Math.min(1, (p - from) / (to - from)));
    return t * t * (3 - 2 * t);
  };
  return {
    formation: ease(0.12, 0.88),
    travel: ease(0, 0.86),
    revealed: p >= 0.92,
    opacity: 1 - ease(0.88, 0.96) * 0.45,
  };
}

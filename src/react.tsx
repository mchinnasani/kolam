'use client';

import { useCallback, useRef, useState } from 'react';
import KolamScene from './components/kolam/KolamScene';
import StarObject from './components/stars/StarObject';
import StarNavigation, { defaultDestinations, type Destination } from './components/stars/StarNavigation';
import PerformanceDebug from './components/animation/PerformanceDebug';

export type { Destination };
export type SpaceExperienceProps = {
  name?: string;
  caption?: string;
  seed?: string | number;
  destinations?: readonly Destination[];
  assetBase?: string;
  /** Runs after the flight; use this for client-side routing. */
  onNavigate?: (href: string) => void;
  skipHref?: string;
};

/** Place one experience inside your page's main element. */
export function SpaceExperience({ name = 'Your Universe', caption = 'A SMALL UNIVERSE BY', seed, destinations = defaultDestinations, assetBase = '/planets', onNavigate, skipHref = '#content' }: SpaceExperienceProps) {
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);

  return <section className="kolam-hero" data-hero ref={track} data-failed={failed || undefined}>
    <div className="kolam-stage" ref={stage}>
      {!failed && <KolamScene track={track} stage={stage} seed={seed} onFail={onFail} />}
      <div className="kolam-darkness" aria-hidden="true" />
      <div className="kolam-opening">
        <svg className="name-constellation" viewBox="0 0 500 100" fill="none" aria-hidden="true"><path d="M20 72 98 34 176 59 257 20 338 56 413 28 480 66" stroke="currentColor" strokeWidth=".5" />{[[20,72],[98,34],[176,59],[257,20],[338,56],[413,28],[480,66]].map(([x,y]) => <circle key={x} cx={x} cy={y} r={x === 257 ? 2.5 : 1.5} fill="currentColor" />)}</svg>
        <span className="name-caption">{caption}</span>
        <h1 className="star-name"><span className="sr-only">{name}</span><StarObject kind="name" text={name} /></h1>
      </div>
      <div className="arrival-stars" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ left: `${(i * 37.7 + 7) % 100}%`, top: `${(i * 23.3 + 13) % 100}%`, animationDelay: `${i % 7}s` }} />)}</div>
      <a className="kolam-skip" href={skipHref}>Skip animation ↘</a>
      <p className="kolam-hint" aria-hidden="true"><span />Scroll to enter</p>
      <StarNavigation destinations={destinations} assetBase={assetBase} onNavigate={onNavigate} />
      <PerformanceDebug />
      <div className="kolam-progress" aria-hidden="true"><span /></div>
    </div>
  </section>;
}

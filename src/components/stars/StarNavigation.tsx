'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { FlightOrigin, StarKind } from './StarObject';
import PlanetObject from './PlanetObject';


export type Destination = { kind: Exclude<StarKind, 'name'>; label: string; subtitle?: string; href: string };
export const defaultDestinations: readonly Destination[] = [
  { kind: 'about', label: 'About me', subtitle: '01 / THE PERSON', href: '/?page=about' },
  { kind: 'projects', label: 'Projects', subtitle: '02 / THE WORK', href: '/?page=projects' },
  { kind: 'interests', label: 'Interests', subtitle: '03 / THE CURIOSITY', href: '/?page=interests' },
] as const;
type Flight = { kind: Exclude<StarKind, 'name'>; href: string; origin: FlightOrigin };

export default function StarNavigation({ destinations = defaultDestinations, assetBase = '/planets', onNavigate }: { destinations?: readonly Destination[]; assetBase?: string; onNavigate?: (href: string) => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const finish = useCallback(() => {
    if (flight) {
      if (onNavigate) { onNavigate(flight.href); setFlight(null); }
      else window.location.assign(flight.href);
    }
  }, [flight, onNavigate]);
  useEffect(() => {
    if (!flight) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.querySelectorAll<HTMLElement>('main, header, footer, .skip-link')).map(element => ({element, inert: element.inert}));
    background.forEach(({element}) => { element.inert = true; });
    cancel.current?.focus();
    const restored = (event: PageTransitionEvent) => { if (event.persisted) setFlight(null); };
    window.addEventListener('pageshow', restored);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFlight(null);
      if (event.key === 'Tab') { event.preventDefault(); cancel.current?.focus(); }
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previous;
      background.forEach(({element, inert}) => { element.inert = inert; });
      focused?.focus({preventScroll: true});
      window.removeEventListener('keydown', escape); window.removeEventListener('pageshow', restored);
    };
  }, [flight]);
  function enter(event: MouseEvent<HTMLAnchorElement>, kind: Exclude<StarKind, 'name'>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (onNavigate) { event.preventDefault(); onNavigate(href); }
      return;
    }
    event.preventDefault();
    if (flight) return;
    const bounds = event.currentTarget.querySelector('.planet-orb')!.getBoundingClientRect();
    setFlight({ kind, href, origin: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, radius: bounds.width * (kind === 'projects' ? .193 : .279) } });
  }
  return <>
    <nav className="kolam-overlay planet-navigation permanent-planets" aria-label="Explore">
      {destinations.map(destination => <a key={destination.kind} className={`planet-destination planet-${destination.kind}`} href={destination.href} aria-label={destination.label}
        onMouseEnter={() => setActive(destination.kind)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(destination.kind)} onBlur={() => setActive(null)}
        onClick={event => enter(event, destination.kind, destination.href)}>
        <span className="planet-orb"><PlanetObject kind={destination.kind} active={active === destination.kind} assetBase={assetBase} /></span>
        <span className="planet-label"><small>{destination.subtitle}</small><span>{destination.label} <span aria-hidden="true">↗</span></span></span>
      </a>)}
      <p className="planet-invitation">A few worlds to explore.</p>
    </nav>
    {flight && createPortal(<dialog open className="star-flight" aria-modal="true" aria-label={`Traveling to ${flight.kind}`}>
      <div className="flight-streaks" aria-hidden="true">{Array.from({length: 42}, (_,i) => <i key={i} style={{rotate: `${i * 137.5}deg`, animationDelay: `${(i % 9) * .07}s`}} />)}</div>
      <PlanetObject kind={flight.kind} origin={flight.origin} onFinish={finish} assetBase={assetBase} />
      <button ref={cancel} className="flight-cancel" onClick={() => setFlight(null)}>Cancel flight</button>
    </dialog>, document.body)}
  </>;
}

import { createRoot } from 'react-dom/client';
import { SpaceExperience } from '../src/react';
import { generateRadialKolam, kolamToSvg } from '../src';
import '../src/space.css';

const params = new URLSearchParams(location.search);
const seed = params.get('seed') ?? 'kolam';
const page = params.get('page');
const titles: Record<string, string> = { about: 'About', projects: 'Projects', interests: 'Interests' };
function download() {
  const svg = kolamToSvg(generateRadialKolam({ seed, rings: 4, spokes: 6, symmetric: true }));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'kolam.svg'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
createRoot(document.getElementById('root')!).render(
  <main>
    {page && titles[page] ? <article className="destination">
      <a href="/">← Back to the universe</a>
      <h1>{titles[page]}</h1>
      <p>This is a demo destination. Point the planet at your own page, or use the navigation callback with your router.</p>
    </article> : <>
      <SpaceExperience name="Your Universe" seed={seed} />
      <article id="content">
        <h2>One scene, three destinations.</h2>
        <p>Scroll through the stars, watch the kolam form, then follow a planet. The name, labels, and destinations are yours to change.</p>
        <p>The pattern and motion paths are prepared once. Scroll controls their playback in both directions.</p>
        <button onClick={download}>Download a kolam as SVG</button>
      </article>
    </>}
  </main>
);

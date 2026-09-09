# Kolam — making a space animation lighter

My portfolio animation was lagging my laptop. This repo contains the code I used to cut down the work it does: convert planet maps into compact point files, prepare particle motion paths once, and stop redrawing parts of the scene that have settled.

The demo is a field of stars that forms a kolam and three clickable particle planets. The main project is how that animation runs without rebuilding everything every frame.

## What changed

**Smaller planet files.** I moved image sampling into a Python conversion script. It saves positions, colors, and a few animation attributes in 12-byte records, then compresses them. All three planet files total **643,284 bytes (about 628 KiB)**. The browser loads these directly instead of processing the original surface maps.

**Prepared movement.** Each kolam particle gets a path with 65 stored positions. Scroll progress picks a point along that path, in either direction. The planet shaders use prepared bend and timing values too. The scene still projects and draws particles while moving; it no longer needs to rebuild their paths.

**Less repeated drawing.** Small glowing dot graphics are cached and reused. Once the kolam settles, its canvas keeps the last image until an interaction changes it. Formed planets use small canvases instead of three full-screen ones. Background renderers pause during a flight, and hidden or offscreen scenes stop requesting frames.

Smaller downloads help loading. Doing less work per frame addresses the lag. Prepared paths use extra memory—about **1.25 MB for 1,600 particles**—to avoid repeated calculations. This is not a claim that total memory use dropped.

## Results

In repeated tests on my laptop, measured rendering CPU time fell by about **59%**.

| Measure | Before | After |
| --- | --- | --- |
| Average rendering CPU time | 2.55–2.58 ms | 1.03–1.06 ms |
| Average frame interval | About 8.53 ms | About 8.33 ms |
| Peak drawing submissions in a measured frame | 4,967 | 2,646 |

These are measurements from the original portfolio on one machine, not a new benchmark of this extracted package. CPU time measures JavaScript drawing submissions, not GPU execution. FPS changed only slightly because the display was already near its refresh limit. [Raw results and test conditions](docs/portfolio-benchmark.json).

## Start with the code

| Part | Code |
| --- | --- |
| Convert maps into compressed planet points | [bake-planets.py](scripts/bake-planets.py) |
| Validate, decode, and cache the point files | [planet-points.ts](src/components/stars/planet-points.ts) |
| Prepare paths once and sample them during scrolling | [motion-paths.ts](src/components/animation/motion-paths.ts) |
| Cache dot sprites and reuse drawing buffers | [renderer.ts](src/components/kolam/renderer.ts) |
| Keep the settled kolam still; wake it on interaction | [KolamScene.tsx](src/components/kolam/KolamScene.tsx) |
| Draw rotating planets and switch to smaller canvases | [PlanetObject.tsx](src/components/stars/PlanetObject.tsx) |
| Run formation and twinkle on the GPU | [planet-shaders.ts](src/components/stars/planet-shaders.ts) |
| Measure performance and compare playback modes | [PerformanceDebug.tsx](src/components/animation/PerformanceDebug.tsx) |

[How I built it](docs/how-it-works.md) explains the decisions. [The planet data format](docs/planet-data.md) explains the conversion and how to run it again.

The full demo uses React, Canvas 2D, and WebGL. Names, labels, and destinations are configurable so the same work can be reused in another site. The kolam generator also exports SVGs for documents.

## Try it

Use Node 22.18 or newer.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Scroll down to form the kolam and back up to unwind it. Add `?seed=your-name` to repeat a particular pattern. Click a planet to try a flight, or press Escape to cancel. The demo includes simple destination pages. At the bottom, download a kolam as an SVG for a document or design.

## Use it in another project

This is a private source repo, not an npm release. Build it locally first:

```sh
npm run build
```

Then install this directory from your other project:

```sh
npm install /absolute/path/to/kolam
```

The full scene is a React component. Import its CSS and place it inside your page's `main` element:

```tsx
import { SpaceExperience } from '@mchinnasani/kolam/react';
import '@mchinnasani/kolam/space.css';

export default function Home() {
  return <main>
    <SpaceExperience
      name="Your Name"
      caption="A SMALL UNIVERSE BY"
      seed="my-project"
      assetBase="/planets"
      skipHref="#content"
      destinations={[
        { kind: 'about', label: 'About', subtitle: '01 / THE PERSON', href: '/about' },
        { kind: 'projects', label: 'Work', subtitle: '02 / THE WORK', href: '/projects' },
        { kind: 'interests', label: 'Ideas', subtitle: '03 / THE CURIOSITY', href: '/ideas' },
      ]}
    />
    <section id="content">Your page content</section>
  </main>;
}
```

Copy this repo's three `public/planets/*.points.gz` files and `credits.txt` into your site's `public/planets` directory. They are about 628 KiB combined. `assetBase` can point to another directory. The demo already serves them. The JPG source maps are only needed if you want to rebuild the point files.

Keep the page background black and remove the default body margin. The CSS preserves the original scene layout. Use one full experience per page; its scroll and flight lifecycle are designed around a full-viewport hero. The component belongs in a client boundary in frameworks that use server components.

By default, the flight ends with normal navigation to `href`. For a client router, pass `onNavigate={(href) => router.push(href)}`. Links still support keyboard use and opening in a new tab. Reduced-motion users get the settled scene and direct navigation. Your destination page owns its content and arrival styling; the demo uses a short fade-in.

The three `kind` values select the artwork and its original position: `about` is Earth, `projects` is Saturn, and `interests` is the violet planet. Supply one entry for each. Labels and URLs are independent of those names. Name lettering uses a system font sampled into stars at setup.

## Use just the kolam

```js
import { mountKolam } from '@mchinnasani/kolam';

const player = mountKolam(canvas, { track, seed: 'my-project' });
// When removing the component:
// player.destroy();
```

Give `canvas` a width and height in CSS. `track` is a tall section (for example, `height: 760svh`) with the canvas inside a sticky `100svh` stage. For a slider, omit `track` and call `player.setProgress(value)` with a number from 0 to 1. `pause()` stops drawing, `resume()` continues, and `destroy()` removes observers and listeners.

The kolam-only options are `seed`, `rings`, `particles`, `motes`, `palette`, `track`, and `maxDpr`. Defaults use 1,600 formation particles and 220 background motes on desktop, or 620 and 90 on small screens and coarse pointers. Resizing does not regenerate the pattern. Reduced-motion users see the completed pattern.

## Generate a static pattern

```js
import { generateRadialKolam, kolamToSvg } from '@mchinnasani/kolam';

const pattern = generateRadialKolam({ seed: 'report-cover', rings: 4 });
const svg = kolamToSvg(pattern);
```

Save `svg` to a file or use it in a browser. This produces a vector line drawing, not a screenshot of the glowing particles. `generateKolam({ seed, n: 5, shape: 'square' })` generates a square grid instead; `shape: 'diamond'` is also supported.

## How it works

1. Generate a seeded dot layout and connect its loops into one closed path.
2. Sample the curve to place particles along it.
3. Prepare 65 positions along each particle's route into the pattern.
4. Map scroll progress to a position between two stored points.
5. Draw the particles through a perspective camera. Keep the finished canvas until something changes.

The stored data describes motion paths, not full frames. Ambient drift still uses time. Colored particle sprites are cached so the renderer can reuse them. Hidden and offscreen scenes pause; sustained slow frames lower the drawing resolution.

Planet surfaces are converted from maps into compressed point data before the site runs. The browser uploads that data once, then shaders handle formation, rotation, shading, and twinkle. See [the planet format and converter](docs/planet-data.md).

Read [how I built it](docs/how-it-works.md) for the longer explanation and tradeoffs.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run build:demo
```

Tests cover seeded generation, closed paths, malformed patterns, camera projection, prepared-path accuracy, reverse playback, and planet data decoding. Test tolerances check the prepared paths against the original equations.

Extracted from [my portfolio](https://github.com/mchinnasani/portfolio), starting at commit `1af7ae9`. The portfolio keeps its own copy, so changes here do not automatically update it. No npm package has been published. Code is currently private; the planet source maps and derived color data retain their [CC BY 4.0 attribution](public/planets/credits.txt).

## Performance view

Open `/?perf=1` to see FPS, frame interval, drawing CPU time, draw submissions, particle count, and pixel ratio. `/?seed=performance-check&perf=1&benchmark=1` runs a repeatable forward/backward scroll test. Add `&animation=baseline` to compare the original drawing path. These controls are off by default and do not send data anywhere.

# Kolam

**Turn your logo into vibrant, glowing dots.**

Upload a PNG, SVG, JPG, or WebP. Adjust the palette, dot spacing, glow, and twinkle. Watch the dots gather into your logo, scrub the animation backward, then download it.

[Open the studio](https://mchinnasani.github.io/kolam/)

Everything is converted in your browser. There is no upload server, account, or API key.

## What you get

- **Interactive HTML:** one file with the animation and player included. Open it offline or embed it in an iframe.
- **`.kolam` animation:** compressed particle positions, colors, and settings. Load it with the player or import it back into the studio.
- **PNG:** a still image of the current preview on its dark background.

The editor supports files up to 8 MB and samples images at up to 480 pixels along their longest side. Transparent logos work best. For logos on white, try “Remove near-white background.” This removes all near-white pixels, including any white details you want to keep, so leave it off when those details matter. SVGs are rasterized before sampling; fine details depend on dot spacing.

## Run it locally

Use Node 22.18 or newer.

```sh
git clone https://github.com/mchinnasani/kolam.git
cd kolam
npm install
npm run dev
```

The standalone player is built automatically before the dev server starts.

```sh
npm test
npm run typecheck
npm run build
npm run build:demo
```

`dist/` contains the importable library. `demo-dist/` is the static studio, ready for hosting. GitHub Actions builds and deploys the studio to GitHub Pages.

## Use the animation on your website

The easiest option is the downloaded HTML:

```html
<iframe src="/particle-logo.html" title="Animated logo"
  style="width:100%;height:600px;border:0"></iframe>
```

For more control, build the repo and copy `public/logo-player.js` plus your downloaded `logo.kolam` file into your site:

```html
<canvas id="logo" role="img" aria-label="Animated logo"
  style="width:100%;height:500px;display:block"></canvas>
<script src="/logo-player.js"></script>
<script>
(async () => {
  const response = await fetch('/logo.kolam');
  if (!response.ok) throw new Error('Could not load logo');
  const data = await KolamLogo.decodeLogo(new Uint8Array(await response.arrayBuffer()));
  const player = new KolamLogo.LogoPlayer(document.querySelector('#logo'));
  player.load(data);
  player.play();
  // player.seek(0.5) controls formation from 0 to 1.
  // player.destroy() cleans up when removing the canvas.
})();
</script>
```

To connect it to scroll, calculate progress for your section and pass a clamped number from 0 to 1 to `player.seek(progress)`. The same paths work in either direction. For a bundler, build this repo, install the local directory, and import `LogoPlayer` and `decodeLogo` from `@mchinnasani/kolam/logo`. The player does not depend on React; only the studio does. This package is not published on npm.

## How it works

I started this because the particle animation on my portfolio was making my laptop lag. The useful part was separating setup from playback. This tool applies that idea to logos people can bring themselves.

1. **Sample once.** Decode the image into a small canvas. Each occupied grid cell becomes a dot, keeping its position, color, and transparency.
2. **Save the shape.** Round those values and gzip the data with the settings. A `.kolam` file is versioned JSON inside gzip, not a video or a sequence of rendered frames.
3. **Prepare the routes.** At load time, a fixed seed gives every dot a start position and two control points leading to its destination. The routes live in GPU buffers.
4. **Play the paths.** A shader evaluates the prepared curves using one progress value. Changing color or glow updates settings, not geometry. Rotation is not part of the logo player; the earlier planet example has its own renderer.
5. **Draw only while needed.** The player uses one point draw per active frame, caps pixel ratio, and lowers resolution after sustained slow frames. Hidden and offscreen canvases pause. With twinkle off, a completed logo stops requesting frames until you interact.

This does not make every image file smaller. A small SVG or PNG can be smaller than the animation it produces. The point is reusable, interactive motion with less repeated setup work. The studio reports the compressed file size and the two GPU point buffers; that buffer number is not total browser memory. The HTML export also includes the player and base64 encoding overhead.

## Where the code lives

| Part | File |
| --- | --- |
| Pixel sampling, validation, compression, prepared paths | [format.ts](src/logo/format.ts) |
| Independent WebGL player | [player.ts](src/logo/player.ts) |
| Upload interface, controls, and exports | [main.tsx](demo/main.tsx) |
| Player bundle entry | [standalone.ts](src/logo/standalone.ts) |
| Conversion and round-trip tests | [logo.test.ts](tests/logo.test.ts) |

The earlier stars → kolam → planets experience remains in `src/components` and the `@mchinnasani/kolam/react` entry. Its [original write-up](docs/how-it-works.md), [planet converter](docs/planet-data.md), and [portfolio benchmarks](docs/portfolio-benchmark.json) are kept as background. Those 59% CPU savings were measured on the old portfolio, **not this new logo converter**. No cross-device speedup is claimed here.

## Compatibility and reuse

Use a modern browser with WebGL, `CompressionStream`, and `DecompressionStream`. The tool respects reduced motion for automatic playback; manual scrubbing stays available. If WebGL is unavailable, it explains the problem instead of pretending the preview succeeded.

Code is under the [MIT license](LICENSE). The older planet maps and derived color data retain their separate [CC BY 4.0 credits](public/planets/credits.txt). Logos you import are yours; this project does not grant rights to third-party logos.

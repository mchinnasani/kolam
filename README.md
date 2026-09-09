# Kolam

**Turn a logo into glowing, interactive particles for your website.**

Upload a PNG, SVG, JPG, or WebP. Pick your colors, adjust the glow and flow, then download an animation you can embed on your site.

[Try the studio →](https://mchinnasani.github.io/kolam/)

## The problem

My portfolio’s particle animation was making my laptop lag. Recalculating thousands of particle positions during playback meant doing the same setup work over and over. I wanted to keep the look while reducing that work—and let other people use their own logos.

## The solution

Kolam finds the visible logo, removes empty margins, and converts it into colored points. It prepares each point’s motion path once. During playback, the GPU follows those paths using a single progress value.

The result is a floating logo in a star field, with flowing dots and cursor interaction. The player draws the logo and stars together in one draw call per active frame. It pauses when hidden or offscreen, and stops drawing a finished logo when flow is turned off.

## Why it matters

You get an interactive visual without processing the source image or rebuilding particle paths every frame. The animation stores the shape and settings, rather than a sequence of full image frames.

There are two different results here:

| Scope | Result |
| --- | --- |
| Original portfolio optimization | Average JavaScript render-submission time fell from **2.57 ms to 1.04 ms**, about **59% less** in the recorded runs. |
| Current logo player | **One draw call** per active frame. Prepared paths and colors use **52 bytes per point**, plus about **33 KB** for the background stars. |

For example, 2,000 logo dots plus the stars use about **134 KiB of GPU point buffers**. That is buffer storage, not total browser memory or a measured memory saving.

The 59% result belongs to the original portfolio, not this converter or total laptop CPU usage. We haven’t measured a CPU savings percentage for the current studio. This is also not a PNG compressor: a small PNG can be smaller and cheaper to display than an animated export.

[Recorded benchmark and limitations](docs/portfolio-benchmark.json) · [How the player works](docs/studio-guide.md)

## Use it

1. Upload your logo. Empty margins are cropped automatically.
2. Adjust the colors, glow, and flow. Try **Enter space** for the full-screen view.
3. Download **interactive HTML** to embed on your website, a reusable **.kolam** file, or a still **PNG**.

Everything runs in your browser. Your image stays on your device.

## Run locally

Use Node 22.18 or newer.

```sh
npm install
npm run dev
```

[Setup and embedding](docs/studio-guide.md) · [Image detection tests](docs/foreground-extraction.md)

[MIT license](LICENSE). Older planet assets have [separate credits](public/planets/credits.txt).

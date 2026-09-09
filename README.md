# Kolam

**Turn a PNG into glowing, flowing dots for your website.**

Upload a logo, pick your colors, and watch stars gather into its shape. Add glow and movement, then download an animation you can use on your own site. SVG, JPG, and WebP work too.

[Try it here →](https://mchinnasani.github.io/kolam/)

## Why I built it

My portfolio’s particle animation was making my laptop lag. I wanted the same feel with less repeated work, and a way for anyone to use their own logo.

Kolam reads the image once, finds the actual logo, and turns it into colored points. It prepares their motion paths ahead of playback, then lets the GPU animate them together. It pauses when hidden and stops drawing a settled logo when flow is off.

The goal is a cooler, interactive website visual without rebuilding thousands of particles every frame. It isn’t a PNG compressor: the exported animation can be larger than the original image.

## Use it

1. Upload your logo. Empty margins are cropped automatically.
2. Adjust the colors, glow, and flow. Try **Enter space** for the full-screen view.
3. Download **interactive HTML** and embed it on your website. You can also save a `.kolam` animation or a still PNG.

Everything runs in your browser. Your image stays on your device.

## Run locally

Use Node 22.18 or newer.

```sh
npm install
npm run dev
```

[Setup, embedding, and how it works](docs/studio-guide.md) · [Image detection tests](docs/foreground-extraction.md)

[MIT license](LICENSE). Older planet assets have [separate credits](public/planets/credits.txt).

# Finding the logo inside an image

A PNG can be mostly empty space. Resizing that whole file made small logos look tiny, and treating opaque backgrounds as content produced a sheet of dots. The converter now finds the object first.

## Pipeline

1. Decode the image. Keep its resolution for analysis up to 4 megapixels, with a 4096-pixel side limit.
2. Analyze in a worker. A transparent silhouette takes priority over color, so white and black marks both survive. Uniform translucency alone is not treated as a silhouette.
3. For opaque images, estimate the background from the dominant border color cluster. Set a color-distance threshold using the border median and median absolute deviation. Blend the cutoff smoothly to preserve soft edges.
4. Label eight-connected regions. Keep disconnected letters and small details; remove isolated single-pixel specks around larger artwork. Combine the retained regions into one tight bounding box.
5. Add padding in object units, then resize with premultiplied-alpha interpolation. This preserves aspect ratio and avoids dark fringes from transparent pixels.
6. Sample occupied grid cells using alpha-weighted positions and colors. Partial cells count, so narrow marks do not disappear between grid centers.

This work happens when the image or extraction settings change, not during animation playback. No external service or vision model is used.

## Reproduce the checks

Run `npm test`. The foreground tests generate 21 PNG fixtures and write the source, a red bounding-box overlay, normalized crop, particle raster, and numerical report to `artifacts/foreground/`. That directory is ignored by Git.

Cases cover huge transparent margins, an edge-touching mark, white on transparent, black on white, color on black, glow, wide and tall marks, disconnected elements, uneven padding, black on transparent, low contrast, light on dark, isolated noise, uniform translucency, faint alpha backgrounds, a tiny detached detail, and four seeded random padding arrangements.

Tests compare detected and expected bounds, verify particle aspect ratio, centering and edge clearance, and check that disconnected parts and soft alpha survive. Empty input must report an error rather than generate a rectangle. A JPEG regression fixture includes real compression artifacts; its allowed bound difference is four pixels.

The first pass caught a tall-logo failure: the crop was right, but center-only grid sampling made the particle result too narrow. Sampling the occupied pixels inside each cell fixed it. All 21 generated cases were also rendered with the actual WebGL player and inspected in a browser, including the wide, tall, and disconnected shapes. The upload flow was checked separately with the large transparent fixture and the JPEG.

## Controls and limits

Image framing details show original and analyzed dimensions, bounds, normalized dimensions, foreground percentage, detection strategy, and scale. Padding controls the space around the object. Sensitivity adjusts background separation. Keep image colors bypasses color removal while respecting transparency.

Background estimation assumes a reasonably consistent border. Photographs, textured backgrounds, marks covering most of the border, or nearly identical foreground and background colors can be ambiguous. Check the preview and use the controls in those cases. Large inputs are downsampled before analysis to bound memory use, so subpixel details can be lost. JPEG compression can leave a few edge pixels; the detector preserves those soft edges instead of aggressively cutting into the logo.

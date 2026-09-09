# How I built it

I wanted the kolam on my portfolio to form from the stars you were already moving through. Scrolling needed to control the whole sequence, including going backward.

The first version did too much work while drawing. I separated the work needed to build the scene from the work needed to play it.

## The pattern

The generator starts with dots arranged on a square, diamond, or radial grid. Each dot begins with its own small loop. Gates join separate loops until they form one continuous circuit. The radial version can repeat the connections around its center to make a symmetric pattern.

A seed controls the choices. The same seed and options give the same result, which makes bugs easier to reproduce and lets me reuse a pattern later. The verifier checks that the path closes and that the dot and curve relationships satisfy the generator's checks. This is a procedural interpretation of kolam, not a claim that it covers every traditional design.

## The motion

The curve is sampled into particle destinations. Each particle also has a starting point, a delay, and a route toward its destination.

At setup, I sample that route into 65 points and store them in a typed array. During scrolling, the renderer finds the two neighboring points and interpolates between them. It still projects and draws the particles each active frame, but it does not rebuild their routes.

At 1,600 particles, those paths use about 1.25 MB. More samples would follow the original curve more closely but use more memory. Tests keep the error under 0.02 world units for the sampled cases.

Scroll owns formation and camera travel. Time only drives the loose particles' drift. That means scrolling backward returns to the same formation state, even though the ambient stars keep moving.

## The drawing

The kolam uses Canvas 2D. A perspective projection gives the dots depth before they are drawn. A cached sprite sheet holds the small colored dots and their bright centers, so those shapes do not have to be constructed again for every particle.

Once the scene settles, the canvas keeps its last image. Scrolling, pointer movement, or resizing wakes it. Hidden tabs and offscreen canvases stop requesting frames. On slower devices, the player can lower its pixel resolution while keeping the same pattern.

## The planets

Earth needs recognizable land and oceans; random colored dots do not do that. I use source maps to assign colors to points on a sphere. The conversion script runs before the browser does. It also creates cloud and atmosphere points, Saturn's rings, and a violet color treatment for the third planet.

The result is a small compressed point file for each planet. The browser decodes it once and uploads a buffer. No JPG is drawn as a planet surface. A shader moves the points in 3D, shades them, and adds subtle twinkle.

During the handoff, the planets' points start from the projected stars in the existing scene. Each point has prepared bend and timing values. Scroll changes the progress; the GPU follows those values toward the planet surface. After formation, each planet switches to a small canvas instead of drawing across the whole screen.

Clicking a planet opens a flight layer. The background pauses while the selected planet grows toward the camera. The flight ends at the configured link. Escape cancels it and restores the original scene.

## What improved

In repeated tests of the original portfolio, the optimization reduced measured rendering CPU time from about 2.55–2.58 ms to 1.03–1.06 ms. Average frame interval went from about 8.53 ms to 8.33 ms on that machine.

Those measurements came from the full portfolio, including its planets and name animation. They are not benchmarks of this extracted package or a promise about every laptop. The CPU measure counts JavaScript drawing submissions, not GPU execution. The frame interval barely changed because the display was already running near its refresh limit.

## Reusing it

The kolam generator and Canvas renderer have no React dependency. The full space scene has a separate React entry point. `mountKolam` supplies the browser lifecycle: scrolling, resizing, pointer input, reduced motion, and cleanup. A site can also call the lower-level drawing functions and supply its own progress.

The SVG exporter is useful when the result needs to go into a document. It exports the underlying line pattern. The particle glow and space animation stay in the browser.

The separate repo keeps the full visual sequence, but the name, planet labels, and destination links are configurable. My portfolio content stays in the portfolio. I can check changes in the demo before bringing them into another site.

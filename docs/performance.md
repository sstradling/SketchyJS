# Performance and caching

Generation is a pure function of the shape, the options, and the seed. The same inputs return the same operations. There is no process-wide drawing cache in this library. Callers who draw the same scene often should keep the `Scene` value and render it again.

## What does not change generation

`interiorShades` are painted after generation. Adding or replacing them does not move `Options.seed` and does not change fill or stroke paths. A cache key you build yourself should omit `interiorShades`.

`SilhouetteShadow` never enters `generateDrawing`. It has no seed. `@sketchy-js/sketchy/scene/silhouette` is a separate entry so the basic import does not carry it.

Contour drift changes the centerlines and the cache key of a generator that includes `contourDrift`. It does not re-roll the slot wobble: each slot's roughness seed is `mix(seed, slot)`, isolated from the outline stream. A full period returns the same strokes. The outline stays put.

## What is expensive

- Contour and wash emit one rough curve per stroke. `fillSpacing` below 1 on a large shape can produce hundreds of curves. The host drops a fill that exceeds 200,000 operations and reports `fill-max-ops`.
- Crayon stamps ellipses along the stroke. A closed ring with a thickness profile scales those stamps. It does not add a second random sequence.
- Stickers that union many shapes pay for the silhouette walk. Clipper is only on `@sketchy-js/sketchy/stickers/clipper` and is not on the Darwin contour path.
- Interior-shade blur is a filter or `shadowBlur` at paint time. It does not add geometry.

## Workers

A worker renderer was measured and deferred. On 48 hachure rectangles at 640×480, seed 42, spacing 2, generation takes 18.36 ms and painting the already built scene takes 3.35 ms. A `worker_threads` paint was 4.37 ms, slower than painting on the main thread. The cost that matters is generation, and moving paint off thread does not help. Do not add WebGL for these scenes.

## Bundles

Import `@sketchy-js/sketchy/scene/basic` when you do not need stickers. Import `@sketchy-js/sketchy/fills/contour` or `@sketchy-js/sketchy/fills/wash` only if you register fills yourself. React imports the SVG scene and not the canvas renderer. Ceilings are in [phase-4.md](phase-4.md).

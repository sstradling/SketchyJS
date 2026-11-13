# Phase 2 status: canvas, advanced strokes, and animation

Scope: the Phase 2 section of [`plan.md`](plan.md), plus scribble fill. Reference: Sketchy v1.5.0 (`fb17a6e`). Darwin fixtures are the oracle. Reference images under `fixtures/swift-reference/v1.5.0/images/` are the accepted upstream copies and were not regenerated.

## Deliverables

| Deliverable | Where | State |
| --- | --- | --- |
| Canvas 2D renderer for the scene IR: fills, native strokes (cap, join, miter), clips, inverse clips | `@sketchy-js/canvas-renderer` | Done |
| SVG and Canvas opacity-mask groups (variable opacity, faintest-first, tinted once) | both renderers | Done |
| Uniform stroke outlines matching CoreGraphics for butt/round/square caps and miter/round/bevel joins | `@sketchy-js/core` `nativePolylineOutline` | Done, Darwin `strokes/outlines.json` |
| Adaptive Bézier sampling, stroke-to-fill, tips, thickness profiles, width stops, curved bevel | `@sketchy-js/core` `strokeToOutline` | Done. Curved bevel matches the Darwin outline, including Float line storage and double arc cubics |
| Variable-opacity ribbons | `@sketchy-js/core` `opacityRibbon` | Done. Scene layers carry `mask.group` |
| Crayon halo, core, and grit passes | `@sketchy-js/brushes/crayon` `defineBrush` | Done. The Darwin crayon line (seed 42, width 10) replays: 4 passes, same operation counts, coordinates within `1e-4` px |
| Scribble fill | `@sketchy-js/fills/scribble` `defineFill` | Done. All 9 Darwin scribble cases match. Polygons and SVG paths are clipped to the fill region |
| Deterministic animation frames | `@sketchy-js/animate` `generateFrame` | Done. Both Darwin frame cases (`circle-medium`, `rectangle-low`) replay |
| Browser animation controller | `createAnimation` | Done. `resize` cancels the scheduled frame before installing the new precomputed frames |
| Watercolor stroke (body, broken rim, granules, feathers) | `@sketchy-js/brushes/watercolor` `defineBrush` id `watercolor` | Done. Darwin rectangle and ellipse strokes replay within `1e-4` px |
| Watercolor fill (glazes, edge dabs, backruns, interior grain) | `@sketchy-js/brushes/watercolor` `defineFill` id `watercolor` | Done. Clipped to the jittered solid outline. Darwin fill paths replay within `1e-4` px |

### Request routing

```
view.with(opts).draw(shape).build(size)
  -> buildScene
     -> resolveSketchOptions
     -> fill plugin (scribble included in scene/basic)
     -> generateDrawing
     -> assembleDrawing
          stroke / fill layers
          curved bevel, variable width, calligraphic tip -> strokeToOutline (filled paths)
          varying opacity -> opacityRibbon mask pieces
     -> if watercolor is registered and brushProfile.watercolor is set
          applyWatercolor -> watercolor brush generate -> glaze fill layers
     -> if crayon is registered and brushProfile.crayon is set
          applyCrayon -> crayon plugin generate -> wax fill layers
renderToSvgString(scene) | renderToCanvas(scene, ctx)
generateFrame(scene, { steps, variance, seed }, index)
createAnimation(scene, config, { onFrame, host }).resize(nextScene)
```

`scene/basic` does not register crayon or watercolor, so a basic import stays under the 42 KB ceiling. Register them with `basicSketchy.use(crayon)` or `basicSketchy.use(watercolor).use(watercolorFill)`.

## Exit criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| SVG and Canvas geometry tests share the same scene fixtures | Met for the scenes both renderers paint | `canvas-renderer/test/geometry.test.ts` builds one scene and checks the canvas records one paint call per SVG `<path>`. Curved bevel is a fill in both. Previews are side by side under `docs/examples/phase-2/` |
| Visual deltas within agreed limits | Met | `canvas-renderer/test/pixels.test.ts`. A pixel differs when any RGBA channel differs by more than 24. At most 3% of pixels may differ. The scenes cover clips, inverse clips (both fill rules), mask groups, crayon, scribble, watercolor, nested transforms, and a 2× device-pixel scale. Upstream PNGs were not compared |
| Brush seed fixtures replay | Met | `brushes/test/crayon.test.ts` replays `crayonLine`. `brushes/test/watercolor-parity.test.ts` replays `watercolorRectangle` and `watercolorEllipseFill` (stroke alphas and fill paths, max delta ≤ `1e-4`) |
| Animation seed fixtures replay | Met | `animate/test/frames.test.ts`, both Darwin cases, max delta ≤ `1e-4` |
| Scribble fixtures replay | Met | `scene/test/scribble-parity.test.ts`, 9/9 Darwin cases. Linux and Darwin scribble files are identical |

## Test results

`pnpm test`: 34 files, 651 tests, all passing (Phase 1 reported 590).

New coverage: native stroke outlines (5 Darwin cases), curved-bevel stroke-to-fill, scribble (9), crayon line, watercolor rectangle and ellipse, animation frames (2) plus resize cancellation, canvas/SVG shared scenes.

## Bundle sizes (minified, gzip, `pnpm size`)

Ceilings, not bands. Under the ceiling passes.

| Entry | Gzip | Ceiling |
| --- | ---: | ---: |
| Basic SVG scene (`scene/basic` + svg-renderer) | 31.4 KB | 42 KB |
| `@sketchy-js/core` | 17.2 KB | 18 KB |
| `@sketchy-js/fills` (10 fills, including scribble) | 8.8 KB | 12 KB |
| `@sketchy-js/svg-renderer` | 2.0 KB | 9 KB |
| `@sketchy-js/canvas-renderer` | 2.1 KB | 12 KB |
| `@sketchy-js/brushes` (crayon + watercolor brush and fill) | 14.1 KB | 20 KB |
| `@sketchy-js/animate` frame generator | 0.7 KB | none set |
| `@sketchy-js/animate` `createAnimation` | 1.0 KB | none set |
| `@sketchy-js/brushes/crayon` | 3.6 KB | none set |
| One fill plugin (hachure) | 2.9 KB | none set |

## Preview images

Side-by-side SVG raster and Canvas, 220×160 scenes:

| Preview | Paths |
| --- | --- |
| Scribble rectangle | `docs/examples/phase-2/scribble.svg`, `scribble.png` |
| Curved bevel polyline | `docs/examples/phase-2/curved-bevel.svg`, `curved-bevel.png` |
| Crayon curve (seed 42) | `docs/examples/phase-2/crayon.svg`, `crayon.png` |
| Watercolor rectangle (seed 42) | `docs/examples/phase-2/watercolor.svg`, `watercolor.png` |
| Animation frames 0–2 (5% variance, seed 42) | `docs/examples/phase-2/animation-0.svg` … `animation-2.png` |

Regenerate with `node scripts/phase-2-previews.mjs` after `pnpm build`. That script uses `@napi-rs/canvas` and `@resvg/resvg-js` (dev dependencies).

## Decisions applied

1. Unseeded drawings stay on seed 1.
2. Scribble fill is in Phase 2 and is a `defineFill` plugin registered by `scene/basic`.
3. Darwin remains the oracle for concave sunburst and starburst. Scribble happens to be identical on Linux and Darwin.
4. The frame-sized builder (`rectangle()` filling a view) stays deferred.
5. 42 KB gzip is a ceiling for the basic SVG scene. `pnpm size` fails only when an entry is over its ceiling.
6. Plugin API 1.1 is folded into 1.0. `PLUGIN_API_VERSION` is `{ major: 1, minor: 0 }`. Built-in fills, scribble, crayon, and watercolor declare `api: "1.0"`. `FillRegion.shape`, `GeometryKit.rough`, `FillBase.strokeWidth`, `FillBase.pattern`, `PluginMeta.paints`, and `BrushInput.seed` are part of that 1.0. An area fill may also set `clipPath` to clip to a path it generated.

## Intentional differences from Swift

- Standard uniform strokes (miter, round, bevel) stay native SVG/Canvas strokes. The filled CoreGraphics outline is available as `nativePolylineOutline` and matches the Darwin fixture, but the renderers do not expand those strokes into fills.
- A clear fill (alpha 0) is not passed through crayon. Visible fill strokes are.
- Crayon does not add the extra corner wax Swift stamps when a sampled turn is at least 0.45 rad. That gap is accepted for now. The Darwin crayon curve has no such corner, and that fixture matches without it.
- Crayon and watercolor are dispatched by plugin id in the scene host. That is temporary until any registered `defineBrush` is applied the same way.
- An explicit crayon `seed` of 1 is seed 1. It does not inherit the drawing seed. Watercolor's default seed of 1 still yields to the drawing seed, matching `WatercolorStyle.defaultSeed`.
- Scribble on a rectangle is clipped to the rectangle. The ink is inside the clip, so the picture matches; the SVG carries a `clipPath` Swift omits for rectangles.
- Watercolor fill commands in the Darwin fixture have alpha 0 because `Options.fill` defaults to clear, and the glaze opacity is multiplied into that color. The scene stores the glaze opacity on the layer and the fill color separately, so a clear fill stays clear and an opaque fill shows the wash. An SVG `path()` runs the wash of that path (`FillShape` kind `"path"`), without the solid-fill jitter rectangles and ellipses use.
- Canvas `stroke` and `fill` paints use the context's current `strokeStyle` or `fillStyle`. That is the canvas stand-in for SVG `currentColor`.
- `createAnimation` takes an injected `AnimationHost` in tests. In a browser it uses `requestAnimationFrame`. It does not ship the 600/300/100 ms timers itself; `ANIMATION_SPEED_MS` exports those durations for the caller.

## Open

1. Crayon corner wax for turns of at least 0.45 rad stays unported. Accepted for now.
2. General `defineBrush` hosting. Crayon and watercolor are still selected by id.
3. The frame-sized builder remains deferred. No new API decision is required unless that convenience should move into a later phase explicitly.

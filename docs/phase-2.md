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
| Watercolor stroke body, broken rim, and granules | `@sketchy-js/brushes` `watercolorStrokePieces` | Partial. Finite and deterministic. Does not yet replay `brushes/crayon-watercolor.json` |
| Watercolor fill (edge dabs, backruns, interior grain) | — | Not done |

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
     -> if crayon is registered and brushProfile.crayon is set
          applyCrayon -> crayon plugin generate -> wax fill layers
renderToSvgString(scene) | renderToCanvas(scene, ctx)
generateFrame(scene, { steps, variance, seed }, index)
createAnimation(scene, config, { onFrame, host }).resize(nextScene)
```

`scene/basic` does not register crayon or watercolor, so a basic import stays under the 42 KB ceiling. Register crayon with `basicSketchy.use(crayon)` (or `createSketchy().use(...)`).

## Exit criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| SVG and Canvas geometry tests share the same scene fixtures | Met for the scenes both renderers paint | `canvas-renderer/test/geometry.test.ts` builds one scene and checks the canvas records one paint call per SVG `<path>`. Curved bevel is a fill in both. Previews are side by side under `docs/examples/phase-2/` |
| Visual deltas within agreed limits | Met for the preview set | SVG and Canvas rasters of the same scene match to the eye (same paths, different rasterizers). No new pixel threshold beyond the `1e-4` px geometry gate. Upstream PNGs were not compared; they stay the accepted copies |
| Brush seed fixtures replay | Met for crayon. Not met for watercolor | `brushes/test/crayon.test.ts` replays `crayonLine` (4 commands, max delta ≤ `1e-4`). Watercolor rectangle and ellipse commands are not compared yet |
| Animation seed fixtures replay | Met | `animate/test/frames.test.ts`, both Darwin cases, max delta ≤ `1e-4` |
| Scribble fixtures replay | Met | `scene/test/scribble-parity.test.ts`, 9/9 Darwin cases. Linux and Darwin scribble files are identical |

## Test results

`pnpm test`: 29 files, 612 tests, all passing (Phase 1 reported 590).

New coverage: native stroke outlines (5 Darwin cases), curved-bevel stroke-to-fill, scribble (9), crayon line, animation frames (2) plus resize cancellation, canvas/SVG shared scenes.

## Bundle sizes (minified, gzip, `pnpm size`)

Ceilings, not bands. Under the ceiling passes.

| Entry | Gzip | Ceiling |
| --- | ---: | ---: |
| Basic SVG scene (`scene/basic` + svg-renderer) | 30.5 KB | 42 KB |
| `@sketchy-js/core` | 17.2 KB | 18 KB |
| `@sketchy-js/fills` (10 fills, including scribble) | 8.8 KB | 12 KB |
| `@sketchy-js/svg-renderer` | 2.0 KB | 9 KB |
| `@sketchy-js/canvas-renderer` | 1.4 KB | 12 KB |
| `@sketchy-js/brushes` (crayon + watercolor stroke) | 8.6 KB | 20 KB |
| `@sketchy-js/animate` frame generator | 0.7 KB | none set |
| One fill plugin (hachure) | 2.9 KB | none set |

## Preview images

Side-by-side SVG raster and Canvas, 220×160 scenes:

| Preview | Paths |
| --- | --- |
| Scribble rectangle | `docs/examples/phase-2/scribble.svg`, `scribble.png` |
| Curved bevel polyline | `docs/examples/phase-2/curved-bevel.svg`, `curved-bevel.png` |
| Crayon curve (seed 42) | `docs/examples/phase-2/crayon.svg`, `crayon.png` |
| Animation frames 0–2 (5% variance, seed 42) | `docs/examples/phase-2/animation-0.svg` … `animation-2.png` |

Regenerate with `node scripts/phase-2-previews.mjs` after `pnpm build`. That script uses `@napi-rs/canvas` and `@resvg/resvg-js` (dev dependencies).

## Decisions applied

1. Unseeded drawings stay on seed 1.
2. Scribble fill is in Phase 2 and is a `defineFill` plugin registered by `scene/basic`.
3. Darwin remains the oracle for concave sunburst and starburst. Scribble happens to be identical on Linux and Darwin.
4. The frame-sized builder (`rectangle()` filling a view) stays deferred.
5. 42 KB gzip is a ceiling for the basic SVG scene. `pnpm size` fails only when an entry is over its ceiling.
6. Plugin API 1.1 is folded into 1.0. `PLUGIN_API_VERSION` is `{ major: 1, minor: 0 }`. Built-in fills, scribble, and crayon declare `api: "1.0"`. `FillRegion.shape`, `GeometryKit.rough`, `FillBase.strokeWidth`, `FillBase.pattern`, `PluginMeta.paints`, and `BrushInput.seed` are part of that 1.0.

## Intentional differences from Swift

- Standard uniform strokes (miter, round, bevel) stay native SVG/Canvas strokes. The filled CoreGraphics outline is available as `nativePolylineOutline` and matches the Darwin fixture, but the renderers do not expand those strokes into fills.
- A clear fill (alpha 0) is not passed through crayon. Visible fill strokes are.
- Crayon does not yet add the extra corner wax Swift stamps when a sampled turn is at least 0.45 rad. The Darwin crayon curve has no such corner, and that fixture matches without it.
- Scribble on a rectangle is clipped to the rectangle. The ink is inside the clip, so the picture matches; the SVG carries a `clipPath` Swift omits for rectangles.
- Watercolor does not yet follow pinned-corner smoothing, feathers, or the fill (edge dabs, backruns, grain). The stroke wash that is implemented is the smoothed body, the broken rim, and granules.
- `createAnimation` takes an injected `AnimationHost` in tests. In a browser it uses `requestAnimationFrame`. It does not ship the 600/300/100 ms timers itself; `ANIMATION_SPEED_MS` exports those durations for the caller.

## Open

1. Finish watercolor so `watercolorRectangle` and `watercolorEllipseFill` replay the Darwin commands, then register a `watercolor` brush and a `watercolor` fill plugin the same way crayon is registered.
2. Stamp crayon corner wax for sharp sampled turns, and add a fixture that has one.
3. The frame-sized builder remains deferred. No new API decision is required unless that convenience should move into a later phase explicitly.

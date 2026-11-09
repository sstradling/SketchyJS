# Phase 1 status: core shapes, basic fills, SVG

Scope: the Phase 1 section of [`plan.md`](plan.md). Phase 2 work (Canvas, brushes, animation, scribble, watercolor) is not started.
Reference: Sketchy v1.5.0 (`fb17a6e`), compared through the fixtures in `fixtures/swift-reference/v1.5.0/`.

## Deliverables

| Deliverable                                                                                  | Where                                                           | State |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----- |
| Shape values: line, rectangle, ellipse, circle, linearPath, polygon, arc, curve, roundedRectangle, egg, path | `@sketchy-js/core` (`shapes/`)                                  | Done  |
| Continuous (default) and legacy outlines, seeds, roughness, bowing, randomness offset        | `@sketchy-js/core` (`rough/`, `generate/`)                      | Done  |
| SVG path parser including arcs, arc-to-cubic conversion, SVG outline passes                  | `@sketchy-js/core` (`svg/`, `generate/svg-outline.ts`)          | Done  |
| Fill padding, offset and fill angle geometry (`FillGeometry`)                                | `@sketchy-js/core` (`fill/geometry.ts`)                         | Done  |
| Fills: solid, hachure, cross-hatch, dots, dashed, zigzag, zigzag-line, sunburst, starburst   | `@sketchy-js/fills` (one `defineFill` plugin and subpath each)  | Done  |
| Scene assembly: fill/stroke layers, stroke alignment, SVG fit, clips, fill spacing passes    | `@sketchy-js/scene`                                             | Done  |
| Plugin registry (`createSketchy`, immutable `use`, aliases, direct plugin objects)           | `@sketchy-js/scene`                                             | Done  |
| SVG string and DOM renderer (normal fill, stroke, clip, inverse clip)                        | `@sketchy-js/svg-renderer`                                      | Done  |
| Compact builder (`RoughView`) and functional API (`sketch`, `sketchScene`, `generateDrawing`) | `@sketchy-js/scene`, `@sketchy-js/scene/basic`, `@sketchy-js/core` | Done  |

Not in Phase 1 and reported through scene `diagnostics` when requested: scribble and watercolor fills (`fill-style-unsupported`), brush profiles (`brush-unsupported`), sticker backing (`sticker-unsupported`).

### Request routing

```
view.with(opts).draw(shape).build(size)  |  sketch(shape, size, opts)
  -> buildScene                           (scene/build.ts)
     -> resolveSketchOptions              (core/options/resolve.ts)   Swift clamps and Float rounding
     -> registry.resolveSpec("fill")      (scene/registry.ts)         built-in or custom fill plugin
     -> generateDrawing(shape, o, stage)  (core/generate)             one seeded stream per drawing
          fill stage -> plugin.generate   (fills/*, scene/fill-stage) shares the stream, Swift draw order
          outline    -> rough/continuous | rough/legacy
     -> assembleDrawing                   (scene/assemble.ts)         layers, SVG fit, alignment, clips
  -> Scene (JSON)
renderToSvgString(scene) | renderToSvgElement(scene)                  (svg-renderer)
```

## Parity results

The oracle is the Darwin fixture set (`darwin/`). Every comparison checks structure first (same number of sets, same operation kinds in the same order) and applies the `1e-4` px tolerance only afterwards.

| Fixture group (Darwin)                            | Cases                       | Operations compared | Structure | Max delta (px) | Test file                                       |
| ------------------------------------------------- | --------------------------- | ------------------- | --------- | -------------- | ----------------------------------------------- |
| `shapes/shapes.json` (continuous and legacy)      | 28 / 28                     | 699                 | exact     | 7.5e-6         | `scene/test/shapes-parity.test.ts`              |
| `fills/fills.json` (shape plus fill)              | 32 / 32                     | 18,998              | exact     | 4.9e-5         | `scene/test/fills-parity.test.ts`               |
| `fills/direct-fillers.json` (filler on a polygon) | 27 / 27                     | 14,020              | exact     | 3.4e-5         | `scene/test/direct-fillers-parity.test.ts`      |
| `svg/path-parse.json` `parse`                     | 24 / 24                     | commands            | exact     | 1e-4 gate      | `core/test/svg-parity.test.ts`                  |
| `svg/path-parse.json` `arcConversion`             | 11 / 11                     | cubics              | exact     | 1e-4 gate      | `core/test/svg-parity.test.ts`                  |
| `rng/`, `options/`                                | Phase 0 tests, still passing | -                   | exact     | -              | `core/test/{splitmix64,rng,swift-random,options}.test.ts` |

Notes:

- The `fills.json` and `direct-fillers.json` groups include the radial fills of the concave polygon. Both pass against Darwin.
- `fills/scribble.json` and the brush, sticker, text and animation groups belong to later phases.
- Reference images are accepted upstream copies. Nothing renders pixels in Phase 1, so no image comparison exists yet.

### Sunburst and starburst oracle policy

Phase 0 found that sunburst and starburst fills of the concave polygon have 320 operations on Linux and 316 on Darwin. Both of those fills are Phase 1 scope, so the policy is:

1. **Darwin is canonical.** It is Apple's `libm` behavior, which is what Sketchy ships on. TypeScript reproduces it exactly, including the 316-operation concave case.
2. **Cause, verified by running upstream code.** The Starburst filler walks rays from the centroid and keeps polygon crossings found by `LineHelper.intersection`, which accepts a crossing when the value is within a `1e-5` margin of the segment. Ray endpoints come from `cosf` and `sinf`. On Linux, glibc 2.39 returns a `sinf` or `cosf` value one `Float` ulp away from the correctly rounded result for 5 of the 82 rays of this polygon. For ray 54, that moves the end point by 8 ulps in x (`1092328480` on Darwin and in TypeScript, `1092328488` on Linux), which flips the `inRange` test for a crossing at a polygon vertex. Linux therefore draws one more ray: 4 more operations, 320 against 316. I reproduced this by building the pinned upstream engine with a real Swift 6.0.3 toolchain on Ubuntu 24.04 and printing per-ray values; the printed `cos`/`sin` bit patterns differ from correctly rounded doubles rounded to `Float` in exactly those rays.
3. **Dedicated assertions, no tolerance.**
   - `scene/test/sunburst-oracle.test.ts`: TypeScript matches Darwin for every sunburst/starburst case; the Linux baseline has exactly 4 more operations for the concave cases (all four of them) and the same count for the rectangle and ellipse cases; the documented 316/320 counts hold.
   - `fills/test/line-helper.test.ts`: the literal Darwin and Linux ray-54 end points (as bit patterns) produce zero and one in-bounds crossings, which pins the mechanism.
4. **Not emulated.** The Linux topology is not reproduced by an option or flag. A future Linux oracle would need a `sinf`/`cosf` implementation matching glibc, which would make TypeScript output platform dependent.

### Bug the real Swift toolchain exposed

The first sunburst failures were not libm. Swift's `Float.pi` is `0x40490fda` (3.1415925), truncated, whereas `Math.fround(Math.PI)` is `0x40490fdb`. Every ray angle `Float(i) * 2 * Float.pi / Float(n)` was one ulp off for some `i`, which for a ray almost parallel to an axis changes a slope by a factor of about 10^6 and moves hits by several pixels (the direct star case was 6 px off). The earlier tolerance-level agreement of the shape fixtures hid the same one-ulp constant. `PI` in `core/src/f32.ts` and `fills/src/internal/f32.ts` is now the literal `3.1415925025939941`, with a test (`core/test/f32.test.ts`).

## Plan exit criteria

| Criterion                                                                                            | Status  | Evidence                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| All primitive operation fixtures pass                                                                | Met     | Shapes 28/28, fills 32/32, direct fillers 27/27 (Darwin)                                                                     |
| All SVG arc operation fixtures pass                                                                  | Met     | `arcConversion` 11/11, `parse` 24/24, plus SVG outline and SVG fills in `shapes.json`/`fills.json`                          |
| SVG output demonstrates the README/Examples primitives and fills                                     | Met     | `docs/examples/phase-1/{primitives,fills,svg-path}.svg`, golden-checked by `svg-renderer/test/examples.test.ts`              |
| Basic import stays inside the agreed size target (28-42 KB gzip)                                     | Met (under) | `pnpm size`: 22.8 KB gzip for `scene/basic` plus `svg-renderer`. The plan band is 28-42 KB, so the result is below it, not inside it. The CI step fails only above 42 KB. |
| Clean clone passes `lint`, `typecheck`, `test`, `build`, `smoke:exports` (and `format:check`)        | Met     | See the command table below                                                                                                  |

Per-package size against the plan estimates (minified, gzip, `pnpm size`): core 11.4 KB (12-18), fills 6.8 KB (7-12), svg-renderer 1.8 KB (5-9), one fill plugin 2.9 KB. All are below their estimates, so estimates were conservative. The `basic` entry registers all nine fills; an application that builds its own registry from `@sketchy-js/fills/<name>` subpaths pays only for those.

## Test results

| Suite                                              | Tests |
| -------------------------------------------------- | ----- |
| Phase 0 baseline (after merging the macOS fixtures) | 196   |
| `core`                                             | 159   |
| `fills`                                            | 6     |
| `plugin`                                           | 39    |
| `scene`                                            | 272   |
| `svg-renderer`                                     | 46    |
| `types`                                            | 29    |
| `tools/*`                                          | 25    |
| **Total**                                          | **576** (22 files) |

The 196 Phase 0 tests still pass. New tests: parity (shapes, fills, direct fillers, SVG parse and arcs, sunburst oracle), independent math (`Float.pi`, fill geometry, geometry kit, generator order and determinism, SVG fit, transforms, stroke alignment, option resolution, registry), plugin conformance for all nine fills (edge regions, angles, determinism, `Math.random` guard, huge and tiny gaps, metadata), and integration tests (shapes to scene to SVG, builder and functional parity, SVG import clipping, golden example sheets).

## Naming parity

Sketchy configures a `RoughView` with one modifier per option and sizes shapes to the view's frame. SketchyJS has no frame, so shapes carry coordinates and options go through one `with` call. Option names match Swift `Options` fields except where noted.

| Sketchy (Swift)                                  | SketchyJS builder                                    | SketchyJS functional                                 | Difference                                                                 |
| ------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `RoughView()`                                    | `new RoughView()` from `@sketchy-js/scene/basic`; `createSketchy().use(...).view()` | -                                                    | The core `RoughView` takes a registry; `basic` pre-registers the nine fills |
| `.rectangle()`, `.circle()`, `.egg(tilt:)`, `.roundedRectangle(cornerRadius:)` (auto-sized) | `.draw(rectangle(x, y, w, h))`, `circle(cx, cy, d)`, `egg(cx, cy, w, h, tilt)`, `roundedRectangle(x, y, w, h, r)` | same constructors from `@sketchy-js/core`            | Explicit geometry instead of frame-sized shapes. Ellipse, circle, arc and egg are center-positioned, rectangles top-left, as in Swift `Drawable` |
| `Line`, `Ellipse`, `LinearPath`, `Polygon`, `Arc`, `Curve`, SVG path | `line`, `ellipse`, `linearPath`, `polygon`, `arc`, `curve`, `path(d)` | same                                                 | Values, not structs                                                        |
| `.fill(Color)` / `.stroke(Color)`                | `with({ fillColor })` / `with({ strokeColor })`      | options of `sketch(...)`                             | Renamed to match the `Options` field names; colors are CSS strings or `[r, g, b, a]` tuples |
| `.fillStyle(.sunBurst)` etc.                     | `with({ fillStyle: "sunBurst" })`                    | same                                                 | Camel-case string names equal the Swift case names                         |
| `.seed(42)` (`nil` by default)                   | `with({ seed: 42n })`                                | `{ seed: 42n }`                                      | `bigint`. Unseeded drawings use seed 1 (see deviations)                    |
| `.strokeOpacity`, `.fillOpacity`                 | `with({ strokeOpacity })`, `with({ fillOpacity })`   | same                                                 | The stored `Options` value (0 to 1); the README's 0-100 is the modifier's scale |
| `.fillSpacing`, `.fillAngle`, `.fillPadding`, `.fillOffset(x:y:)`, `.fillWeight`, `.fillSpacingPattern` | same names; `fillOffset: { x, y }`                   | same                                                 | `fillOffset` is a `Point` instead of `CGSize`                              |
| `.svgFillStrokeAlignment`, `.svgFillWeight`, `.svgStrokeWidth` | same names                                           | same                                                 | -                                                                          |
| `.strokeContinuity(.continuous / .legacy)`       | `with({ strokeContinuity: "continuous" })`           | same                                                 | String union                                                               |
| Result builder / `body`                          | `build(size)` returns a serializable `Scene`         | `sketch(shapes, size, options)` returns a `Scene`    | Rendering is a separate step (`renderToSvgString`, `renderToSvgElement`)   |
| Chained modifiers mutate a copy                  | Every `with`/`draw` returns a new immutable view     | -                                                    | A shape keeps the options in effect when it was drawn                      |
| Fills chosen by enum                             | `with({ fill: plugin.with({...}) })` or `{ kind: "id", ... }` | `sketch(..., { fill })`                              | Additive: custom fill plugins use the same path as built-ins               |

## Deviations from the plan and from Swift

1. **Plugin API 1.0 to 1.1.** The Swift fills draw with the shape's own `RoughMath` helpers and random stream, so a plugin that only received polygons could not reproduce them. 1.1 adds `FillRegion.shape` (exact ellipse or arc), `GeometryKit.rough` (seeded line drawing bound to the shared stream), `FillBase.strokeWidth` and `PluginMeta.paints` (`"area"` for solid, which Sketchy emits before it consumes randomness). It is a minor, additive change; the plugin conformance helpers and the four `define*` functions are unchanged.
2. **Scene type additions.** `ClipDescriptor.inverse` (outside stroke alignment) and `DrawLayer.cap`, `join`, `miterLimit`. Both schemas regenerate (`packages/types/schemas/scene.schema.json`). They are optional fields.
3. **Built-in fill ids are camelCase** (`sunBurst`, `crossHatch`, `zigzagLine`, `starBurst`) so the id equals the `FillStyle` name and registry lookup needs no mapping. The plugin id pattern accepts them.
4. **Unseeded drawings are deterministic.** Swift picks a new random seed on a cache miss. Core uses seed 1 (`DEFAULT_STYLE_SEED`) so scene building has no hidden randomness. Decision needed (below).
5. **Fills are always generated.** As in Swift's generator, a fill style produces operations even when the fill color is clear; the renderer paints transparent strokes. This costs time and bytes for unfilled shapes.
6. **SVG fit comes from the first set that carries path text.** Sketchy fits the whole drawing from that path; the port keeps the quirk, including identity for a zero-width or zero-height control-point box and a canvas clamped to at least 1 x 1.
7. **Fill stage passes one ring.** `FillRegion` can describe holes, but the Swift generators fill one polygon, so conformance cases with holes are not exercised yet.
8. **SVG renderer limits.** `fill` and `stroke` paint references render as `currentColor` (the scene builder only emits `solid` paints in Phase 1); `paper` uses the `background` option or white; `curvedBevel` joins render as `round`; inverse clips use a mask covering from minus ten to plus twenty canvas sizes, so they are not meant for content farther from the canvas than that.
9. **Namespaces removed from the core index.** `legacyRough` and `continuousRough` were not used by any package and defeated tree shaking (a `SplitMix64` import pulled 11 KB). They are internal.
10. **Float emulation.** Every Swift `Float` operation is rounded with `Math.fround`; `sin`, `cos`, `tan` are computed in double and rounded. No fused multiply-add is used (neither reference platform fuses on x86_64).

Housekeeping: `tools/clipper-bench/results/results.json` was reformatted so `pnpm format:check` passes (it failed on the Phase 0 branch).

## Open risks

- **Linux libm.** Concave radial fills cannot match a Linux oracle without emulating glibc `sinf`/`cosf`. If CI compares to Linux fixtures later, expect the same 4-operation difference. Any other fill that produces a vertex-grazing ray on some platform has the same exposure.
- **Float32 fidelity far from the origin.** Operation counts can legitimately change when a shape is translated far from the origin (the `Float` grid is 0.0625 px at 1e6), as in Swift. Region cases at 1e6 are checked for finiteness, not for count stability.
- **Example sheets are golden files** that depend on V8's `Math.sin`/`cos` agreeing across Node 22 and 24 after rounding to `Float`. It has held locally; CI on both versions is the check.
- **`basic` registers all nine fills.** Selective registries are small, but the default entry cannot shed unused fills.
- **Scribble has no phase owner.** The plan lists it as a fill style but neither Phase 1 nor Phase 2 names it. `FillStyle` includes it, the renderer reports `fill-style-unsupported`, and a fixture (`fills/scribble.json`) exists.
- **Reference images are not compared** because nothing rasterizes yet.
- **Operation-count budget.** A 0.1 px gap on a 60 px square is within the 200,000-operation cap; larger regions drop the part with a `fill-max-ops` diagnostic rather than failing.

## Decisions needed

1. Should unseeded drawings stay deterministic (seed 1), or draw a random seed per build like Swift, with the seed recorded in the scene?
2. Which phase owns scribble? Phase 2 (with watercolor and crayon, which share the renderer-side stroke code) is the lowest-risk choice.
3. Accept Darwin-canonical for radial fills and treat the Linux 320-operation baseline as informational, or invest in a glibc `sinf`/`cosf` port for a Linux oracle?
4. Provide frame-sized convenience (`rectangle()` filling a view) in the builder, or keep explicit geometry only?
5. Keep the 28-42 KB estimate as a band, or restate it as a ceiling now that the measured size is 22.8 KB?
6. Ship plugin API 1.1 as the first public version, or fold the additions into a retroactive 1.0 before anything is published?

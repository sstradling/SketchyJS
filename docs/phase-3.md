# Phase 3 status: stickers and groups

Scope: the Phase 3 section of [plan.md](plan.md), plus the pixel-test tightening Seth asked for before sticker work. Reference: Sketchy v1.5.0 (`fb17a6e`). Darwin output is canonical. Sticker and group contours are the accepted fixtures in `fixtures/swift-reference/v1.5.0/stickers/`. They were not regenerated.

Plugin API stays **1.0**. Package versions stay `0.0.0` in this PR. The version policy is [versioning.md](versioning.md).

## Step 0 — pixel limits

`packages/canvas-renderer/test/pixels.test.ts` no longer uses one 3% / delta-24 limit.

| Scene | Channel delta | Max fraction | Why |
| --- | --- | --- | --- |
| Geometric (fills, clips, strokes, transforms, quadratics) | 24 | 0.4% (about 0.2%) | A round cap measures up to 0.31% from antialiasing on an 80×60 scene. 0.4% leaves a couple of pixels of raster noise. |
| Watercolor and crayon | 4 | 2% | Delta 4 is below an alpha of 0.2, so a faint glaze is not hidden inside the old delta of 24. |
| Scribble | 24 | 3% | The Phase 2 limit. Scribble is a dense field of short overlapping strokes; resvg and Canvas antialias the crossings differently even when the paths match. |

New scenes: a clip with a same-winding hole, even-odd and nonzero fills of overlapping subpaths, butt / round / square caps with miter / round / bevel / curved-bevel joins, and a filled quadratic.

Planted Canvas bugs, run locally, then reverted (`packages/canvas-renderer/src/render.ts` has no leftover edits from this check):

| Planted bug | Test that failed |
| --- | --- |
| Even-odd clip ignored (always nonzero) | punches a hole with an even-odd clip |
| Transform translated by 1 px | matches nested transforms at 1× and 2× |
| Caps forced to butt | matches butt, round, and square caps and every join |
| Fill forced to nonzero | matches an even-odd fill of overlapping subpaths |
| Quadratic flattened to a line | matches a quadratic curve |

Each bug failed only its own scene. The other scenes stayed inside their limits.

## What shipped

| Piece | Where |
| --- | --- |
| Single-shape contours, smoothness guides, holes, open ribbons, smooth / fully smooth / torn edges | `@sketchy-js/stickers` (`builder.ts`, `guide.ts`, `edges/*`) |
| Paper fibers | `defineTexture` id `paper` |
| Sheet shadow | `DrawLayer.shadow`, painted before the paper |
| `SketchGroup` / `SketchPart` | `@sketchy-js/scene/stickers` |
| Vector silhouette union (Swift's edge walk) | `combineSilhouettes` |
| Clipper2, only in one module | `@sketchy-js/stickers/clipper` (`clipper2-ts`, scale 1000) |
| Experimental image mask | `@sketchy-js/stickers/image` |

Stickers do not import Canvas or React. `@sketchy-js/scene/basic` does not import stickers, so the basic scene bundle does not pay for them.

### Request routing

```
RoughView.with({ stickerBacking }).draw(shape).build(size)
  is still the basic scene: it reports sticker-unsupported and draws no sheet.

buildStickerScene(registry, items, size)          scene/stickers.ts
  -> buildScene with the backing removed          ink, same as Phase 1–2
  -> stickerCommands(drawing, shape, backing)     stickers/builder.ts
       flatten outline, drop the duplicate pass
       aim at the shape's guide (smoothness)
       resample at 2.5 px
       edge plugin (smooth | fullySmooth | torn)
       even-odd sheet, or a round dilation if the offset crosses itself
  -> stickerLayers                                shadow, paper, image, fibers
  -> SVG path sheets use the same fit as the ink

SketchGroup.build(size)
  -> each part's drawing, child's stickerBacking dropped when the group has one
  -> groupSilhouette: half-stroke hull, then combineSilhouettes
  -> one shared sheet, then each part's ink
  -> transforms are baked into coordinates; stroke, backing, and shadow widths stay in pixels
  -> SVG paths are not fitted to the canvas
```

Edges are `defineStickerEdge` plugins (`smooth`, `fullySmooth`, `torn`). Paper is `defineTexture`. The sticker builder calls them. A generic registry host that would run any third-party edge the way fills run is still not in `@sketchy-js/scene`.

## Fixture coverage

Structural match first (same rings, same operation kinds), then coordinates within `1e-4` px. Oracle: `fixtures/swift-reference/v1.5.0/stickers/`.

| Case | What it checks | Result |
| --- | --- | --- |
| `smooth` | Rectangle, smoothness 1, square corners kept | exact, max delta 0 |
| `fullySmooth` | Ellipse, automatic radius | exact within 1e-4 |
| `fullySmooth-radius-12` | Rectangle, radius 12, small-hole-safe smooth corner | exact within 1e-4 |
| `torn` | Star, depth 8; offset crosses itself so the sheet is the round dilation (fill + 27 px stroke) | exact within 1e-4 |
| `hole` | Compound path, even-odd hole | exact within 1e-4 |
| `shadow` | Shadow metadata on the sheet command (opacity 0.35, offset 6×8, radius 8) | path exact within 1e-4 |
| `group` | Rectangle seed 42 union circle seed 7 offset by (10, 0), shared width 12 | same cycle within 1e-4 after rotating the start vertex |
| `image-placement` (6 rows) | `resolveImagePlacement` for tile, stretch, fill, including the 900-repeat cap | within 1e-6 |

The group contour is one closed cycle. Swift chains it from a `Dictionary`, and that iteration order chooses the start vertex. The points match to about 1e-12 once the cycle is rotated. The test rotates, then rebuilds the sheet commands, then applies the 1e-4 check. The painted shape does not depend on which vertex is first.

`image-placement.json` also carries a `maskedCommand` (the smooth rectangle sheet plus image metadata). The sheet geometry is the `smooth` case. This PR does not re-compare those embedded commands as a second copy.

`stickers/phase3.json` is a later Darwin export from the same Sketchy commit. It does not replace `contours.json`. Every case is in the geometric parity test: structure first, then 1e-4 px. Group rings are rotated to Swift's start vertex, then the sheet is rebuilt.

| Case | What it is | Result |
| --- | --- | --- |
| `torn-chop` | Rectangle, torn edge, jaggedness 0 | within 1e-4 |
| `paper-fibers` | Paper texture, seed 5, fibers clipped to the sheet | within 1e-4 |
| `hole-smaller-than-margin` | 12 pt hole, backing width 20, stroke 4 | within 1e-4 |
| `open-ribbon` | Open line. Roughness 0 follows the input segment | within 1e-4 |
| `smoothness-0.5` | Stored smoothness 0.5 | within 1e-4 |
| `smoothness-1.5` | Requested 1.5, stored as 1 (`StickerBacking` clamps to 0...1) | within 1e-4 |
| `group-hole` | One group sheet, hole ring then exterior | within 1e-4 |
| `group-transform` | Rectangle with the recorded affine (20° and translate 28, 14) | within 1e-4 |
| `group-overlapping` | Two 100 pt squares that overlap. One exterior ring, so the overlap stays filled | within 1e-4 |
| `group-corner-sharing` | Two 50 pt squares that share a corner. Two rings, even-odd, matching Swift | within 1e-4 |
| `image-hole` | Fully smooth holed sheet, plus a tile command at 24 pt | within 1e-4 |
| `group-torn` | Torn contour from the Darwin silhouette (seed 11, offset 36×8) | within 1e-4 |

`group-torn` records the offset, the tear, and the seed. It does not record the two circles' centers or diameters. The parity test builds the torn sheet from the Darwin centerline. A search of nearby integer diameters did not reproduce that 21-point silhouette, so the circle placement is not claimed.

Overlapping squares are unioned in the silhouette, before the backing offset, so the shared region is one ring and stays filled. Corner-sharing squares stay two rings. Their offset margins overlap, and the exported fill rule is even-odd, so that lens is open in Swift's path as well. The port matches that path. It does not merge those offset rings into one contour.

## Image mask

`StickerBacking.image` is not on the main backing type. `StickerBackingWithImage` in `@sketchy-js/stickers/image` adds it. The main stickers entry does not import that subpath.

Seth's decisions, as implemented:

- The source is an `ImageBitmap` or other `CanvasImageSource`, passed to `renderToCanvas` in `options.images`, or a `data:image` URL.
- SVG export embeds `data:image` URLs. A same-origin URL is written only when `allowSameOriginImages` is set. `blob:` and `file:` throw.
- A tainted canvas throws `StickerImageError` with code `sticker-image-taint`. `isStickerImageError` accepts that class and a renderer error with the same code.
- `renderToCanvas` stays synchronous. `prepareImages(scene)` decodes the scene's images first.
- Tiles start at the union of the sheet paths.
- `resolveFitScale(0)` returns 1. The 0.05 floor is applied only when the stretch or fill rect is drawn.
- Non-finite sticker numbers throw `StickerOptionsError`. Negatives clamp the way the Swift initializers do. Groups use the same clamps.

## Other checks

- Disconnected squares stay two components. A shared corner does not grow a bridge before the backing offset. A nested hole stays open until another shape covers it.
- A scaled `SketchPart` keeps `strokeWidth` at the authored value. A child `stickerBacking` is ignored while the group has one. An SVG path inside a group keeps its part transform and is not fitted to the canvas. A child sheet is offset after that transform, so the margin stays in unscaled points.
- An open stroke in a group becomes a round-capped ribbon and is unioned into the sheet. Stroke width stays in points.
- Sheet shadow opacity is applied once. The shadow color and SVG `flood-opacity` stay at 1. The paint alpha carries the opacity.
- The silhouette union runs on the flattened centerline. Quadratics are already polylines before that union.
- `clipper2-ts` is imported only from `packages/stickers/src/clipper/adapter.ts` (BSL-1.0, already in `THIRD_PARTY_NOTICES`). Integer scale is 1000. The Darwin contours do not go through Clipper: they are cubics from Sketchy's own offset, and Clipper's integer rings cannot match them at 1e-4. The adapter has a union/offset contract test.

## Known gaps

- Package versions are `0.0.0`. The Phase 1 and Phase 2 changesets that would have published `0.1.0` are gone. The publishable packages are one Changesets `fixed` group. The release PR sets `1.5.0` explicitly.
- Plugin API examples in `docs/plugins.md` use `version: "1.0.0"` for a **plugin**, not for the package. That is the plugin API line and stays.
- `group-torn` does not record circle centers or diameters. The torn contour matches the Darwin centerline. The circle placement that produced it is not reconstructed.
- Ink on a compound SVG path is still nonzero, so a blue fill covers a hole even when the paper punches it. The holes preview uses a clear fill so the hole shows.
- One smooth corner on a ring used to collapse the sheet (Swift's `slice` returns that single point). The port walks the long way around. Fixtures have several corners and still match.
- No browser timing for `clipper2-ts`. `clipper2-wasm` is not wired (the ADR leaves it optional).
- Previews in `docs/examples/phase-3/` are SketchyJS SVG/Canvas renders, not Swift screenshots. The upstream PNGs under `fixtures/.../images/stickers/` were not regenerated. The preview test writes those PNGs only when `UPDATE_EXAMPLES=1`.
- Shadow blur is Canvas `shadowBlur` and SVG `feDropShadow` with `stdDeviation = radius / 2`. They agree within the preview limit; they are not a pixel match to CoreGraphics. Opacity itself is applied once in both renderers.

## Tests

`pnpm test`: **704** tests, 44 files. That includes the Phase 0–2 suites and the check that `StickerImageError` is only in the image build.

## Bundle size

`pnpm size`, minified gzip. The basic SVG scene stays under its 42 KB ceiling (32.0 KB). The stickers entry does not include Clipper.

| Entry | Gzip | Ceiling |
| --- | --- | --- |
| `@sketchy-js/stickers` (sheet, edges, paper, group union) | 15.3 KB | 18 KB |
| `@sketchy-js/stickers/image` | 0.4 KB | none (placement helper; the scene entry pulls the image module) |
| sticker scene (`scene/stickers` + sheets + image) | 33.4 KB | 65 KB |
| `@sketchy-js/stickers/clipper` | 17.1 KB | 22 KB |

## Previews

`docs/examples/phase-3/`: `single.png`, `holes.png`, `torn.png`, `paper.png`, `shadow.png`, `group.png`, `texture-mask.png`. Each is under 10 MB. `packages/canvas-renderer/test/phase-3-preview.test.ts` checks SVG against Canvas. It rewrites the PNGs only when `UPDATE_EXAMPLES=1`.

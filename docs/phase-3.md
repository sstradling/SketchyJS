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

## Image mask — proposal (experimental)

Sketchy's `StickerImage` takes an already decoded `UIImage` and never fetches a URL. The placement math (`tile` / `stretch` / `fill`, the 4 px tile floor, the ~900 repeat cap, the 0.05 fit floor) is agreed by the v1.5.0 fixture and is implemented as `resolveImagePlacement`.

What is **not** agreed is how a web caller supplies pixels, and what a tainted canvas or an SVG export should do. This PR implements only the conservative slice, on `@sketchy-js/stickers/image`:

- The source must be a `data:image/…` URL the caller already decoded. `http:`, `https:`, `blob:`, and `file:` throw `StickerImageError` (`sticker-image-source`). Nothing is fetched.
- The sheet path, even-odd, is the mask, so holes stay empty. Torn and smooth edges are the same path.
- The image is painted after the paper color and after the shadow, so it does not cast a shadow. Opacity multiplies the image. Paper shows through where the image is transparent. Fibers, when set, draw on top.
- Canvas rendering is synchronous, so the caller passes the decoded image in `renderToCanvas(..., { images })` keyed by that data URL. A missing entry throws. It is not dropped.

### Open questions for Seth

1. Is the long-term source a `data:` URL, an `ImageBitmap` / `CanvasImageSource`, raw RGBA bytes, or all three?
2. May SVG export reference a same-origin URL, or must it always embed a data URL?
3. When the canvas is tainted, should export throw a typed error, or is taint the caller's problem because we never fetch?
4. `renderToCanvas` is synchronous. If the source is a URL or a blob, who decodes it, and does the renderer grow an async entry point?
5. Tile origin is the sheet bounds (Swift). Should a group sheet tile from the union bounds or from each part?
6. `core`'s `resolveFitScale(0)` returns `0.05`. Swift's `resolvedFitScale` returns `1` for scale 0, and the 0.05 floor is applied only when drawing stretch and fill. The sticker helper matches Swift. Should the core helper change?
7. Should `StickerBacking.image` stay on the main backing type, or move so that importing `@sketchy-js/stickers` does not mention images at all?

## Other checks

- Disconnected squares stay two components. A shared corner does not grow a bridge. A nested hole stays open until another shape covers it.
- A scaled `SketchPart` keeps `strokeWidth` at the authored value. A child `stickerBacking` is ignored while the group has one. An SVG path inside a group stays in authored coordinates.
- `clipper2-ts` is imported only from `packages/stickers/src/clipper/adapter.ts` (BSL-1.0, already in `THIRD_PARTY_NOTICES`). Integer scale is 1000. The Darwin contours do not go through Clipper: they are cubics from Sketchy's own offset, and Clipper's integer rings cannot match them at 1e-4. The adapter has a union/offset contract test.

## Known gaps

- Package versions are `0.0.0`. A Changesets minor bump would publish `0.1.0`, which fights the 1.5.0 policy, so this PR adds no changeset. The release PR should set 1.5.0 explicitly.
- Plugin API examples in `docs/plugins.md` use `version: "1.0.0"` for a **plugin**, not for the package. That is the plugin API line and stays.
- `resolveFitScale` in core still maps 0 to 0.05 (see question 6). Phase 0 tests lock that. The sticker placement helper does not use it.
- Ink on a compound SVG path is still nonzero, so a blue fill covers a hole even when the paper punches it. The holes preview uses a clear fill so the hole shows.
- One smooth corner on a ring used to collapse the sheet (Swift's `slice` returns that single point). The port walks the long way around. Fixtures have several corners and still match.
- No browser timing for `clipper2-ts`. `clipper2-wasm` is not wired (the ADR leaves it optional).
- Previews in `docs/examples/phase-3/` are SketchyJS SVG/Canvas renders, not Swift screenshots. The upstream PNGs under `fixtures/.../images/stickers/` were not regenerated.
- Shadow blur is Canvas `shadowBlur` and SVG `feDropShadow` with `stdDeviation = radius / 2`. They agree within the preview limit; they are not a pixel match to CoreGraphics.

## Tests

`pnpm test`: **682** tests, 41 files. That includes the Phase 0–2 suites.

## Bundle size

`pnpm size`, minified gzip. The basic SVG scene stays under its 42 KB ceiling (32.0 KB). The stickers entry does not include Clipper.

| Entry | Gzip | Ceiling |
| --- | --- | --- |
| `@sketchy-js/stickers` (sheet, edges, paper, group union) | 14.6 KB | 20 KB |
| `@sketchy-js/stickers/image` | 0.5 KB | none (placement only) |
| `@sketchy-js/stickers/clipper` | 17.1 KB | 22 KB |

## Previews

`docs/examples/phase-3/`: `single.png`, `holes.png`, `torn.png`, `paper.png`, `shadow.png`, `group.png`, `texture-mask.png`. Each is under 10 MB. `packages/canvas-renderer/test/phase-3-preview.test.ts` rewrites them and checks SVG against Canvas.

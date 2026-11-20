# Phase 4 status: bindings, 1.6.0 parity, and release hardening

Scope: the Phase 4 section of [plan.md](plan.md), plus Sketchy 1.6.0 (commit `650763d8c2696daf5dc44d0f25286b64ba91fc13`). Phase 3 remains the sticker work at `46676c6`. Package versions stay `0.0.0`. The first stable release is **v1.6.0**, not 1.5.0. See [versioning.md](versioning.md).

Plugin API stays **1.0**. `RoughKit.curve`, `RoughKit.isolated`, contour and wash fields on `FillInput`, stroke scale on fill parts, and `BrushInput.thickness` are additive and unpublished.

## What shipped

| Piece | Where |
| --- | --- |
| `.contour` fill | `@sketchy-js/fills` `contour`, `defineFill` |
| `.wash` fill and `skyWash` | `@sketchy-js/fills` `wash` |
| Interior shades | `interiorShades` on the scene, painted by both renderers |
| Closed width stops and `.variable` | `thicknessWidth(..., closed)` with the 6% join blend |
| Crayon wax follows that profile, including a closed ring | `@sketchy-js/brushes` |
| `SilhouetteShadow` / `treeShadow` | `@sketchy-js/scene/silhouette` |
| React hooks and SVG component | `@sketchy-js/react` (no canvas import) |
| `<sketchy-shape>` | `@sketchy-js/web-components` |
| Release workflow, dry run, size budgets | `.github/workflows/release.yml`, `scripts/release-dry-run.mjs` |

### Request routing

```
view.with({ fillStyle: "contour", contourGuide, contourDrift }).draw(shape).build(size)
  -> createFillStage copies contour options onto FillInput
  -> contour plugin plans centerlines (even-odd clip, short chords dropped)
  -> ctx.geom.rough.isolated(mix(seed, slot)) draws the wobble
  -> a full period of contourDrift returns the same strokes and does not touch the outline seed
  -> SVG paths become path2DPattern clips with fill-rule evenodd

view.with({ fillStyle: "wash" })
  -> skyWash when washPasses is omitted
  -> one layer per width/opacity bucket

interiorShades
  -> not read by generateDrawing
  -> attachShades inserts layers after the fill (halo after the stroke)
  -> SVG feGaussianBlur stdDeviation = blur/2; Canvas shadowBlur = blur

treeShadow(image, at)
  -> scene node type "silhouette"
  -> no seed, no generator, not part of the basic import
```

## 1.6.0 feature coverage

Reference: Sketchy 1.6.0 changelog and commits `324d68d`, `ce08e55`, `8c42b66`, `c697d9c`, `2bd9c88`, `d4ddb83`, `e39962c`.

| Feature | Port | Fixture |
| --- | --- | --- |
| Contour along an arc or polyline | yes | `contour-intensity-0`, `contour-intensity-1` plans and sets |
| Intensity 0 chord, 1 guide bow, flatten rather than tighten | yes | `contour-intensity-middle` (0.35) |
| Start/end intensity, angle, easing, no crossings | yes | `contour-intensity-ramp` |
| `contourFalloff` packs and thins toward the guide | yes | `contour-falloff` |
| Animated contour scrolls, wobble stays | yes | `contour-animated` at phase 0, half a gap, and one period |
| Strokes stay wide when the bow flattens (`ce08e55`) | yes | intensity 0 and the ramp keep `fillLineScale` |
| SVG holes even-odd, short clips dropped | yes | `contour-svg-hole`, `contour-short-clip` |
| `washPasses` on contour | yes | `contour-wash-passes` |
| Wash: angle scatter, trim, sine bow, width buckets | yes | `wash-scatter`, `wash-trim`, `wash-bow` |
| `WashPass.sky` | `skyWash` | `wash-default`, `wash-sky` |
| `pitShadow`, `pitRecess`, `edgeShade`, `halo` | yes, both renderers | shade cases, plus the Swift PNGs |
| Shades leave seed and geometry unchanged, holes empty | yes | `generatedSetsEqual`; `shade-hole` fill is even-odd |
| Closed `widthStops` and `.variable`, 6% blend | yes. This changes the 1.5.0 "drop the profile" behavior | `width-samples-stops`, `width-samples-variable` |
| Closed rings fill winding; two rough passes union | yes (`nonzero`) | `closed-ring-stops`, `closed-ring-variable`, `closed-ring-same-seed` |
| Crayon wax scales on a closed ring | yes. Uniform crayon fixtures still match 1.5.0 | `closed-crayon-ring` |
| `SilhouetteShadow.tree` | yes | `silhouette-tree`, `silhouette-affine`, plus the Swift PNGs |

### Fixture table

Darwin files are at `fixtures/swift-reference/v1.6.0/`, merged from `cursor/sketchy-1-6-0-fixtures-8a16` (`a776ef8`) with a normal merge commit. The check is structural equality, then `1e-4` px. Darwin is canonical. The tests do not loosen tolerance and do not edit fixtures. The v1.5.0 corpus is untouched.

| Group | Cases | Result |
| --- | --- | --- |
| `fills/contour.json` | intensity 0, 0.35, 1, ramp, falloff, animated phases, SVG hole, short clip, wash passes | plans, sets, clip, and probes match |
| `fills/wash.json` | default, sky, scatter, trim, bow | sets match |
| `fills/interior-shades.json` | pit, recess, edge, halo, hole | order, silhouette path, shade parameters, and unchanged generator sets match. PNGs are within delta 24 and 20% |
| `strokes/closed-width.json` | width samples, stops ring, variable ring, crayon ring, same seed | samples, hachure, winding ribbon, and wax passes match |
| `stickers/silhouette-shadow.json` | affine, tree | foot `(14, 63.5)`, tree skew `-0.58` and squash `0.32`, composed matrix, and both PNGs match |
| re-run of the 1.5.0 list | fills and shapes generated again; every other unchanged file compared byte for byte with v1.5.0 | geometry is identical. `darwin/options/defaults.json` adds only `contourDrift`, `contourEasing`, `contourFalloff`, `contourGradientAngle`, `contourGuide`, `contourIntensity`, `contourIntensityEnd`, `contourIntensityStart`, `interiorShades`, and `washPasses` |

Where 1.6.0 intentionally changed a 1.5.0 result, the 1.6.0 fixture wins. The known intentional change is closed contours: 1.5.0 dropped `widthStops` and `.variable`; 1.6.0 keeps them and blends the join. Open strokes are unchanged. Uniform crayon lines still match the 1.5.0 fixture.

## Benchmarks

`tools/worker-bench` drew 48 hachure rectangles at 640×480, seed 42, spacing 2, eight times after a warmup.

| Runner | Median |
| --- | --- |
| Main thread | 3.76 ms |
| `worker_threads` | 3.75 ms |

The worker is not faster. Message passing would add cost on top of that. **OffscreenCanvas is deferred.** WebGL and WebGPU were not prototyped: the scenes are path construction, not fill-rate, and a GPU backend would not change a 4 ms CPU draw.

## Sizes

`pnpm size`, minified gzip. Standing ceilings hold. The fills ceiling is now 16 KB because contour and wash joined the built-in set (measured 13.5 KB). The old 12 KB figure was the nine fills from 1.5.0.

| Entry | Gzip | Ceiling |
| --- | --- | --- |
| Basic SVG scene | 39.4 KB | 42 KB |
| Core | 17.5 KB | 18 KB |
| All built-in fills | 13.5 KB | 16 KB |
| `fills/contour` | 5.0 KB | 8 KB |
| `fills/wash` | 2.6 KB | 8 KB |
| Canvas renderer | 3.9 KB | 12 KB |
| Stickers | 15.3 KB | 18 KB |
| Sticker scene | 35.2 KB | 65 KB |
| Clipper | 17.1 KB | 22 KB |
| React (SVG scene, React itself external) | 39.6 KB | 42 KB |
| Web components | 39.9 KB | 42 KB |
| `scene/silhouette` | 0.5 KB | 2 KB |

## Release

The workflow is `.github/workflows/release.yml`. `workflow_dispatch` defaults to a dry run. A dry run verifies the tree, runs `scripts/release-dry-run.mjs`, and does not publish or tag. A real run, only after versions are set to 1.6.0 in one commit, publishes with npm provenance, creates one annotated `v1.6.0` tag, writes the GitHub release notes, and repeats the fresh-consumer tarball install.

This PR leaves every `package.json` at `0.0.0`. A Changesets bump from that number would publish `0.1.0` and is refused.

## Known gaps

- The 1.6.0 Darwin fixtures are merged and the parity tests match them. No case failed at 1e-4, and the shade and silhouette PNGs stayed inside the delta 24 / 20% allowance.
- Arc contour keeps per-band widths. Swift's single-set `fillArc` flattens bands when it goes through `fillPolygon`. Polygons and ellipses use the sets API on both sides.
- `ContourGuide.path` (flatten a `CGPath`) is not a helper. Pass a polyline.
- Shade and halo blur are not a pixel match to CoreGraphics. The ratio is documented in [capabilities.md](capabilities.md). The Swift cards still fit the existing delta 24 / 20% allowance, so that allowance was not raised.
- A silhouette with no data URL and no live canvas draws nothing in SVG. Canvas can paint a live source.
- React and the custom element render SVG only. Canvas remains `renderToCanvas`.
- No WebGL, no worker renderer.
- Versions are `0.0.0`. The release that sets 1.6.0 is a later PR.

## Open questions for Seth

1. Answered by the fixture merge: `v1.6.0/` keeps the 1.5.0 layout, the re-run geometry is byte-identical, and only `darwin/options/defaults.json` gained the new fields. Closed width is the intentional 1.5.0 behavior change, and it matches the new ring fixtures.
2. Should arc fills keep per-band contour widths, or flatten the way Swift's single-set `fillArc` does?
3. Is `stdDeviation = blur / 2` the shade ratio you want to keep, matching sticker shadows, or should SVG move to the Canvas radius?
4. The React and web-component bundles sit at 39.6 KB and 39.9 KB of the 42 KB basic-scene ceiling because they include that scene. Should the ceiling for those entries stay at 42 KB?
5. `ContourGuide.path` flattening: do you want it in this library, or will callers pass polylines?
6. The first release tag is `v1.6.0` with every package at that version. Confirm the fixed group should not split react or web-components onto their own number.

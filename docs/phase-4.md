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
  -> SVG feGaussianBlur stdDeviation = blur; Canvas shadowBlur = 2 * blur

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
| `fills/interior-shades.json` | pit, recess, edge, halo, hole | order, silhouette path, shade parameters, and unchanged generator sets match. SVG (resvg) and Canvas PNGs are within delta 12 and 6% |
| `strokes/closed-width.json` | width samples, stops ring, variable ring, crayon ring, same seed | samples, hachure, winding ribbon, and wax passes match |
| `strokes/closed-width-z.json` | closed-z ring stops, variable, crayon ring, same seed, rounded rect, crayon fill | explicit `Z` on the outline. Exact structure, then 1e-4 |
| `stickers/silhouette-shadow.json` | affine, tree | foot `(14, 63.5)`, tree skew `-0.58` and squash `0.32`, composed matrix, and both PNGs match |
| re-run of the 1.5.0 list | fills and shapes generated again; every other unchanged file compared byte for byte with v1.5.0 | geometry is identical. `darwin/options/defaults.json` adds only `contourDrift`, `contourEasing`, `contourFalloff`, `contourGradientAngle`, `contourGuide`, `contourIntensity`, `contourIntensityEnd`, `contourIntensityStart`, `interiorShades`, and `washPasses` |

Where 1.6.0 intentionally changed a 1.5.0 result, the 1.6.0 fixture wins. The known intentional change is closed contours: 1.5.0 dropped `widthStops` and `.variable`; 1.6.0 keeps them and blends the join. Open strokes are unchanged. Uniform crayon lines still match the 1.5.0 fixture.

## Benchmarks

`tools/worker-bench` drew 48 hachure rectangles at 640×480, seed 42, spacing 2, eight times after a warmup.

| Step | Median |
| --- | --- |
| Generation | 18.36 ms |
| Paint of the built scene | 3.35 ms |
| Main thread, canvas plus paint | 3.46 ms |
| `worker_threads` paint | 4.37 ms |

Generation is the expensive part. Painting in a worker is slower than painting on the main thread. **OffscreenCanvas stays deferred.** WebGL and WebGPU were not prototyped.

## Sizes

`pnpm size`, minified gzip. Standing ceilings hold, including 42 KB for the basic SVG scene. Contour and wash are subpath imports, so the basic scene is 34.9 KB and the basic fill set is 8.8 KB. The fills ceiling stays 16 KB.

| Entry | Gzip | Ceiling |
| --- | --- | --- |
| Basic SVG scene | 34.9 KB | 42 KB |
| Core | 17.5 KB | 18 KB |
| Basic fills, without contour and wash | 8.8 KB | 16 KB |
| `fills/contour` | 5.1 KB | 8 KB |
| `fills/wash` | 2.6 KB | 8 KB |
| Canvas renderer | 3.9 KB | 12 KB |
| Stickers | 15.3 KB | 18 KB |
| Sticker scene | 35.3 KB | 65 KB |
| Clipper | 17.1 KB | 22 KB |
| React (SVG scene, React itself external) | 35.1 KB | 42 KB |
| Web components | 35.6 KB | 42 KB |
| `scene/silhouette` | 0.5 KB | 2 KB |

## Release

The workflow is `.github/workflows/release.yml`. A `workflow_run` release requires a successful CI `push` on this repository's master. A manual run requires master, a green CI run for that commit, and a `version` input. Node 22 and 24 both verify. Job permissions stay at read except the publish job, which has `contents: write` and `id-token: write`. A dry run is the default and does not upload or tag. A real run calls `scripts/release-dry-run.mjs --gate --expect <version>` before `changeset publish`. The gate refuses `0.0.0`, versions that disagree, a version other than the input, and pending changesets. The release PR runs `changeset version` first, so the publish job does not version again and does not create a version commit. It publishes with provenance. An existing `v` tag or GitHub Release is left in place, so a rerun after a partial release does not fail on the tag. A `changeset publish` that exits non-zero continues only when every package version is already on the registry. This PR does not publish.

This PR leaves every `package.json` at `0.0.0`. A Changesets bump from that number would publish `0.1.0` and is refused.

## Known gaps

- The 1.6.0 Darwin fixtures match at 1e-4. Shade and silhouette PNGs fit delta 12 and 6%.
- Arc contours flatten to one unscaled set, matching Swift `fillArc`. Polygon bands keep their scales.
- `ContourGuide.path` is intentionally not ported. Pass a polyline.
- A silhouette with no data URL and no live canvas draws nothing in SVG. Canvas can paint a live source.
- `SketchyCanvas` is `@sketchy-js/react/canvas`. The main React entry stays SVG.
- No WebGL, no worker renderer. Generation and paint are timed separately in `tools/worker-bench`.
- Versions are `0.0.0`. One fixed Changesets group will move together to 1.6.0. The release that sets that version is a later PR.
- `strokes/closed-width-z.json` holds the explicit-`Z` cases (ring stops, variable, crayon ring, same seed, rounded rect, crayon fill). They pass at 1e-4. The parity file fails if a new id appears in either closed-width file.
- There is no Swift arc-contour fixture. Arc contours emit one unscaled stroke set, matching `fillArc`, and that remains a known gap.

## Decisions

1. Arc contour bands match Swift: one set, no per-band width.
2. `ContourGuide.path` stays unported.
3. SVG shade sigma is `stdDeviation = blur`. Canvas `shadowBlur` is `2 * blur` (canvas sigma is about `shadowBlur / 2`). Sticker shadows stay at `radius / 2`.
4. The 42 KB basic-scene ceiling stays. Contour and wash are subpath imports.
5. One fixed version group. The release PR sets the version and runs `changeset version`. The publish job takes that version as an input.

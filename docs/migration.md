# Migrating to SketchyJS

## From the thirteen-package layout

Every former `@sketchy-js/<name>` import, except React, is `@sketchy-js/sketchy/<name>`.

| Before | After |
| --- | --- |
| `@sketchy-js/core` | `@sketchy-js/sketchy/core` |
| `@sketchy-js/core/options` | `@sketchy-js/sketchy/core/options` |
| `@sketchy-js/fills/hachure` | `@sketchy-js/sketchy/fills/hachure` |
| `@sketchy-js/scene/basic` | `@sketchy-js/sketchy/scene/basic` |
| `@sketchy-js/svg-renderer` | `@sketchy-js/sketchy/svg` |
| `@sketchy-js/canvas-renderer` | `@sketchy-js/sketchy/canvas` |
| `@sketchy-js/stickers/clipper` | `@sketchy-js/sketchy/stickers/clipper` |
| `@sketchy-js/web-components` | `@sketchy-js/sketchy/web-components` |
| `@sketchy-js/react` | `@sketchy-js/react` |
| `@sketchy-js/react/canvas` | `@sketchy-js/react/canvas` |

`@sketchy-js/contrib` is gone. `@sketchy-js/react` depends on `@sketchy-js/sketchy`. Canvas is not a peer.

## From Sketchy (Swift)

SketchyJS keeps Sketchy's drawing names where the behavior transfers, and changes the names where the web platform is different. The parity marks are in [api-parity.md](api-parity.md).

| Swift | SketchyJS |
| --- | --- |
| `import Sketchy` | `import { RoughView, sketch } from "@sketchy-js/sketchy/scene/basic"` |
| `RoughView().fillStyle(.hachure)` | `new RoughView().with({ fillStyle: "hachure" })` |
| `.frame` / SwiftUI layout | `build({ width, height })` or the renderer's canvas size |
| `Color` / `UIColor` | `Color`: a CSS string or `[r, g, b, a]` in 0...1 |
| `Path(d:)` | `path(d)` from `@sketchy-js/sketchy/core` |
| `Options.seed` | `seed` as a `bigint` or a safe integer. JSON stores it as a decimal string |
| `.animated()` | `createAnimation` from `@sketchy-js/sketchy/animate`, or `useContourPhase` for a contour scroll |
| `.stickerBacking` | `@sketchy-js/sketchy/scene/stickers`. The basic import does not load it |
| `StickerImage` | `@sketchy-js/sketchy/stickers/image`. The caller decodes the image |
| `SilhouetteShadow.tree` | `@sketchy-js/sketchy/scene/silhouette`. It is not a sticker shadow |
| `.interiorShades` | `interiorShades` on the view. Presets: `pitShadow`, `pitRecess`, `edgeShade`, `halo` |
| `.fillStyle(.contour)` / `.wash` | `fillStyle: "contour"` / `"wash"` |

A seeded rectangle:

```ts
import { rectangle } from "@sketchy-js/sketchy/core";
import { RoughView } from "@sketchy-js/sketchy/scene/basic";
import { renderToSvgString } from "@sketchy-js/sketchy/svg";

const scene = new RoughView()
  .with({ seed: 42n, fillStyle: "hachure" })
  .draw(rectangle(10, 10, 80, 60))
  .build({ width: 120, height: 90 });
const svg = renderToSvgString(scene);
```

The same `scene` value goes to `renderToCanvas`. Stickers are a second import. React is a third, and it does not pull Canvas.

Contour options live on the view, not on a separate plugin schema, because a guide curve is not a number:

```ts
.with({
  fillStyle: "contour",
  seed: 7n,
  contourGuide: { kind: "arc", x: 180, y: 520, radius: 460 },
  contourIntensity: 1,
  contourFalloff: 0.65,
})
```

`contourIntensity` `0` is the straight chord. `1` keeps the guide's bow. A lower value flattens that bow. It does not move the stroke onto a tighter circle. `contourDrift.phase` is the distance already traveled. `useContourPhase(speed)` in `@sketchy-js/react` advances it. The slot seed does not change, so the wobble does not boil.

`.wash` with no `washPasses` uses `skyWash` from `@sketchy-js/fills`. Pass the same list as `washPasses` on a contour view to stroke those centerlines with the wash recipe.

## From rough.js

SketchyJS is not a drop-in rough.js build. Shared ideas:

| rough.js | SketchyJS |
| --- | --- |
| `rough.rectangle(x, y, w, h, options)` | `rectangle(x, y, w, h)` plus `with({ ... })` |
| `roughness`, `bowing` | same names, Swift defaults (`roughness` 1, `bowing` 1) |
| `fillStyle: "hachure"` | `fillStyle: "hachure"` |
| `hachureAngle` in radians in some versions | `fillAngle` in degrees, `0` horizontal, matching Sketchy |
| `seed` | `seed`. The generator is SplitMix64, not `Math.random` |
| `svg` output | `renderToSvgString(scene)` |
| canvas output | `renderToCanvas(scene, context)` |

Do not expect the same pixels as rough.js. Sketchy 1.6.0 fixtures are the oracle. rough.js differential tests exist only where Sketchy intentionally inherited a behavior. Continuous outlines are the default. `strokeContinuity: "legacy"` is the older sampled look.

`fillWeight: -1` means half the stroke width, as in Sketchy. rough.js callers who passed a positive stroke width for the fill should set `fillWeight` explicitly.

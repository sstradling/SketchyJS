# @sketchy-js/sketchy

Seeded hand-drawn graphics. One package holds the geometry, fills, brushes, stickers, scene, SVG renderer, Canvas renderer, animation frames, and the custom element.

## Install

```bash
pnpm add @sketchy-js/sketchy
```

## Usage

```ts
import { rectangle } from "@sketchy-js/sketchy/core";
import { sketch } from "@sketchy-js/sketchy/scene/basic";
import { renderToSvgString } from "@sketchy-js/sketchy/svg";

const scene = sketch(rectangle(8, 8, 120, 80), { width: 160, height: 120 }, {
  seed: 7n,
  fillStyle: "hachure",
});
const svg = renderToSvgString(scene);
```

Canvas is `@sketchy-js/sketchy/canvas`. Clipper is `@sketchy-js/sketchy/stickers/clipper` and is not part of the core or SVG entry.

## Subpaths

| Import | What it is |
| --- | --- |
| `@sketchy-js/sketchy` | shapes, `sketch`, `basicSketchy`, `RoughView`, and `ViewOptions`. An unbundled import does not load a renderer |
| `@sketchy-js/sketchy/core` | shapes, RNG, outlines |
| `@sketchy-js/sketchy/core/options` | option defaults and rules |
| `@sketchy-js/sketchy/fills` and `/fills/<name>` | fill plugins. Contour and wash are subpaths |
| `@sketchy-js/sketchy/brushes`, `/brushes/crayon`, `/brushes/watercolor` | brushes |
| `@sketchy-js/sketchy/stickers`, `/stickers/image`, `/stickers/clipper` | sheets and the Clipper adapter |
| `@sketchy-js/sketchy/scene`, `/scene/basic`, `/scene/stickers`, `/scene/silhouette` | scene builders |
| `@sketchy-js/sketchy/svg` | SVG renderer |
| `@sketchy-js/sketchy/canvas` | Canvas renderer |
| `@sketchy-js/sketchy/animate` | frame generator |
| `@sketchy-js/sketchy/web-components` | custom element |
| `@sketchy-js/sketchy/plugin` and `/plugin/schema` | plugin contract |
| `@sketchy-js/sketchy/types` | shared types |
| `@sketchy-js/sketchy/schemas/*` | JSON schemas |

`THIRD_PARTY_NOTICES` in this package names `clipper2-ts` (BSL-1.0) and the Sketchy and rough.js code the geometry is ported from. It does not repeat development-only tools. The full list stays at the repository root. `@sketchy-js/react` ships `LICENSE` only, because it vendors no third-party code.

## Docs

[Migration](https://github.com/sstradling/SketchyJS/blob/master/docs/migration.md), [ADR 0002](https://github.com/sstradling/SketchyJS/blob/master/docs/adr/0002-two-packages.md), and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

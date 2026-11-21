# @sketchy-js/scene

Turns shapes, fills, and brushes into a `Scene`. Renderers consume that scene; this package does not paint pixels.

## Install

```bash
pnpm add @sketchy-js/scene @sketchy-js/core
```

`pnpm add` resolves the package after the first publish. Until then, depend on it from this repo with `workspace:*`.

## Usage

```ts
import { rectangle } from "@sketchy-js/core";
import { sketch } from "@sketchy-js/scene/basic";

const scene = sketch(rectangle(8, 8, 120, 80), { width: 160, height: 120 }, {
  seed: 7n,
  fillStyle: "hachure",
});
```

## Subpaths

| Import | What it exports |
| --- | --- |
| `@sketchy-js/scene` | `RoughView`, `createSketchy`, shade helpers (`pitShadow`, `halo`, …) |
| `@sketchy-js/scene/basic` | `sketch` and `basicSketchy` (built-in fills, not contour or wash) |
| `@sketchy-js/scene/stickers` | sticker scene builders |
| `@sketchy-js/scene/silhouette` | `silhouetteScene` and `treeShadow` |

## Docs

[Phase 4](https://github.com/sstradling/SketchyJS/blob/master/docs/phase-4.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

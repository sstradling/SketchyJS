# @sketchy-js/brushes

Crayon and watercolor brush plugins.

## Install

```bash
pnpm add @sketchy-js/brushes
```

`pnpm add` resolves the package after the first publish. Until then, depend on it from this repo with `workspace:*`.

## Usage

```ts
import { circle } from "@sketchy-js/core";
import { crayon } from "@sketchy-js/brushes/crayon";
import { basicSketchy } from "@sketchy-js/scene/basic";
import { sketchScene } from "@sketchy-js/scene";

const scene = sketchScene(
  basicSketchy.use(crayon),
  circle(80, 80, 100),
  { width: 160, height: 160 },
  { seed: 8n, strokeWidth: 14 },
);
```

`basicSketchy` does not register brushes. Call `.use(crayon)` or `.use(watercolor)`, then set `brushProfile.crayon` or `brushProfile.watercolor` when you want the wax or wash passes.

## Subpaths

| Import | What it exports |
| --- | --- |
| `@sketchy-js/brushes` | `crayon` and `watercolor` |
| `@sketchy-js/brushes/crayon` | the crayon plugin |
| `@sketchy-js/brushes/watercolor` | the watercolor plugin |

## Docs

[Plan](https://github.com/sstradling/SketchyJS/blob/master/docs/plan.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

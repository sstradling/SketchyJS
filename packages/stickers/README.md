# @sketchy-js/stickers

Paper sheets, torn and smooth edges, and group unions. This package does not import React.

## Install

```bash
pnpm add @sketchy-js/stickers
```

## Usage

```ts
import { rectangle } from "@sketchy-js/core";
import { RoughView } from "@sketchy-js/scene/basic";
import { buildStickerScene } from "@sketchy-js/scene/stickers";

const view = new RoughView()
  .with({
    seed: 4n,
    stickerBacking: {
      width: 12,
      smoothness: 0.5,
      edge: "smooth",
      color: [0.96, 0.93, 0.86, 1],
    },
  })
  .draw(rectangle(16, 16, 160, 100));

const scene = buildStickerScene(view.registry(), view.contents(), {
  width: 240,
  height: 160,
});
```

Scene assembly lives on `@sketchy-js/scene/stickers`. This package is the geometry: edges, paper, and the clipper adapter.

## Subpaths

| Import | What it exports |
| --- | --- |
| `@sketchy-js/stickers` | edges, paper, group union, `stickerCommands` |
| `@sketchy-js/stickers/image` | experimental image placement |
| `@sketchy-js/stickers/clipper` | the Clipper2 adapter |

## Docs

[Phase 3](https://github.com/sstradling/SketchyJS/blob/master/docs/phase-3.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

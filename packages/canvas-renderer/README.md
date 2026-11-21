# @sketchy-js/canvas-renderer

Paints a `Scene` onto a Canvas 2D context. The React package does not import this; use `@sketchy-js/react/canvas` when you want that binding.

## Install

```bash
pnpm add @sketchy-js/canvas-renderer @sketchy-js/scene
```

`pnpm add` resolves the package after the first publish. Until then, depend on it from this repo with `workspace:*`.

## Usage

```ts
import { rectangle } from "@sketchy-js/core";
import { sketch } from "@sketchy-js/scene/basic";
import { renderToCanvas, type Canvas2D } from "@sketchy-js/canvas-renderer";

const scene = sketch(rectangle(8, 8, 120, 80), { width: 160, height: 120 }, { seed: 7n });
const canvas = document.querySelector("canvas");
const context = canvas?.getContext("2d");
// Canvas2D is the structural context this package paints. A DOM context has
// extra members, so the assignment needs the same cast SketchyCanvas uses.
if (context) renderToCanvas(scene, context as unknown as Canvas2D);
```

There is one export, `.`.

## Docs

[Capabilities](https://github.com/sstradling/SketchyJS/blob/master/docs/capabilities.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

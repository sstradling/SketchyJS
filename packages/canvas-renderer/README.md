# @sketchy-js/canvas-renderer

Paints a `Scene` onto a Canvas 2D context. The React package does not import this; use `@sketchy-js/react/canvas` when you want that binding.

## Install

```bash
pnpm add @sketchy-js/canvas-renderer @sketchy-js/scene
```

## Usage

```ts
import { rectangle } from "@sketchy-js/core";
import { sketch } from "@sketchy-js/scene/basic";
import { renderToCanvas } from "@sketchy-js/canvas-renderer";

const scene = sketch(rectangle(8, 8, 120, 80), { width: 160, height: 120 }, { seed: 7n });
const canvas = document.querySelector("canvas");
const context = canvas?.getContext("2d");
if (context) renderToCanvas(scene, context);
```

There is one export, `.`.

## Docs

[Capabilities](https://github.com/sstradling/SketchyJS/blob/master/docs/capabilities.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

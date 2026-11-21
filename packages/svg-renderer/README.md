# @sketchy-js/svg-renderer

Paints a `Scene` to an SVG document string. It does not import Canvas or React.

## Install

```bash
pnpm add @sketchy-js/svg-renderer @sketchy-js/scene
```

## Usage

```ts
import { rectangle } from "@sketchy-js/core";
import { sketch } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";

const scene = sketch(rectangle(8, 8, 120, 80), { width: 160, height: 120 }, { seed: 7n });
const svg = renderToSvgString(scene, { background: "#f4efe6" });
```

There is one export, `.`. `renderToSvgElement` writes into a DOM `document` when you have one.

## Docs

[Capabilities](https://github.com/sstradling/SketchyJS/blob/master/docs/capabilities.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

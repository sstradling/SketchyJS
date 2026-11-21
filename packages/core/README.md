# @sketchy-js/core

Seeded shape construction and stroke outlines. This package has no browser, Canvas, or SVG dependency.

## Install

```bash
pnpm add @sketchy-js/core
```

`pnpm add @sketchy-js/core@1.6.0` resolves the package after the release workflow publishes it. Until then, depend on it from this repo with `workspace:*`.

## Usage

```ts
import { rectangle, circle } from "@sketchy-js/core";

const box = rectangle(10, 10, 120, 80);
const ring = circle(80, 80, 100);
```

`rectangle`, `circle`, `ellipse`, `polygon`, `path`, and the stroke outline helpers live on the main export. Pass the shape to `@sketchy-js/scene/basic` when you want a drawable scene.

## Subpaths

| Import | What it exports |
| --- | --- |
| `@sketchy-js/core` | shapes, RNG, stroke outlines, SVG path parsing |
| `@sketchy-js/core/options` | `defaultSketchOptions`, option rules, `applyRule` |

## Docs

[Plan](https://github.com/sstradling/SketchyJS/blob/master/docs/plan.md), [versioning](https://github.com/sstradling/SketchyJS/blob/master/docs/versioning.md), and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

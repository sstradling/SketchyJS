# @sketchy-js/types

Shared TypeScript types for scenes, paths, colors, and options. The package has no runtime code.

## Install

```bash
pnpm add @sketchy-js/types
```

## Usage

```ts
import type { Scene, Color, Path } from "@sketchy-js/types";

const ink: Color = [0.12, 0.16, 0.22, 1];
```

## Subpaths

| Import | What it exports |
| --- | --- |
| `@sketchy-js/types` | `Scene`, `Color`, `Path`, `SketchOptions`, and the other shared types |
| `@sketchy-js/types/schemas/*` | JSON schemas shipped in `schemas/` |

## Docs

[Plan](https://github.com/sstradling/SketchyJS/blob/master/docs/plan.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

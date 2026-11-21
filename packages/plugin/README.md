# @sketchy-js/plugin

The plugin contract: `defineFill`, `defineBrush`, `defineTexture`, and `defineStickerEdge`. Plugin API version is 1.0.

## Install

```bash
pnpm add @sketchy-js/plugin
```

`pnpm add` resolves the package after the first publish. Until then, depend on it from this repo with `workspace:*`.

## Usage

```ts
import { defineFill, s } from "@sketchy-js/plugin";

export const solid = defineFill({
  id: "example.solid",
  version: "1.0.0",
  api: "1.0",
  title: "Solid",
  description: "One filled silhouette.",
  options: {
    spacing: s.number({ default: 4, min: 1, max: 32, description: "Gap between strokes." }),
  },
  paints: "area",
  stochastic: false,
  stream: "shared",
  generate: () => [],
});
```

Register the result with `@sketchy-js/scene`. Built-in fills and brushes use this same API.

## Subpaths

| Import | What it exports |
| --- | --- |
| `@sketchy-js/plugin` | `defineFill`, `defineBrush`, `defineTexture`, `defineStickerEdge`, `s` |
| `@sketchy-js/plugin/schema` | `resolveOptions`, `validateSchema`, `toJsonSchema` |

## Docs

[Plugin architecture](https://github.com/sstradling/SketchyJS/blob/master/docs/plugins.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

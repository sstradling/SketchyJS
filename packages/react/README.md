# @sketchy-js/react

SVG React bindings. This entry does not import the canvas renderer, so an app can render sketches without Canvas.

## Install

```bash
pnpm add @sketchy-js/react react
```

`pnpm add` resolves the package after the first publish. Until then, depend on it from this repo with `workspace:*`.

`react` is the only peer dependency. The package depends on `@sketchy-js/sketchy`, which includes Canvas. `@sketchy-js/react/canvas` is the Canvas binding.

## Usage

```tsx
import { rectangle } from "@sketchy-js/sketchy/core";
import { Sketchy } from "@sketchy-js/react";

export function Card() {
  return (
    <Sketchy
      shapes={rectangle(8, 8, 120, 80)}
      size={{ width: 160, height: 120 }}
      options={{ seed: 7n, fillStyle: "hachure" }}
      label="A hatched rectangle"
    />
  );
}
```

`useSketch` memoizes on the option values. `useSketchAnimation` memoizes the current frame and does not rebuild the scene key on every tick.

## Subpaths

| Import | What it exports |
| --- | --- |
| `@sketchy-js/react` | `Sketchy`, `SketchySvg`, `useSketch`, `useSketchAnimation` |
| `@sketchy-js/react/canvas` | `SketchyCanvas`, which calls `renderToCanvas` |

## Docs

[Phase 4](https://github.com/sstradling/SketchyJS/blob/master/docs/phase-4.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

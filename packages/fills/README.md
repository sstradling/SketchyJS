# @sketchy-js/fills

Built-in fill plugins. The main import is the basic set. Contour and wash stay on subpaths so a basic scene does not pay for them.

## Install

```bash
pnpm add @sketchy-js/fills
```

`pnpm add` resolves the package after the first publish. Until then, depend on it from this repo with `workspace:*`.

## Usage

```ts
import { basicSketchy } from "@sketchy-js/scene/basic";
import { hachure } from "@sketchy-js/fills/hachure";
import { contour } from "@sketchy-js/fills/contour";
import { wash } from "@sketchy-js/fills/wash";

const sketchy = basicSketchy.use(hachure).use(contour).use(wash);
```

`basicSketchy` already includes the main-import fills. Use the subpath when you want only one plugin in a bundle.

## Subpaths

`solid`, `hachure`, `zigzag`, `crossHatch`, `dots`, `dashed`, `zigzagLine`, `sunBurst`, `starBurst`, `scribble`, `contour`, and `wash`, each at `@sketchy-js/fills/<name>`. The main export re-exports all of them and lists the basic set as `builtinFills` (contour and wash excluded).

## Docs

[Phase 4](https://github.com/sstradling/SketchyJS/blob/master/docs/phase-4.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

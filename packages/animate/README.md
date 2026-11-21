# @sketchy-js/animate

Seeded frame-to-frame variance. It does not start a timer; callers advance the frame.

## Install

```bash
pnpm add @sketchy-js/animate @sketchy-js/scene
```

## Usage

```ts
import { rectangle } from "@sketchy-js/core";
import { sketch } from "@sketchy-js/scene/basic";
import { generateFrame } from "@sketchy-js/animate";

const scene = sketch(rectangle(8, 8, 120, 80), { width: 160, height: 120 }, { seed: 7n });
const frame = generateFrame(scene, { steps: 4, variance: 0.05, seed: 7n }, 1);
```

`ANIMATION_SPEED_MS` and `ANIMATION_VARIANCE` are the Sketchy presets. React callers can use `useSketchAnimation` from `@sketchy-js/react` instead of driving the interval themselves.

There is one export, `.`.

## Docs

[Phase 4](https://github.com/sstradling/SketchyJS/blob/master/docs/phase-4.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

# @sketchy-js/web-components

A custom element that draws a seeded sketch as SVG. Importing the module does not register the element, and it does not load the canvas renderer.

## Install

```bash
pnpm add @sketchy-js/web-components
```

## Usage

```ts
import { defineSketchyElement } from "@sketchy-js/web-components";

defineSketchyElement();
```

```html
<sketchy-shape shape="rectangle" seed="7" fill="hachure" label="A hatched rectangle"></sketchy-shape>
```

In Node, pass the realm's `HTMLElement` (happy-dom or jsdom). Calling `defineSketchyElement()` with no DOM throws an error that names `HTMLElement` instead of a `ReferenceError`.

There is one export, `.`.

## Docs

[Phase 4](https://github.com/sstradling/SketchyJS/blob/master/docs/phase-4.md) and the [root README](https://github.com/sstradling/SketchyJS/blob/master/README.md).

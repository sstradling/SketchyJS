# @sketchy-js/react

## 1.6.0

### Minor Changes

- SketchyJS 1.6.0. The first publish ships two packages. `@sketchy-js/sketchy` holds geometry, fills, brushes, stickers, the scene, SVG, Canvas, animation, and the custom element. `@sketchy-js/react` is the React binding and depends on it. The package root exports shapes, `sketch`, `basicSketchy`, `RoughView`, and `ViewOptions`. `renderToSvgString` and `renderToSvgElement` are on `@sketchy-js/sketchy/svg`, so an unbundled import of the root does not load the SVG renderer. The README wordmark is `docs/images/header.gif`: the S is a white paper sticker and the exclamation mark boils. The plugin API stays 1.0. Seeded drawing output is unchanged.

### Patch Changes

- Updated dependencies
  - @sketchy-js/sketchy@1.6.0

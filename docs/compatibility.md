# Compatibility

| Requirement | Support |
| --- | --- |
| Node.js | 22 and 24. CI runs both. `engines` is `>=22` |
| Modules | ESM only. No CommonJS build |
| Package manager | pnpm 10, Turborepo. The lockfile is frozen in CI |
| TypeScript | 5.9. Consumers need `moduleResolution` `bundler` or `nodenext` |
| React | 18 peer. Optional. Not required for SVG, Canvas, or stickers |
| Canvas | any `CanvasRenderingContext2D` or `OffscreenCanvas` context that matches the `Canvas2D` slice. Node tests use `@napi-rs/canvas` |
| SVG | string or DOM. No foreign object |
| Browsers | current Chromium, Firefox, and Safari for the 2D context and SVG filters. The unit tests run in Node and compare SVG with Canvas through resvg |
| Workers | not a supported renderer in this release. The benchmark deferred it |

## Package graph

```
types  plugin
  |      |
  core --+
  |   \
fills  brushes
  |
scene/basic     scene/stickers     scene/silhouette
  |                  |                    |
svg-renderer    stickers            (no basic import)
canvas-renderer
react           (svg + scene/basic, no canvas)
web-components  (svg + scene/basic, no canvas)
```

`clipper2-ts` is imported only from `@sketchy-js/stickers/clipper`.

## Seeds and numbers

Coordinates that Sketchy stores as `Float` are `Math.fround` values. Seeds are `bigint` when they do not fit in a safe integer. JSON fixtures store seeds as decimal strings. Do not use `Math.random` on a seeded path.

## Version line

The publishable packages are 1.6.0. They are not on npm until the release workflow runs. See [versioning.md](versioning.md).

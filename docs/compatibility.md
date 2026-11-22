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

`@sketchy-js/sketchy` publishes the areas as subpaths: `/types`, `/plugin`, `/core`, `/fills`, `/brushes`, `/stickers`, `/scene`, `/svg`, `/canvas`, `/animate`, `/web-components`. `@sketchy-js/react` depends on that package. Its only peer is `react`. The Canvas binding is `@sketchy-js/react/canvas`.

`clipper2-ts` is a regular dependency of `@sketchy-js/sketchy`, imported only from `@sketchy-js/sketchy/stickers/clipper`.

## Seeds and numbers

Coordinates that Sketchy stores as `Float` are `Math.fround` values. Seeds are `bigint` when they do not fit in a safe integer. JSON fixtures store seeds as decimal strings. Do not use `Math.random` on a seeded path.

## Version line

The first published line is 1.6.0 for `@sketchy-js/sketchy` and `@sketchy-js/react`. Nothing is on npm until the release workflow runs. See [versioning.md](versioning.md).

# Phase 0 status: contracts and reference corpus

Scope is `docs/plan.md`, "Phase 0". Nothing from Phase 1 is implemented: the 13 packages other than `types`, `plugin`, and `core` are empty skeletons, and `@sketchy-js/core` contains only the RNG and the option tables.

## Exit criteria

| Criterion                                              | Status | Evidence                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SplitMix64(seed: 42)` matches the documented sequence | Done   | `packages/core/test/splitmix64.test.ts` asserts `13679457532755275413, 2949826092126892291, 5139283748462763858, 6349198060258255764` against `fixtures/.../rng/splitmix64.json`, which holds both the sequence quoted in the Swift tests and the one the compiled Swift engine emits. |
| Fixture manifests are reproducible                     | Done   | `pnpm fixtures:regen -- --check` with Swift 6.0.3 exports twice and compares with the committed files: "exporter output is reproducible and matches 9 committed fixtures". `pnpm fixtures:verify` re-hashes every file (no Swift needed).               |
| Package export smoke tests pass                        | Done   | `pnpm smoke:exports`: Node ESM import, `tsc` under NodeNext and Bundler, publint, are-the-types-wrong, tarball contents, and tree-shaking, from a clean `npm install` of the packed tarballs of all 13 packages.                                       |

## Work items

| Item                                              | Status  | Evidence and caveats                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace, boundaries, lint/type/test rules       | Done    | pnpm + Turborepo, strict `tsconfig.base.json`, ESLint flat config with package-boundary and determinism rules (`tools/eslint`, `scripts/check-boundaries.mjs`, 12 rule tests), Prettier, vitest.                                                                                                  |
| CI definition                                     | Partial | `.github/workflows/ci.yml` runs format, lint, build, typecheck, test, schemas, fixtures, smoke, and docs on Node 22 and 24. It has not run on GitHub yet, and everything was verified locally on Node 22 only. `fixtures:regen -- --check --allow-missing-swift` is explicit in CI because the runner has no Swift toolchain; `fixtures:verify` performs the actual committed-corpus check. Superseded in Phase 1: CI installs Swift 6.0.3 on `ubuntu-24.04` and runs `fixtures:regen -- --check` without the flag. |
| Generated API documentation                       | Partial | `pnpm docs:api` (TypeDoc, packages mode) builds for `types`, `plugin`, `core` with 3 warnings (two schema tags `@asType`/`@minimum` unknown to TypeDoc; `Entry` not exported from `@sketchy-js/plugin`). Output is not published or checked for completeness.                                           |
| Consumer fixture                                  | Done    | `tools/consumer-smoke`. Uses `npm` for the consumer on purpose, since consumers are not on pnpm.                                                                                                                                                                                                  |
| JSON schemas                                      | Done    | Six schemas in `packages/types/schemas`: options, path operations, scene, geometry snapshot, color, seed. Generated from TypeScript types by `tools/schemas` (`pnpm schemas:check` fails on drift) and exercised with ajv (29 tests). Plugin option schemas also export through `toJsonSchema`. |
| Clamping and defaults in one source of truth      | Done    | `packages/core/src/options/spec.ts` covers sketch options, crayon, watercolor, sticker tear/texture/shadow/backing/image, and animation. 42 tests compare every default and clamp with the Swift dump, including Swift's NaN-to-lower-bound `min`/`max` behavior. Groups not in Swift's `Options` (for example plugin-defined brushes) are out of scope here. |
| Swift fixture exporter pinned to v1.5.0           | Partial | Pinned by tag and commit. Linux shims produce the original nine groups. The iOS simulator exporter adds stroke, brush, sticker, animation, and text fixtures plus a Darwin replay and float comparison. See `docs/fixtures.md`. |
| Reference images with manifest hashes             | Accepted | Upstream copies from Sketchy v1.5.0 `docs/images` at `fb17a6e`. Hashes are in the manifest `accepted` entry. `DocsGalleryRenderer` regeneration is deferred until pixel parity work. They are not yet compared with SketchyJS output. |
| Polygon backend benchmark and decision            | Done    | `tools/clipper-bench`, results in `tools/clipper-bench/results/results.json`, decision in `docs/adr/0001-polygon-clipper.md`: `clipper2-ts` default, `clipper2-wasm` optional, `polygon-clipping` rejected. Swift sticker contours are in `fixtures/swift-reference/v1.5.0/stickers/contours.json`. |

## Test results

Run on Linux x86_64, Node 22.23, pnpm 10.33.

| Command                           | Result                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `pnpm format:check`               | pass                                                                 |
| `pnpm lint` (eslint + boundaries) | pass, 13 packages                                                    |
| `pnpm typecheck`                  | pass, 17 turbo tasks                                                 |
| `pnpm test`                       | 9 files, 192 tests pass (including plugin validation/conformance and fit-scale coverage) |
| `pnpm schemas:check`              | up to date, 6 files                                                  |
| `pnpm fixtures:verify`            | manifest matches disk                                                |
| `pnpm fixtures:regen -- --check`  | reproducible, matches 9 committed fixtures                           |
| `pnpm smoke:exports`              | pass                                                                 |
| `pnpm docs:api`                   | builds, 3 warnings                                                   |

## Decisions needed from maintainers

1. **macOS fixtures.** Stroke, brush, sticker, animation, and text groups are exported. The docs images stay the imported upstream copies; `DocsGalleryRenderer` regeneration is deferred until pixel parity work. See `docs/fixtures.md`.
2. **Clipper decision.** `clipper2-ts` is the provisional default and `clipper2-wasm` is optional. Swift sticker contours are now in the fixture corpus; browser timings are still open.
3. **Float tolerance.** Aligned Darwin and Linux values differ by at most `2.84e-14` px, so keep the provisional `1e-4` CSS-pixel tolerance. Sunburst and starburst fills of the concave polygon are a separate shape mismatch. See `comparison/darwin-linux.json`.
4. **Publishing.** The project is MIT under the same copyright notices as Sketchy; Clipper notices are in `THIRD_PARTY_NOTICES`. Confirm `@sketchy-js` scope ownership on npm before publishing.

## Known limits

- RNG parity covers `SplitMix64`, `Float` and `Double` closed-range draws, and facet seed derivation, all against Swift fixtures. `Rng.fork(label)` (FNV-1a) is a SketchyJS addition with no Swift counterpart, so it is tested for stability only. Swift's `SeededNoise` is neither exported nor ported yet.
- The determinism lint rule blocks `Math.random()`, `Date.now()`, and similar in seeded packages. It is a syntax check and does not prove determinism.
- Tree-shaking sizes in the smoke test are measured with esbuild only.

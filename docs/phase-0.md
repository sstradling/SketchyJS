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
| CI definition                                     | Partial | `.github/workflows/ci.yml` runs format, lint, build, typecheck, test, schemas, fixtures, smoke, and docs on Node 22 and 24. It has not run on GitHub yet, and everything was verified locally on Node 22 only. `fixtures:regen -- --check --allow-missing-swift` is explicit in CI because the runner has no Swift toolchain; `fixtures:verify` performs the actual committed-corpus check. |
| Generated API documentation                       | Partial | `pnpm docs:api` (TypeDoc, packages mode) builds for `types`, `plugin`, `core` with 3 warnings (two schema tags `@asType`/`@minimum` unknown to TypeDoc; `Entry` not exported from `@sketchy-js/plugin`). Output is not published or checked for completeness.                                           |
| Consumer fixture                                  | Done    | `tools/consumer-smoke`. Uses `npm` for the consumer on purpose, since consumers are not on pnpm.                                                                                                                                                                                                  |
| JSON schemas                                      | Done    | Six schemas in `packages/types/schemas`: options, path operations, scene, geometry snapshot, color, seed. Generated from TypeScript types by `tools/schemas` (`pnpm schemas:check` fails on drift) and exercised with ajv (29 tests). Plugin option schemas also export through `toJsonSchema`. |
| Clamping and defaults in one source of truth      | Done    | `packages/core/src/options/spec.ts` covers sketch options, crayon, watercolor, sticker tear/texture/shadow/backing/image, and animation. 42 tests compare every default and clamp with the Swift dump, including Swift's NaN-to-lower-bound `min`/`max` behavior. Groups not in Swift's `Options` (for example plugin-defined brushes) are out of scope here. |
| Swift fixture exporter pinned to v1.5.0           | Partial | Pinned by tag and commit, 43 verbatim upstream files, Linux shims. Produces RNG, option, shape, fill, and SVG path-parse fixtures. Eight groups need macOS and are listed under `pending` in the manifest; see `docs/fixtures.md`.                                                                  |
| Reference images with manifest hashes             | Partial | Upstream docs images and test assets are copied and hashed (`images/catalog.json`, manifest). They are copies, not regenerated, and they are not yet compared with any SketchyJS output.                                                                                                          |
| Polygon backend benchmark and decision            | Done    | `tools/clipper-bench`, results in `tools/clipper-bench/results/results.json`, decision in `docs/adr/0001-polygon-clipper.md`: `clipper2-ts` default, `clipper2-wasm` optional, `polygon-clipping` rejected. Fixtures are synthetic; Swift sticker contours are pending.                              |

## Test results

Run on Linux x86_64, Node 22.23, pnpm 10.33.

| Command                           | Result                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `pnpm format:check`               | pass                                                                 |
| `pnpm lint` (eslint + boundaries) | pass, 13 packages                                                    |
| `pnpm typecheck`                  | pass, 17 turbo tasks                                                 |
| `pnpm test`                       | 9 files, 189 tests pass (core 102, plugin 37, types 29, eslint 12, fixtures 9) |
| `pnpm schemas:check`              | up to date, 6 files                                                  |
| `pnpm fixtures:verify`            | manifest matches disk                                                |
| `pnpm fixtures:regen -- --check`  | reproducible, matches 9 committed fixtures                           |
| `pnpm smoke:exports`              | pass                                                                 |
| `pnpm docs:api`                   | builds, 3 warnings                                                   |

## Decisions needed from maintainers

1. **License and notices.** No `LICENSE` file exists. Clipper2 builds are BSL-1.0; upstream Sketchy's license is copied into the corpus as `UPSTREAM-LICENSE`. Pick the project license and a third-party notices format before any publish.
2. **macOS fixtures.** Someone with a Mac must run the pending exporters (see `docs/fixtures.md`). Phase 2 and Phase 3 depend on them. Decide whether those phases wait for them.
3. **Clipper decision.** Confirm `clipper2-ts` as the default and `clipper2-wasm` as optional only, or ask for a browser benchmark first.
4. **Float tolerance.** The Darwin-versus-Linux comparison sets the tolerance for libm-dependent fixtures. Until then Phase 1 tests need a provisional tolerance; propose `1e-4` CSS pixels.
5. **Node floor.** Node 22 is the minimum supported runtime (`.nvmrc` and all package manifests); CI covers Node 22 and 24.
6. **Publishing scope.** `@sketchy-js/*` scope ownership has not been verified on npm.

## Known limits

- RNG parity covers `SplitMix64`, `Float` and `Double` closed-range draws, and facet seed derivation, all against Swift fixtures. `Rng.fork(label)` (FNV-1a) is a SketchyJS addition with no Swift counterpart, so it is tested for stability only. Swift's `SeededNoise` is neither exported nor ported yet.
- The determinism lint rule blocks `Math.random()`, `Date.now()`, and similar in seeded packages. It is a syntax check and does not prove determinism.
- Tree-shaking sizes in the smoke test are measured with esbuild only.

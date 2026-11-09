# ADR 0001: Polygon union and offset backend

- Status: Accepted for Phase 0 (revisit after the Phase 3 sticker fixtures; see "Open items")
- Date: 2026-11-09
- Scope: `@sketchy/stickers` (and `SketchGroup` silhouette union). Nothing else may depend on the chosen library.

## Context

Stickers need two geometric operations on flattened polygons:

1. **Union** of many shapes into one silhouette (groups, compound paths, holes, disconnected components).
2. **Offset (inflate)** of that silhouette by a backing width, with round joins for smooth edges and miter joins (with a limit) for sharp edges. Holes must shrink and can close, so topology changes.

`docs/plan.md` requires a benchmark of maintained JS/WASM candidates before any public sticker API, with the library hidden behind a small adapter and no handwritten general polygon boolean code.

## Candidates

| Package            | Version  | License | Maintained (last publish) | Offset | Delivery          |
| ------------------ | -------- | ------- | ------------------------- | ------ | ----------------- |
| `clipper2-ts`      | 2.0.1-19 | BSL-1.0 | 2026-11                   | yes    | pure TypeScript   |
| `clipper2-wasm`    | 0.4.0    | BSL-1.0 | 2026-05                   | yes    | Emscripten + WASM |
| `polygon-clipping` | 0.15.7   | MIT     | 2023-12                   | no     | pure JavaScript   |

`polygon-clipping` has no offset. The benchmark builds a round offset as the union of per-edge rectangles and per-vertex discs (a Minkowski dilation). Miter offsets are not expressible that way, so they are marked unsupported.

## Method

`tools/clipper-bench` (`pnpm bench:clipper`). Each case runs in a fresh worker with a time limit, five timed runs after warm-up, median reported. Every case runs twice to check byte-identical output. Output is checked for self-intersections and, for offsets, that the result contains the input.

Fixtures (all synthetic, generated deterministically):

- `concave-star-24` / `concave-star-120`: deeply concave stars (48 / 240 vertices).
- `compound-holes`: outer ring with three holes, one slot narrow enough to close under the offset.
- `dense-group-20` / `-80` / `-200`: overlapping rotated rounded rectangles (880 / 3520 / 8800 input vertices), unioned and then offset.

Raw results: `tools/clipper-bench/results/results.json`. Machine: Node 22.23, linux x64, shared Xeon VM, so absolute numbers are indicative and the ratios matter more.

## Results

Median milliseconds (output vertices in parentheses where they differ).

| Fixture / operation    | clipper2-ts | clipper2-wasm | polygon-clipping |
| ---------------------- | ----------- | ------------- | ---------------- |
| concave-star-24 union  | 0.27        | 0.15          | 0.80             |
| concave-star-24 round  | 1.55        | 0.81          | 9.02 (252 v)     |
| concave-star-24 miter  | 1.20        | 0.33          | unsupported      |
| concave-star-120 union | 1.26        | 1.10          | 2.02             |
| concave-star-120 round | 5.70        | 3.55          | **error**        |
| compound-holes round   | 3.01        | 1.47          | **error**        |
| dense-group-20 round   | 3.40        | 2.29          | **error**        |
| dense-group-80 union   | 4.83        | 5.13          | 19.99            |
| dense-group-80 round   | 9.09        | 4.80          | **error**        |
| dense-group-200 union  | 26.86       | 17.47         | 96.47            |
| dense-group-200 round  | 42.13       | 18.01         | **error**        |
| dense-group-200 miter  | 31.57       | 18.17         | unsupported      |

Correctness:

- All three agree on union area to within 0.001% on every fixture. Union output is deterministic and free of self-intersections for all three.
- `clipper2-ts` and `clipper2-wasm` agree on offset area to within 0.0002% and produce identical vertex counts. Both give the expected topology (compound-holes offset: 3 rings, 2 holes; the narrow slot closes).
- `polygon-clipping` threw `Unable to find segment #N` on every round offset except the smallest star. We did not investigate the root cause beyond noting that a dilation produces many coincident and near-coincident edges. We did not try to repair it with input perturbation, because a sticker backing must not depend on tuning that varies per shape.

Bundle cost (gzip, only the operations we need, tree-shaken):

| Candidate        | JS      | WASM    | Notes                                                   |
| ---------------- | ------- | ------- | ------------------------------------------------------- |
| clipper2-ts      | 17.3 KB | none    | named imports; `sideEffects: false`                     |
| clipper2-wasm    | 10.5 KB | 81.7 KB | async init; every native object needs manual `delete()` |
| polygon-clipping | 9.8 KB  | none    | union only; offset code would be ours                   |

## Decision

1. **Default backend: `clipper2-ts`.** It is correct on every fixture, handles round and miter offsets natively, is deterministic, has no WASM or async initialisation, and works unchanged in Node, browsers, workers, and SSR. Its worst case here (200 overlapping shapes, 8,800 input vertices) is about 42 ms, which is acceptable for a result that is cached by option hash.
2. **`clipper2-wasm` is a supported optional backend, not the default.** It is about 2x faster on large round offsets and up to 3.6x on miter offsets, with roughly parity on small unions, but adds 82 KB gzip of WASM, async init, and manual memory management that leaks if mishandled. Implement it behind the same adapter only if Phase 3 profiling shows group union or offset dominating frame time.
3. **`polygon-clipping` is rejected.** No offset, and the dilation workaround failed on 5 of 6 round-offset fixtures.
4. **Adapter boundary.** `@sketchy/stickers` defines a small `PolygonBackend` interface (`union(rings[]) -> rings[]`, `offset(rings[], delta, join) -> rings[]`) over plain `Float64`-compatible point arrays with even-odd/non-zero fill declared explicitly. The library is imported in exactly one module; a boundary rule for that is added in Phase 3 together with the adapter. Public APIs never expose library types.
5. **Coordinate precision.** Clipper's core works on integer coordinates. The adapter owns the scale factor and rounding so that both Clipper builds see identical integer input; the factor is chosen in Phase 3 and changing it afterwards is a geometry (seeded-output) change.

## Consequences

- Positive: no handwritten boolean code, one dependency, no async surface in the sticker API, and a clear escape hatch.
- Negative: roughly 17 KB gzip lands in any bundle that imports `@sketchy/stickers`, which is why stickers stay a separate package and `StickerImage` stays on a subpath. Both Clipper builds are BSL-1.0; it is permissive and requires no attribution in binaries, but the license notice must ship in the repository's third-party notices.
- Negative: `clipper2-ts` is a younger port than Clipper2 itself. Mitigation (to build in Phase 3): run the adapter contract tests (concave, holes, dense group) against both Clipper builds so a regression in the port is visible against the reference implementation.

## Open items

- The benchmark fixtures are synthetic. Swift's actual sticker contours (`sticker-backing-contours`) are pending a macOS export (see `docs/fixtures.md`). Re-run the adapter contract tests on those before the first public sticker release.
- Swift offsets with CoreGraphics stroking semantics (miter limit, how inner joins collapse) have not been compared with Clipper's `InflatePaths`. The Phase 3 geometric fixtures are the real check; expect small per-vertex differences and agree tolerances there.
- Timings are Node only. Browser numbers for the TS build should be taken during Phase 3.
- Which BSL-1.0 notice wording to ship is a maintainer decision (see Phase 0 open decisions).

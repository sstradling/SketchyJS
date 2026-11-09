# Swift reference fixtures

SketchyJS tests its output against data produced by the original Swift library, pinned to Sketchy `v1.5.0` (commit `fb17a6e7344f46da994ece07da1505be7d431b16`). This page explains what is in the corpus, how it is produced, how much to trust each part, and what is still missing.

## Layout

```
tools/swift-fixture-exporter/   Swift package that produces the data (not part of the pnpm workspace)
tools/fixtures/                 Node tools: manifest builder, verifier, regeneration, asset import
fixtures/swift-reference/v1.5.0/
  manifest.json                 sha256, size, fidelity and platform for every file, plus pending items
  rng/  options/  shapes/  fills/  svg/    exporter output (JSON)
  images/  assets/  UPSTREAM-LICENSE       files copied unchanged from the pinned upstream checkout
```

## Commands

| Command                                        | Purpose                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm fixtures:verify`                         | Recompute hashes and fail if `manifest.json` and the files on disk disagree. Needs no Swift. Runs in CI. |
| `pnpm fixtures:manifest`                       | Rebuild `manifest.json` from the files on disk.                                                          |
| `pnpm fixtures:regen`                          | Run the Swift exporter and overwrite the committed JSON. Needs a Swift 6 toolchain and network.          |
| `pnpm fixtures:regen -- --check`               | Export twice into temp directories; fail if the runs differ or differ from the committed files.          |
| `pnpm fixtures:import-assets`                  | Copy upstream docs images, test assets and license into the corpus and write `images/catalog.json`.      |

`fixtures:regen -- --check` exits 0 without checking anything when no Swift toolchain is on `PATH` (set `SWIFT_BIN` to override). Treat a green run on a machine without Swift as unverified. It was run with Swift 6.0.3 on Linux for Phase 0 and reported "exporter output is reproducible and matches 9 committed fixtures".

## How the exporter works on Linux

The exporter does not reimplement Sketchy. `scripts/prepare.sh` clones the pinned tag, checks that `HEAD` equals the pinned commit, and copies 43 Swift files (the engine plus `SVGPath`, `SVGArcConverter`, `CGPathToSVG`) into `Sources/exporter/Upstream/` (git-ignored). The only edit is deleting `import os.signpost` lines. The sha256 of every copied file is recorded in `upstream-files.json`, which is committed, and its own hash is stored in the manifest as `upstreamFilesSha256`.

The engine imports UIKit, CoreGraphics, SwiftUI and CoreText, which do not exist on Linux. Small shims stand in for them (`Shims/*`, `LinuxShims.swift`, about 125 lines in total). They provide only the types and path-building calls the compiled engine files use. Anything that needs real CoreGraphics behavior (stroking, path union, offsetting, clipping) is not implemented and is listed under "Pending" below instead of being approximated.

Excluded engine files: `TextPathConverter`, `Color+Extensions`, `RoughColor`, `PerformanceInstrumentation`.

## Trust levels

Each file in the manifest carries a `fidelity` tag. Tests should use tolerances that match it.

| Fidelity          | Meaning                                                                                      | Files                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `verbatim-engine` | Produced only by upstream engine code and the Swift standard library. Exact on any platform. | `rng/*`, `options/*`                                   |
| `shim-dependent`  | Also passes through a Linux CGPath or UIBezierPath shim.                                     | `shapes/shapes.json`, `fills/scribble.json`            |
| `libm-dependent`  | Uses trigonometry, so the last bits can differ per platform.                                 | `fills/fills.json`, `fills/direct-fillers.json`, `svg/path-parse.json` |
| `upstream-copy`   | A file copied unchanged from upstream.                                                       | `images/*`, `assets/*`, `UPSTREAM-LICENSE`             |

All exporter data is tagged `linux-x86_64` unless it is `any`. Until the Darwin comparison below is done, we do not know whether libm differences exceed the test tolerances.

The RNG fixtures include the sequence quoted in the Swift test suite (`SeedDeterminismTests.testSplitMix64MatchesReferenceSequence`, seed 42) next to the sequence the compiled engine actually emits, so a mismatch between documentation and code would be visible in the data.

## Reproducibility rules for the exporter

- No timestamps, hostnames, absolute paths, or locale-dependent formatting in output.
- JSON keys sorted, two-space indent, trailing newline (`JSON.swift`).
- 64-bit integers are written as decimal strings because JSON numbers lose precision above 2^53.
- Non-finite numbers are written as the strings `"NaN"`, `"Infinity"`, `"-Infinity"`.
- Floats use Swift's shortest round-trip description. Tests that compare a `Float` fixture must apply `Math.fround` to the expected value.

## Pending (needs macOS)

These are recorded in `manifest.json` under `pending` so the gap is visible in every checkout.

| Id                             | Why Linux cannot produce it                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `stroke-outlines`              | CoreGraphics stroking (`copy(strokingWithWidth:)`).                                |
| `crayon-watercolor-layers`     | CoreGraphics path and clip behavior.                                               |
| `sticker-backing-contours`     | CoreGraphics path union and offset. Also needed to validate ADR 0001.              |
| `sticker-image-placement`      | `StickerImagePainter` is SwiftUI code; placement is not a pure function upstream.  |
| `animation-frames`             | `PathVariance` and frame generation sit behind the SwiftUI render layer.           |
| `text-outlines`                | CoreText glyph outlines and system fonts.                                          |
| `reference-image-regeneration` | Docs images need the macOS `DocsGalleryRenderer` target; they are copied, not rebuilt. |
| `darwin-float-comparison`      | Compare a Darwin export of the existing fixtures against the Linux one.            |

### macOS regeneration plan

1. On a Mac with Xcode, check out this repository and the pinned Sketchy tag.
2. Add exporters for the pending items in a macOS-only target that links the real `Sketchy` module (so no shims). Write to `fixtures/swift-reference/v1.5.0/<group>/` with `platform: "darwin-arm64"` in the classification.
3. Run the existing exporter against real Foundation too, and diff its output against the committed Linux files. Record the largest per-field delta; that sets the tolerance used by Phase 1 and 2 tests.
4. `pnpm fixtures:manifest`, commit, and remove the corresponding `pending` entries.

Phases that depend on pending items: Phase 2 (stroke outlines, crayon, watercolor, animation frames) and Phase 3 (sticker contours, image placement). They should not be started without the matching fixtures or an explicit decision to proceed without them.

## Adding a fixture

1. Add the exporter in `Sources/exporter/` and call it from `main.swift`.
2. Classify it in `tools/fixtures/lib.mjs` (`classify`) with an honest fidelity tag.
3. Run `pnpm fixtures:regen`, then `pnpm fixtures:manifest`, then `pnpm fixtures:regen -- --check`.
4. Add a vitest that loads it through the package's `test/fixtures.ts` helper.

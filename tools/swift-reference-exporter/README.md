# Phase 3 Darwin fixture exporter

This directory is the Swift harness that wrote `fixtures/swift-reference/v1.5.0/stickers/phase3.json`. It compiles Sketchy **v1.5.0** (`fb17a6e7344f46da994ece07da1505be7d431b16`) and runs it in the iOS simulator, so the contours come from UIKit and CoreGraphics. Sketchy sources are not stored in this repository. The script reads a local checkout with `git archive` and deletes that archive when it exits.

The JSON writer is the shared one at `tools/swift-fixture-exporter/Sources/exporter/JSON.swift`.

## Rerun on a Mac

Requirements: Xcode, a booted iOS simulator, and a Sketchy git checkout that contains commit `fb17a6e7344f46da994ece07da1505be7d431b16`. The script does not switch branches or write into that checkout.

```bash
xcrun simctl boot "iPhone 17 Pro"   # skip when a simulator is already booted
tools/swift-reference-exporter/scripts/export.sh \
  /path/to/Sketchy \
  /tmp/phase3.json
```

The build target is `$(uname -m)-apple-ios17.0-simulator`. The committed fixture was produced on `darwin-x86_64` with Xcode 26.0.1 (17A400), Swift 6.2 (`swiftlang-6.2.0.19.9 clang-1700.3.19.1`), and the iPhone 17 Pro simulator on iOS 26.0 (23A343). `SWIFT_DETERMINISTIC_HASHING=1` is set for the simulator process. Group union walks a dictionary, and that flag keeps the ring's starting vertex stable.

The provenance strings passed into the binary are the ones recorded in the committed file. They are labels. The geometry comes from the pinned Sketchy sources and the simulator frameworks.

## `group-torn` reconstruction fields

The other cases are unchanged. `group-torn` adds:

| Field | Source |
| --- | --- |
| `parts` | Each `SketchPart`: circle center and diameter, the part `CGAffineTransform` (`a b c d tx ty`), and the stroke, roughness, bowing, randomness, and seed actually stored on that part. |
| `groupTransform` | `SketchGroup.transform`. This case is identity. The second circle's move is the part transform from `sketchOffset(x: 36, y: 8)`. |
| `preSimplifyRings` | `Centerline.source` on the lines returned by `SketchGroupRenderer.silhouetteLines`. For a torn group that source is the union ring before `simplify(..., epsilon: 1.8)`. `startIndex` is 0: point 0 is the vertex Swift emitted first. The array is not rotated. |
| `simplifyEpsilon` | The literal `1.8` passed in `SketchGroup.swift` at v1.5.0. The harness repeats that private Ramer–Douglas–Peucker pass and exits if it does not reproduce `centerlines`. |
| `offsetBeforeTear` | `StickerBackingBuilder.offsetClosed` on the simplified ring, at the same signed distance `commands(for:outward:)` uses (`backing.width`, positive for an exterior). This is the ring handed to the private chop. The chop itself is file-private and is not reimplemented. |

`centerlines`, `commands`, `input`, and `storedSmoothness` are the original measurements.

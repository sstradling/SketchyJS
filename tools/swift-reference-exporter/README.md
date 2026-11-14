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

## Where the union ring starts

`SilhouetteUnion.chain` is what chooses the first vertex. It does not search for the maximum x.

Boundary edges are stored in a dictionary whose key quantizes each edge's start to a 0.2 point grid:

```swift
Key(x: Int((point.x / 0.2).rounded()), y: Int((point.y / 0.2).rounded()))
```

`Array(unused.keys)` is then walked in `Dictionary` iteration order. With `SWIFT_DETERMINISTIC_HASHING=1` that order is stable, because `Hasher` uses a fixed seed, and it is the hash-table order of those integer keys. It is not sorted by x or y. The ring begins at `start` of the edge `popLast()` returns for the first key that still has edges. `popLast` matters when several edges share one quantized start: the last edge appended is the one the walk leaves on. Append order follows `boundaryEdges`, which iterates `Dictionary(grouping: rings, by: \.shape).values` (shape-id hash order) and then each ring's own vertices.

`group-torn-2` keeps the rectangle and the circle apart. In v1.5.0, those two outlines overlapped and `combine` returned no loop when they had different shape ids, so that layout has no ring to measure. Separate components still start by the same key order, and the order of the keys also chooses which component is first.

After that first edge, the rest of the loop is geometric. At each vertex the next edge is the sharpest right turn, since the filled side is on the left. The dictionary is only used again to find the bucket of the current end point. The repeated closing vertex is dropped, so `preSimplifyRings[].points[0]` (`startIndex` 0) is the vertex the walk started on. Simplify keeps that vertex first, which is why the centerline starts there too.

A second dictionary, `Dictionary(grouping:by: \.shape)`, does not pick the start key. It can change which duplicate edge survives into a bucket, and therefore which edge `popLast` selects.

## `group-torn` reconstruction fields

`group-torn`, `group-torn-2`, `group-torn-3`, and `group-torn-4` add:

| Field | Source |
| --- | --- |
| `parts` | Each `SketchPart`: circle center and diameter, the part `CGAffineTransform` (`a b c d tx ty`), and the stroke, roughness, bowing, randomness, and seed actually stored on that part. |
| `groupTransform` | `SketchGroup.transform`. This case is identity. The second circle's move is the part transform from `sketchOffset(x: 36, y: 8)`. |
| `preSimplifyRings` | `Centerline.source` on the lines returned by `SketchGroupRenderer.silhouetteLines`. For a torn group that source is the union ring before `simplify(..., epsilon: 1.8)`. `startIndex` is 0: point 0 is the vertex Swift emitted first. The array is not rotated. |
| `simplifyEpsilon` | The literal `1.8` passed in `SketchGroup.swift` at v1.5.0. The harness repeats that private Ramer–Douglas–Peucker pass and exits if it does not reproduce `centerlines`. |
| `offsetBeforeTear` | `StickerBackingBuilder.offsetClosed` on the simplified ring, at the same signed distance `commands(for:outward:)` uses (`backing.width`, positive for an exterior). This is the ring handed to the private chop. The chop itself is file-private and is not reimplemented. |

`centerlines`, `commands`, `input`, and `storedSmoothness` are the original measurements.

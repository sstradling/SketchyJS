# Visual review

Geometry and pixels are different checks. A parity fixture compares operations: the same set types, then coordinates within `1e-4` px. A preview compares SVG with Canvas after rasterizing both.

## When a picture is required

- A new fill, brush, shade, or sticker that changes pixels.
- A change to blur, gradients, clips, or image tint.
- A closed-stroke change that alters the ribbon.

The picture lives in `docs/examples/phase-N/` as a PNG under 10 MB. The test that writes it compares SVG and Canvas and only rewrites the file when `UPDATE_EXAMPLES=1`. Reviewers look at the PNG in the PR. They do not treat it as a Swift screenshot.

## Channel limits

A pixel counts as different when any RGBA channel differs by more than the delta.

| Scene | Delta | Max fraction | Why |
| --- | --- | --- | --- |
| Geometric fills, clips, strokes, transforms | 24 | 0.4% | Antialiasing on a round cap |
| Watercolor and crayon | 4 | 2% | A faint glaze must stay visible to the check |
| Scribble | 24 | 3% | Dense crossings rasterize differently |
| Contour and wash previews | 24 | 8–12% | Many thin strokes. The paths match; the coverage of a 1 px wobble does not |
| Interior shades and halo | 12 | 6% | SVG `stdDeviation = blur`. Canvas `shadowBlur = 2 * blur` because canvas sigma is about `shadowBlur / 2`. Half or double that blur fails a 3% check on the pit shadow at delta 12, and an 8.1% check on the halo at delta 4 |
| Silhouette tint | 12 | 6% | SVG filter versus Canvas `source-in`. The exported cards fit this |

Do not raise a limit to hide a wrong path. If the operations differ, fix the geometry. The pixel limit is only for antialiasing and the documented filter gap.

## What not to do

- Do not compare an antialiased Swift PNG at zero tolerance.
- Do not edit a fixture to match a drift. The 1.6.0 fixture wins where Sketchy intentionally changed a 1.5.0 result. The 1.5.0 files stay as they are.
- Do not regenerate `docs/examples` in a drive-by formatting change.

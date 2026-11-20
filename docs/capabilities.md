# Rendering and backend capabilities

Both renderers consume the same `Scene`. Geometry is decided before either one runs. What differs is paint: blur, gradients, image tint, and antialiasing.

| Capability | SVG | Canvas 2D | Notes |
| --- | --- | --- | --- |
| Solid, hachure, zigzag, cross-hatch, dots, dashed, zigzag-line, sunburst, starburst, scribble | yes | yes | Same paths |
| Contour and wash | yes | yes | Stroke width and opacity travel on the layer |
| SVG holes in those fills | even-odd clip | even-odd clip | Short contour clips are dropped before paint |
| Watercolor and crayon | yes | yes | Filled marks, not a native stroke |
| Variable width, width stops, curved bevel | filled outline | filled outline | Closed rings keep the profile and use the winding rule |
| Interior shades | filters and gradients | `shadowBlur` and canvas gradients | See the blur row |
| Halo | mask + `feGaussianBlur` | inverse clip + `shadowBlur` | Outside half of a double-width stroke |
| Sticker sheet, torn edge, paper, image mask | yes | yes | Not in the basic import |
| Silhouette shadow | `feFlood` + `feComposite`, needs a data URL | `source-in` on an offscreen surface, or a live canvas | `@sketchy-js/scene/silhouette` |
| Clips, inverse clips | `clipPath` or mask | `clip` or a luminance mask | |
| Nested transforms | `transform` attribute | `context.transform` | Not multiplied into stroke width |
| Text | supplied outlines | supplied outlines | Browser text is not a parity path |
| OffscreenCanvas worker | not shipped | not shipped | Benchmark did not show a benefit. See [phase-4.md](phase-4.md) |
| WebGL / WebGPU | no | no | Not justified by the benchmark |

## Blur and filters

| Effect | SVG | Canvas | CoreGraphics |
| --- | --- | --- | --- |
| Sticker shadow | `feDropShadow`, `stdDeviation = radius / 2` | `shadowBlur = radius` | native shadow |
| Interior inner shadow | `feOffset` + `feGaussianBlur`, `stdDeviation = blur`, then a flood | `shadowBlur = blur`, `shadowOffset` | same sigma. Sticker shadows still use `radius / 2` |
| Halo | `stdDeviation = blur` | `shadowBlur = blur` | same sigma |

Shade blur uses sigma = `blur` on both SVG and Canvas. Sticker shadows keep `stdDeviation = radius / 2`. Compare geometry in the parity tests. Compare SVG with Canvas, and the shade cards with the Swift PNGs, using the channel limits in [visual-review.md](visual-review.md).

## What the basic import pays for

`@sketchy-js/scene/basic` registers the built-in fills except contour and wash. Those two are `@sketchy-js/fills/contour` and `@sketchy-js/fills/wash`, then `registry.use(...)`. The basic import does not include stickers, the silhouette helper, React, or the canvas renderer. Stickers do not import React. The React entry does not import Canvas; `SketchyCanvas` is `@sketchy-js/react/canvas`.

# API parity with Sketchy 1.6.0

Marks: **same** (same drawing semantics), **web** (same idea, web types or names), **experimental** (usable, still moving), **n/a** (no web equivalent, or deliberately not ported).

| Sketchy | SketchyJS | Mark |
| --- | --- | --- |
| `RoughView` modifiers | `RoughView.with({ ... })` | web |
| `sketch` / functional draw | `sketch(shape, size, options)` | web |
| Shapes (`rectangle`, `ellipse`, `circle`, `polygon`, `arc`, `curve`, `path`, `linearPath`, `roundedRectangle`, `egg`, `line`) | same constructors | same |
| `seed`, roughness, bowing, fill angle in degrees | same fields | same |
| Hachure, solid, zigzag, cross-hatch, dots, dashed, zigzag-line, sunburst, starburst | fill plugins | same |
| Scribble | `scribble` fill | same |
| Watercolor fill and brush | `@sketchy-js/brushes` | same |
| Crayon | `@sketchy-js/brushes` | same |
| `.widthStops`, `.variable`, caps and joins | `brushProfile` | same |
| Closed contour keeps stops and `.variable`, 6% join blend | `thicknessWidth(..., closed)` | same |
| Winding fill so two rough passes union | `fillRule: "nonzero"` on those outlines | same |
| `.fillStyle(.contour)` | `fillStyle: "contour"` | same |
| `contourGuide` arc and polyline | `{ kind: "arc" \| "polyline" }` | web |
| `ContourGuide.path` (CGPath flatten) | not a built-in. Pass the polyline | web |
| Intensity, start/end, angle, easing, falloff | same fields | same |
| `.animatedContour` | `contourDrift` plus `useContourPhase` | web |
| `.fillStyle(.wash)`, `WashPass.sky` | `fillStyle: "wash"`, `skyWash` | same |
| `.interiorShades`, pit, recess, edge, halo | `interiorShades` and the preset functions | same |
| Shade blur kernel | SVG and Canvas approximations | web |
| `SilhouetteShadow`, `.tree(image:at:)` | `@sketchy-js/scene/silhouette` | web |
| `StickerShadow` | sheet shadow on the sticker backing | same |
| `StickerBacking`, edges, paper, groups | `@sketchy-js/stickers`, `@sketchy-js/scene/stickers` | same |
| `StickerImage` / `UIImage` | `@sketchy-js/stickers/image`, caller-decoded source | web |
| `SketchGroup` / `SketchPart` | same names | web |
| SwiftUI `.frame`, `.offset`, `.scaleEffect` | renderer size; part transforms are explicit | n/a |
| `UIColor` / SwiftUI `Color` | `Color` | web |
| CoreText `RoughText` | supply outlines. Browser text is not parity | n/a |
| `AnimatedRoughView` | `createAnimation` | web |
| Drawing cache | no process-wide cache. Generation is pure. Shades and silhouette stay out of it | web |
| Plugin API 1.0 | `defineFill` and the other three | same |
| rough.js as a dependency | not used | n/a |

`nonzero` is the winding rule. `evenodd` is even-odd. Closed variable-width and stopped strokes fill nonzero so the two rough passes union. The outline is still a ribbon, so the middle of a ring stays empty.

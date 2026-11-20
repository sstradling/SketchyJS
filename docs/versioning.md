# Version policy

SketchyJS package versions match the Swift Sketchy library.

- The first stable JS release is **1.6.0**. It means parity with Sketchy 1.6.0, including the 1.5.0 surface that 1.6.0 still draws. It is not 1.0.0, and it is not 1.5.0. Seth moved the first tag from 1.5.0 to 1.6.0 when contour, wash, interior shades, closed variable width, and silhouette shadows landed in this phase.
- After that, each JS release line tracks the Swift **minor** version it reaches parity with. Sketchy 1.7 behavior ships as JS 1.7.x.
- Fixes that do not move Swift parity use **patch** numbers (1.6.1, 1.6.2).
- Git tags are **`v`-prefixed** (`v1.6.0`). Do not tag feature branches.
- The plugin API version (currently **1.0**) is a different number. It describes `defineBrush` / `defineFill` / `defineTexture` / `defineStickerEdge` and does not follow the package version. Additive fields on that contract (`RoughKit.curve`, `RoughKit.isolated`, contour and wash inputs, stroke scale on fill parts, `BrushInput.thickness`) stay on 1.0 because nothing has been published.

Nothing in this repository has been published. `package.json` versions are still `0.0.0` on purpose until the release that sets 1.6.0. Do not treat a Changesets minor bump from `0.0.0` as that release: it would publish `0.1.0`, which breaks this policy. The release PR sets `1.6.0` explicitly. This phase wires the workflow and leaves the versions at `0.0.0`.

`.changeset/config.json` puts the publishable packages in one `fixed` group so they always share a version: `types`, `plugin`, `core`, `fills`, `brushes`, `stickers`, `scene`, `svg-renderer`, `canvas-renderer`, `animate`, `react`, `web-components`, and `contrib`.

`v1.4.2` appears in [plan.md](plan.md) only as the old Sketchy pin this plan was first written against. It is not a SketchyJS version. `v1.5.0` in the fixture tree is the Sketchy pin those files were exported from. It is not the SketchyJS release tag.

# Version policy

SketchyJS package versions match the Swift Sketchy library.

- The first stable JS release is **1.5.0**. It means parity with Sketchy 1.5.0. It is not 1.0.0.
- After that, each JS release line tracks the Swift **minor** version it reaches parity with. Sketchy 1.6 behavior ships as JS 1.6.x.
- Fixes that do not move Swift parity use **patch** numbers (1.5.1, 1.5.2).
- Git tags are **`v`-prefixed** (`v1.5.0`). Do not tag feature branches.
- The plugin API version (currently **1.0**) is a different number. It describes `defineBrush` / `defineFill` / `defineTexture` / `defineStickerEdge` and does not follow the package version.

Nothing in this repository has been published. `package.json` versions are still `0.0.0` on purpose until the release that sets 1.5.0. Do not treat a Changesets minor bump from `0.0.0` as that release: it would publish `0.1.0`, which breaks this policy.

`v1.4.2` appears in [plan.md](plan.md) only as the old Sketchy pin this plan was first written against. It is not a SketchyJS version.

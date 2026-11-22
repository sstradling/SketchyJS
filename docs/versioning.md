# Version policy

SketchyJS package versions match the Swift Sketchy library.

- The first stable JS release is **1.6.0**. It means parity with Sketchy 1.6.0, including the 1.5.0 surface that 1.6.0 still draws. It is not 1.0.0, and it is not 1.5.0. Seth moved the first tag from 1.5.0 to 1.6.0 when contour, wash, interior shades, closed variable width, and silhouette shadows landed in this phase.
- After that, each JS release line tracks the Swift **minor** version it reaches parity with. Sketchy 1.7 behavior ships as JS 1.7.x.
- Fixes that do not move Swift parity use **patch** numbers (1.6.1, 1.6.2).
- Git tags are **`v`-prefixed** (`v1.6.0`). Do not tag feature branches.
- The plugin API version (currently **1.0**) is a different number. It describes `defineBrush` / `defineFill` / `defineTexture` / `defineStickerEdge` and does not follow the package version. Additive fields on that contract (`RoughKit.curve`, `RoughKit.isolated`, contour and wash inputs, stroke scale on fill parts, `BrushInput.thickness`) stay on 1.0 because nothing has been published.

`@sketchy-js/sketchy` and `@sketchy-js/react` are **1.6.0**. Nothing has been published to npm yet. Publishing is the release workflow on master, with the version input `1.6.0`. It does not run `changeset version` again. Feature PRs add changesets and do not edit package versions.

The first release could not start from `0.0.0`. A minor bump from `0.0.0` writes `## 0.1.0` in the changelogs. This release set both packages to `1.5.0`, added one minor changeset that names them, and ran `pnpm changeset version`. That bumped both to `1.6.0` and headed each changelog with `## 1.6.0`. Later releases take the version the command produces from the version already on the branch.

The publish workflow takes the resulting version as a required input, including when the dispatch is a dry run. It does not run `changeset version` again, and it refuses to publish while a changeset is still pending. See [CONTRIBUTING.md](../CONTRIBUTING.md).

The publish job is bound to the GitHub environment `npm-publish`. Before the first real publish, create that environment on this repository and add a required reviewer. A dispatch with dry run off then waits for that approval. `NPM_TOKEN` stays the registry credential; the environment is the approval gate, not a replacement for the token.

`pnpm changeset status` exits 1 on this branch after `changeset version`. The command diffs the packages against master, the version bump is in that diff, and the changeset file has already been consumed, so it reports a package change with no changeset. That is expected. The release gate does not call it. It refuses a pending changeset file instead, and this branch has none. Do not add an empty changeset to silence the command: the gate would then refuse to publish.

`.changeset/config.json` puts the two publishable packages in one `fixed` group so they always share a version: `@sketchy-js/sketchy` and `@sketchy-js/react`. This release set both to `1.5.0`, added one minor changeset, and ran `changeset version`, which wrote `1.6.0`.

`v1.4.2` appears in [plan.md](plan.md) only as the old Sketchy pin this plan was first written against. It is not a SketchyJS version. `v1.5.0` in the fixture tree is the Sketchy pin those files were exported from. It is not the SketchyJS release tag.

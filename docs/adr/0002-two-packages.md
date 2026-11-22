# ADR 0002: Two publishable packages

- Status: Accepted
- Date: 2026-11-21
- Supersedes the package split in [ADR 0001](0001-polygon-clipper.md) only for where the code lives. The clipper choice is unchanged.

## Context

The first publish was about to ship thirteen `@sketchy-js/*` packages. Most of them exist so the build can keep Clipper, Canvas, and the SVG renderer out of a small import. That split is real, but it does not need thirteen npm names. A consumer had to install a graph of packages that always version together.

## Decision

Publish two packages.

- `@sketchy-js/sketchy` holds types, the plugin contract, core geometry, fills, brushes, stickers, the scene, SVG, Canvas, animation frames, and the custom element. Public subpaths keep the old entry points (`/core`, `/fills/hachure`, `/stickers/clipper`, `/svg`, `/canvas`, `/scene/basic`, and the rest).
- `@sketchy-js/react` depends on `@sketchy-js/sketchy` and has one peer, `react`. Canvas is a subpath of the React package and is no longer an optional peer.
- `clipper2-ts` stays a normal dependency of `@sketchy-js/sketchy`, external in the build, imported only from `src/stickers/clipper`. A core-only or SVG bundle does not include it.
- The empty `contrib` package is removed. Community plugins can still be separate npm packages that depend on `@sketchy-js/sketchy/plugin`.

Folder rules replace the old package dependency list. Pure-geometry folders (`types`, `plugin`, `core`, `fills`, `brushes`, `stickers`) still cannot use DOM globals or unseeded randomness.

## Consequences

Versions move together in one Changesets fixed group of two. The first release still sets both to `1.5.0`, adds a minor changeset, and runs `changeset version` so the changelogs say `1.6.0`. Import paths change; the geometry and the fixtures do not.

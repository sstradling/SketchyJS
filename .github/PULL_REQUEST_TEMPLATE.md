## Summary

<!-- What does this change and why? Link the issue: Fixes #123 -->

## Type of change

- [ ] Plugin (new or changed brush, fill, texture, or sticker edge)
- [ ] Core, scene, renderer, or sticker change
- [ ] Docs only
- [ ] Tooling, CI, or build
- [ ] Breaking change (public API, option schema, or seeded output changes)

## Checklist (all PRs)

- [ ] `pnpm check` passes locally (lint, types, tests, size)
- [ ] Tests added or updated, including edge cases (empty, zero-length, closed, degenerate)
- [ ] Docs and doc comments updated
- [ ] Changeset added (`pnpm changeset`) if a published package changes
- [ ] No `Math.random`, `Date.now`, or other nondeterminism in seeded code
- [ ] Snapshot or fixture changes are explained below

## Plugin checklist (delete this section if not a plugin PR)

Plugin id and kind: `contrib/<name>` / brush | fill | texture | edge

- [ ] Generated with `pnpm new` (or the same structure) and placed in the right package
- [ ] Pure: only `@sketchy/plugin` imports, no DOM or Canvas, no module-level mutable state
- [ ] `defineX(...)` is annotated `/*#__PURE__*/`; the module exports only the plugin and types
- [ ] Every option has `min`, `max`, `default`, `unit`, and an artist-readable `description`
- [ ] At least two `examples` with fixed seeds; defaults look good with no tuning
- [ ] Conformance suite passes with no `expectedFailures` (or each is linked to an issue below)
- [ ] Snapshots committed and visually reviewed; SVG and Canvas match (`pnpm test:visual <name>`)
- [ ] Size within budget in `budgets.json` (or the increase is justified below)
- [ ] `<name>.doc.md` and `<name>.demo.ts` present and render in the playground
- [ ] I have the right to contribute this code under the repository license

## Visual changes

<!-- Gallery or playground screenshots, or the CI visual report link. For snapshot updates, say why the output changed. -->

## Size and performance

<!-- Gzip size before and after (CI posts a delta comment). Op count for typical shapes if relevant. -->

## Notes for reviewers

<!-- Design decisions, trade-offs, follow-ups, known limitations, expectedFailures. -->

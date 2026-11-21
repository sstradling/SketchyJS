# Contributing to SketchyJS

Thanks for helping. SketchyJS is a TypeScript port of the Swift library [Sketchy](https://github.com/sstradling/Sketchy). This file covers the repository rules. For adding a brush, fill, texture, or sticker edge, go straight to [docs/contributing-plugins.md](docs/contributing-plugins.md).

> **Status: design phase.** The repository currently contains design docs only. The commands below are the target workflow for Phase 0 of [the plan](docs/plan.md) and will start working as the workspace is created. Until then, contributions are documentation and design feedback.

## Ways to contribute

| You want to | Start here |
| --- | --- |
| Add or improve a brush, fill, texture, or sticker edge | [docs/contributing-plugins.md](docs/contributing-plugins.md). Add the plugin by hand with `defineFill`, `defineBrush`, `defineTexture`, or `defineStickerEdge`. There is no scaffold script |
| Fix a bug or improve core geometry, renderers, scene, stickers | Open an issue first for anything larger than a small fix |
| Improve docs or examples | A PR is welcome; no issue needed |
| Report a rendering difference from Swift Sketchy | Issue with the shape, options, seed, and the Swift output |
| Propose a new plugin kind, API change, or package | Issue labeled `design`; read [docs/plugins.md](docs/plugins.md) and [docs/plan.md](docs/plan.md) first |

## Setup

Requirements: Node.js 22+ (pinned in `.nvmrc`) and pnpm (pinned by the `packageManager` field; enable with `corepack enable`).

```bash
git clone https://github.com/sstradling/SketchyJS.git
cd SketchyJS
corepack enable
pnpm install --frozen-lockfile
pnpm build        # builds all packages in dependency order (Turborepo)
pnpm lint
pnpm typecheck
pnpm test
pnpm size
```

### Commands

| Command | What it does |
| --- | --- |
| `pnpm build` | Build every package (ESM and `.d.ts`) |
| `pnpm test` | Vitest, including pixel comparisons and plugin conformance |
| `pnpm lint` | ESLint, package boundaries, LICENSE copies, and README typecheck |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | `tsc --noEmit` for every workspace package, including `tools/release` |
| `pnpm size` | Bundle-size budgets |
| `pnpm docs:api` | TypeDoc API docs |
| `pnpm examples:svg` | Rewrite the committed SVG example sheets |
| `pnpm changeset` | Record a release note and version intent |

There is no `pnpm new`, `pnpm dev`, `pnpm check`, `pnpm test:visual`, or `pnpm docs:plugins`. Before pushing, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm size`. CI runs those plus the schema check, fixture verify, export smoke, and size budget. Preview PNGs are rewritten with `UPDATE_EXAMPLES=1`, and `UPDATE_EXAMPLES_ONLY` limits that to named files.

## Repository layout

```text
packages/        types, plugin, core, fills, brushes, stickers, scene,
                 svg-renderer, canvas-renderer, animate, react, web-components,
                 testkit, eslint-plugin, contrib
apps/            playground, docs
fixtures/        swift-reference (generated from Sketchy), generated
docs/            plan, plugin architecture, contributor guides
tools/           plugin generator and templates
```

Package boundaries are part of the design: `core` has no browser, renderer, or polygon-clipping dependency, and `types` and `plugin` have no side effects. See [docs/plan.md](docs/plan.md#2-architecture). Do not add an import that crosses these boundaries without a design issue.

## Workflow

1. **Branch** from the default branch: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `plugin/<name>`. Do not push tags; releases are created by the release workflow only, with `v`-prefixed tags. The first stable tag is `v1.6.0` (see [docs/versioning.md](docs/versioning.md)).
2. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/) (`feat(brushes): ...`, `fix(core): ...`, `docs: ...`). Keep commits logical; do not mix refactors with behavior changes.
3. **Add a changeset** (`pnpm changeset`) for any change that affects a published package. Say whether seeded output changes; that is a breaking change for stable plugins and built-ins. Do not edit `package.json` versions in that PR. The release PR sets all 13 packages to `1.5.0`, adds one minor changeset, and runs `pnpm changeset version`. That writes `1.6.0` and a `## 1.6.0` heading in each changelog. A minor bump from `0.0.0` would have written `## 0.1.0` instead. See [docs/versioning.md](docs/versioning.md). The publish job refuses to run while a changeset is still pending.
4. **Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm size`** before pushing. CI runs those plus the schema check, fixture verify, and export smoke.
5. **Open a pull request** using the template. Draft PRs are welcome for early feedback.
6. **Review.** One maintainer approval is required; changes to `core`, `types`, `plugin`, or the RNG need two. Address feedback with new commits; maintainers squash on merge.

## Code standards

- **TypeScript:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. ESM only. No `any` without a comment explaining why.
- **Determinism:** anything seeded must use the injected RNG. `Math.random`, `Date.now`, and similar are forbidden in `core`, `fills`, `brushes`, `stickers`, `scene`, and all plugins. This is lint-enforced.
- **Immutability:** geometry and scene data are immutable and serializable. Do not mutate arguments.
- **Size of things:** split files that grow past a few hundred lines and functions that do more than one thing. Prefer small pure functions; they are what the tests target.
- **Docs:** every exported function and type has a doc comment stating what it does, its units (px, degrees), and its determinism or seeding behavior. Public behavior changes update the docs in the same PR.
- **Tests:** add or update unit tests for all business logic, with the likely scenarios and the edge cases (empty, zero-length, closed, degenerate). Core geometry changes need fixtures or independent mathematical assertions (see the plan's parity test design); tests must not compute expected values with a second copy of the implementation. Integration tests cover interactions with external services such as the Playwright renderer tests and fixture exporters.
- **Simplicity first:** if CSS, SVG, or Canvas can do it natively and identically, do not add code. If it is renderer-sensitive, express the intent in the IR and let both renderers implement it.
- **Dependencies:** a new runtime dependency needs a design issue (size, license, maintenance). Polygon boolean and offset libraries are isolated behind an adapter in `stickers`.

## Pull request expectations

- A clear description of what and why, linked issue, and screenshots or gallery links for anything visual.
- Tests for new behavior; snapshot changes explained.
- No unrelated formatting churn.
- Small PRs get reviewed faster. Split large changes (for example, a new package and its first consumer).

The [PR template](.github/PULL_REQUEST_TEMPLATE.md) has the checklist, including the plugin-specific items.

## Issues

Include the package and version, a minimal reproduction (shape, options, seed), expected and actual output (SVG or screenshots), and the renderer. For differences from Swift Sketchy, include the Swift version and output.

## Licensing

Contributions are made under the MIT license in [LICENSE](LICENSE). Third-party notices stay in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES). By opening a pull request you confirm that you wrote the code or have the right to submit it. Do not copy code from projects whose licenses are incompatible; rough.js-derived algorithms must keep the required notices (see the plan's relationship-to-rough.js section).

## Security

Do not open public issues for vulnerabilities. Contact the maintainers privately (GitHub private vulnerability reporting, once enabled for this repository).

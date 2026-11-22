# SketchyJS

SketchyJS is a TypeScript port of [Sketchy](https://github.com/sstradling/Sketchy), a Swift library for hand-drawn, seeded, deterministic graphics. It draws roughened shapes, hatch and scribble fills, crayon and watercolor brushes, paper-sheet stickers (including image-masked stickers, new in Sketchy v1.5.0), grouped sketches, and animation, and renders them to **SVG** and **Canvas 2D**.

> **Status: pre-1.0.** The implementation matches Sketchy 1.6.0. It is not published yet. The layout is two packages, recorded in [ADR 0002](docs/adr/0002-two-packages.md).

## Design at a glance

- **Two packages.** `@sketchy-js/sketchy` holds geometry, fills, brushes, stickers, the scene, SVG, Canvas, animation, and the custom element. `@sketchy-js/react` is the React binding and depends on it.
- **Deterministic.** Same seed, same drawing. The core is browser-independent and uses Sketchy's SplitMix64 sequence.
- **Tree-shakeable.** Import only what you use; stickers, watercolor, and framework bindings are separate imports.
- **Plugin-based.** Brushes, fills, textures, and sticker edges are pure plugins, and the built-ins use the same API as community plugins.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/plan.md](docs/plan.md) | Implementation plan: feature inventory, architecture, package split, testing, roadmap. The first release is v1.6.0 |
| [docs/versioning.md](docs/versioning.md) | Package versions track Sketchy. The first stable release is 1.6.0. Tags are `v`-prefixed |
| [docs/phase-3.md](docs/phase-3.md) | Phase 3 status: stickers, groups, and the experimental image mask |
| [docs/plugins.md](docs/plugins.md) | Plugin architecture: `defineBrush`, `defineFill`, `defineTexture`, `defineStickerEdge`, option schemas, registration, API versioning, a worked charcoal brush |
| [docs/contributing-plugins.md](docs/contributing-plugins.md) | Plugin walkthrough: the `pnpm new` generator, conformance suite, `packages/contrib`, graduation criteria, PR checklist |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, workflow, code standards |

## Contributing

Requirements: Node.js 22+ (see `.nvmrc`) and pnpm 10.33.4. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Adding a brush, fill, texture, or sticker edge is designed to be one command, `pnpm new brush <name>`, and one file of real code.

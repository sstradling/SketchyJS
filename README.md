# SketchyJS

SketchyJS is a TypeScript port of [Sketchy](https://github.com/sstradling/Sketchy), a Swift library for hand-drawn, seeded, deterministic graphics. It draws roughened shapes, hatch and scribble fills, crayon and watercolor brushes, paper-sheet stickers (including image-masked stickers, new in Sketchy v1.5.0), grouped sketches, and animation, and renders them to **SVG** and **Canvas 2D**.

> **Status: design phase.** The repository currently contains the implementation plan and the plugin architecture. There is no installable package yet.

## Design at a glance

- **ESM pnpm monorepo** of small packages: `@sketchy-js/types`, `core`, `fills`, `brushes`, `stickers`, `scene`, `svg-renderer`, `canvas-renderer`, and optional `animate`, `react`, `web-components`.
- **Deterministic.** Same seed, same drawing. The core is browser-independent and uses Sketchy's SplitMix64 sequence.
- **Tree-shakeable.** Import only what you use; stickers, watercolor, and framework bindings are separate imports.
- **Plugin-based.** Brushes, fills, textures, and sticker edges are pure plugins, and the built-ins use the same API as community plugins.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/plan.md](docs/plan.md) | Implementation plan: feature inventory, architecture, package split, testing, roadmap (targets Sketchy v1.5.0) |
| [docs/plugins.md](docs/plugins.md) | Plugin architecture: `defineBrush`, `defineFill`, `defineTexture`, `defineStickerEdge`, option schemas, registration, API versioning, a worked charcoal brush |
| [docs/contributing-plugins.md](docs/contributing-plugins.md) | Plugin walkthrough: the `pnpm new` generator, conformance suite, `packages/contrib`, graduation criteria, PR checklist |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, workflow, code standards |

## Contributing

Requirements: Node.js 22+ (see `.nvmrc`) and pnpm 10.33.4. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Adding a brush, fill, texture, or sticker edge is designed to be one command, `pnpm new brush <name>`, and one file of real code.

import type { Shape } from "@sketchy-js/core";
import type { Scene, Size, SketchOptions } from "@sketchy-js/types";
import { buildScene, type DrawItem, type FillResolver } from "./build.js";

/** Options accepted by `RoughView.with`: any sketch option plus a plugin fill specification. */
export type ViewOptions = Partial<SketchOptions> & {
  /** A fill plugin (object, `plugin.with(...)` ref, or registered `{ kind, ...options }`); overrides `fillStyle`. */
  readonly fill?: unknown;
};

export interface ViewState {
  readonly options: Partial<SketchOptions>;
  readonly fill: unknown;
  readonly items: readonly DrawItem[];
}

const EMPTY: ViewState = { options: {}, fill: undefined, items: [] };

/**
 * Immutable, chainable scene builder: `view.with({ seed: 1 }).draw(circle(...)).build(size)`.
 * Every method returns a new view. A shape keeps the options in effect when it was drawn, so a
 * later `with` never changes shapes already drawn.
 *
 * Routing: `build(size)` -> `buildScene` (fill resolution, generation, layer assembly).
 */
export class RoughView {
  protected readonly state: ViewState;
  protected readonly resolver: FillResolver;

  /** Prefer `createSketchy().view()` or `new RoughView()` from `@sketchy-js/scene/basic`. */
  constructor(resolver: FillResolver, state: ViewState = EMPTY) {
    this.resolver = resolver;
    this.state = state;
  }

  /** Creates a view of the same kind with new state; subclasses override to keep their type. */
  protected derive(state: ViewState): RoughView {
    return new RoughView(this.resolver, state);
  }

  /** Returns a view with `options` merged over the current ones (later calls win). */
  with(options: ViewOptions): RoughView {
    const { fill, ...rest } = options;
    return this.derive({
      options: { ...this.state.options, ...stripUndefined(rest) },
      fill: fill === undefined ? this.state.fill : fill,
      items: this.state.items,
    });
  }

  /** Appends a shape drawn with the current options. */
  draw(shape: Shape): RoughView {
    const item: DrawItem = { shape, options: this.state.options, fill: this.state.fill };
    return this.derive({ ...this.state, items: [...this.state.items, item] });
  }

  /** Generates the scene for a canvas of `size`. Deterministic for seeded options. */
  build(size: Size): Scene {
    return buildScene(this.resolver, this.state.items, size);
  }

  /** Shapes and options captured so far. Group backing reads this and ignores a child's sheet. */
  contents(): readonly DrawItem[] {
    return this.state.items;
  }

  /** The registry this view resolves fills with. */
  registry(): FillResolver {
    return this.resolver;
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

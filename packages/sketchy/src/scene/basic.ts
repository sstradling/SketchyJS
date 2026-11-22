import type { Shape } from "../core/index.js";
import { builtinFills } from "../fills/index.js";
import type { Scene, Size } from "../types/index.js";
import { sketchScene } from "./functional.js";
import { createSketchy, type SketchyRegistry } from "./registry.js";
import { RoughView as BaseRoughView, type ViewOptions, type ViewState } from "./view.js";

export type { ViewOptions } from "./view.js";
export { sketchScene } from "./functional.js";
export { buildScene } from "./build.js";
export {
  edgeShade,
  halo,
  innerShadow,
  linearShade,
  pitRecess,
  pitShadow,
  radialShade,
} from "./shades.js";

/** Registry holding the built-in fill plugins. Immutable; `use` returns a new registry. */
export const basicSketchy: SketchyRegistry = /*#__PURE__*/ builtinFills.reduce<SketchyRegistry>(
  (registry, plugin) => registry.use(plugin),
  createSketchy(),
);

/** A `RoughView` bound to the built-in fills: `new RoughView().with({ fillStyle: "hachure" })`. */
export class RoughView extends BaseRoughView {
  constructor(state?: ViewState) {
    super(basicSketchy, state);
  }

  protected override derive(state: ViewState): RoughView {
    return new RoughView(state);
  }
}

/** Builds a scene for `shapes` with the built-in fills (functional API). */
export function sketch(shapes: Shape | readonly Shape[], size: Size, options?: ViewOptions): Scene {
  return sketchScene(basicSketchy, shapes, size, options);
}

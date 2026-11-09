import type { Shape } from "@sketchy-js/core";
import type { Scene, Size } from "@sketchy-js/types";
import { buildScene, type FillResolver } from "./build.js";
import type { ViewOptions } from "./view.js";

/**
 * Functional equivalent of `view.with(options).draw(shape).build(size)` for one or more shapes
 * drawn with the same options.
 *
 * Routing: straight to `buildScene`; no builder object is created.
 */
export function sketchScene(
  resolver: FillResolver,
  shapes: Shape | readonly Shape[],
  size: Size,
  options: ViewOptions = {},
): Scene {
  const { fill, ...rest } = options;
  const list = Array.isArray(shapes) ? (shapes as readonly Shape[]) : [shapes as Shape];
  return buildScene(
    resolver,
    list.map((shape) => ({ shape, options: rest, fill })),
    size,
  );
}

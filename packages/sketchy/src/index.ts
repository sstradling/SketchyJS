/**
 * Basic drawing entry: shapes, the built-in scene, and SVG.
 * Canvas, stickers, and Clipper stay on their own subpaths.
 */
export { circle, ellipse, path, polygon, rectangle, type Shape } from "./core/shapes/index.js";
export { sketch, basicSketchy, RoughView } from "./scene/basic.js";
export type { ViewOptions } from "./scene/basic.js";
export { renderToSvgString, renderToSvgElement } from "./svg/index.js";

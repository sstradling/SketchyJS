/**
 * Unbundled root entry: shapes, `sketch`, `basicSketchy`, `RoughView`, and `ViewOptions`.
 * `sketch` still pulls the basic scene and the built-in fills. SVG, Canvas, and
 * Clipper stay on `@sketchy-js/sketchy/svg`, `/canvas`, and `/stickers/clipper`,
 * so loading this file without a bundler does not load a renderer.
 */
export { circle, ellipse, path, polygon, rectangle, type Shape } from "./core/shapes/index.js";
export { sketch, basicSketchy, RoughView } from "./scene/basic.js";
export type { ViewOptions } from "./scene/basic.js";

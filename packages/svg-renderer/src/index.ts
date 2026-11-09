import type { Scene } from "@sketchy-js/types";
import type { SvgRenderOptions } from "./options.js";
import { buildSvgTree } from "./render.js";
import { serializeSvg, toDom, type SvgDocumentLike, type SvgElementLike } from "./serialize.js";

export type { SvgRenderOptions } from "./options.js";
export type { SvgDocumentLike, SvgElementLike } from "./serialize.js";

/**
 * Renders a built scene to a standalone SVG document string.
 *
 * Routing: `sketch(...)` / `RoughView.build()` produce a `Scene`; this function turns each
 * layer into a `<path>` (strokes for outlines and hachure fills, areas for solid fills), emits
 * deduplicated `clipPath`/`mask` definitions for aligned fill strokes and SVG pattern fills, and
 * serializes the tree. Output is deterministic for a given scene and options.
 */
export function renderToSvgString(scene: Scene, options?: SvgRenderOptions): string {
  return serializeSvg(buildSvgTree(scene, options));
}

/**
 * Renders a built scene to an SVG DOM element using `document.createElementNS`. Pass `document`
 * in non-browser environments (for example from jsdom); the default is `globalThis.document`.
 */
export function renderToSvgElement(
  scene: Scene,
  options?: SvgRenderOptions & { document?: SvgDocumentLike },
): SvgElementLike {
  const document = options?.document ?? (globalThis as { document?: SvgDocumentLike }).document;
  if (document === undefined) {
    throw new Error("renderToSvgElement needs a DOM: pass options.document outside the browser");
  }
  return toDom(buildSvgTree(scene, options), document);
}

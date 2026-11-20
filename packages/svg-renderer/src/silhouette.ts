import type { SilhouetteShadowDraw } from "@sketchy-js/types";
import { cssColor, formatNumber } from "./format.js";
import type { ResolvedSvgOptions } from "./options.js";
import { el, type SvgElement } from "./tree.js";

/**
 * Tints an image with `feFlood` composited through its alpha, then applies the
 * affine transform around the anchor. A missing href draws nothing: SVG cannot
 * see a live canvas. Canvas can.
 */
export function renderSilhouette(
  shadow: SilhouetteShadowDraw,
  options: ResolvedSvgOptions,
  defs: { elements: SvgElement[] },
  transform: string | undefined,
): SvgElement {
  if (!shadow.href || !(shadow.opacity > 0.001)) return el("g", { transform });
  const color = cssColor(shadow.color);
  const id = `${options.idPrefix}-silhouette-${defs.elements.length}`;
  defs.elements.push(
    el("filter", { id, x: "-20%", y: "-20%", width: "140%", height: "140%" }, [
      el("feFlood", { "flood-color": color.value, result: "flood" }),
      el("feComposite", { in: "flood", in2: "SourceAlpha", operator: "in" }),
    ]),
  );
  const n = (value: number): string => formatNumber(value, Math.max(options.precision, 4));
  const [a, b, c, d, e, f] = shadow.transform;
  const local = `translate(${n(shadow.position.x)} ${n(shadow.position.y)}) matrix(${[a, b, c, d, e, f].map((v) => n(v ?? 0)).join(" ")}) translate(${n(-shadow.anchor.x)} ${n(-shadow.anchor.y)})`;
  const alpha = Math.min(1, Math.max(0, shadow.opacity * color.opacity));
  return el("g", { transform, opacity: n(alpha) }, [
    el("image", {
      href: shadow.href,
      x: "0",
      y: "0",
      width: n(shadow.width),
      height: n(shadow.height),
      filter: `url(#${id})`,
      transform: local,
    }),
  ]);
}

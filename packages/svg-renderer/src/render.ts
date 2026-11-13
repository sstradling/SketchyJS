import type { ClipDescriptor, DrawLayer, Paint, Scene, SceneNode } from "@sketchy-js/types";
import { cssColor, formatNumber, matrixAttribute, pathData } from "./format.js";
import { resolveSvgOptions, type ResolvedSvgOptions, type SvgRenderOptions } from "./options.js";
import { el, type SvgElement } from "./tree.js";

/** Collects deduplicated `clipPath` and `mask` definitions while layers are rendered. */
class Defs {
  private readonly ids = new Map<string, string>();
  readonly elements: SvgElement[] = [];

  constructor(
    private readonly options: ResolvedSvgOptions,
    private readonly extent: number,
  ) {}

  /**
   * Returns the attribute (`clip-path` or `mask`) that applies `clip`. A normal clip is a
   * `clipPath`; an inverse clip (outside stroke alignment) is a `mask` so shapes with holes or
   * self-overlap keep their own fill rule.
   */
  attribute(clip: ClipDescriptor): [name: "clip-path" | "mask", value: string] {
    const inverse = clip.inverse === true;
    const d = clip.paths.map((p) => pathData(p, this.options.precision)).join("");
    const key = `${inverse ? "m" : "c"}|${clip.fillRule}|${d}`;
    let id = this.ids.get(key);
    if (id === undefined) {
      id = `${this.options.idPrefix}-${inverse ? "mask" : "clip"}-${this.ids.size}`;
      this.ids.set(key, id);
      this.elements.push(inverse ? this.mask(id, d, clip) : this.clipPath(id, d, clip));
    }
    return [inverse ? "mask" : "clip-path", `url(#${id})`];
  }

  private clipPath(id: string, d: string, clip: ClipDescriptor): SvgElement {
    return el("clipPath", { id }, [el("path", { d, "clip-rule": clip.fillRule })]);
  }

  private mask(id: string, d: string, clip: ClipDescriptor): SvgElement {
    const e = this.extent;
    const region = { x: String(-e), y: String(-e), width: String(3 * e), height: String(3 * e) };
    return el("mask", { id, maskUnits: "userSpaceOnUse", ...region }, [
      el("rect", { ...region, fill: "#fff" }),
      el("path", { d, fill: "#000", "fill-rule": clip.fillRule }),
    ]);
  }
}

interface ResolvedPaint {
  value: string;
  opacity: number;
}

/** Resolves a scene paint. Shape-relative paints (`stroke`, `fill`) inherit `currentColor`. */
function resolvePaint(paint: Paint, options: ResolvedSvgOptions): ResolvedPaint {
  const alpha = paint.alpha ?? 1;
  switch (paint.kind) {
    case "solid": {
      const c = cssColor(paint.color);
      return { value: c.value, opacity: c.opacity * alpha };
    }
    case "paper": {
      const c = cssColor(options.background ?? "#ffffff");
      return { value: c.value, opacity: c.opacity * alpha };
    }
    default:
      return { value: "currentColor", opacity: alpha };
  }
}

const opacityAttribute = (value: number, precision: number): string | undefined =>
  value >= 1 ? undefined : formatNumber(value, Math.max(precision, 3));

/**
 * Renders one layer. A layer with a stroke width paints its paths as strokes (sketchy outlines
 * and hachure-style fills); one without paints filled areas.
 */
function renderLayer(layer: DrawLayer, options: ResolvedSvgOptions, defs: Defs): SvgElement {
  const { precision } = options;
  const paint = resolvePaint(layer.paint, options);
  const opacity = opacityAttribute(paint.opacity, precision);
  const d = layer.paths.map((p) => pathData(p, precision)).join("");
  const clip = layer.clip ? defs.attribute(layer.clip) : undefined;
  const clipAttrs = clip ? { [clip[0]]: clip[1] } : {};

  if (layer.strokeWidth !== undefined) {
    const cap = layer.cap ?? "round";
    // `curvedBevel` has no SVG equivalent; it is a brush-outline feature rendered by later phases.
    const join = typeof layer.join === "object" ? "round" : (layer.join ?? "round");
    return el("path", {
      d,
      fill: "none",
      stroke: paint.value,
      "stroke-opacity": opacity,
      "stroke-width": formatNumber(layer.strokeWidth, Math.max(precision, 3)),
      "stroke-linecap": cap,
      "stroke-linejoin": join,
      "stroke-miterlimit":
        join === "miter" && layer.miterLimit !== undefined
          ? formatNumber(layer.miterLimit, 3)
          : undefined,
      ...clipAttrs,
    });
  }
  return el("path", {
    d,
    fill: paint.value,
    "fill-opacity": opacity,
    "fill-rule": layer.fillRule === "evenodd" ? "evenodd" : undefined,
    ...clipAttrs,
  });
}

/**
 * One luminance mask for a variable-opacity stroke. Pieces are opaque gray, faintest first,
 * so a later piece replaces an earlier one. The tint is applied once through the mask.
 */
function renderMaskGroup(
  layers: readonly DrawLayer[],
  options: ResolvedSvgOptions,
  defs: Defs,
): SvgElement {
  const first = layers[0]!;
  const paint = resolvePaint(first.paint, options);
  const gray = layers.map((layer) => {
    const amount = Math.round(Math.min(1, Math.max(0, layer.mask?.opacity ?? 1)) * 255);
    const channel = amount.toString(16).padStart(2, "0");
    const d = layer.paths.map((p) => pathData(p, options.precision)).join("");
    return el("path", { d, fill: `#${channel}${channel}${channel}` });
  });
  const id = `${options.idPrefix}-opacity-${defs.elements.length}`;
  defs.elements.push(
    el("mask", { id, maskUnits: "userSpaceOnUse", "mask-type": "luminance" }, gray),
  );
  const clip = first.clip ? defs.attribute(first.clip) : undefined;
  return el("rect", {
    x: "0",
    y: "0",
    width: "100%",
    height: "100%",
    fill: paint.value,
    "fill-opacity": opacityAttribute(paint.opacity, options.precision),
    mask: `url(#${id})`,
    ...(clip ? { [clip[0]]: clip[1] } : {}),
  });
}

/** Groups consecutive layers that share an opacity-mask group, then paints the rest. */
function renderLayers(
  layers: readonly DrawLayer[],
  options: ResolvedSvgOptions,
  defs: Defs,
): SvgElement[] {
  const out: SvgElement[] = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    const group = layer.mask?.group;
    if (group === undefined) {
      out.push(renderLayer(layer, options, defs));
      continue;
    }
    let end = i + 1;
    while (end < layers.length && layers[end]!.mask?.group === group) end++;
    out.push(renderMaskGroup(layers.slice(i, end), options, defs));
    i = end - 1;
  }
  return out;
}

function renderNode(node: SceneNode, options: ResolvedSvgOptions, defs: Defs): SvgElement {
  const transform = node.transform ? matrixAttribute(node.transform, options.precision) : undefined;
  if (node.type === "group") {
    return el(
      "g",
      { transform },
      node.children.map((c) => renderNode(c, options, defs)),
    );
  }
  return el("g", { transform }, renderLayers(node.drawing.layers, options, defs));
}

/**
 * Builds the SVG element tree for a scene. Routing: `renderToSvgString` and
 * `renderToSvgElement` both call this, then serialize the result.
 */
export function buildSvgTree(scene: Scene, userOptions?: SvgRenderOptions): SvgElement {
  const options = resolveSvgOptions(userOptions);
  const { width, height } = scene.size;
  const defs = new Defs(options, Math.max(width, height) * 10);
  const body = scene.nodes.map((n) => renderNode(n, options, defs));
  const background =
    options.background === undefined
      ? []
      : [
          el("rect", {
            width: formatNumber(width, options.precision),
            height: formatNumber(height, options.precision),
            fill: cssColor(options.background).value,
            "fill-opacity": opacityAttribute(
              cssColor(options.background).opacity,
              options.precision,
            ),
          }),
        ];
  const children = [
    ...(defs.elements.length > 0 ? [el("defs", {}, defs.elements)] : []),
    ...background,
    ...body,
  ];
  const w = formatNumber(width, options.precision);
  const h = formatNumber(height, options.precision);
  return el(
    "svg",
    { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${w} ${h}`, width: w, height: h },
    children,
  );
}

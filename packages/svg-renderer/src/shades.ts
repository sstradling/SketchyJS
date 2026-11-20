import type { DrawLayer, InteriorShade, ShadeStop } from "@sketchy-js/types";
import { cssColor, formatNumber, pathData } from "./format.js";
import type { ResolvedSvgOptions } from "./options.js";
import { el, type SvgElement } from "./tree.js";

/**
 * Paints an interior shade into SVG.
 *
 * Blur is `feGaussianBlur` with `stdDeviation = radius / 2`, the same ratio as
 * a sticker `feDropShadow`. Canvas uses `shadowBlur = radius`. Neither matches
 * CoreGraphics' blur kernel. Gradients are clipped even-odd, so holes stay empty.
 * A halo is the outside half of a double-width stroke, then the same blur.
 */

interface DefsLike {
  elements: SvgElement[];
}

export function renderShade(
  layer: DrawLayer,
  options: ResolvedSvgOptions,
  defs: DefsLike,
): SvgElement {
  const shade = layer.shade;
  if (!shade) return el("g");
  const d = layer.paths.map((path) => pathData(path, options.precision)).join("");
  const id = `${options.idPrefix}-shade-${defs.elements.length}`;
  if (shade.kind === "halo") return halo(id, d, shade, options, defs);
  defs.elements.push(clipPath(id, d));
  if (shade.kind === "innerShadow") return innerShadow(id, d, layer, shade, options, defs);
  if (shade.kind === "linear") return linear(id, d, layer, shade, options, defs);
  return radial(id, d, layer, shade, options, defs);
}

function clipPath(id: string, d: string): SvgElement {
  return el("clipPath", { id: `${id}-clip` }, [el("path", { d, "clip-rule": "evenodd" })]);
}

function innerShadow(
  id: string,
  d: string,
  layer: DrawLayer,
  shade: Extract<InteriorShade, { kind: "innerShadow" }>,
  options: ResolvedSvgOptions,
  defs: DefsLike,
): SvgElement {
  const box = bounds(layer);
  const pad = shade.blur * 3 + Math.abs(shade.x) + Math.abs(shade.y) + 4;
  const color = cssColor(shade.color);
  const deviation = formatNumber(shade.blur / 2, 3);
  defs.elements.push(
    el("filter", { id: `${id}-filter`, x: "-50%", y: "-50%", width: "200%", height: "200%" }, [
      el("feOffset", {
        dx: formatNumber(shade.x, 3),
        dy: formatNumber(shade.y, 3),
        in: "SourceAlpha",
      }),
      el("feGaussianBlur", { stdDeviation: deviation }),
      el("feFlood", {
        "flood-color": color.value,
        "flood-opacity": formatNumber(color.opacity * shade.opacity, 3),
      }),
      el("feComposite", { in2: "SourceAlpha", operator: "in" }),
    ]),
  );
  const n = (value: number): string => formatNumber(value, options.precision);
  const exterior = `M${n(box.x - pad)},${n(box.y - pad)}H${n(box.x + box.width + pad)}V${n(box.y + box.height + pad)}H${n(box.x - pad)}Z${d}`;
  return el("g", { "clip-path": `url(#${id}-clip)` }, [
    el("path", { d: exterior, fill: "#000", "fill-rule": "evenodd", filter: `url(#${id}-filter)` }),
  ]);
}

function linear(
  id: string,
  d: string,
  layer: DrawLayer,
  shade: Extract<InteriorShade, { kind: "linear" }>,
  options: ResolvedSvgOptions,
  defs: DefsLike,
): SvgElement {
  const box = bounds(layer);
  const radians = (shade.angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const n = (value: number): string => formatNumber(value, Math.max(options.precision, 3));
  defs.elements.push(
    el(
      "linearGradient",
      {
        id: `${id}-grad`,
        gradientUnits: "userSpaceOnUse",
        x1: n(box.x + box.width / 2 - dx * (box.width / 2)),
        y1: n(box.y + box.height / 2 - dy * (box.height / 2)),
        x2: n(box.x + box.width / 2 + dx * (box.width / 2)),
        y2: n(box.y + box.height / 2 + dy * (box.height / 2)),
      },
      shade.stops.map((stop) => stopEl(stop)),
    ),
  );
  return el("g", { "clip-path": `url(#${id}-clip)` }, [
    el("path", { d, fill: `url(#${id}-grad)`, "fill-rule": "evenodd" }),
  ]);
}

function radial(
  id: string,
  d: string,
  layer: DrawLayer,
  shade: Extract<InteriorShade, { kind: "radial" }>,
  options: ResolvedSvgOptions,
  defs: DefsLike,
): SvgElement {
  const box = bounds(layer);
  const reach = Math.min(box.width, box.height) / 2;
  const n = (value: number): string => formatNumber(value, Math.max(options.precision, 3));
  defs.elements.push(
    el(
      "radialGradient",
      {
        id: `${id}-grad`,
        gradientUnits: "userSpaceOnUse",
        cx: n(box.x + shade.centerX * box.width),
        cy: n(box.y + shade.centerY * box.height),
        r: n(Math.max(shade.endRadius, 0.001) * reach),
        fr: n(Math.max(0, shade.startRadius) * reach),
      },
      shade.stops.map((stop) => stopEl(stop)),
    ),
  );
  return el("g", { "clip-path": `url(#${id}-clip)` }, [
    el("path", { d, fill: `url(#${id}-grad)`, "fill-rule": "evenodd" }),
  ]);
}

function halo(
  id: string,
  d: string,
  shade: Extract<InteriorShade, { kind: "halo" }>,
  options: ResolvedSvgOptions,
  defs: DefsLike,
): SvgElement {
  const color = cssColor(shade.color);
  const deviation = formatNumber(shade.blur / 2, 3);
  defs.elements.push(
    el("filter", { id: `${id}-filter`, x: "-50%", y: "-50%", width: "200%", height: "200%" }, [
      el("feGaussianBlur", { in: "SourceAlpha", stdDeviation: deviation, result: "blur" }),
      el("feFlood", {
        "flood-color": color.value,
        "flood-opacity": formatNumber(color.opacity * shade.glow, 3),
      }),
      el("feComposite", { in2: "blur", operator: "in" }),
    ]),
  );
  defs.elements.push(
    el("mask", { id: `${id}-mask`, maskUnits: "userSpaceOnUse" }, [
      el("rect", { x: "-10000", y: "-10000", width: "20000", height: "20000", fill: "#fff" }),
      el("path", { d, fill: "#000", "fill-rule": "evenodd" }),
    ]),
  );
  return el("g", {}, [
    el("path", {
      d,
      fill: "none",
      stroke: color.value,
      "stroke-opacity": formatNumber(color.opacity * shade.opacity, 3),
      "stroke-width": formatNumber(shade.width * 2, Math.max(options.precision, 3)),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      mask: `url(#${id}-mask)`,
      filter: shade.blur > 0 ? `url(#${id}-filter)` : undefined,
    }),
  ]);
}

function stopEl(stop: ShadeStop): SvgElement {
  const color = cssColor(stop.color);
  return el("stop", {
    offset: formatNumber(stop.location, 4),
    "stop-color": color.value,
    "stop-opacity": formatNumber(color.opacity * stop.opacity, 4),
  });
}

function bounds(layer: DrawLayer): { x: number; y: number; width: number; height: number } {
  const ellipse = layer.shadeEllipse;
  if (ellipse) {
    return {
      x: ellipse.cx - ellipse.rx,
      y: ellipse.cy - ellipse.ry,
      width: ellipse.rx * 2,
      height: ellipse.ry * 2,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of layer.paths) {
    for (const op of path) {
      if (op.op === "Z") continue;
      const xs = op.op === "C" ? [op.c1x, op.c2x, op.x] : op.op === "Q" ? [op.cx, op.x] : [op.x];
      const ys = op.op === "C" ? [op.c1y, op.c2y, op.y] : op.op === "Q" ? [op.cy, op.y] : [op.y];
      for (const x of xs) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      for (const y of ys) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

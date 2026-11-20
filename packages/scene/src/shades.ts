import {
  eggPolygonPoints,
  f,
  roundedRectanglePolygonPoints,
  svgPathToOps,
  type Shape,
} from "@sketchy-js/core";
import type {
  Color,
  DrawLayer,
  Drawing,
  InteriorShade,
  Path,
  PathOp,
  ShadeStop,
  Size,
  SketchOptions,
} from "@sketchy-js/types";
import { computeSvgTransform, transformPath } from "./transform.js";

/**
 * Interior shades are painted from the clean silhouette after generation.
 * They are not part of the operation sets, so a seed and a geometry cache
 * that ignores `interiorShades` stay the same when the list changes.
 *
 * Request flow: `buildScene` generates the drawing, then `attachShades`
 * inserts shade layers. Clipped shades sit after the fill and before the
 * stroke. A halo is after the stroke. Renderers paint `DrawLayer.shade`.
 */

const KAPPA = 0.5522847498307936;

/** Shadow of the exterior, clipped to the interior. Defaults match `.pitShadow`. */
export function innerShadow(
  partial: Partial<Extract<InteriorShade, { kind: "innerShadow" }>> = {},
): InteriorShade {
  return {
    kind: "innerShadow",
    opacity: clamp01(partial.opacity ?? 0.6),
    x: partial.x ?? 0,
    y: partial.y ?? 9,
    blur: Math.max(0, partial.blur ?? 4),
    color: partial.color ?? [0, 0, 0, 1],
  };
}

/** The small-pit inner shadow: 60% black, 9 points down, blur 4. */
export function pitShadow(): InteriorShade {
  return innerShadow();
}

/** Linear gradient across the shape bounds, clipped to the interior. */
export function linearShade(stops: readonly ShadeStop[], angle = 90): InteriorShade {
  return { kind: "linear", stops: stops.map(clampStop), angle };
}

/** Vertical black recess on the small pits. */
export function pitRecess(): InteriorShade {
  return linearShade([
    { location: 0, color: [0, 0, 0, 1], opacity: 0.62 },
    { location: 0.62, color: [0, 0, 0, 1], opacity: 0.4 },
    { location: 1, color: [0, 0, 0, 1], opacity: 0.22 },
  ]);
}

/** Radial gradient. Radii are fractions of half the smaller side. */
export function radialShade(
  stops: readonly ShadeStop[],
  centerX = 0.5,
  centerY = 0.5,
  startRadius = 0,
  endRadius = 1,
): InteriorShade {
  return {
    kind: "radial",
    stops: stops.map(clampStop),
    centerX,
    centerY,
    startRadius,
    endRadius,
  };
}

/** Clear in the middle, then a colour at the rim. */
export function edgeShade(
  color: Color = [0.86, 0.16, 0.18, 1],
  opacity = 0.55,
  inner = 0.62,
): InteriorShade {
  const start = clamp01(inner);
  return radialShade([
    { location: 0, color, opacity: 0 },
    { location: start, color, opacity: 0 },
    { location: 1, color, opacity: clamp01(opacity) },
  ]);
}

/** A soft band just outside the outline. The hit ring uses the defaults. */
export function halo(
  color: Color,
  partial: Partial<
    Pick<Extract<InteriorShade, { kind: "halo" }>, "opacity" | "glow" | "width" | "blur">
  > = {},
): InteriorShade {
  return {
    kind: "halo",
    color,
    opacity: clamp01(partial.opacity ?? 0.55),
    glow: clamp01(partial.glow ?? 0.3),
    width: Math.max(0, partial.width ?? 3.5),
    blur: Math.max(0, partial.blur ?? 2),
  };
}

/** Inserts shade layers. An open contour or an empty list leaves the drawing unchanged. */
export function attachShades(
  drawing: Drawing,
  shape: Shape,
  options: SketchOptions,
  size: Size,
): Drawing {
  const shades = options.interiorShades.filter(drawsShade);
  if (shades.length === 0) return drawing;
  const silhouette = shadeSilhouette(shape, size);
  if (!silhouette) return drawing;
  const before = shades.filter((shade) => shade.kind !== "halo");
  const after = shades.filter((shade) => shade.kind === "halo");
  const layers: DrawLayer[] = [];
  let placed = false;
  const place = (list: readonly InteriorShade[]): void => {
    for (const shade of list) layers.push(shadeLayer(silhouette, shade));
  };
  for (const layer of drawing.layers) {
    if (!placed && layer.role === "stroke") {
      place(before);
      placed = true;
    }
    layers.push(layer);
  }
  if (!placed) place(before);
  place(after);
  return { ...drawing, layers };
}

function shadeLayer(
  silhouette: { paths: Path[]; ellipse?: DrawLayer["shadeEllipse"] },
  shade: InteriorShade,
): DrawLayer {
  return {
    role: "shade",
    paths: silhouette.paths,
    fillRule: "evenodd",
    paint: { kind: "fill", alpha: 1 },
    shade,
    ...(silhouette.ellipse ? { shadeEllipse: silhouette.ellipse } : {}),
  };
}

function shadeSilhouette(
  shape: Shape,
  size: Size,
): { paths: Path[]; ellipse?: DrawLayer["shadeEllipse"] } | undefined {
  switch (shape.kind) {
    case "line":
    case "linearPath":
    case "curve":
      return undefined;
    case "arc":
      return shape.closed ? { paths: [arcPie(shape)] } : undefined;
    case "rectangle":
      return { paths: [polygonPath(rectPoints(shape.x, shape.y, shape.width, shape.height))] };
    case "polygon":
      return shape.points.length >= 3 ? { paths: [polygonPath(shape.points)] } : undefined;
    case "roundedRectangle":
      return {
        paths: [
          polygonPath(
            roundedRectanglePolygonPoints(
              f(shape.x),
              f(shape.y),
              f(shape.width),
              f(shape.height),
              f(shape.cornerRadius),
              10,
            ).map(([x, y]) => ({ x, y })),
          ),
        ],
      };
    case "egg":
      return {
        paths: [
          polygonPath(
            eggPolygonPoints(
              f(shape.x),
              f(shape.y),
              f(shape.width),
              f(shape.height),
              f(shape.tilt),
              48,
            ).map(([x, y]) => ({ x, y })),
          ),
        ],
      };
    case "circle": {
      const radius = shape.diameter / 2;
      return oval(shape.x, shape.y, radius, radius);
    }
    case "ellipse":
      return oval(shape.x, shape.y, shape.width / 2, shape.height / 2);
    case "path": {
      const ops = svgPathToOps(shape.d);
      if (ops.length === 0) return undefined;
      const matrix = computeSvgTransform(shape.d, size);
      return { paths: [transformPath(ops, matrix)] };
    }
  }
}

function oval(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): { paths: Path[]; ellipse: DrawLayer["shadeEllipse"] } {
  return { paths: [ellipseCubics(cx, cy, rx, ry)], ellipse: { cx, cy, rx, ry } };
}

function ellipseCubics(cx: number, cy: number, rx: number, ry: number): Path {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const c = (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): PathOp => ({
    op: "C",
    c1x,
    c1y,
    c2x,
    c2y,
    x,
    y,
  });
  return [
    { op: "M", x: cx + rx, y: cy },
    c(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
    c(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
    c(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
    c(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
    { op: "Z" },
  ];
}

function rectPoints(x: number, y: number, width: number, height: number) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function polygonPath(points: readonly { x: number; y: number }[]): Path {
  return [
    ...points.map((point, index): PathOp =>
      index === 0 ? { op: "M", x: point.x, y: point.y } : { op: "L", x: point.x, y: point.y },
    ),
    { op: "Z" },
  ];
}

function arcPie(shape: Extract<Shape, { kind: "arc" }>): Path {
  const rx = shape.width / 2;
  const ry = shape.height / 2;
  const steps = 24;
  const points = [{ x: shape.x, y: shape.y }];
  for (let index = 0; index <= steps; index++) {
    const t = shape.start + ((shape.stop - shape.start) * index) / steps;
    points.push({ x: shape.x + rx * Math.cos(t), y: shape.y + ry * Math.sin(t) });
  }
  return polygonPath(points);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampStop(stop: ShadeStop): ShadeStop {
  return { location: clamp01(stop.location), color: stop.color, opacity: clamp01(stop.opacity) };
}

function alphaOf(color: Color): number {
  return typeof color === "string" ? 1 : (color[3] ?? 1);
}

function drawsShade(shade: InteriorShade): boolean {
  if (shade.kind === "innerShadow") return shade.opacity > 0 && alphaOf(shade.color) > 0;
  if (shade.kind === "halo") {
    return (
      alphaOf(shade.color) > 0 &&
      ((shade.opacity > 0 && shade.width > 0) || (shade.glow > 0 && shade.blur > 0))
    );
  }
  return shade.stops.some((stop) => stop.opacity > 0 && alphaOf(stop.color) > 0);
}

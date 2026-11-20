import type { Color, DrawLayer, InteriorShade, Path, ShadeStop } from "@sketchy-js/types";
import type { Canvas2D } from "./context.js";

/**
 * Paints an interior shade into Canvas 2D.
 *
 * Canvas `shadowBlur` is about twice the SVG Gaussian sigma, so
 * `shadowBlur = 2 * blur` while SVG uses `stdDeviation = blur`. Sticker
 * shadows are a different ratio. Gradients and the inner shadow are clipped
 * even-odd, so a hole stays empty. A halo strokes at twice the band width
 * and is clipped to the outside of the shape.
 */

/** `shadowBlur` for a shade whose SVG sigma is `blur`. */
export function canvasShadowBlur(blur: number): number {
  return blur * 2;
}

export function paintShade(layer: DrawLayer, context: Canvas2D): void {
  const shade = layer.shade;
  if (!shade) return;
  if (shade.kind === "halo") {
    paintHalo(layer, shade, context);
    return;
  }
  context.save();
  clipInterior(layer, context);
  if (shade.kind === "innerShadow") paintInner(layer, shade, context);
  else if (shade.kind === "linear") paintLinear(layer, shade, context);
  else paintRadial(layer, shade, context);
  context.restore();
}

function clipInterior(layer: DrawLayer, context: Canvas2D): void {
  trace(context, layer);
  context.clip("evenodd");
}

function paintInner(
  layer: DrawLayer,
  shade: Extract<InteriorShade, { kind: "innerShadow" }>,
  context: Canvas2D,
): void {
  const box = bounds(layer);
  const pad = shade.blur * 3 + Math.abs(shade.x) + Math.abs(shade.y) + 4;
  const color = css(shade.color, shade.opacity);
  context.shadowColor = color;
  context.shadowBlur = canvasShadowBlur(shade.blur);
  context.shadowOffsetX = shade.x;
  context.shadowOffsetY = shade.y;
  context.fillStyle = "#000";
  context.beginPath();
  rect(context, box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2);
  trace(context, layer, false);
  context.fill("evenodd");
}

function paintLinear(
  layer: DrawLayer,
  shade: Extract<InteriorShade, { kind: "linear" }>,
  context: Canvas2D,
): void {
  const box = bounds(layer);
  if (!(box.width > 0) || !(box.height > 0)) return;
  const radians = (shade.angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  if (!context.createLinearGradient) return;
  const gradient = context.createLinearGradient(
    box.x + box.width / 2 - dx * (box.width / 2),
    box.y + box.height / 2 - dy * (box.height / 2),
    box.x + box.width / 2 + dx * (box.width / 2),
    box.y + box.height / 2 + dy * (box.height / 2),
  );
  for (const stop of shade.stops)
    gradient.addColorStop(stop.location, css(stop.color, stop.opacity));
  context.fillStyle = gradient;
  context.fillRect(box.x, box.y, box.width, box.height);
}

function paintRadial(
  layer: DrawLayer,
  shade: Extract<InteriorShade, { kind: "radial" }>,
  context: Canvas2D,
): void {
  const box = bounds(layer);
  if (!(box.width > 0) || !(box.height > 0)) return;
  const reach = Math.min(box.width, box.height) / 2;
  const cx = box.x + shade.centerX * box.width;
  const cy = box.y + shade.centerY * box.height;
  if (!context.createRadialGradient) return;
  const gradient = context.createRadialGradient(
    cx,
    cy,
    Math.max(0, shade.startRadius) * reach,
    cx,
    cy,
    Math.max(shade.endRadius, 0.001) * reach,
  );
  for (const stop of shade.stops)
    gradient.addColorStop(stop.location, css(stop.color, stop.opacity));
  context.fillStyle = gradient;
  context.fillRect(box.x, box.y, box.width, box.height);
}

function paintHalo(
  layer: DrawLayer,
  shade: Extract<InteriorShade, { kind: "halo" }>,
  context: Canvas2D,
): void {
  context.save();
  const box = bounds(layer);
  const pad = shade.blur * 3 + shade.width + 8;
  context.beginPath();
  rect(context, box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2);
  trace(context, layer, false);
  context.clip("evenodd");
  context.strokeStyle = css(shade.color, shade.opacity);
  context.lineWidth = shade.width * 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (shade.blur > 0 && shade.glow > 0) {
    context.shadowColor = css(shade.color, shade.glow);
    context.shadowBlur = canvasShadowBlur(shade.blur);
  }
  trace(context, layer);
  context.stroke();
  context.restore();
}

function trace(context: Canvas2D, layer: DrawLayer, begin = true): void {
  const ellipse = layer.shadeEllipse;
  if (ellipse && begin && context.ellipse) {
    context.beginPath();
    context.ellipse(
      ellipse.cx,
      ellipse.cy,
      Math.max(ellipse.rx, 0),
      Math.max(ellipse.ry, 0),
      0,
      0,
      Math.PI * 2,
    );
    return;
  }
  if (begin) context.beginPath();
  for (const path of layer.paths) tracePath(context, path);
}

function rect(context: Canvas2D, x: number, y: number, w: number, h: number): void {
  if (context.rect) {
    context.rect(x, y, w, h);
    return;
  }
  context.moveTo(x, y);
  context.lineTo(x + w, y);
  context.lineTo(x + w, y + h);
  context.lineTo(x, y + h);
  context.closePath();
}

function tracePath(context: Canvas2D, path: Path): void {
  for (const op of path) {
    if (op.op === "M") context.moveTo(op.x, op.y);
    else if (op.op === "L") context.lineTo(op.x, op.y);
    else if (op.op === "Q") context.quadraticCurveTo(op.cx, op.cy, op.x, op.y);
    else if (op.op === "C") context.bezierCurveTo(op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y);
    else context.closePath();
  }
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

function css(color: Color, opacity: number): string {
  if (typeof color === "string") return color;
  const r = Math.round((color[0] ?? 0) * 255);
  const g = Math.round((color[1] ?? 0) * 255);
  const b = Math.round((color[2] ?? 0) * 255);
  const a = (color[3] ?? 1) * opacity;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export type { ShadeStop };

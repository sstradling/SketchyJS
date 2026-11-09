import { svgPathToOps, type OperationSet, type SketchDrawing } from "@sketchy-js/core";
import type {
  ClipDescriptor,
  DrawLayer,
  Drawing,
  Matrix2D,
  Path,
  Size,
  SketchOptions,
  SvgFillStrokeAlignment,
} from "@sketchy-js/types";
import { computeSvgTransform, IDENTITY, transformPath } from "./transform.js";

/** Sketchy's stroke alignment: width and clip used for fill strokes on SVG paths. */
export function alignFillStroke(
  width: number,
  alignment: SvgFillStrokeAlignment,
  shape: Path | undefined,
): { width: number; clip?: ClipDescriptor } {
  if (alignment === "center" || !shape) return { width };
  return {
    width: width * 2,
    clip: {
      paths: [shape],
      fillRule: "nonzero",
      ...(alignment === "outside" ? { inverse: true } : {}),
    },
  };
}

/** Shared stroke attributes of a layer drawn from `options`. */
function strokeStyle(o: SketchOptions): Pick<DrawLayer, "cap" | "join" | "miterLimit"> {
  return { cap: o.brushProfile.cap, join: o.brushProfile.join, miterLimit: o.strokeMiterLimit };
}

/** Fill weight Sketchy's renderer uses: a negative weight means half the stroke width. */
function renderFillWeight(o: SketchOptions, isSvg: boolean, strokeWidth: number): number {
  const base = isSvg ? (o.svgFillWeight ?? o.fillWeight) : o.fillWeight;
  return base < 0 ? strokeWidth / 2 : base;
}

/** The first SVG path text of a drawing; Sketchy fits the whole drawing from it. */
const firstPath = (sets: readonly OperationSet[]): string | undefined =>
  sets.find((s) => s.path !== undefined)?.path;

/**
 * Turns generated operation sets into scene layers, following Sketchy's renderer
 * (`SwiftUIRenderer.commands`):
 *
 * - `path` strokes the outline in the stroke color.
 * - `fillSketch` strokes fill lines with the fill weight in the fill color.
 * - `fillPath` and `path2DFill` paint an area in the fill color.
 * - `path2DPattern` strokes fill lines clipped to the SVG path.
 *
 * SVG-path drawings are scaled and centered into the canvas by one matrix computed from the
 * first set that carries path text. Stroke widths are not scaled.
 */
export function assembleDrawing(drawing: SketchDrawing, size: Size): Drawing {
  const o = drawing.options;
  const isSvg = drawing.shape === "path";
  const svgText = isSvg ? firstPath(drawing.sets) : undefined;
  const matrix: Matrix2D = svgText === undefined ? IDENTITY : computeSvgTransform(svgText, size);
  const clipShape =
    svgText === undefined ? undefined : transformPath(svgPathToOps(svgText), matrix);

  const strokeWidth = isSvg ? (o.svgStrokeWidth ?? o.strokeWidth) : o.strokeWidth;
  const fillWeight = renderFillWeight(o, isSvg, strokeWidth);
  const alignment: SvgFillStrokeAlignment = isSvg ? o.svgFillStrokeAlignment : "center";
  const aligned = alignFillStroke(fillWeight, alignment, clipShape);
  const strokePaint = { kind: "solid", color: o.strokeColor, alpha: o.strokeOpacity } as const;
  const fillPaint = { kind: "solid", color: o.fillColor, alpha: o.fillOpacity } as const;

  const outline: Path[] = [];
  const layers: DrawLayer[] = [];

  const fillStrokes = (
    paths: Path[],
    role: "fill" | "fill-pattern",
    clip: ClipDescriptor | undefined,
  ): DrawLayer => ({
    role,
    paths,
    fillRule: "nonzero",
    paint: fillPaint,
    strokeWidth: aligned.width,
    ...strokeStyle(o),
    ...(clip ? { clip } : {}),
  });

  for (const set of drawing.sets) {
    switch (set.type) {
      case "path": {
        const path = transformPath(set.ops, matrix);
        outline.push(path);
        layers.push({
          role: "stroke",
          paths: [path],
          fillRule: "nonzero",
          paint: strokePaint,
          strokeWidth,
          ...strokeStyle(o),
        });
        break;
      }
      case "fillSketch":
        layers.push(fillStrokes([transformPath(set.ops, matrix)], "fill", aligned.clip));
        break;
      case "fillPath":
        layers.push({
          role: "fill",
          paths: [transformPath(set.ops, matrix)],
          fillRule: "nonzero",
          paint: fillPaint,
        });
        break;
      case "path2DFill": {
        if (set.path === undefined) break;
        const path = transformPath(svgPathToOps(set.path), matrix);
        layers.push({ role: "fill", paths: [path], fillRule: "nonzero", paint: fillPaint });
        break;
      }
      case "path2DPattern": {
        if (set.path === undefined) break;
        const shape = transformPath(svgPathToOps(set.path), matrix);
        if (set.ops.length > 0) {
          const clip: ClipDescriptor = { paths: [shape], fillRule: "nonzero" };
          layers.push(fillStrokes([transformPath(set.ops, matrix)], "fill-pattern", clip));
        } else {
          layers.push(fillStrokes([shape], "fill-pattern", aligned.clip));
        }
        break;
      }
    }
  }
  return { shape: drawing.shape, outline, layers };
}

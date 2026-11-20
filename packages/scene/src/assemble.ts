import {
  opacityRibbon,
  opacityVaries,
  strokeToOutline,
  svgPathToOps,
  thicknessVaries,
  type OperationSet,
  type SketchDrawing,
} from "@sketchy-js/core";
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
export function assembleDrawing(drawing: SketchDrawing, size: Size, fitSvg = true): Drawing {
  const o = drawing.options;
  const isSvg = drawing.shape === "path";
  const svgText = isSvg ? firstPath(drawing.sets) : undefined;
  const matrix: Matrix2D =
    svgText === undefined || !fitSvg ? IDENTITY : computeSvgTransform(svgText, size);
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
    set: OperationSet,
    paths: Path[],
    role: "fill" | "fill-pattern",
    clip: ClipDescriptor | undefined,
  ): DrawLayer => {
    const scale =
      set.fillLineScale !== undefined ? Math.min(4, Math.max(0.05, set.fillLineScale)) : 1;
    const width = set.fillLineWidth ?? aligned.width * scale;
    const alpha = Math.min(1, Math.max(0, (fillPaint.alpha ?? 1) * (set.opacityScale ?? 1)));
    return {
      role,
      paths,
      fillRule: "nonzero",
      paint: { ...fillPaint, alpha },
      strokeWidth: width,
      ...strokeStyle(o),
      ...(clip ? { clip } : {}),
    };
  };

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
      case "fillSketch": {
        const scribbleClip = set.clip
          ? { paths: [transformPath(set.clip, matrix)], fillRule: "nonzero" as const }
          : undefined;
        layers.push(
          fillStrokes(set, [transformPath(set.ops, matrix)], "fill", scribbleClip ?? aligned.clip),
        );
        break;
      }
      case "fillPath":
        layers.push({
          role: "fill",
          paths: [transformPath(set.ops, matrix)],
          // A compound path (a hole) is even-odd, matching the SwiftUI fill of
          // a path that contains more than one contour. A single contour stays
          // nonzero; the two rules paint that shape the same.
          fillRule: set.fillRule ?? (moveCount(set.ops) > 1 ? "evenodd" : "nonzero"),
          paint: { kind: "solid", color: o.fillColor, alpha: set.opacity ?? o.fillOpacity },
          ...(set.clip
            ? { clip: { paths: [transformPath(set.clip, matrix)], fillRule: "nonzero" as const } }
            : {}),
        });
        break;
      case "path2DFill": {
        if (set.path === undefined) break;
        const path = transformPath(svgPathToOps(set.path), matrix);
        layers.push({
          role: "fill",
          paths: [path],
          fillRule: moveCount(path) > 1 ? "evenodd" : "nonzero",
          paint: fillPaint,
        });
        break;
      }
      case "path2DPattern": {
        if (set.path === undefined) break;
        const shape = transformPath(svgPathToOps(set.path), matrix);
        if (set.ops.length > 0) {
          const clip: ClipDescriptor = {
            paths: [shape],
            fillRule: set.fillRule ?? "nonzero",
          };
          layers.push(fillStrokes(set, [transformPath(set.ops, matrix)], "fill-pattern", clip));
        } else {
          layers.push(fillStrokes(set, [shape], "fill-pattern", aligned.clip));
        }
        break;
      }
    }
  }
  return applyAdvancedStroke({ shape: drawing.shape, outline, layers }, o);
}

/**
 * Replaces plain stroke layers when the brush cannot be a native stroke.
 * Curved bevel, variable width, and calligraphic tips become filled outlines.
 * A varying opacity profile becomes one luminance-mask group.
 */
/** Contours in one operation list. More than one means the path has a hole or a second island. */
function moveCount(ops: readonly { op: string }[]): number {
  let count = 0;
  for (const op of ops) if (op.op === "M") count++;
  return count;
}

function applyAdvancedStroke(drawing: Drawing, o: SketchOptions): Drawing {
  const profile = o.brushProfile;
  if (profile.crayon || profile.watercolor) return drawing;
  const varyingOpacity = opacityVaries(profile.opacityProfile);
  const custom =
    typeof profile.join === "object" ||
    thicknessVaries(profile.thicknessProfile) ||
    (profile.tip.directionSensitive && profile.tip.roundness < 0.99);
  if (!varyingOpacity && !custom) return drawing;
  const layers: DrawLayer[] = [];
  let group = 1;
  for (const layer of drawing.layers) {
    if (layer.role !== "stroke" || layer.strokeWidth === undefined) {
      layers.push(layer);
      continue;
    }
    if (varyingOpacity) {
      const pieces = layer.paths.flatMap((path) =>
        opacityRibbon(path, layer.strokeWidth ?? 0, profile, layer.paint.alpha ?? 1),
      );
      const id = group++;
      for (const piece of pieces) {
        layers.push({
          role: "stroke",
          paths: [piece.path],
          fillRule: "nonzero",
          paint: layer.paint,
          mask: { group: id, opacity: piece.opacity },
          ...(layer.clip ? { clip: layer.clip } : {}),
        });
      }
      continue;
    }
    const filled = layer.paths.flatMap((path) => [
      strokeToOutline(path, {
        width: layer.strokeWidth ?? 0,
        cap: profile.cap,
        join: profile.join,
        miterLimit: o.strokeMiterLimit,
        profile,
      }),
    ]);
    layers.push({
      role: "stroke",
      paths: filled,
      fillRule: "nonzero",
      paint: layer.paint,
      ...(layer.clip ? { clip: layer.clip } : {}),
    });
  }
  return { ...drawing, layers };
}

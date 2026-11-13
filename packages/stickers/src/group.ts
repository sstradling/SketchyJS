import type { Shape, SketchDrawing } from "@sketchy-js/core";
import type { Matrix2D, SketchOptions, StickerBacking } from "@sketchy-js/types";
import {
  commandsForLines,
  stickerCenterlines,
  type Centerline,
  type StickerCommand,
} from "./builder.js";
import { channels } from "./builder.js";
import { centroid, contains, dist, signedArea, type Pt } from "./geom.js";
import { offsetClosed } from "./offset.js";
import { combineSilhouettes, type SilhouetteRing } from "./union.js";

const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0];

/** One drawing inside a group, plus the part transform in group coordinates. */
export interface GroupPart {
  shape: Shape;
  /** Resolved options. A part's own sticker backing is ignored while the group has one. */
  options: SketchOptions;
  drawing: SketchDrawing;
  transform?: Matrix2D;
}

/**
 * Merged silhouette of a group, before the backing width is applied.
 * Stroke, backing, and shadow widths stay in points: the transform moves
 * points and does not multiply those widths. SVG paths keep authored
 * coordinates; they are not fitted to the canvas.
 */
export function groupSilhouette(
  parts: readonly GroupPart[],
  backing: StickerBacking,
  groupTransform: Matrix2D = IDENTITY,
): Centerline[] {
  const rings: SilhouetteRing[] = [];
  let shapeId = 0;
  for (const part of parts) {
    if (!contributes(part.options)) continue;
    const placement = multiply(part.transform ?? IDENTITY, groupTransform);
    const transform = part.shape.kind === "path" ? placement : undefined;
    const lines = stickerCenterlines(part.drawing, part.shape, backing, transform);
    const placed = lines.map((line) =>
      part.shape.kind === "path"
        ? line
        : {
            ...line,
            points: line.points.map((p) => apply(p, placement)),
            source: line.source.map((p) => apply(p, placement)),
          },
    );
    const stroke = Math.max(
      0,
      part.shape.kind === "path"
        ? (part.options.svgStrokeWidth ?? part.options.strokeWidth)
        : part.options.strokeWidth,
    );
    const closed = placed.filter((line) => line.closed && line.points.length >= 3);
    closed.forEach((line, index) => {
      const hole = isHole(index, closed);
      const distance = hole ? -stroke / 2 : stroke / 2;
      const hull =
        Math.abs(distance) > 0.4
          ? (offsetClosed(line.points, distance) ?? line.points)
          : line.points;
      rings.push({ points: hull, shape: shapeId, isHole: hole });
    });
    shapeId += 1;
  }
  const combined = combineSilhouettes(rings);
  const torn = typeof backing.edge === "object" && backing.edge.kind === "torn";
  return combined.map((ring) => {
    const points = torn ? simplify(ring.points, 1.8) : ring.points;
    return { points, closed: true, source: ring.points };
  });
}

/** Shared sheet for a group. `outward` is the backing width; stroke is already in the hull. */
export function groupCommands(
  parts: readonly GroupPart[],
  backing: StickerBacking,
  seed: bigint | undefined,
  groupTransform: Matrix2D = IDENTITY,
): { centerlines: Centerline[]; commands: StickerCommand[] } {
  const centerlines = groupSilhouette(parts, backing, groupTransform);
  return { centerlines, commands: commandsForLines(centerlines, backing.width, backing, seed) };
}

function contributes(options: SketchOptions): boolean {
  const fill = channels(options.fillColor).a * options.fillOpacity;
  const stroke = channels(options.strokeColor).a * options.strokeOpacity;
  return fill > 0.02 || stroke > 0.02;
}

function isHole(index: number, lines: readonly Centerline[]): boolean {
  const sample = centroid(lines[index]!.points);
  const area = Math.abs(signedArea(lines[index]!.points));
  let depth = 0;
  for (let other = 0; other < lines.length; other++) {
    if (other === index) continue;
    if (!(Math.abs(signedArea(lines[other]!.points)) > area * 1.02)) continue;
    if (contains(sample, lines[other]!.points)) depth += 1;
  }
  return depth % 2 === 1;
}

/** `t1` then `t2`, matching `CGAffineTransform.concatenating`. */
export function multiply(t1: Matrix2D, t2: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = t1;
  const [a2, b2, c2, d2, e2, f2] = t2;
  return [
    a2 * a1 + c2 * b1,
    b2 * a1 + d2 * b1,
    a2 * c1 + c2 * d1,
    b2 * c1 + d2 * d1,
    a2 * e1 + c2 * f1 + e2,
    b2 * e1 + d2 * f1 + f2,
  ];
}

function apply(point: Pt, [a, b, c, d, e, f]: Matrix2D): Pt {
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/** Douglas–Peucker used so a torn group edge can cut facets. */
function simplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 8) return points;
  const ring = points.concat([points[0]!]);
  const reduced = rdp(ring, epsilon);
  let open = reduced;
  if (open.length >= 2 && dist(open[0]!, open[open.length - 1]!) < 0.5) open = open.slice(0, -1);
  return open.length >= 8 ? open : points;
}

function rdp(input: Pt[], epsilon: number): Pt[] {
  if (input.length <= 2) return input;
  const start = input[0]!;
  const end = input[input.length - 1]!;
  let farthest = 0;
  let distance = 0;
  const span = Math.hypot(end.x - start.x, end.y - start.y);
  for (let index = 1; index < input.length - 1; index++) {
    const point = input[index]!;
    const deviation =
      span < 1e-4
        ? Math.hypot(point.x - start.x, point.y - start.y)
        : Math.abs(
            (end.y - start.y) * point.x -
              (end.x - start.x) * point.y +
              end.x * start.y -
              end.y * start.x,
          ) / span;
    if (deviation > distance) {
      distance = deviation;
      farthest = index;
    }
  }
  if (distance <= epsilon) return [start, end];
  const left = rdp(input.slice(0, farthest + 1), epsilon);
  const right = rdp(input.slice(farthest), epsilon);
  return left.slice(0, -1).concat(right);
}

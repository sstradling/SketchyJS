import type { Shape, SketchDrawing } from "@sketchy-js/core";
import type { Matrix2D, SketchOptions, StickerBacking } from "@sketchy-js/types";
import {
  clampStickerBacking,
  commandsForLines,
  stickerCenterlines,
  type Centerline,
  type StickerCommand,
  type StickerReport,
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
    if (stroke > 0.4) {
      for (const line of placed) {
        if (line.closed || line.points.length < 2) continue;
        rings.push({ points: openRibbon(line.points, stroke), shape: shapeId, isHole: false });
      }
    }
    shapeId += 1;
  }
  // Swift's silhouette walk emits later rings first. A single ring is unchanged.
  const combined = combineSilhouettes(rings).reverse();
  const torn = typeof backing.edge === "object" && backing.edge.kind === "torn";
  return combined.map((ring) => {
    const source = torn ? startAtMaxX(ring.points) : ring.points;
    const points = torn ? simplifyTornRing(source, TORN_SIMPLIFY_EPSILON) : source;
    return { points, closed: true, source };
  });
}

/** Shared sheet for a group. `outward` is the backing width; stroke is already in the hull. */
export function groupCommands(
  parts: readonly GroupPart[],
  backing: StickerBacking,
  seed: bigint | undefined,
  groupTransform: Matrix2D = IDENTITY,
  report?: StickerReport,
): { centerlines: Centerline[]; commands: StickerCommand[] } {
  const clamped = clampStickerBacking(backing);
  const centerlines = groupSilhouette(parts, clamped, groupTransform);
  return {
    centerlines,
    commands: commandsForLines(centerlines, clamped.width, clamped, seed, report),
  };
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

/** Round-capped stroke hull. Width stays in points; the group transform is already in the points. */
function openRibbon(points: readonly Pt[], width: number): Pt[] {
  const half = width / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let index = 0; index < points.length; index++) {
    const prev = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    const nx = (-(next.y - prev.y) / len) * half;
    const ny = ((next.x - prev.x) / len) * half;
    const point = points[index]!;
    left.push({ x: point.x + nx, y: point.y + ny });
    right.push({ x: point.x - nx, y: point.y - ny });
  }
  const start = points[0]!;
  const after = points[1]!;
  const startLen = Math.hypot(after.x - start.x, after.y - start.y) || 1;
  const end = points[points.length - 1]!;
  const before = points[points.length - 2]!;
  const endLen = Math.hypot(end.x - before.x, end.y - before.y) || 1;
  return [
    {
      x: start.x - ((after.x - start.x) / startLen) * half,
      y: start.y - ((after.y - start.y) / startLen) * half,
    },
    ...right,
    {
      x: end.x + ((end.x - before.x) / endLen) * half,
      y: end.y + ((end.y - before.y) / endLen) * half,
    },
    ...left.reverse(),
  ];
}

function apply(point: Pt, [a, b, c, d, e, f]: Matrix2D): Pt {
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/** Starts a ring at its maximum-x vertex, matching the group-torn union order. */
function startAtMaxX(points: Pt[]): Pt[] {
  let at = 0;
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    const best = points[at]!;
    if (point.x > best.x || (point.x === best.x && point.y > best.y)) at = index;
  }
  if (at === 0) return points.slice();
  return points.slice(at).concat(points.slice(0, at));
}

/** Douglas–Peucker epsilon in Sketchy v1.5.0 `SketchGroup`. A smaller value keeps more corners. */
export const TORN_SIMPLIFY_EPSILON = 1.8;

/** Douglas–Peucker used so a torn group edge can cut facets. */
export function simplifyTornRing(points: readonly Pt[], epsilon: number): Pt[] {
  if (points.length <= 8) return points.slice();
  const ring = points.concat([points[0]!]);
  const reduced = rdp(ring, epsilon);
  let open = reduced;
  if (open.length >= 2 && dist(open[0]!, open[open.length - 1]!) < 0.5) open = open.slice(0, -1);
  return open.length >= 8 ? open : points.slice();
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

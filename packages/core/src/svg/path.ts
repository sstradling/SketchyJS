import type { PathOp } from "@sketchy-js/types";
import { convertArc } from "./arc.js";
import { parseSvgPath } from "./parse.js";

/**
 * Converts an SVG path string to absolute `M L Q C Z` operations, the way
 * `UIBezierPath(svgPath:)` builds its `CGPath`: arcs become cubics, a zero-radius arc a line,
 * and an arc with identical endpoints is dropped.
 */
export function svgPathToOps(d: string): PathOp[] {
  const ops: PathOp[] = [];
  let current: [number, number] = [0, 0];
  let subpathStart: [number, number] | undefined;
  for (const c of parseSvgPath(d)) {
    switch (c.type) {
      case "move":
        ops.push({ op: "M", x: c.x, y: c.y });
        current = [c.x, c.y];
        subpathStart = [c.x, c.y];
        break;
      case "line":
        ops.push({ op: "L", x: c.x, y: c.y });
        current = [c.x, c.y];
        break;
      case "quad":
        ops.push({ op: "Q", cx: c.c1x, cy: c.c1y, x: c.x, y: c.y });
        current = [c.x, c.y];
        break;
      case "cubic":
        ops.push({ op: "C", c1x: c.c1x, c1y: c.c1y, c2x: c.c2x, c2y: c.c2y, x: c.x, y: c.y });
        current = [c.x, c.y];
        break;
      case "arc": {
        const conv = convertArc(current, [c.x, c.y], c.rx, c.ry, c.rotation, c.largeArc, c.sweep);
        if (conv.kind === "line") ops.push({ op: "L", x: c.x, y: c.y });
        else if (conv.kind === "cubic") for (const k of conv.curves) ops.push({ op: "C", ...k });
        current = [c.x, c.y];
        break;
      }
      case "close":
        ops.push({ op: "Z" });
        if (subpathStart) current = subpathStart;
        break;
    }
  }
  return ops;
}

/** An axis-aligned box; `empty` marks a path without points (`CGRect.null`). */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  empty: boolean;
}

/**
 * `CGPath.boundingBox`: the box of every point **including control points**. It is deliberately
 * not the tight curve bounds, because SVG fit and pattern sizing in Sketchy use this box.
 */
export function controlPointBounds(ops: readonly PathOp[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const op of ops) {
    if (op.op === "M" || op.op === "L") add(op.x, op.y);
    else if (op.op === "Q") {
      add(op.cx, op.cy);
      add(op.x, op.y);
    } else if (op.op === "C") {
      add(op.c1x, op.c1y);
      add(op.c2x, op.c2y);
      add(op.x, op.y);
    }
  }
  if (minX === Infinity)
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, empty: true };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, empty: false };
}

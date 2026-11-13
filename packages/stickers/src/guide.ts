import {
  cosf,
  eggPolygonPoints,
  f,
  PI,
  roundedRectanglePolygonPoints,
  sinf,
  svgPathToOps,
  type Shape,
} from "@sketchy-js/core";
import { flattenPath } from "./flatten.js";
import type { GuideRing } from "./smooth.js";

/**
 * The input silhouette, without roughness. Sticker smoothness blends the rough
 * outline toward these rings. Nothing here reads the drawing's random stream.
 *
 * Request flow: `buildStickerBacking` calls this with the shape that was drawn,
 * then `aim` projects each rough sample onto the matching ring.
 */
export function guideRings(shape: Shape): GuideRing[] {
  switch (shape.kind) {
    case "line":
      return [{ points: [p(shape.x1, shape.y1), p(shape.x2, shape.y2)], closed: false }];
    case "rectangle":
      return [
        {
          points: [
            p(shape.x, shape.y),
            p(f(shape.x + shape.width), shape.y),
            p(f(shape.x + shape.width), f(shape.y + shape.height)),
            p(shape.x, f(shape.y + shape.height)),
          ],
          closed: true,
        },
      ];
    case "ellipse":
      return [
        {
          points: ellipse(shape.x, shape.y, f(shape.width / 2), f(shape.height / 2)),
          closed: true,
        },
      ];
    case "circle": {
      const radius = f(shape.diameter / 2);
      return [{ points: ellipse(shape.x, shape.y, radius, radius), closed: true }];
    }
    case "polygon":
      return shape.points.length >= 3
        ? [{ points: shape.points.map((pt) => p(pt.x, pt.y)), closed: true }]
        : [];
    case "linearPath":
    case "curve":
      return shape.points.length >= 2
        ? [{ points: shape.points.map((pt) => p(pt.x, pt.y)), closed: false }]
        : [];
    case "roundedRectangle":
      return [
        {
          points: roundedRectanglePolygonPoints(
            f(shape.x),
            f(shape.y),
            f(shape.width),
            f(shape.height),
            f(shape.cornerRadius),
            10,
          ).map(([x, y]) => ({ x, y })),
          closed: true,
        },
      ];
    case "egg":
      return [
        {
          points: eggPolygonPoints(
            f(shape.x),
            f(shape.y),
            f(shape.width),
            f(shape.height),
            f(shape.tilt),
            48,
          ).map(([x, y]) => ({ x, y })),
          closed: true,
        },
      ];
    case "arc":
      return [
        arcRing(
          f(shape.x),
          f(shape.y),
          f(shape.width / 2),
          f(shape.height / 2),
          f(shape.start),
          f(shape.stop),
          shape.closed,
        ),
      ];
    case "path":
      return svgRings(shape.d);
  }
}

function p(x: number, y: number): { x: number; y: number } {
  return { x: f(x), y: f(y) };
}

/** 64-step ellipse. Angles use Swift `Float.pi`, then each sample is rounded to `Float`. */
function ellipse(cx: number, cy: number, rx: number, ry: number): { x: number; y: number }[] {
  const steps = 64;
  const points = [];
  for (let index = 0; index < steps; index++) {
    const angle = f(f(f(f(index) / f(steps)) * f(2)) * PI);
    points.push(p(f(cx) + f(rx * cosf(angle)), f(cy) + f(ry * sinf(angle))));
  }
  return points;
}

function arcRing(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
  closed: boolean,
): GuideRing {
  const sweep = f(stop - start);
  const steps = Math.max(12, Math.trunc(Math.abs(sweep) / f(PI / 18)));
  const samples = [];
  for (let index = 0; index <= steps; index++) {
    const angle = f(start + f(f(sweep * f(index)) / f(steps)));
    samples.push(p(f(cx) + f(rx * cosf(angle)), f(cy) + f(ry * sinf(angle))));
  }
  if (closed) samples.push(p(cx, cy));
  return { points: samples, closed };
}

function svgRings(d: string): GuideRing[] {
  return flattenPath(svgPathToOps(d)).map((piece) => ({
    points: piece.points,
    closed: piece.closed,
  }));
}

import type { Point } from "@sketchy-js/types";
import type { Shape } from "./types.js";

/** `Line(from:to:)`. */
export const line = (x1: number, y1: number, x2: number, y2: number): Shape => ({
  kind: "line",
  x1,
  y1,
  x2,
  y2,
});

/** `Rectangle(x:y:width:height:)`, top-left origin. */
export const rectangle = (x: number, y: number, width: number, height: number): Shape => ({
  kind: "rectangle",
  x,
  y,
  width,
  height,
});

/** `Ellipse(x:y:width:height:)`; `x`, `y` is the center. */
export const ellipse = (x: number, y: number, width: number, height: number): Shape => ({
  kind: "ellipse",
  x,
  y,
  width,
  height,
});

/** `Circle(x:y:diameter:)`; `x`, `y` is the center. */
export const circle = (x: number, y: number, diameter: number): Shape => ({
  kind: "circle",
  x,
  y,
  diameter,
});

/** `LinearPath(points:)`: an open polyline. */
export const linearPath = (points: readonly Point[]): Shape => ({ kind: "linearPath", points });

/** `Polygon(points:)`: a closed, fillable polygon. */
export const polygon = (points: readonly Point[]): Shape => ({ kind: "polygon", points });

/** `Arc(x:y:width:height:start:stop:closed:)`; angles in radians, `x`, `y` is the center. */
export const arc = (
  x: number,
  y: number,
  width: number,
  height: number,
  start: number,
  stop: number,
  closed = false,
): Shape => ({ kind: "arc", x, y, width, height, start, stop, closed });

/** `Curve(points:)`: a Catmull-Rom curve through the points. */
export const curve = (points: readonly Point[]): Shape => ({ kind: "curve", points });

/** `RoundedRectangle(x:y:width:height:cornerRadius:)`. */
export const roundedRectangle = (
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
): Shape => ({ kind: "roundedRectangle", x, y, width, height, cornerRadius });

/** `EggShape(x:y:width:height:tilt:)`; `tilt` defaults to 0.3 and `x`, `y` is the center. */
export const egg = (x: number, y: number, width: number, height: number, tilt = 0.3): Shape => ({
  kind: "egg",
  x,
  y,
  width,
  height,
  tilt,
});

/** `Path(d:)`: an SVG path string, fitted to the canvas when rendered. */
export const path = (d: string): Shape => ({ kind: "path", d });

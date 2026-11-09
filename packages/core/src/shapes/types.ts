import type { Point } from "@sketchy-js/types";

/**
 * A drawable shape value. These mirror Sketchy's `Drawable` structs, argument for argument:
 * `ellipse`, `circle`, `arc` and `egg` are positioned by their **center**; `rectangle` and
 * `roundedRectangle` by their top-left corner.
 */
export type Shape =
  | {
      readonly kind: "line";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly kind: "rectangle";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: "ellipse";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: "circle"; readonly x: number; readonly y: number; readonly diameter: number }
  | { readonly kind: "linearPath"; readonly points: readonly Point[] }
  | { readonly kind: "polygon"; readonly points: readonly Point[] }
  | {
      readonly kind: "arc";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly start: number;
      readonly stop: number;
      readonly closed: boolean;
    }
  | { readonly kind: "curve"; readonly points: readonly Point[] }
  | {
      readonly kind: "roundedRectangle";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly cornerRadius: number;
    }
  | {
      readonly kind: "egg";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly tilt: number;
    }
  | { readonly kind: "path"; readonly d: string };

/** The `kind` discriminant of a `Shape`. */
export type ShapeKindName = Shape["kind"];

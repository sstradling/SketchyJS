import type { Color, FillRule, Path, Point, Rect } from "@sketchy-js/types";
import type { FillRegion, FlatSubpath } from "./services.js";

export interface StrokeBase {
  readonly width: number;
  readonly color: Color;
  readonly opacity: number;
  readonly cap: "butt" | "round" | "square";
  readonly join: "miter" | "round" | "bevel" | "curvedBevel";
  readonly miterLimit: number;
}

export interface BrushInput {
  readonly path: Path;
  readonly bounds: Rect;
  readonly stroke: StrokeBase;
}

export interface FillBase {
  readonly weight: number;
  readonly gap: number;
  readonly angle: number;
  readonly color: Color;
  readonly opacity: number;
  /** The shape's outline width in px, used by fills that keep a minimum gap (API 1.1). */
  readonly strokeWidth?: number;
}

export interface FillInput {
  readonly region: FillRegion;
  readonly fill: FillBase;
}

export type PaintRef =
  | { readonly kind: "solid"; readonly color: Color; readonly alpha?: number }
  | { readonly kind: "stroke"; readonly alpha?: number }
  | { readonly kind: "fill"; readonly alpha?: number }
  | { readonly kind: "paper"; readonly alpha?: number };

export type FillPart =
  | {
      readonly kind: "area";
      readonly paths: readonly Path[];
      readonly fillRule?: FillRule;
      readonly paint?: PaintRef;
      readonly clip?: "region" | "none";
    }
  | {
      readonly kind: "strokes";
      readonly centerlines: readonly Path[];
      readonly clip?: "region" | "none";
    };

export interface Sheet {
  readonly paths: readonly Path[];
  readonly fillRule: FillRule;
  readonly bounds: Rect;
  readonly margin: number;
}

export interface TextureInput {
  readonly sheet: Sheet;
  readonly paperColor: Color;
}

export interface EdgeRing {
  readonly points: readonly Point[];
  readonly corner: readonly boolean[];
  readonly hole: boolean;
}

export interface EdgeInput {
  readonly rings: readonly EdgeRing[];
  readonly margin: number;
  readonly smoothness: number;
}

export interface EdgeOutRing {
  readonly path: Path;
  readonly hole: boolean;
}

export interface PluginLayer<R extends string> {
  readonly role: R;
  readonly paths: readonly Path[];
  readonly paint: PaintRef;
  readonly fillRule?: FillRule;
}

export type BrushLayer = PluginLayer<"stroke">;
export type TextureLayer = PluginLayer<"texture">;

export type { FillRegion, FlatSubpath };

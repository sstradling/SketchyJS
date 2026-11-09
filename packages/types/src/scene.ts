import type { Color } from "./color.js";
import type { Matrix2D, Rect, Size } from "./geometry.js";
import type { FillRule, Path } from "./path.js";

/** What a layer paints with. `stroke`, `fill` and `paper` refer to the owning shape's colors. */
export type Paint =
  | { kind: "solid"; color: Color; alpha?: number }
  | { kind: "stroke"; alpha?: number }
  | { kind: "fill"; alpha?: number }
  | { kind: "paper"; alpha?: number };

/** Paint order within a sticker or shape: `sheet-shadow` first, `stroke` last. */
export type LayerRole =
  | "sheet-shadow"
  | "sheet"
  | "sticker-image"
  | "texture"
  | "fill"
  | "fill-pattern"
  | "stroke"
  | "mask";

/** A clip applied to a layer. `path` is in the layer's coordinate space. */
export interface ClipDescriptor {
  paths: readonly Path[];
  fillRule: FillRule;
}

/** One painted group of paths. */
export interface DrawLayer {
  role: LayerRole;
  paths: readonly Path[];
  fillRule: FillRule;
  paint: Paint;
  /** Stroke width in scene units for `stroke` layers rendered as strokes; absent for filled areas. */
  strokeWidth?: number;
  clip?: ClipDescriptor;
}

/** Kinds of base shape. */
export type ShapeKind =
  | "line"
  | "rectangle"
  | "ellipse"
  | "circle"
  | "linearPath"
  | "polygon"
  | "arc"
  | "curve"
  | "roundedRectangle"
  | "egg"
  | "path";

/** Generated geometry for one shape. */
export interface Drawing {
  shape: ShapeKind;
  outline: readonly Path[];
  layers: readonly DrawLayer[];
}

/** A node in a built scene. */
export type SceneNode =
  | { type: "drawing"; drawing: Drawing; transform?: Matrix2D }
  | { type: "group"; children: readonly SceneNode[]; transform?: Matrix2D };

/** A non-fatal message produced while building a scene. `code` is a stable kebab-case string. */
export interface Diagnostic {
  code: string;
  message: string;
  plugin?: string;
}

/** Which plugin produced part of a scene, so a stored scene says what built it. */
export interface PluginUse {
  id: string;
  version: string;
  api: string;
}

/** A serializable, renderer-independent scene. */
export interface Scene {
  version: 1;
  size: Size;
  nodes: readonly SceneNode[];
  plugins?: readonly PluginUse[];
  diagnostics?: readonly Diagnostic[];
}

/** Bounding box snapshot used by geometry fixtures. */
export interface GeometrySnapshot {
  bounds: Rect;
  /**
   * @asType integer
   * @minimum 0
   */
  opCount: number;
  paths: readonly Path[];
}

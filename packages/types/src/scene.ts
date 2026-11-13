import type { Color } from "./color.js";
import type { Matrix2D, Rect, Size } from "./geometry.js";
import type { BrushCap, BrushJoin, StickerImagePlacement } from "./options.js";
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
  /** When true the layer is visible outside `paths` instead of inside (outside stroke alignment). */
  inverse?: boolean;
}

/** One painted group of paths. */
export interface DrawLayer {
  role: LayerRole;
  paths: readonly Path[];
  fillRule: FillRule;
  paint: Paint;
  /** Stroke width in scene units for `stroke` layers rendered as strokes; absent for filled areas. */
  strokeWidth?: number;
  /** Line cap of stroked layers; renderers default to `round` (Sketchy's default brush). */
  cap?: BrushCap;
  /** Line join of stroked layers; renderers default to `round`. */
  join?: BrushJoin;
  /** Miter limit used with the `miter` join. */
  miterLimit?: number;
  /**
   * Drop shadow painted with this layer, in scene pixels. Used by `sheet-shadow`.
   * The offset and blur are not multiplied by a node transform.
   */
  shadow?: { x: number; y: number; radius: number };
  /**
   * Experimental image mask. `href` is a caller-supplied `data:image` URL.
   * Renderers do not fetch it. See `docs/phase-3.md`.
   */
  stickerImage?: {
    href: string;
    placement: StickerImagePlacement;
    scale: number;
    opacity: number;
    width: number;
    height: number;
    /** One copy's rectangle. Tiles repeat this size from the sheet bounds. */
    drawRect: { x: number; y: number; width: number; height: number };
  };
  clip?: ClipDescriptor;
  /**
   * When set, this layer is one piece of a luminance mask. Pieces that share `group`
   * are painted faintest-first in opaque gray, then tinted once, so overlaps do not darken.
   */
  mask?: { group: number; opacity: number; blur?: number };
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

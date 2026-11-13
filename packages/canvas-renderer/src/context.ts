import type { Color } from "@sketchy-js/types";

/** The slice of a 2D context SketchyJS paints with. DOM and `OffscreenCanvas` both satisfy it. */
export interface Canvas2D {
  canvas: { width: number; height: number };
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  closePath(): void;
  fill(rule?: "nonzero" | "evenodd"): void;
  stroke(): void;
  clip(rule?: "nonzero" | "evenodd"): void;
  /**
   * Replaces the current transform. Mask blits use it inside `save`/`restore` to address
   * backing-store pixels. Node transforms use `transform` so they compose.
   */
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /** Post-multiplies a matrix onto the current transform. */
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /** Current transform, including a device-pixel scale the caller set before rendering. */
  getTransform?(): { a: number; b: number; c: number; d: number; e: number; f: number };
  /** Used to keep an inverse clip's outside region. Absent on geometry recorders. */
  globalCompositeOperation?: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillStyle: string | CanvasGradientLike;
  strokeStyle: string | CanvasGradientLike;
  globalAlpha: number;
  lineWidth: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  miterLimit: number;
  getImageData?(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  putImageData?(data: ImageDataLike, dx: number, dy: number): void;
  drawImage?(source: CanvasImageSourceLike, dx: number, dy: number): void;
}

/** Minimal stand-in so the renderer does not depend on the DOM lib. */
export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface CanvasImageSourceLike {
  width: number;
  height: number;
}

/** Builds an offscreen surface for an opacity mask. Absent in geometry-only tests. */
export interface CanvasSurfaceFactory {
  (width: number, height: number): { context: Canvas2D; image: CanvasImageSourceLike };
}

export interface CanvasRenderOptions {
  /** Paints a background rect before the scene. */
  background?: Color;
  /** Creates the luminance-mask surface. Defaults to `OffscreenCanvas` when the runtime has one. */
  createSurface?: CanvasSurfaceFactory;
}

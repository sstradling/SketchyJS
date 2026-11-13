import type {
  ClipDescriptor,
  Color,
  DrawLayer,
  Matrix2D,
  Paint,
  Path,
  Scene,
  SceneNode,
} from "@sketchy-js/types";
import type {
  Canvas2D,
  CanvasRenderOptions,
  CanvasSurfaceFactory,
  ImageDataLike,
} from "./context.js";

/**
 * Paints a scene onto a Canvas 2D context.
 *
 * Routing: the same `Scene` the SVG renderer consumes. A layer with `strokeWidth` is a native
 * stroke (cap, join, miter). A layer without one is a fill. Layers that share `mask.group`
 * are drawn into one luminance mask and tinted once, so overlapping quads do not darken.
 * An inverse clip (outside stroke alignment) is a mask of the complement.
 */

const css = (color: Color): { value: string; opacity: number } => {
  if (typeof color === "string") return { value: color, opacity: 1 };
  const [r, g, b, a] = color;
  const byte = (n: number): number => Math.round(Math.min(1, Math.max(0, n)) * 255);
  return {
    value: `rgb(${byte(r ?? 0)} ${byte(g ?? 0)} ${byte(b ?? 0)})`,
    opacity: a ?? 1,
  };
};

function trace(context: Canvas2D, paths: readonly Path[], begin = true): void {
  if (begin) context.beginPath();
  for (const path of paths) {
    for (const op of path) {
      switch (op.op) {
        case "M":
          context.moveTo(op.x, op.y);
          break;
        case "L":
          context.lineTo(op.x, op.y);
          break;
        case "Q":
          context.quadraticCurveTo(op.cx, op.cy, op.x, op.y);
          break;
        case "C":
          context.bezierCurveTo(op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y);
          break;
        case "Z":
          context.closePath();
          break;
      }
    }
  }
}

function paintOf(paint: Paint, background: Color | undefined): { value: string; opacity: number } {
  const alpha = paint.alpha ?? 1;
  if (paint.kind === "solid") {
    const c = css(paint.color);
    return { value: c.value, opacity: c.opacity * alpha };
  }
  if (paint.kind === "paper") {
    const c = css(background ?? "#ffffff");
    return { value: c.value, opacity: c.opacity * alpha };
  }
  return { value: "#000000", opacity: alpha };
}

function applyClip(
  context: Canvas2D,
  clip: ClipDescriptor | undefined,
  surface: CanvasSurfaceFactory | undefined,
): void {
  if (!clip) return;
  if (clip.inverse) {
    // Even-odd: a huge rectangle plus the shape punches the shape out.
    context.beginPath();
    const w = context.canvas.width || 1;
    const h = context.canvas.height || 1;
    context.moveTo(-w, -h);
    context.lineTo(w * 3, -h);
    context.lineTo(w * 3, h * 3);
    context.lineTo(-w, h * 3);
    context.closePath();
    trace(context, clip.paths, false);
    context.clip("evenodd");
    void surface;
    return;
  }
  trace(context, clip.paths);
  context.clip(clip.fillRule === "evenodd" ? "evenodd" : "nonzero");
}

function defaultSurface(): CanvasSurfaceFactory | undefined {
  const Offscreen = (
    globalThis as {
      OffscreenCanvas?: new (
        w: number,
        h: number,
      ) => {
        width: number;
        height: number;
        getContext(kind: "2d"): Canvas2D | null;
      };
    }
  ).OffscreenCanvas;
  if (!Offscreen) return undefined;
  return (width, height) => {
    const canvas = new Offscreen(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("OffscreenCanvas has no 2D context");
    return { context, image: canvas };
  };
}

function tintMask(data: ImageDataLike, tint: { r: number; g: number; b: number; a: number }): void {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i]! + px[i + 1]! + px[i + 2]!) / (3 * 255);
    px[i] = tint.r;
    px[i + 1] = tint.g;
    px[i + 2] = tint.b;
    px[i + 3] = Math.round(lum * tint.a * 255);
  }
}

function renderMask(
  layers: readonly DrawLayer[],
  context: Canvas2D,
  options: CanvasRenderOptions,
): void {
  const surface = (options.createSurface ?? defaultSurface())?.(
    context.canvas.width,
    context.canvas.height,
  );
  const paint = paintOf(layers[0]!.paint, options.background);
  const solid = css(paint.value.startsWith("rgb") ? paint.value : paint.value);
  void solid;
  if (
    !surface ||
    !surface.context.getImageData ||
    !surface.context.putImageData ||
    !context.drawImage
  ) {
    // No pixel surface: paint each piece with its own alpha. Overlaps darken, which is not
    // the mask behaviour; callers that need the mask pass createSurface.
    for (const layer of layers) {
      context.save();
      context.globalAlpha = Math.min(1, (layer.mask?.opacity ?? 1) * paint.opacity);
      context.fillStyle = paint.value;
      trace(context, layer.paths);
      context.fill("nonzero");
      context.restore();
    }
    return;
  }
  const mask = surface.context;
  mask.setTransform(1, 0, 0, 1, 0, 0);
  for (const layer of layers) {
    const g = Math.round(Math.min(1, Math.max(0, layer.mask?.opacity ?? 1)) * 255);
    mask.fillStyle = `rgb(${g} ${g} ${g})`;
    mask.globalAlpha = 1;
    trace(mask, layer.paths);
    mask.fill("nonzero");
  }
  if (!mask.getImageData || !mask.putImageData) return;
  const image = mask.getImageData(0, 0, mask.canvas.width, mask.canvas.height);
  const parsed = css(
    typeof layers[0]!.paint === "object" && layers[0]!.paint.kind === "solid"
      ? layers[0]!.paint.color
      : "#000000",
  );
  const bytes = parsed.value.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
  tintMask(image, { r: bytes[0] ?? 0, g: bytes[1] ?? 0, b: bytes[2] ?? 0, a: paint.opacity });
  mask.putImageData(image, 0, 0);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(surface.image, 0, 0);
  context.restore();
}

function renderLayer(layer: DrawLayer, context: Canvas2D, options: CanvasRenderOptions): void {
  const paint = paintOf(layer.paint, options.background);
  context.save();
  context.globalAlpha = paint.opacity;
  applyClip(context, layer.clip, options.createSurface);
  if (layer.strokeWidth !== undefined) {
    context.strokeStyle = paint.value;
    context.lineWidth = layer.strokeWidth;
    context.lineCap = layer.cap ?? "round";
    context.lineJoin = typeof layer.join === "object" ? "round" : (layer.join ?? "round");
    context.miterLimit = layer.miterLimit ?? 10;
    trace(context, layer.paths);
    context.stroke();
  } else {
    context.fillStyle = paint.value;
    trace(context, layer.paths);
    context.fill(layer.fillRule === "evenodd" ? "evenodd" : "nonzero");
  }
  context.restore();
}

function renderLayers(
  layers: readonly DrawLayer[],
  context: Canvas2D,
  options: CanvasRenderOptions,
): void {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    const group = layer.mask?.group;
    if (group === undefined) {
      renderLayer(layer, context, options);
      continue;
    }
    let end = i + 1;
    while (end < layers.length && layers[end]!.mask?.group === group) end++;
    context.save();
    applyClip(context, layer.clip, options.createSurface);
    renderMask(layers.slice(i, end), context, options);
    context.restore();
    i = end - 1;
  }
}

function renderNode(node: SceneNode, context: Canvas2D, options: CanvasRenderOptions): void {
  context.save();
  if (node.transform) applyMatrix(context, node.transform);
  if (node.type === "group") {
    for (const child of node.children) renderNode(child, context, options);
  } else {
    renderLayers(node.drawing.layers, context, options);
  }
  context.restore();
}

function applyMatrix(context: Canvas2D, m: Matrix2D): void {
  context.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

/**
 * Draws `scene` into `context`. The context's current transform is left unchanged.
 *
 * @param scene a built scene, the same value `renderToSvgString` accepts
 * @param context a Canvas 2D or OffscreenCanvas context
 */
export function renderToCanvas(
  scene: Scene,
  context: Canvas2D,
  options: CanvasRenderOptions = {},
): void {
  if (options.background !== undefined) {
    const c = css(options.background);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = c.opacity;
    context.fillStyle = c.value;
    context.fillRect(0, 0, scene.size.width, scene.size.height);
    context.restore();
  }
  for (const node of scene.nodes) renderNode(node, context, options);
}

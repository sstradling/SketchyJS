import type {
  ClipDescriptor,
  Color,
  DrawLayer,
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
 * An inverse clip is a luminance mask of the complement, using the clip's fill rule.
 * `stroke` and `fill` paints use the context's current stroke or fill style, which is the
 * canvas stand-in for SVG `currentColor`.
 *
 * Node transforms multiply the context's current transform (`save`, `transform`, `restore`).
 * A device-pixel scale set by the caller and nested groups therefore compose. The transform
 * on return matches the transform on entry.
 */

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const byteOf = (n: number): number => Math.round(Math.min(1, Math.max(0, n)) * 255);

/** CSS color plus the alpha carried by the color itself. Strings pass through for `fillStyle`. */
const css = (color: Color): { value: string; opacity: number } => {
  if (typeof color === "string") return { value: color, opacity: 1 };
  const [r, g, b, a] = color;
  return {
    value: `rgb(${byteOf(r ?? 0)} ${byteOf(g ?? 0)} ${byteOf(b ?? 0)})`,
    opacity: a ?? 1,
  };
};

/** Bytes of a scene color. Hex and `rgb()`/`rgba()` are parsed; unknown strings stay black. */
function colorBytes(color: Color): { r: number; g: number; b: number; a: number } {
  if (typeof color !== "string") {
    const [r, g, b, a = 1] = color;
    return { r: byteOf(r), g: byteOf(g), b: byteOf(b), a };
  }
  const text = color.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    const channel = (i: number): number => Number.parseInt(h.slice(i, i + 2), 16);
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: h.length >= 8 ? channel(6) / 255 : 1,
    };
  }
  const rgb =
    /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+%?))?\s*\)$/i.exec(text);
  if (rgb) {
    const alpha = rgb[4];
    const a =
      alpha === undefined
        ? 1
        : alpha.endsWith("%")
          ? Number(alpha.slice(0, -1)) / 100
          : Number(alpha);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: a > 1 ? a / 255 : a };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

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

function inheritedStyle(
  style: string | { addColorStop: (offset: number, color: string) => void },
): string {
  return typeof style === "string" && style.length > 0 ? style : "#000000";
}

function paintOf(
  paint: Paint,
  background: Color | undefined,
  context: Canvas2D,
): { value: string; opacity: number } {
  const alpha = paint.alpha ?? 1;
  if (paint.kind === "solid") {
    const c = css(paint.color);
    return { value: c.value, opacity: c.opacity * alpha };
  }
  if (paint.kind === "paper") {
    const c = css(background ?? "#ffffff");
    return { value: c.value, opacity: c.opacity * alpha };
  }
  const current = paint.kind === "stroke" ? context.strokeStyle : context.fillStyle;
  return { value: inheritedStyle(current), opacity: alpha };
}

function currentTransform(context: Canvas2D): Matrix {
  const t = context.getTransform?.();
  if (!t) return IDENTITY;
  return { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f };
}

function setMatrix(context: Canvas2D, m: Matrix): void {
  context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
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

function surfaceFor(
  context: Canvas2D,
  options: CanvasRenderOptions,
): ReturnType<CanvasSurfaceFactory> | undefined {
  const factory = options.createSurface ?? defaultSurface();
  if (!factory) return undefined;
  return factory(context.canvas.width, context.canvas.height);
}

/** Luminance times coverage, so antialiased edges stay soft. */
function tintMask(data: ImageDataLike, tint: { r: number; g: number; b: number; a: number }): void {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const coverage = (px[i + 3] ?? 0) / 255;
    const lum = ((px[i]! + (px[i + 1] ?? 0) + (px[i + 2] ?? 0)) / (3 * 255)) * coverage;
    px[i] = tint.r;
    px[i + 1] = tint.g;
    px[i + 2] = tint.b;
    px[i + 3] = Math.round(Math.min(1, lum * tint.a) * 255);
  }
}

/** White stays opaque and black becomes clear. Used by inverse clips. */
function luminanceToAlpha(data: ImageDataLike): void {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const coverage = (px[i + 3] ?? 0) / 255;
    const lum = ((px[i]! + (px[i + 1] ?? 0) + (px[i + 2] ?? 0)) / (3 * 255)) * coverage;
    const a = Math.round(Math.min(1, lum) * 255);
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = a;
  }
}

function blit(context: Canvas2D, image: Parameters<NonNullable<Canvas2D["drawImage"]>>[0]): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage?.(image, 0, 0);
  context.restore();
}

function renderMask(
  layers: readonly DrawLayer[],
  context: Canvas2D,
  options: CanvasRenderOptions,
): void {
  const paint = paintOf(layers[0]!.paint, options.background, context);
  const surface = surfaceFor(context, options);
  if (
    !surface ||
    !surface.context.getImageData ||
    !surface.context.putImageData ||
    !context.drawImage
  ) {
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
  setMatrix(mask, currentTransform(context));
  for (const layer of layers) {
    const g = Math.round(Math.min(1, Math.max(0, layer.mask?.opacity ?? 1)) * 255);
    mask.fillStyle = `rgb(${g} ${g} ${g})`;
    mask.globalAlpha = 1;
    trace(mask, layer.paths);
    mask.fill("nonzero");
  }
  if (!mask.getImageData || !mask.putImageData) return;
  const image = mask.getImageData(0, 0, mask.canvas.width, mask.canvas.height);
  const source = layers[0]!.paint.kind === "solid" ? layers[0]!.paint.color : paint.value;
  const bytes = colorBytes(source);
  const stringAlpha = typeof source === "string" ? bytes.a : 1;
  tintMask(image, { r: bytes.r, g: bytes.g, b: bytes.b, a: paint.opacity * stringAlpha });
  mask.putImageData(image, 0, 0);
  blit(context, surface.image);
}

function paintContent(
  layer: DrawLayer,
  context: Canvas2D,
  paint: { value: string; opacity: number },
): void {
  context.globalAlpha = paint.opacity;
  if (layer.strokeWidth !== undefined) {
    context.strokeStyle = paint.value;
    context.lineWidth = layer.strokeWidth;
    context.lineCap = layer.cap ?? "round";
    context.lineJoin = typeof layer.join === "object" ? "round" : (layer.join ?? "round");
    context.miterLimit = layer.miterLimit ?? 10;
    trace(context, layer.paths);
    context.stroke();
    return;
  }
  context.fillStyle = paint.value;
  trace(context, layer.paths);
  context.fill(layer.fillRule === "evenodd" ? "evenodd" : "nonzero");
}

function evenOddInverse(context: Canvas2D, clip: ClipDescriptor): void {
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
}

/**
 * Keeps the outside of `clip`, honoring `fillRule`. The mask is white everywhere and the clip
 * path is black, then luminance becomes alpha so antialiased edges stay soft.
 */
function paintInverse(
  layer: DrawLayer,
  context: Canvas2D,
  options: CanvasRenderOptions,
  paint: { value: string; opacity: number },
): void {
  const clip = layer.clip;
  const content = surfaceFor(context, options);
  const maskSurface = surfaceFor(context, options);
  if (
    !clip ||
    !content ||
    !maskSurface ||
    !content.context.getImageData ||
    !maskSurface.context.getImageData ||
    !maskSurface.context.putImageData ||
    !context.drawImage
  ) {
    if (clip) evenOddInverse(context, clip);
    paintContent(layer, context, paint);
    return;
  }
  const transform = currentTransform(context);
  const drawn = content.context;
  setMatrix(drawn, transform);
  paintContent(layer, drawn, { value: paint.value, opacity: 1 });
  const mask = maskSurface.context;
  mask.setTransform(1, 0, 0, 1, 0, 0);
  mask.fillStyle = "#ffffff";
  mask.fillRect(0, 0, mask.canvas.width, mask.canvas.height);
  setMatrix(mask, transform);
  mask.fillStyle = "#000000";
  trace(mask, clip.paths);
  mask.fill(clip.fillRule === "evenodd" ? "evenodd" : "nonzero");
  if (!mask.getImageData || !mask.putImageData) return;
  const image = mask.getImageData(0, 0, mask.canvas.width, mask.canvas.height);
  luminanceToAlpha(image);
  mask.putImageData(image, 0, 0);
  drawn.setTransform(1, 0, 0, 1, 0, 0);
  drawn.globalCompositeOperation = "destination-in";
  drawn.globalAlpha = 1;
  drawn.drawImage?.(maskSurface.image, 0, 0);
  context.save();
  context.globalAlpha = paint.opacity;
  blit(context, content.image);
  context.restore();
}

function renderLayer(layer: DrawLayer, context: Canvas2D, options: CanvasRenderOptions): void {
  const paint = paintOf(layer.paint, options.background, context);
  context.save();
  if (layer.stickerImage) {
    paintStickerImage(layer, context, options);
  } else if (layer.clip?.inverse) {
    paintInverse(layer, context, options, paint);
  } else {
    if (layer.clip) {
      trace(context, layer.clip.paths);
      context.clip(layer.clip.fillRule === "evenodd" ? "evenodd" : "nonzero");
    }
    if (layer.shadow) {
      const bytes = colorBytes(layer.paint.kind === "solid" ? layer.paint.color : "#000000");
      // Opacity is already on the paint. Putting it in the shadow color as well
      // would apply it twice.
      context.shadowColor = `rgb(${bytes.r} ${bytes.g} ${bytes.b})`;
      context.shadowBlur = layer.shadow.radius;
      context.shadowOffsetX = layer.shadow.x;
      context.shadowOffsetY = layer.shadow.y;
    }
    paintContent(layer, context, paint);
  }
  context.restore();
}

/**
 * Masks a caller-decoded image to the sheet. Holes use the even-odd clip.
 * The image is not given a shadow. A missing decode throws rather than skipping.
 */
function imageError(code: "sticker-image-source" | "sticker-image-taint", message: string): Error {
  const error = new Error(message);
  error.name = "StickerImageError";
  return Object.assign(error, { code });
}

function assertCanvasUntainted(source: unknown): void {
  if (!source || typeof source !== "object") return;
  const canvas = source as {
    width?: number;
    height?: number;
    getContext?: (
      kind: string,
    ) => { getImageData?: (x: number, y: number, w: number, h: number) => unknown } | null;
  };
  if (typeof canvas.getContext !== "function" || !(canvas.width && canvas.height)) return;
  const context = canvas.getContext("2d");
  if (!context?.getImageData) return;
  try {
    context.getImageData(0, 0, 1, 1);
  } catch {
    throw imageError(
      "sticker-image-taint",
      "sticker image canvas is tainted and its pixels cannot be read",
    );
  }
}

function paintStickerImage(
  layer: DrawLayer,
  context: Canvas2D,
  options: CanvasRenderOptions,
): void {
  const image = layer.stickerImage;
  if (!image) return;
  const source = options.images?.[image.href];
  if (!source || !context.drawImage) {
    throw imageError(
      "sticker-image-source",
      "sticker image source must be a decoded image passed in render options; network URLs are not loaded",
    );
  }
  assertCanvasUntainted(source);
  trace(context, layer.clip?.paths ?? layer.paths);
  context.clip("evenodd");
  context.globalAlpha = image.opacity;
  const rect = image.drawRect;
  if (image.placement === "tile") {
    const bounds = controlBox(layer.paths);
    for (
      let y = bounds.y, row = 0;
      y < bounds.y + bounds.height && row < 900;
      y += rect.height, row++
    ) {
      for (
        let x = bounds.x, col = 0;
        x < bounds.x + bounds.width && col < 900;
        x += rect.width, col++
      ) {
        context.drawImage(source, x, y, rect.width, rect.height);
      }
    }
    return;
  }
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}

function controlBox(paths: readonly Path[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const op of path) {
      if (op.op === "Z") continue;
      const xs = op.op === "C" ? [op.c1x, op.c2x, op.x] : op.op === "Q" ? [op.cx, op.x] : [op.x];
      const ys = op.op === "C" ? [op.c1y, op.c2y, op.y] : op.op === "Q" ? [op.cy, op.y] : [op.y];
      for (const x of xs) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      for (const y of ys) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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
    const clip = layer.clip;
    if (clip?.inverse) evenOddInverse(context, clip);
    else if (clip) {
      trace(context, clip.paths);
      context.clip(clip.fillRule === "evenodd" ? "evenodd" : "nonzero");
    }
    renderMask(layers.slice(i, end), context, options);
    context.restore();
    i = end - 1;
  }
}

function renderNode(node: SceneNode, context: Canvas2D, options: CanvasRenderOptions): void {
  context.save();
  if (node.transform) {
    const m = node.transform;
    context.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  }
  if (node.type === "group") {
    for (const child of node.children) renderNode(child, context, options);
  } else {
    renderLayers(node.drawing.layers, context, options);
  }
  context.restore();
}

/**
 * Draws `scene` into `context`. The context's current transform is multiplied by each node
 * transform and restored before return, so a HiDPI scale and nested groups stay in effect
 * while the scene paints and are unchanged afterwards.
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
    context.globalAlpha = c.opacity;
    context.fillStyle = c.value;
    context.fillRect(0, 0, scene.size.width, scene.size.height);
    context.restore();
  }
  for (const node of scene.nodes) renderNode(node, context, options);
}

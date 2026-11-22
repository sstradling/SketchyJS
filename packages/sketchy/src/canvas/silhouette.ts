import type { SilhouetteShadowDraw } from "../types/index.js";
import type { Canvas2D, CanvasRenderOptions } from "./context.js";

/**
 * Draws a silhouette shadow. The image is tinted, then transformed around the
 * anchor, and the anchor is moved to `position`. No seed is read.
 *
 * SVG tints with `feFlood` + `feComposite`. Canvas tints with `source-in` on
 * an offscreen surface when one is available. Without a surface the image is
 * drawn untinted at the shadow opacity, which the phase notes call out.
 */
export function paintSilhouette(
  shadow: SilhouetteShadowDraw,
  context: Canvas2D,
  options: CanvasRenderOptions,
): void {
  if (!(shadow.opacity > 0.001) || !(shadow.width > 0) || !(shadow.height > 0)) return;
  const source = options.images?.[shadow.href] ?? (shadow.source as Canvas2D["canvas"] | undefined);
  if (!source || !context.drawImage) return;
  const factory = options.createSurface;
  const tinted = factory ? factory(shadow.width, shadow.height) : undefined;
  const image = tinted?.image ?? source;
  if (tinted?.context.drawImage) {
    tinted.context.drawImage(source, 0, 0, shadow.width, shadow.height);
    tinted.context.globalCompositeOperation = "source-in";
    tinted.context.fillStyle = css(shadow.color);
    tinted.context.fillRect(0, 0, shadow.width, shadow.height);
  }
  const [a, b, c, d, e, f] = shadow.transform;
  const colorAlpha = typeof shadow.color === "string" ? 1 : (shadow.color[3] ?? 1);
  context.save();
  context.globalAlpha = Math.min(1, Math.max(0, shadow.opacity * colorAlpha));
  context.transform(1, 0, 0, 1, shadow.position.x, shadow.position.y);
  context.transform(a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0);
  context.transform(1, 0, 0, 1, -shadow.anchor.x, -shadow.anchor.y);
  context.drawImage(image, 0, 0, shadow.width, shadow.height);
  context.restore();
}

function css(color: SilhouetteShadowDraw["color"]): string {
  if (typeof color === "string") return color;
  const r = Math.round((color[0] ?? 0) * 255);
  const g = Math.round((color[1] ?? 0) * 255);
  const b = Math.round((color[2] ?? 0) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

import type { Point, Scene, SilhouetteShadowDraw, Size } from "../types/index.js";

/**
 * A tinted image shadow, separate from `StickerShadow`.
 *
 * It is painted directly. It does not enter `generateDrawing`, so it has no
 * seed and it does not change a geometry cache. Import this module from
 * `@sketchy-js/sketchy/scene/silhouette` so a basic scene does not pay for it.
 *
 * `.tree(image, at)` is the glider ground shadow: rgb(22, 48, 14) at 42%
 * opacity, skew -0.58, squash 0.32, pinned on the middle of the lowest opaque row.
 */

export interface SilhouetteImage {
  /** Width in points. */
  width: number;
  /** Height in points. */
  height: number;
  /** RGBA bytes, row 0 at the top. Length is `pixelWidth * pixelHeight * 4`. */
  pixels: ArrayLike<number>;
  /** Buffer width. Defaults to `width` when the image is 1x. */
  pixelWidth?: number;
  /** Buffer height. Defaults to `height` when the image is 1x. */
  pixelHeight?: number;
  /** Data URL used by SVG and by Canvas when `source` is absent. */
  href?: string;
  /** Live canvas or bitmap. Canvas prefers this. */
  source?: unknown;
}

const TREE_COLOR = [22 / 255, 48 / 255, 14 / 255, 1] as const;

/**
 * Middle of the lowest row whose alpha is above `threshold`, in points.
 * Y points down. An empty image returns the bottom centre.
 */
export function footAnchor(image: SilhouetteImage, alphaThreshold = 20): Point {
  const { width, height } = image;
  if (!(width > 0) || !(height > 0)) return { x: width / 2, y: height };
  const pixelWidth = image.pixelWidth ?? width;
  const pixelHeight = image.pixelHeight ?? height;
  if (!(pixelWidth > 0) || !(pixelHeight > 0)) return { x: width / 2, y: height };
  const scaleX = width / pixelWidth;
  const scaleY = height / pixelHeight;
  let foot: Point | undefined;
  for (let row = 0; row < pixelHeight; row++) {
    let first: number | undefined;
    let last: number | undefined;
    for (let column = 0; column < pixelWidth; column++) {
      const alpha = image.pixels[(row * pixelWidth + column) * 4 + 3] ?? 0;
      if (alpha > alphaThreshold) {
        if (first === undefined) first = column;
        last = column;
      }
    }
    if (first !== undefined && last !== undefined) {
      const mid = (first + last) / 2;
      foot = { x: (mid + 0.5) * scaleX, y: (row + 0.5) * scaleY };
    }
  }
  return foot ?? { x: width / 2, y: height };
}

/** Glider tree shadow. The anchor is the middle of the lowest opaque row. */
export function treeShadow(
  image: SilhouetteImage,
  at: Point,
  partial: Partial<Pick<SilhouetteShadowDraw, "color" | "opacity">> & {
    skew?: number;
    squash?: number;
  } = {},
): SilhouetteShadowDraw {
  const skew = partial.skew ?? -0.58;
  const squash = partial.squash ?? 0.32;
  return {
    href: image.href ?? "",
    width: image.width,
    height: image.height,
    color: partial.color ?? TREE_COLOR,
    opacity: clamp01(partial.opacity ?? 0.42),
    transform: [1, 0, skew, squash, 0, 0],
    anchor: footAnchor(image),
    position: at,
    ...(image.source !== undefined ? { source: image.source } : {}),
  };
}

/** A scene whose only node is the shadow. Nothing here is generated. */
export function silhouetteScene(size: Size, shadow: SilhouetteShadowDraw): Scene {
  return { version: 1, size, nodes: [{ type: "silhouette", shadow }] };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

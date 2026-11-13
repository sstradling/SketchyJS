import type { Scene } from "@sketchy-js/types";
import { StickerImageError } from "./error.js";
import { assertDataImage } from "./placement.js";

/** Reads one pixel. A tainted canvas throws in the host; this turns that into `sticker-image-taint`. */
export function assertImageUntainted(source: unknown): void {
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
  } catch (cause) {
    throw new StickerImageError(
      "sticker-image-taint",
      "sticker image canvas is tainted and its pixels cannot be read",
      { cause },
    );
  }
}

function hrefs(scene: Scene): string[] {
  const found: string[] = [];
  const visit = (nodes: Scene["nodes"]): void => {
    for (const node of nodes) {
      if (node.type === "group") {
        visit(node.children);
        continue;
      }
      for (const layer of node.drawing.layers) {
        const href = layer.stickerImage?.href;
        if (href && !found.includes(href)) found.push(href);
      }
    }
  };
  visit(scene.nodes);
  return found;
}

async function decode(href: string): Promise<unknown> {
  const bitmap = (globalThis as { createImageBitmap?: (blob: Blob) => Promise<unknown> })
    .createImageBitmap;
  if (!bitmap) {
    throw new StickerImageError(
      "sticker-image-source",
      "this runtime cannot decode images; pass decoded images to renderToCanvas",
    );
  }
  const response = await fetch(href);
  return bitmap(await response.blob());
}

/**
 * Decodes every sticker image in `scene` so `renderToCanvas` can stay synchronous.
 * Pass `load` to supply an `ImageBitmap` or canvas. A tainted canvas throws
 * `StickerImageError` with code `sticker-image-taint`.
 */
export async function prepareImages(
  scene: Scene,
  options: {
    allowSameOriginImages?: boolean;
    load?: (href: string) => Promise<unknown>;
  } = {},
): Promise<Record<string, unknown>> {
  const images: Record<string, unknown> = {};
  for (const href of hrefs(scene)) {
    assertDataImage(href, options.allowSameOriginImages ?? false);
    const source = options.load ? await options.load(href) : await decode(href);
    assertImageUntainted(source);
    images[href] = source;
  }
  return images;
}

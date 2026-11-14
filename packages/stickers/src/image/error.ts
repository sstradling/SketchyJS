/** Why a sticker image was refused. */
export type StickerImageErrorCode = "sticker-image-source" | "sticker-image-taint";

/**
 * A sticker image the renderers will not paint.
 * `sticker-image-source` is a URL this build does not load.
 * `sticker-image-taint` is a canvas whose pixels cannot be read.
 */
export class StickerImageError extends Error {
  readonly code: StickerImageErrorCode;
  constructor(code: StickerImageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StickerImageError";
    this.code = code;
  }
}

/** True for this class and for a renderer error that carries the same `code`. */
export function isStickerImageError(error: unknown): error is StickerImageError {
  if (error instanceof StickerImageError) return true;
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "sticker-image-source" || code === "sticker-image-taint";
}

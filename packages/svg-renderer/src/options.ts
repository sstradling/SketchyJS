import type { Color } from "@sketchy-js/types";

/** Options shared by `renderToSvgString` and `renderToSvgElement`. */
export interface SvgRenderOptions {
  /** Decimal places for coordinates; default 3. */
  precision?: number;
  /** Paints a full-canvas rectangle first; also the color of `paper` paints. Default none (white paper). */
  background?: Color;
  /** Prefix for generated `clipPath` and `mask` ids; use distinct prefixes when inlining several scenes. Default `sk`. */
  idPrefix?: string;
  /**
   * When set, a same-origin sticker image URL is written into the SVG.
   * The default embeds `data:image` URLs only. `blob:` and `file:` are never written.
   */
  allowSameOriginImages?: boolean;
  /**
   * Decoded images keyed like `renderToCanvas`'s `images`. A canvas here is
   * serialized to a data URL. A bitmap that cannot be serialized throws.
   */
  images?: Readonly<Record<string, unknown>>;
}

/** Options with defaults applied. */
export interface ResolvedSvgOptions {
  precision: number;
  background: Color | undefined;
  idPrefix: string;
  allowSameOriginImages: boolean;
  images: Readonly<Record<string, unknown>> | undefined;
}

/** Applies defaults to renderer options. */
export function resolveSvgOptions(options: SvgRenderOptions = {}): ResolvedSvgOptions {
  const precision = options.precision ?? 3;
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) {
    throw new RangeError(`precision must be an integer from 0 to 12, got ${precision}`);
  }
  return {
    precision,
    background: options.background,
    idPrefix: options.idPrefix ?? "sk",
    allowSameOriginImages: options.allowSameOriginImages ?? false,
    images: options.images,
  };
}

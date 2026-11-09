/**
 * A color value. A string is any CSS color; a tuple is sRGB with components in `0..1`
 * (alpha defaults to 1). Core never parses strings; renderers do.
 */
export type Color = string | readonly [r: number, g: number, b: number, a?: number];

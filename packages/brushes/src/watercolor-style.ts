/** Numeric watercolor settings. `seed` stays off the plugin schema, as crayon does. */
export interface WatercolorNumbers {
  pigment: number;
  wetness: number;
  edgeDarkening: number;
  layers: number;
  variation: number;
  bleed: number;
  seed: bigint | number;
}

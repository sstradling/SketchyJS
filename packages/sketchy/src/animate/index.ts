export { createAnimation } from "./controller.js";
export type { AnimationController, AnimationHost, AnimationOptions } from "./controller.js";
export { generateFrame, precomputeFrames, varianceOffset, varyPath } from "./variance.js";
export type { VarianceConfig } from "./variance.js";

/** Preset frame durations, in milliseconds. Sketchy's slow, medium, and fast speeds. */
export const ANIMATION_SPEED_MS = { slow: 600, medium: 300, fast: 100 } as const;

/** Preset variance factors. */
export const ANIMATION_VARIANCE = { veryLow: 0.005, low: 0.01, medium: 0.05, high: 0.1 } as const;

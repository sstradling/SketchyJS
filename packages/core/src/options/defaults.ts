import type { SketchOptions } from "@sketchy/types";
import { SKETCH_OPTIONS } from "./spec.js";

type ScalarKey = keyof typeof SKETCH_OPTIONS;

/**
 * Returns a fresh `SketchOptions` with every default from the spec table. Matches Swift
 * `Options()` field for field (see `fixtures/swift-reference/v1.5.0/options/defaults.json`).
 */
export function defaultSketchOptions(): SketchOptions {
  const scalars = Object.fromEntries(
    (Object.keys(SKETCH_OPTIONS) as ScalarKey[]).map((key) => [key, SKETCH_OPTIONS[key].default]),
  ) as Pick<SketchOptions, ScalarKey>;
  return {
    ...scalars,
    strokeColor: [0, 0, 0, 1],
    fillColor: [0, 0, 0, 0],
    fillOffset: { x: 0, y: 0 },
    brushProfile: {
      tip: { roundness: 1, angle: 0, directionSensitive: false },
      thicknessProfile: { kind: "uniform" },
      cap: "round",
      join: "round",
      opacityProfile: { kind: "uniform" },
    },
  };
}

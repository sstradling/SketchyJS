import type { SketchOptions } from "@sketchy-js/types";
import { applyRule } from "./clamp.js";
import { defaultSketchOptions } from "./defaults.js";
import { SKETCH_OPTIONS } from "./spec.js";

type ScalarKey = keyof typeof SKETCH_OPTIONS;

/**
 * Merges `overrides` over the Swift defaults and applies every numeric rule (clamps, `Float`
 * rounding), exactly as the `RoughView` modifiers do. The result is what generators consume.
 *
 * Colors, profiles and structural values pass through untouched. `fillOffset` and the
 * `fillPadding` are `Double` in Swift and are kept as given.
 */
export function resolveSketchOptions(overrides: Partial<SketchOptions> = {}): SketchOptions {
  const merged: SketchOptions = { ...defaultSketchOptions(), ...stripUndefined(overrides) };
  const out = merged as unknown as Record<string, unknown>;
  for (const key of Object.keys(SKETCH_OPTIONS) as ScalarKey[]) {
    const rule = SKETCH_OPTIONS[key];
    if (rule.type === "boolean" || rule.type === "enum") {
      if (rule.type === "enum" && !rule.values.includes(String(out[key])))
        throw new RangeError(
          `${key} must be one of ${rule.values.join(", ")}, got ${String(out[key])}`,
        );
      continue;
    }
    const value = out[key];
    if (typeof value !== "number") throw new TypeError(`${key} must be a number`);
    out[key] = applyRule(value, rule);
  }
  return merged;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

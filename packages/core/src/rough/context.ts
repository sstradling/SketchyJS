import type { SketchOptions } from "@sketchy-js/types";
import { f, PI } from "../f32.js";
import type { Rng } from "../rng/index.js";

/** A 2D point as `[x, y]`, the shape Sketchy's `[[Float]]` point lists use. */
export type Pt = readonly [number, number];

/**
 * State every rough generator draws from: the resolved options and the one random stream of the
 * drawing being generated. Sketchy uses a single stream per drawing, and nested helpers keep
 * consuming it, so the call order of generators is part of the output contract.
 */
export interface RoughCtx {
  readonly o: SketchOptions;
  readonly rng: Rng;
}

/**
 * `RoughMath.randOffsetWithRange`: `roughness * (unit * (max - min) + min)` in `Float`. Draws
 * exactly one value from the stream.
 */
export function randOffsetWithRange(ctx: RoughCtx, min: number, max: number): number {
  const unit = ctx.rng.swiftUnit();
  return f(ctx.o.roughness * f(f(unit * f(max - min)) + min));
}

/** `RoughMath.randOffset`: a value in `[-max, max]` scaled by roughness. */
export function randOffset(ctx: RoughCtx, max: number): number {
  return randOffsetWithRange(ctx, f(-max), max);
}

/** `2 * Float.pi / curveStepCount`, the angular step of ellipse sampling. */
export function ellipseIncrement(ctx: RoughCtx): number {
  return f(f(2 * PI) / ctx.o.curveStepCount);
}

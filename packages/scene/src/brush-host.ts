import { createGeometryKit, createRoughKit, Rng } from "@sketchy-js/core";
import type { BrushInput, BrushLayer, PluginContext } from "@sketchy-js/plugin";
import type { DrawLayer, Drawing, SketchOptions } from "@sketchy-js/types";
import type { ResolvedPlugin } from "./registry.js";

/** Grain seed: an explicit seed other than 1 wins; otherwise the drawing seed is used. */
export function resolvedStyleSeed(
  styleSeed: bigint | number | undefined,
  drawingSeed: bigint | undefined,
): bigint {
  if (styleSeed === undefined || styleSeed === 1 || styleSeed === 1n) return drawingSeed ?? 1n;
  return typeof styleSeed === "bigint" ? styleSeed : BigInt(styleSeed);
}

function context(seed: bigint, options: SketchOptions): PluginContext {
  const rng = new Rng(seed);
  return {
    rng,
    geom: createGeometryKit(createRoughKit({ o: options, rng })),
    quality: "final",
    maxOps: 200_000,
    warn: () => undefined,
  };
}

/**
 * Replaces stroke layers with the crayon plugin's wax passes. Fill strokes are left alone when
 * the fill is fully transparent, which is how a clear fill stays out of the wax.
 */
export function applyCrayon(
  drawing: Drawing,
  plugin: ResolvedPlugin,
  options: SketchOptions,
): Drawing {
  const crayon = options.brushProfile.crayon;
  if (!crayon) return drawing;
  const drawingSeed = options.seed === undefined ? undefined : BigInt(options.seed);
  const seed = resolvedStyleSeed(crayon.seed, drawingSeed);
  const ctx = context(seed, options);
  // Plugin `generate` is a plain function property, not a method that uses `this`.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const generate = plugin.plugin.generate as unknown as (
    input: BrushInput,
    resolved: Record<string, unknown>,
    context: PluginContext,
  ) => readonly BrushLayer[];
  const layers: DrawLayer[] = [];
  for (const layer of drawing.layers) {
    const width = layer.strokeWidth;
    if (
      width === undefined ||
      (layer.role !== "stroke" && layer.role !== "fill" && layer.role !== "fill-pattern")
    ) {
      layers.push(layer);
      continue;
    }
    const color = layer.paint.kind === "solid" ? layer.paint.color : options.strokeColor;
    const colorAlpha = typeof color === "string" ? 1 : (color[3] ?? 1);
    if (colorAlpha * (layer.paint.alpha ?? 1) === 0) {
      layers.push(layer);
      continue;
    }
    for (const path of layer.paths) {
      const produced = generate(
        {
          path,
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          stroke: {
            width,
            color: options.strokeColor,
            opacity: layer.paint.alpha ?? 1,
            cap: "round",
            join: "round",
            miterLimit: options.strokeMiterLimit,
          },
          seed,
        },
        plugin.options,
        ctx,
      );
      for (const piece of produced) {
        layers.push({
          role: "stroke",
          paths: piece.paths,
          fillRule: piece.fillRule ?? "nonzero",
          paint: {
            kind: "solid",
            color,
            alpha: piece.paint.alpha ?? 1,
          },
          ...(layer.clip ? { clip: layer.clip } : {}),
        });
      }
    }
  }
  return { ...drawing, layers };
}

import { Rng } from "../core/index.js";
import type { PluginContext } from "../plugin/index.js";

/**
 * A new context for one plugin call. A module-level `Rng` would couple
 * unrelated stickers, so every call gets its own stream.
 */
export function freshPluginContext(): PluginContext {
  return {
    rng: new Rng(1n),
    quality: "final",
    maxOps: 200_000,
    warn() {},
  } as unknown as PluginContext;
}

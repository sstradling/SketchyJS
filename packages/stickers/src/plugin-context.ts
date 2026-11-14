import { Rng } from "@sketchy-js/core";
import type { PluginContext } from "@sketchy-js/plugin";

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

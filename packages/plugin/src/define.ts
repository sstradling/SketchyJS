import type {
  BrushInput,
  BrushLayer,
  EdgeInput,
  EdgeOutRing,
  FillInput,
  FillPart,
  TextureInput,
  TextureLayer,
} from "./io.js";
import type { OptionSchema, Overrides } from "./options.js";
import type {
  BrushPlugin,
  Definition,
  EdgePlugin,
  FillPlugin,
  Plugin,
  PluginRef,
  TexturePlugin,
} from "./plugin.js";
import type { PluginKind } from "./version.js";

/** Recursively freezes plain objects and arrays. Functions are left as they are. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Builds a plugin object. It attaches `kind` and the `~sketchy` brand, deep-freezes the
 * definition, and adds `with()`. It has no other effect, so a call marked `/*#__PURE__*\/` can be
 * dropped by a bundler when the plugin is unused.
 *
 * Schema validation is not done here: the host validates at `use()` time and the test kit
 * validates in CI (see `@sketchy/plugin/schema`), which keeps this entry point tiny.
 */
function build<K extends PluginKind, S extends OptionSchema, Id extends string, In, Out>(
  kind: K,
  def: Definition<S, Id, In, Out>,
): Plugin<K, Id, S, In, Out> {
  const plugin = {
    ...def,
    "~sketchy": kind,
    kind,
    with(options: Overrides<S> = {}): PluginRef<K, Id, S> {
      return { plugin: plugin, options };
    },
  } as Plugin<K, Id, S, In, Out>;
  return deepFreeze(plugin);
}

/** Defines a brush plugin: a stroke centerline in, paint layers out. */
export function defineBrush<const S extends OptionSchema, const Id extends string>(
  def: Definition<S, Id, BrushInput, readonly BrushLayer[]>,
): BrushPlugin<S, Id> {
  return build("brush", def);
}

/** Defines a fill plugin: a fill region in, area and stroke parts out. */
export function defineFill<const S extends OptionSchema, const Id extends string>(
  def: Definition<S, Id, FillInput, readonly FillPart[]>,
): FillPlugin<S, Id> {
  return build("fill", def);
}

/** Defines a sticker texture plugin: a sheet in, texture layers out. */
export function defineTexture<const S extends OptionSchema, const Id extends string>(
  def: Definition<S, Id, TextureInput, readonly TextureLayer[]>,
): TexturePlugin<S, Id> {
  return build("texture", def);
}

/** Defines a sticker edge plugin: offset rings in, replacement rings out. */
export function defineStickerEdge<const S extends OptionSchema, const Id extends string>(
  def: Definition<S, Id, EdgeInput, readonly EdgeOutRing[]>,
): EdgePlugin<S, Id> {
  return build("edge", def);
}

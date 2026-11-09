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

function isDevelopment(): boolean {
  const processLike = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
  return processLike?.env?.NODE_ENV !== "production";
}

function validateDefinition(def: unknown, kind: PluginKind): void {
  if (def === null || typeof def !== "object")
    throw new TypeError("plugin definition must be an object");
  const value = def as Record<string, unknown>;
  for (const key of ["id", "version", "api", "title", "description"]) {
    if (typeof value[key] !== "string" || value[key] === "")
      throw new TypeError(`plugin ${key} must be a non-empty string`);
  }
  if (value.options === null || typeof value.options !== "object" || Array.isArray(value.options))
    throw new TypeError("plugin options must be a schema object");
  if (typeof value.generate !== "function")
    throw new TypeError(`plugin ${kind} generate must be a function`);
  for (const [name, spec] of Object.entries(value.options as Record<string, unknown>)) {
    if (spec === null || typeof spec !== "object" || Array.isArray(spec))
      throw new TypeError(`option ${name} must be a schema object`);
    const option = spec as Record<string, unknown>;
    if (typeof option.description !== "string" || option.description === "")
      throw new TypeError(`option ${name} needs a description`);
    if (typeof option.type !== "string") throw new TypeError(`option ${name} needs a type`);
    if (option.type === "number" || option.type === "int" || option.type === "range") {
      if (typeof option.min !== "number" || !Number.isFinite(option.min))
        throw new TypeError(`option ${name} needs a finite min`);
      if (typeof option.max !== "number" || !Number.isFinite(option.max) || option.min > option.max)
        throw new TypeError(`option ${name} needs a valid max`);
      const defaults = option.type === "range" ? option.default : [option.default];
      if (!Array.isArray(defaults) || defaults.length !== (option.type === "range" ? 2 : 1))
        throw new TypeError(`option ${name} has an invalid default`);
      for (const item of defaults)
        if (
          typeof item !== "number" ||
          !Number.isFinite(item) ||
          item < option.min ||
          item > option.max
        )
          throw new RangeError(`option ${name} default is outside its range`);
      if (option.type === "int" && !Number.isInteger(option.default))
        throw new TypeError(`option ${name} integer default must be an integer`);
    } else if (option.type === "choice") {
      if (
        !Array.isArray(option.values) ||
        option.values.length === 0 ||
        !option.values.every((v) => typeof v === "string")
      )
        throw new TypeError(`option ${name} needs non-empty choice values`);
      if (typeof option.default !== "string" || !option.values.includes(option.default))
        throw new TypeError(`option ${name} default must be one of its values`);
    } else if (option.type === "boolean") {
      if (typeof option.default !== "boolean")
        throw new TypeError(`option ${name} default must be boolean`);
    } else if (option.type === "color") {
      if (typeof option.default !== "string" || option.default === "")
        throw new TypeError(`option ${name} default must be a color string`);
    } else {
      throw new TypeError(`option ${name} has unknown type ${option.type}`);
    }
  }
}

/**
 * Builds a plugin object. It attaches `kind` and the `~sketchy` brand, deep-freezes the
 * definition, and adds `with()`. It has no other effect, so a call marked `/*#__PURE__*\/` can be
 * dropped by a bundler when the plugin is unused.
 *
 * In development, the definition shape and option defaults are validated before freezing.
 * Production builds skip this check.
 */
function build<K extends PluginKind, S extends OptionSchema, Id extends string, In, Out>(
  kind: K,
  def: Definition<S, Id, In, Out>,
): Plugin<K, Id, S, In, Out> {
  if (isDevelopment()) validateDefinition(def, kind);
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

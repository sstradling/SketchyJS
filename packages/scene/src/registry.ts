import type {
  AnyPlugin,
  MergeRegistry,
  OptionSchema,
  Plugin,
  PluginKind,
  PluginRef,
  RegistryShape,
  Resolved,
  Sketchy,
  Spec,
  UseOptions,
} from "@sketchy-js/plugin";
import { assertPluginApi } from "@sketchy-js/plugin/schema";
import { PluginNotRegisteredError, PluginRegistrationError } from "./errors.js";
import { resolvePluginOptions } from "./options-resolve.js";
import { RoughView } from "./view.js";

/** Registry type of an instance with nothing registered. */
export type EmptyRegistry = {
  brush: Record<never, never>;
  fill: Record<never, never>;
  texture: Record<never, never>;
  edge: Record<never, never>;
};

/** The registry entry a plugin adds, mirroring the plugin package's registry typing. */
export type EntryOf<P> =
  P extends Plugin<infer K, infer Id, infer S extends OptionSchema, never, unknown>
    ? { [Kind in K]: { [I in Id]: Resolved<S> } }
    : never;

/** Built-in ids are plain words (`hachure`, `crossHatch`); namespaced ids use a lowercase scope. */
const ID_PATTERN = /^(?:[a-z][a-z0-9-]*\/)?[a-zA-Z][a-zA-Z0-9-]*$/;

const keyOf = (kind: PluginKind, id: string): string => `${kind}:${id}`;

const isPlugin = (value: unknown): value is AnyPlugin =>
  typeof value === "object" && value !== null && "~sketchy" in value;

const isRef = (value: unknown): value is PluginRef<PluginKind, string, never> =>
  typeof value === "object" && value !== null && "plugin" in value && !("~sketchy" in value);

/** The result of resolving a plugin specification. `options` are fully resolved and validated. */
export interface ResolvedPlugin {
  readonly plugin: AnyPlugin;
  /** Options explicitly set by the caller (before defaults), used to let shape options bridge in. */
  readonly explicit: Readonly<Record<string, unknown>>;
  readonly options: Record<string, unknown>;
}

/**
 * Immutable plugin registry (`createSketchy()`). `use` returns a new instance, so a module can
 * never change another module's plugins. There is no global instance.
 *
 * Routing: `sketchy.view()` creates a `RoughView` bound to this registry; the view resolves its
 * fill specification here at build time.
 */
export class SketchyRegistry<
  R extends RegistryShape = EmptyRegistry & RegistryShape,
> implements Sketchy<R> {
  readonly #plugins: ReadonlyMap<string, AnyPlugin>;
  readonly #aliases: ReadonlyMap<string, AnyPlugin>;

  /** Use `createSketchy()`; the constructor is internal. */
  constructor(
    plugins: ReadonlyMap<string, AnyPlugin> = new Map(),
    aliases: ReadonlyMap<string, AnyPlugin> = new Map(),
  ) {
    this.#plugins = plugins;
    this.#aliases = aliases;
  }

  /**
   * Returns a new registry with `plugin` added. Registering the identical object again is a
   * no-op; a different object under the same id throws unless `{ replace: true }`.
   */
  use<P extends AnyPlugin>(
    plugin: P,
    options: UseOptions = {},
  ): SketchyRegistry<MergeRegistry<R, EntryOf<P>>> {
    assertPluginApi(plugin.id, plugin.api);
    const plugins = new Map(this.#plugins);
    const aliases = new Map(this.#aliases);
    const register = (id: string, target: Map<string, AnyPlugin>): void => {
      if (!ID_PATTERN.test(id)) throw new TypeError(`invalid plugin id "${id}"`);
      const key = keyOf(plugin.kind, id);
      const existing = plugins.get(key) ?? aliases.get(key);
      if (existing && existing !== plugin && !options.replace)
        throw new PluginRegistrationError(
          `${plugin.kind} "${id}" is already registered by a different plugin; pass { replace: true } to override`,
        );
      target.set(key, plugin);
    };
    register(plugin.id, plugins);
    if (options.alias !== undefined) register(options.alias, aliases);
    return new SketchyRegistry<MergeRegistry<R, EntryOf<P>>>(plugins, aliases);
  }

  /** True when a plugin (or alias) is registered. */
  has(kind: PluginKind, id: string): boolean {
    return this.#plugins.has(keyOf(kind, id)) || this.#aliases.has(keyOf(kind, id));
  }

  /** Registered plugins in registration order, optionally of one kind. */
  list(kind?: PluginKind): readonly AnyPlugin[] {
    return [...this.#plugins.values()].filter((p) => kind === undefined || p.kind === kind);
  }

  /**
   * Resolves a plugin specification: a registered id (`{ kind: "hachure", gap: 4 }`), a
   * `plugin.with(...)` reference, or a plugin object. Direct objects need no registration.
   */
  resolve<K extends PluginKind>(
    kind: K,
    spec: NoInfer<Spec<R, K>>,
  ): { plugin: AnyPlugin; options: Record<string, unknown> } {
    const { plugin, options } = this.resolveSpec(kind, spec);
    return { plugin, options };
  }

  /** Like `resolve`, also reporting which options the caller set explicitly. */
  resolveSpec(kind: PluginKind, spec: unknown): ResolvedPlugin {
    if (isPlugin(spec)) return this.finish(kind, spec, {});
    if (isRef(spec)) return this.finish(kind, spec.plugin, spec.options);
    if (typeof spec === "object" && spec !== null && "kind" in spec) {
      const { kind: id, ...rest } = spec as { kind: string } & Record<string, unknown>;
      const found = this.#plugins.get(keyOf(kind, id)) ?? this.#aliases.get(keyOf(kind, id));
      if (!found)
        throw new PluginNotRegisteredError(
          `${kind} "${id}" is not registered. Did you discard the return value of sketchy.use()?`,
        );
      return this.finish(kind, found, rest);
    }
    throw new TypeError(`cannot resolve a ${kind} plugin from ${JSON.stringify(spec)}`);
  }

  /** A `RoughView` bound to this registry. */
  view(): RoughView {
    return new RoughView(this);
  }

  private finish(kind: PluginKind, plugin: AnyPlugin, explicit: object): ResolvedPlugin {
    if (plugin.kind !== kind)
      throw new TypeError(`${plugin.id} is a ${plugin.kind} plugin, not a ${kind}`);
    assertPluginApi(plugin.id, plugin.api);
    const given = explicit as Readonly<Record<string, unknown>>;
    return { plugin, explicit: given, options: resolvePluginOptions(plugin, given) };
  }

  /** Looks a plugin up by id without throwing. */
  find(kind: PluginKind, id: string): AnyPlugin | undefined {
    return this.#plugins.get(keyOf(kind, id)) ?? this.#aliases.get(keyOf(kind, id));
  }
}

/** Creates an empty, immutable plugin registry. Nothing is registered for you. */
export function createSketchy(): SketchyRegistry {
  return new SketchyRegistry();
}

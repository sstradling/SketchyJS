import type { AnyPlugin, Plugin, PluginRef } from "./plugin.js";
import type { OptionSchema, Resolved } from "./options.js";
import type { PluginKind } from "./version.js";

type Entry<P> =
  P extends Plugin<infer K, infer Id, infer S, never, unknown>
    ? { [Kind in K]: { [I in Id]: Resolved<S> } }
    : never;

export type MergeRegistry<R, E> = {
  [K in PluginKind]: (K extends keyof R ? R[K] : Record<never, never>) &
    (K extends keyof E ? E[K] : Record<never, never>);
};

export type RegistryShape = { [K in PluginKind]: { [id: string]: object } };

export type Spec<R extends RegistryShape, K extends PluginKind> =
  | { [I in keyof R[K] & string]: { readonly kind: I } & Partial<R[K][I]> }[keyof R[K] & string]
  | PluginRef<K, string, OptionSchema>
  | Plugin<K, string, OptionSchema, never, unknown>;

export interface UseOptions {
  /** Allow replacing an already registered (kind, id). Intended for tests and deliberate overrides. */
  readonly replace?: boolean;
  /** Also register the plugin under this id, e.g. after graduation from contrib to core. */
  readonly alias?: string;
}

/**
 * Host registry contract. The implementation (`createSketchy`) lives in `@sketchy-js/scene`; only
 * the types are part of the plugin contract so plugin and tool code can refer to them.
 */
export interface Sketchy<R extends RegistryShape> {
  use<P extends AnyPlugin>(plugin: P, options?: UseOptions): Sketchy<MergeRegistry<R, Entry<P>>>;
  has(kind: PluginKind, id: string): boolean;
  list(kind?: PluginKind): readonly AnyPlugin[];
  resolve<K extends PluginKind>(
    kind: K,
    spec: NoInfer<Spec<R, K>>,
  ): { plugin: AnyPlugin; options: Record<string, unknown> };
}

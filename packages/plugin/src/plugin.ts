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
import type { Overrides, OptionSchema, Resolved } from "./options.js";
import type { PluginContext } from "./services.js";
import type { PluginApi, PluginKind } from "./version.js";

export interface PluginExample<S extends OptionSchema> {
  readonly name: string;
  readonly options: Overrides<S>;
  readonly seed?: number;
}

export interface PluginMeta<S extends OptionSchema, Id extends string> {
  readonly id: Id;
  readonly version: string;
  readonly api: PluginApi;
  readonly title: string;
  readonly description: string;
  readonly options: S;
  readonly tags?: readonly string[];
  readonly stochastic?: boolean;
  readonly stream?: "isolated" | "shared";
  readonly overflow?: number;
  /**
   * Fill plugins only (API 1.1). `"area"` declares that the plugin paints its region as an area, so
   * hosts can use an SVG path directly instead of running the plugin (Sketchy's solid shortcut).
   */
  readonly paints?: "area" | "strokes";
  readonly examples?: readonly PluginExample<S>[];
}

export interface PluginRef<K extends PluginKind, Id extends string, S extends OptionSchema> {
  readonly plugin: Plugin<K, Id, S, unknown, unknown>;
  readonly options: Overrides<S>;
}

export interface Plugin<
  K extends PluginKind,
  Id extends string,
  S extends OptionSchema,
  In,
  Out,
> extends PluginMeta<S, Id> {
  readonly "~sketchy": K;
  readonly kind: K;
  generate(input: In, options: Resolved<S>, ctx: PluginContext): Out;
  with(options?: Overrides<S>): PluginRef<K, Id, S>;
}

export type BrushPlugin<S extends OptionSchema = OptionSchema, Id extends string = string> = Plugin<
  "brush",
  Id,
  S,
  BrushInput,
  readonly BrushLayer[]
>;
export type FillPlugin<S extends OptionSchema = OptionSchema, Id extends string = string> = Plugin<
  "fill",
  Id,
  S,
  FillInput,
  readonly FillPart[]
>;
export type TexturePlugin<
  S extends OptionSchema = OptionSchema,
  Id extends string = string,
> = Plugin<"texture", Id, S, TextureInput, readonly TextureLayer[]>;
export type EdgePlugin<S extends OptionSchema = OptionSchema, Id extends string = string> = Plugin<
  "edge",
  Id,
  S,
  EdgeInput,
  readonly EdgeOutRing[]
>;

/** What an author passes to `defineX`: metadata plus `generate`. */
export interface Definition<S extends OptionSchema, Id extends string, In, Out> extends PluginMeta<
  S,
  Id
> {
  generate(input: In, options: Resolved<S>, ctx: PluginContext): Out;
}

/** Any plugin, for registries and tools. */
export type AnyPlugin = Plugin<PluginKind, string, OptionSchema, never, unknown>;

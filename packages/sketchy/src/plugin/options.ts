export type Unit = "px" | "deg" | "ratio" | "ms" | "count" | "none";

interface SpecBase {
  readonly label?: string;
  readonly description: string;
  readonly group?: string;
  readonly advanced?: boolean;
}

export interface NumberSpec extends SpecBase {
  readonly type: "number";
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: Unit;
  readonly scale?: "linear" | "log";
  readonly uiMin?: number;
  readonly uiMax?: number;
}

export interface IntSpec extends SpecBase {
  readonly type: "int";
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly unit?: Unit;
}

export interface BooleanSpec extends SpecBase {
  readonly type: "boolean";
  readonly default: boolean;
}

export interface ChoiceSpec<V extends string = string> extends SpecBase {
  readonly type: "choice";
  readonly values: readonly V[];
  readonly default: V;
}

export interface ColorSpec extends SpecBase {
  readonly type: "color";
  /** A color string, or `"inherit"` to use the owning shape's color. */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  readonly default: string | "inherit";
}

export interface RangeSpec extends SpecBase {
  readonly type: "range";
  readonly default: readonly [number, number];
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: Unit;
}

export type OptionSpec = NumberSpec | IntSpec | BooleanSpec | ChoiceSpec | ColorSpec | RangeSpec;

/** Option schema: plain, JSON-serializable data keyed by option name. */
export type OptionSchema = { readonly [key: string]: OptionSpec };

export type SpecValue<T extends OptionSpec> = T extends NumberSpec | IntSpec
  ? number
  : T extends BooleanSpec
    ? boolean
    : T extends ChoiceSpec<infer V>
      ? V
      : T extends ColorSpec
        ? string
        : T extends RangeSpec
          ? readonly [number, number]
          : never;

/** Fully resolved options handed to `generate`. */
export type Resolved<S extends OptionSchema> = { readonly [K in keyof S]: SpecValue<S[K]> };

/** Partial options accepted by `with()` and registry specs. */
export type Overrides<S extends OptionSchema> = { readonly [K in keyof S]?: SpecValue<S[K]> };

/** Schema builders. They add the `type` tag and nothing else, so they tree-shake to object literals. */
export const s = {
  number: (o: Omit<NumberSpec, "type">): NumberSpec => ({ type: "number", ...o }),
  int: (o: Omit<IntSpec, "type">): IntSpec => ({ type: "int", ...o }),
  boolean: (o: Omit<BooleanSpec, "type">): BooleanSpec => ({ type: "boolean", ...o }),
  color: (o: Omit<ColorSpec, "type">): ColorSpec => ({ type: "color", ...o }),
  range: (o: Omit<RangeSpec, "type">): RangeSpec => ({ type: "range", ...o }),
  choice: <const V extends string>(o: Omit<ChoiceSpec<V>, "type">): ChoiceSpec<V> => ({
    type: "choice",
    ...o,
  }),
} as const;

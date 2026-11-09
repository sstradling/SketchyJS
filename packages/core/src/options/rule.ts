/** Numeric storage of a Swift property. `float` values are rounded with `Math.fround` after clamping. */
export type NumericType = "float" | "double" | "int";

/**
 * One documented option. The tables in `spec.ts` are the single source of truth for defaults and
 * clamping; the JSON Schemas, defaults, docs and parity tests all derive from them.
 */
export interface NumericRule {
  readonly type: NumericType;
  readonly default: number;
  /** Lower bound applied by the Swift code, when there is one. */
  readonly min?: number;
  /** Upper bound applied by the Swift code, when there is one. */
  readonly max?: number;
  /** Value stored when the input is NaN or infinite, for rules that do not follow `min`/`max`. */
  readonly nonFiniteTo?: number;
  /** Where Swift applies the clamp: its initializer, a `RoughView` modifier, or nowhere. */
  readonly enforcedBy: "init" | "modifier" | "use-site" | "none";
  /** Swift symbol, for traceability. */
  readonly swift: string;
}

export interface BooleanRule {
  readonly type: "boolean";
  readonly default: boolean;
  readonly enforcedBy: "none";
  readonly swift: string;
}

export interface EnumRule {
  readonly type: "enum";
  readonly values: readonly string[];
  readonly default: string;
  readonly enforcedBy: "none";
  readonly swift: string;
}

export type OptionRule = NumericRule | BooleanRule | EnumRule;

/** Creates a numeric rule with no clamp. */
export function num(
  type: NumericType,
  swift: string,
  def: number,
  extra: Partial<Pick<NumericRule, "min" | "max" | "nonFiniteTo" | "enforcedBy">> = {},
): NumericRule {
  return { type, swift, default: def, enforcedBy: "none", ...extra };
}

/** Creates a boolean rule. */
export function bool(swift: string, def: boolean): BooleanRule {
  return { type: "boolean", swift, default: def, enforcedBy: "none" };
}

/** Creates an enum rule. */
export function choice(swift: string, values: readonly string[], def: string): EnumRule {
  return { type: "enum", swift, values, default: def, enforcedBy: "none" };
}

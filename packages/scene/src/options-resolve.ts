import type { OptionSchema, OptionSpec, AnyPlugin } from "@sketchy-js/plugin";

/** Describes a value for error messages. */
const show = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** Throws when `value` is not valid for `spec`. */
function check(plugin: string, name: string, spec: OptionSpec, value: unknown): void {
  const where = `${plugin} option ${name}`;
  switch (spec.type) {
    case "number":
    case "int":
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new TypeError(`${where} must be a finite number, got ${show(value)}`);
      if (spec.type === "int" && !Number.isInteger(value))
        throw new TypeError(`${where} must be an integer, got ${show(value)}`);
      if (value < spec.min || value > spec.max)
        throw new RangeError(`${where} must be within ${spec.min}..${spec.max}, got ${value}`);
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new TypeError(`${where} must be a boolean`);
      return;
    case "choice":
      if (typeof value !== "string" || !spec.values.includes(value))
        throw new RangeError(
          `${where} must be one of ${spec.values.join(", ")}, got ${show(value)}`,
        );
      return;
    case "color":
      if (typeof value !== "string") throw new TypeError(`${where} must be a color string`);
      return;
    case "range":
      if (!Array.isArray(value) || value.length !== 2 || value.some((v) => typeof v !== "number"))
        throw new TypeError(`${where} must be a [min, max] pair`);
      return;
  }
}

/**
 * Merges overrides over a plugin's schema defaults and validates them. Unknown names, wrong types
 * and out-of-range numbers throw, so a typo never silently falls back to the default.
 */
export function resolvePluginOptions(
  plugin: Pick<AnyPlugin, "id" | "options">,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const schema: OptionSchema = plugin.options;
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) out[name] = spec.default;
  for (const [name, value] of Object.entries(overrides)) {
    const spec = schema[name];
    if (!spec) throw new TypeError(`${plugin.id} has no option "${name}"`);
    if (value === undefined) continue;
    check(plugin.id, name, spec, value);
    out[name] = value;
  }
  return out;
}

/**
 * Fills the options of a plugin that share a name and numeric type with a shape option (for
 * example `dashGap`, `dashOffset`, `zigzagOffset`) from the shape's `SketchOptions`, clamped to
 * the plugin's declared range. Explicit plugin overrides win over the shape options.
 */
export function bridgeShapeOptions(
  plugin: Pick<AnyPlugin, "options">,
  resolved: Record<string, unknown>,
  explicit: Readonly<Record<string, unknown>>,
  shape: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out = { ...resolved };
  for (const [name, spec] of Object.entries(plugin.options)) {
    if (name in explicit || (spec.type !== "number" && spec.type !== "int")) continue;
    const value = shape[name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[name] = Math.min(spec.max, Math.max(spec.min, value));
  }
  return out;
}

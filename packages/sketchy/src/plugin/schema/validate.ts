import type { OptionSchema, OptionSpec } from "../options.js";
import type { PluginMeta } from "../plugin.js";

const OPTION_NAME = /^[a-z][A-Za-z0-9]*$/;
const PLUGIN_ID = /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const API = /^\d+\.\d+$/;
const RESERVED_NAMES: ReadonlySet<string> = new Set(["seed", "kind", "with", "constructor"]);

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function checkNumeric(
  name: string,
  spec: Extract<OptionSpec, { type: "number" | "int" | "range" }>,
  problems: string[],
): void {
  const where = `option "${name}"`;
  if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || spec.min > spec.max) {
    problems.push(`${where}: min and max must be finite with min <= max`);
    return;
  }
  if (spec.type === "int" && (!Number.isInteger(spec.min) || !Number.isInteger(spec.max))) {
    problems.push(`${where}: int min and max must be integers`);
  }
  if (spec.type === "range") {
    const [lo, hi] = spec.default;
    if (lo > hi || !inRange(lo, spec.min, spec.max) || !inRange(hi, spec.min, spec.max)) {
      problems.push(`${where}: default must satisfy min <= lo <= hi <= max`);
    }
  } else {
    if (!inRange(spec.default, spec.min, spec.max))
      problems.push(`${where}: default is outside min..max`);
    if (spec.type === "int" && !Number.isInteger(spec.default))
      problems.push(`${where}: int default must be an integer`);
  }
  if ("step" in spec && spec.step !== undefined && !(spec.step > 0))
    problems.push(`${where}: step must be > 0`);
  if (spec.type === "number") {
    if (spec.scale === "log" && spec.min <= 0) problems.push(`${where}: log scale needs min > 0`);
    const uiMin = spec.uiMin ?? spec.min;
    const uiMax = spec.uiMax ?? spec.max;
    if (uiMin < spec.min || uiMax > spec.max || uiMin > uiMax) {
      problems.push(`${where}: uiMin and uiMax must lie within min..max and uiMin <= uiMax`);
    }
  }
}

/**
 * Checks an option schema and returns a list of problems (empty when valid): defaults in range,
 * `min <= max`, valid names, enum defaults listed in `values`, and non-empty descriptions.
 */
export function validateSchema(schema: OptionSchema): string[] {
  const problems: string[] = [];
  for (const [name, spec] of Object.entries(schema)) {
    if (!OPTION_NAME.test(name))
      problems.push(`option "${name}": names must be lowerCamelCase identifiers`);
    if (RESERVED_NAMES.has(name)) problems.push(`option "${name}": name is reserved`);
    if (typeof spec.description !== "string" || spec.description.trim() === "") {
      problems.push(`option "${name}": description is required`);
    }
    switch (spec.type) {
      case "number":
      case "int":
      case "range":
        checkNumeric(name, spec, problems);
        break;
      case "choice":
        if (spec.values.length === 0) problems.push(`option "${name}": values must not be empty`);
        if (new Set(spec.values).size !== spec.values.length)
          problems.push(`option "${name}": values must be unique`);
        if (!spec.values.includes(spec.default))
          problems.push(`option "${name}": default must be one of values`);
        break;
      case "color":
        if (typeof spec.default !== "string" || spec.default === "")
          problems.push(`option "${name}": default must be a color string or "inherit"`);
        break;
      case "boolean":
        if (typeof spec.default !== "boolean")
          problems.push(`option "${name}": default must be a boolean`);
        break;
    }
  }
  return problems;
}

/** Checks plugin metadata (id, versions, text) plus its option schema. Returns problems; empty when valid. */
export function validateDefinition(
  def: Pick<
    PluginMeta<OptionSchema, string>,
    "id" | "version" | "api" | "title" | "description" | "options"
  >,
): string[] {
  const problems: string[] = [];
  if (!PLUGIN_ID.test(def.id))
    problems.push(`id "${def.id}" must be kebab-case, optionally "scope/name"`);
  if (!SEMVER.test(def.version)) problems.push(`version "${def.version}" must be semver`);
  if (!API.test(def.api)) problems.push(`api "${def.api}" must look like "1.0"`);
  if (def.title.trim() === "") problems.push("title is required");
  if (def.description.trim() === "") problems.push("description is required");
  return [...problems, ...validateSchema(def.options)];
}

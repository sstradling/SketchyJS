import type { OptionSchema, OptionSpec, Overrides, Resolved } from "../options.js";
import { PluginOptionError } from "./errors.js";

export type ResolveMode = "lenient" | "strict";

/** Non-fatal message produced while resolving options. */
export interface OptionDiagnostic {
  code:
    "option-clamped" | "option-invalid" | "option-rounded" | "option-unknown" | "option-swapped";
  option: string;
  message: string;
}

export interface ResolveResult<S extends OptionSchema> {
  value: Resolved<S>;
  diagnostics: OptionDiagnostic[];
}

/** Keys the host owns and plugins never declare. */
const HOST_KEYS: ReadonlySet<string> = new Set(["seed"]);

type Report = (code: OptionDiagnostic["code"], message: string) => void;

function clampNumber(
  name: string,
  spec: { min: number; max: number },
  value: number,
  report: Report,
): number {
  if (value < spec.min || value > spec.max) {
    report("option-clamped", `${name} ${value} is outside ${spec.min}..${spec.max}`);
    return Math.min(spec.max, Math.max(spec.min, value));
  }
  return value;
}

function resolveOne(name: string, spec: OptionSpec, raw: unknown, report: Report): unknown {
  const invalid = (): unknown => {
    report("option-invalid", `${name} has an invalid value; using the default`);
    return spec.default;
  };
  switch (spec.type) {
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return invalid();
      return clampNumber(name, spec, raw, report);
    }
    case "int": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return invalid();
      let value = raw;
      if (!Number.isInteger(value)) {
        report("option-rounded", `${name} ${value} is not an integer; rounded`);
        value = Math.round(value);
      }
      return clampNumber(name, spec, value, report);
    }
    case "boolean":
      return typeof raw === "boolean" ? raw : invalid();
    case "choice":
      return typeof raw === "string" && spec.values.includes(raw) ? raw : invalid();
    case "color":
      return typeof raw === "string" && raw.length > 0 ? raw : invalid();
    case "range": {
      if (
        !Array.isArray(raw) ||
        raw.length !== 2 ||
        typeof raw[0] !== "number" ||
        typeof raw[1] !== "number" ||
        !Number.isFinite(raw[0]) ||
        !Number.isFinite(raw[1])
      ) {
        return invalid();
      }
      let [lo, hi] = raw as [number, number];
      if (lo > hi) {
        report("option-swapped", `${name} had its bounds swapped`);
        [lo, hi] = [hi, lo];
      }
      return [clampNumber(name, spec, lo, report), clampNumber(name, spec, hi, report)];
    }
  }
}

/**
 * Resolves `overrides` against `schema` into a complete, in-range options object.
 *
 * Lenient mode (default) repairs values and records diagnostics. Strict mode throws
 * `PluginOptionError` on the first problem. A missing or `undefined` option uses its default
 * in both modes. The host-owned `seed` key is ignored here.
 */
export function resolveOptions<S extends OptionSchema>(
  schema: S,
  overrides: Overrides<S> | Record<string, unknown> = {},
  mode: ResolveMode = "lenient",
): ResolveResult<S> {
  const diagnostics: OptionDiagnostic[] = [];
  const value: Record<string, unknown> = {};
  const given = overrides as Record<string, unknown>;

  const reporterFor =
    (name: string): Report =>
    (code, message) => {
      if (mode === "strict") throw new PluginOptionError(code, name, message);
      diagnostics.push({ code, option: name, message });
    };

  for (const name of Object.keys(given)) {
    if (HOST_KEYS.has(name) || Object.hasOwn(schema, name)) continue;
    reporterFor(name)("option-unknown", `${name} is not an option of this plugin`);
  }
  for (const [name, spec] of Object.entries(schema)) {
    const raw = given[name];
    value[name] = raw === undefined ? spec.default : resolveOne(name, spec, raw, reporterFor(name));
  }
  return { value: value as Resolved<S>, diagnostics };
}

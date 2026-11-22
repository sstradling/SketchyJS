import type { OptionSchema, OptionSpec } from "../options.js";

/** A JSON Schema object (draft 2020-12 subset). */
export type JsonSchema = { [key: string]: unknown };

function specToJson(spec: OptionSpec): JsonSchema {
  const common: JsonSchema = { description: spec.description, default: spec.default };
  if (spec.label !== undefined) common["title"] = spec.label;
  switch (spec.type) {
    case "number":
      return { ...common, type: "number", minimum: spec.min, maximum: spec.max };
    case "int":
      return { ...common, type: "integer", minimum: spec.min, maximum: spec.max };
    case "boolean":
      return { ...common, type: "boolean" };
    case "choice":
      return { ...common, type: "string", enum: [...spec.values] };
    case "color":
      return { ...common, type: "string", minLength: 1 };
    case "range":
      return {
        ...common,
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "number", minimum: spec.min, maximum: spec.max },
      };
  }
}

/**
 * Converts an option schema to a JSON Schema for editors, scene validation and web-component
 * attribute parsing. Set `seed` for plugins that are stochastic: the host-owned `seed` override
 * is then allowed too.
 */
export function toJsonSchema(
  schema: OptionSchema,
  options: { title?: string; seed?: boolean } = {},
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const [name, spec] of Object.entries(schema)) properties[name] = specToJson(spec);
  if (options.seed) {
    properties["seed"] = {
      description: "Deterministic seed (host-owned).",
      oneOf: [
        { type: "integer", minimum: 0 },
        { type: "string", pattern: "^[0-9]{1,20}$" },
      ],
    };
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...(options.title !== undefined ? { title: options.title } : {}),
    type: "object",
    properties,
    additionalProperties: false,
  };
}

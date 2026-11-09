import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";
import {
  CRAYON_STYLE,
  SKETCH_OPTIONS,
  STICKER_BACKING,
  STICKER_IMAGE,
  STICKER_SHADOW,
  STICKER_TEXTURE,
  WATERCOLOR_STYLE,
  type OptionRule,
} from "../../packages/core/src/options/index.ts";

type Json = { [key: string]: unknown };

const root = fileURLToPath(new URL("../../", import.meta.url));
const typesDir = join(root, "packages", "types");
const outDir = join(typesDir, "schemas");

/** Schema files to produce: file stem, TypeScript type name, title. */
const TARGETS = [
  { file: "options", type: "SketchOptions", title: "Sketchy options" },
  { file: "path-operations", type: "Path", title: "Sketchy path operations" },
  { file: "scene", type: "Scene", title: "Sketchy scene" },
  { file: "geometry-snapshot", type: "GeometrySnapshot", title: "Sketchy geometry snapshot" },
  { file: "color", type: "Color", title: "Sketchy color" },
  { file: "seed", type: "SerializedSeed", title: "Sketchy deterministic seed" },
] as const;

/** Definitions whose numeric properties get ranges and defaults from the option spec tables. */
const RANGED: Record<string, Record<string, OptionRule>> = {
  SketchOptions: SKETCH_OPTIONS,
  CrayonStyle: CRAYON_STYLE,
  WatercolorStyle: WATERCOLOR_STYLE,
  StickerShadow: STICKER_SHADOW,
  StickerTexture: STICKER_TEXTURE,
  StickerBacking: STICKER_BACKING,
  StickerImage: STICKER_IMAGE,
};

const SEED_SCHEMA: Json = {
  description:
    "Deterministic seed: a non-negative safe integer, or a decimal string for values up to 2^64 - 1.",
  anyOf: [
    { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    { type: "string", pattern: "^[0-9]{1,20}$" },
  ],
};

const COLOR_SCHEMA: Json = {
  description:
    "A CSS color string, or an sRGB tuple [r, g, b] or [r, g, b, a] with components in 0..1.",
  anyOf: [
    { type: "string", minLength: 1 },
    {
      type: "array",
      minItems: 3,
      maxItems: 4,
      items: { type: "number", minimum: 0, maximum: 1 },
    },
  ],
};

/** Adds min/max/default from a spec rule to a generated property schema. */
function applyRule(property: Json, rule: OptionRule): void {
  delete property["$ref"];
  if (rule.type === "enum") {
    property["enum"] = [...rule.values];
    property["default"] = rule.default;
    return;
  }
  property["default"] = rule.default;
  if (rule.type === "boolean") return;
  if (rule.type === "int") property["type"] = "integer";
  if (rule.min !== undefined) property["minimum"] = rule.min;
  if (rule.max !== undefined) property["maximum"] = rule.max;
}

function enrich(schema: Json): void {
  const definitions = (schema["definitions"] ?? {}) as Record<string, Json>;
  definitions["Seed"] = SEED_SCHEMA;
  definitions["SerializedSeed"] = SEED_SCHEMA;
  definitions["Color"] = COLOR_SCHEMA;
  for (const [name, table] of Object.entries(RANGED)) {
    const properties = (definitions[name]?.["properties"] ?? {}) as Record<string, Json>;
    for (const [key, rule] of Object.entries(table)) {
      const property = properties[key];
      if (property) applyRule(property, rule);
    }
  }
}

/** Generates all schemas as `[fileName, text]` pairs. */
function generateAll(): [string, string][] {
  return TARGETS.map(({ file, type, title }) => {
    const generator = createGenerator({
      path: join(typesDir, "src", "index.ts"),
      tsconfig: join(typesDir, "tsconfig.json"),
      type,
      expose: "export",
      topRef: true,
      additionalProperties: false,
      jsDoc: "extended",
      skipTypeCheck: false,
    });
    const schema = generator.createSchema(type) as Json;
    enrich(schema);
    const output: Json = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: `urn:sketchyjs:schema:${file}:v1`,
      title,
      ...schema,
    };
    output["$schema"] = "http://json-schema.org/draft-07/schema#";
    return [`${file}.schema.json`, `${JSON.stringify(output, null, 2)}\n`];
  });
}

const check = process.argv.includes("--check");
const outputs = generateAll();
if (check) {
  const stale = outputs.filter(([name, text]) => {
    const path = join(outDir, name);
    return !existsSync(path) || readFileSync(path, "utf8") !== text;
  });
  if (stale.length > 0) {
    console.error(`stale schemas: ${stale.map(([n]) => n).join(", ")}; run pnpm schemas`);
    process.exit(1);
  }
  console.log(`schemas up to date (${outputs.length} files)`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [name, text] of outputs) writeFileSync(join(outDir, name), text);
  console.log(`wrote ${outputs.length} schemas to ${dirname(join(outDir, "x"))}`);
}

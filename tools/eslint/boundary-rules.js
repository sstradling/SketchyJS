import { readFileSync } from "node:fs";

export const boundaries = JSON.parse(
  readFileSync(new URL("../boundaries.json", import.meta.url), "utf8"),
);

const { globals, members, newExpressions } = boundaries.bannedInPureGeometry;
const areas = Object.keys(boundaries.areas);

/**
 * Forbids subpaths outside the area's allowed folders.
 * @param {string} area folder under packages/sketchy/src
 */
export function importRestrictions(area) {
  const allowed = new Set([area, ...(boundaries.areas[area] ?? [])]);
  const banned = areas.filter((name) => !allowed.has(name));
  const patterns = banned.flatMap((name) => [
    `@sketchy-js/sketchy/${name}`,
    `@sketchy-js/sketchy/${name}/*`,
  ]);
  patterns.push("@sketchy-js/svg-renderer", "@sketchy-js/svg-renderer/*");
  return {
    "no-restricted-imports": [
      "error",
      {
        patterns: patterns.map((group) => ({
          group: [group],
          message: "Not an allowed folder dependency; see tools/boundaries.json.",
        })),
      },
    ],
  };
}

/** Determinism rules for folders that must not touch time, randomness, or the DOM. */
export function determinismRules() {
  const memberSelectors = members.map((path) => {
    const [object, property] = path.split(".");
    return {
      selector: `MemberExpression[object.name='${object}'][property.name='${property}']`,
      message: `${path} is non-deterministic or environment-specific; use the seeded Rng or inject it.`,
    };
  });
  const newSelectors = newExpressions.map((name) => ({
    selector: `NewExpression[callee.name='${name}']`,
    message: `new ${name}() is non-deterministic; inject time from the host.`,
  }));
  return {
    "no-restricted-globals": [
      "error",
      ...globals.map((name) => ({
        name,
        message: `${name} is not available to pure geometry code.`,
      })),
    ],
    "no-restricted-syntax": ["error", ...memberSelectors, ...newSelectors],
  };
}

/** Folder-level ESLint overrides derived from tools/boundaries.json. */
export function packageOverrides() {
  return areas.map((area) => {
    const pure = boundaries.pureGeometryAreas.includes(area);
    return {
      files: [`packages/sketchy/src/${area}/**/*.ts`],
      rules: { ...importRestrictions(area), ...(pure ? determinismRules() : {}) },
    };
  });
}

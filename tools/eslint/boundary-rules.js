import { readFileSync } from "node:fs";

export const boundaries = JSON.parse(
  readFileSync(new URL("../boundaries.json", import.meta.url), "utf8"),
);

const { globals, members, newExpressions } = boundaries.bannedInPureGeometry;
const allPackages = Object.keys(boundaries.packages);

/**
 * `no-restricted-imports` rule forbidding every workspace package that `name` may not import.
 * @param {string} name package directory name, e.g. "core"
 */
export function importRestrictions(name) {
  const entry = boundaries.packages[name];
  const allowed = new Set([
    name,
    ...entry.dependencies,
    ...(entry.peers ?? []),
    ...(entry.optionalPeers ?? []),
  ]);
  const groups = allPackages.filter((p) => !allowed.has(p)).map((p) => `@sketchy-js/${p}`);
  if (groups.length === 0) return {};
  return {
    "no-restricted-imports": [
      "error",
      {
        patterns: groups.map((group) => ({
          group: [group],
          message: "Not an allowed dependency; see tools/boundaries.json.",
        })),
      },
    ],
  };
}

/** Determinism rules for packages that must not touch time, randomness, or the environment. */
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
        message: `${name} is not available to pure geometry packages.`,
      })),
    ],
    "no-restricted-syntax": ["error", ...memberSelectors, ...newSelectors],
  };
}

/**
 * Per-package ESLint override blocks derived from `tools/boundaries.json`.
 * @returns {import("eslint").Linter.Config[]}
 */
export function packageOverrides() {
  return allPackages.map((name) => {
    const pure = boundaries.pureGeometryPackages.includes(name);
    return {
      files: [`packages/${name}/src/**/*.ts`],
      rules: { ...importRestrictions(name), ...(pure ? determinismRules() : {}) },
    };
  });
}

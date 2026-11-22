import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { entryProblems } from "../../../scripts/check-typedoc-entries.mjs";

const repo = fileURLToPath(new URL("../../..", import.meta.url));

describe("typedoc entry points", () => {
  it("matches the sketchy exports and the tsup entries", () => {
    const pkg = JSON.parse(readFileSync(join(repo, "packages/sketchy/package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    const typedoc = JSON.parse(
      readFileSync(join(repo, "packages/sketchy/typedoc.json"), "utf8"),
    ) as {
      entryPoints: string[];
    };
    const tsupSource = readFileSync(join(repo, "packages/sketchy/tsup.config.ts"), "utf8");
    expect(
      entryProblems({
        exportsMap: pkg.exports,
        typedocEntryPoints: typedoc.entryPoints,
        tsupSource,
      }),
    ).toEqual([]);
  });

  it("fails when a public export is missing from typedoc", () => {
    const tsupSource = `const fills = ["solid"];
export default {
  entry: {
    index: "src/index.ts",
    "fills/solid": "src/fills/solid.ts",
  },
};`;
    const problems = entryProblems({
      exportsMap: {
        ".": {},
        "./fills/solid": {},
        "./canvas": {},
        "./package.json": {},
        "./schemas/*": {},
      },
      typedocEntryPoints: ["src/index.ts", "src/fills/solid.ts"],
      tsupSource,
    });
    expect(problems.some((problem) => problem.includes("package exports and tsup"))).toBe(true);
  });
});

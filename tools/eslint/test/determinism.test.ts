import tseslint from "typescript-eslint";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { determinismRules, importRestrictions } from "../boundary-rules.js";

type Rules = Record<string, unknown>;

async function lint(source: string, rules: Rules): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser }, rules: rules as never },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: "sample.ts" });
  return (result?.messages ?? []).map((m) => m.message);
}

const pure = (): Rules => ({
  ...determinismRules(),
  ...importRestrictions("core"),
});

describe("determinism lint rules for pure geometry packages", () => {
  it.each([
    ["Math.random()", "const x = Math.random();"],
    ["Date.now()", "const x = Date.now();"],
    ["new Date()", "const x = new Date();"],
    ["performance.now()", "const x = performance.now();"],
    ["crypto.getRandomValues", "crypto.getRandomValues(new Uint8Array(1));"],
    ["window", "const w = window;"],
    ["document", "const d = document;"],
    ["Path2D", "const p = new Path2D();"],
    ["OffscreenCanvas", "const c = new OffscreenCanvas(1, 1);"],
  ])("rejects %s", async (_name, source) => {
    expect((await lint(source, pure())).length).toBeGreaterThan(0);
  });

  it("allows seeded and pure code", async () => {
    expect(
      await lint("export const f = (a: number) => Math.sqrt(a) + Math.floor(a);", pure()),
    ).toEqual([]);
  });

  it("forbids importing packages that are not allowed dependencies", async () => {
    expect((await lint('import "@sketchy-js/fills";', pure())).length).toBe(1);
    expect((await lint('import "@sketchy-js/svg-renderer/x";', pure())).length).toBe(1);
    expect(
      await lint('import "@sketchy-js/types"; import "@sketchy-js/plugin/schema";', pure()),
    ).toEqual([]);
  });

  it("built-in packages may import only the plugin package", async () => {
    const fills = importRestrictions("fills");
    expect((await lint('import "@sketchy-js/core";', fills)).length).toBe(1);
    expect(await lint('import "@sketchy-js/plugin";', fills)).toEqual([]);
  });
});

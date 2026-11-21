import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../../scripts/release-dry-run.mjs", import.meta.url));

function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

describe("release dry run", () => {
  it("accepts the unpublished 0.0.0 tree without a gate", () => {
    const result = run([]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("0.0.0");
  });

  it("refuses a gate at 0.0.0 and a gate with no expected version", () => {
    const missing = run(["--gate"]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toMatch(/--expect/);
    const wrong = run(["--gate", "--expect", "1.6.0"]);
    expect(wrong.status).not.toBe(0);
    expect(wrong.stderr).toMatch(/0\.0\.0/);
  });
});

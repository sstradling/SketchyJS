import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../../scripts/release-dry-run.mjs", import.meta.url));
const names = [
  "types",
  "plugin",
  "core",
  "fills",
  "brushes",
  "stickers",
  "scene",
  "svg-renderer",
  "canvas-renderer",
  "animate",
  "react",
  "web-components",
  "contrib",
];

function tree(versions: string | readonly string[], pending = false): string {
  const root = mkdtempSync(join(tmpdir(), "sketchy-release-"));
  const list = typeof versions === "string" ? names.map(() => versions) : versions;
  names.forEach((name, index) => {
    const dir = join(root, "packages", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({ name: `@sketchy-js/${name}`, version: list[index] })}\n`,
    );
  });
  mkdirSync(join(root, ".changeset"));
  if (pending) writeFileSync(join(root, ".changeset", "pending.md"), "# pending\n");
  return root;
}

function run(root: string, args: string[] = []) {
  return spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
}

describe("release dry run", () => {
  it("accepts an unpublished 0.0.0 tree without a gate", () => {
    const result = run(tree("0.0.0"));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("0.0.0");
  });

  it("refuses a gate at 0.0.0, a missing expect, and a non-semver expect", () => {
    const root = tree("0.0.0");
    const atZero = run(root, ["--gate", "--expect", "1.6.0"]);
    expect(atZero.status).not.toBe(0);
    expect(atZero.stderr).toMatch(/0\.0\.0/);
    const missing = run(root, ["--gate"]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toMatch(/--expect/);
    const bad = run(root, ["--gate", "--expect", "v1.6.0"]);
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/strict semver/);
  });

  it("refuses an explicit 0.0.0 expected version", () => {
    const explicit = run(tree("0.0.0"), ["--gate", "--expect", "0.0.0"]);
    expect(explicit.status).not.toBe(0);
    expect(explicit.stderr).toMatch(/versions are still 0\.0\.0/);
  });

  it("accepts 1.6.0 when that is the expected version and nothing is pending", () => {
    const result = run(tree("1.6.0"), ["--gate", "--expect", "1.6.0"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("1.6.0");
  });

  it("refuses a version mismatch, the wrong expected version, and a pending changeset", () => {
    const versions = names.map(() => "1.6.0");
    versions[2] = "1.6.1";
    const mismatch = run(tree(versions), ["--gate", "--expect", "1.6.0"]);
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toMatch(/differ/);
    const wrong = run(tree("1.6.0"), ["--gate", "--expect", "1.7.0"]);
    expect(wrong.status).not.toBe(0);
    expect(wrong.stderr).toMatch(/expected 1\.7\.0/);
    const pending = run(tree("1.6.0", true), ["--gate", "--expect", "1.6.0"]);
    expect(pending.status).not.toBe(0);
    expect(pending.stderr).toMatch(/pending/);
  });
});

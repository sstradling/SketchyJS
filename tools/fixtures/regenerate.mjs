import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, exporterDir, listFiles, referenceDir } from "./lib.mjs";

const check = process.argv.includes("--check");
const allowMissingSwift = process.argv.includes("--allow-missing-swift");
const swiftBin = process.env.SWIFT_BIN ?? "swift";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message})`);
    process.exit(1);
  }
}

/** Fixture files written by the exporter (as opposed to imported assets). */
const exporterFiles = (dir) => listFiles(dir).filter((p) => p !== "manifest.json" && classify(p).generator === "swift-fixture-exporter");

/**
 * Runs the Swift exporter. With `--check` it writes to a temp directory twice and compares with
 * the committed files, which proves both reproducibility and that the committed data is current.
 */
function main() {
  if (spawnSync(swiftBin, ["--version"], { stdio: "ignore" }).status !== 0) {
    console.error("swift toolchain not found; set SWIFT_BIN or add swift to PATH");
    process.exit(allowMissingSwift ? 0 : 1);
  }
  run("bash", [join(exporterDir, "scripts", "prepare.sh")]);
  run(swiftBin, ["build", "--package-path", exporterDir]);
  const binary = join(exporterDir, ".build", "debug", "exporter");
  if (!check) {
    run(binary, [referenceDir]);
    return;
  }
  const first = mkdtempSync(join(tmpdir(), "sketchy-fx-a-"));
  const second = mkdtempSync(join(tmpdir(), "sketchy-fx-b-"));
  try {
    run(binary, [first]);
    run(binary, [second]);
    const problems = [];
    for (const path of exporterFiles(first)) {
      const a = readFileSync(join(first, path));
      if (!existsSync(join(second, path)) || !a.equals(readFileSync(join(second, path)))) problems.push(`${path}: two runs differ`);
      if (!existsSync(join(referenceDir, path)) || !a.equals(readFileSync(join(referenceDir, path)))) problems.push(`${path}: differs from committed fixture`);
    }
    for (const path of exporterFiles(referenceDir)) {
      if (!existsSync(join(first, path))) problems.push(`${path}: committed but no longer exported`);
    }
    if (problems.length > 0) {
      console.error(problems.join("\n"));
      process.exit(1);
    }
    console.log(`exporter output is reproducible and matches ${exporterFiles(first).length} committed fixtures`);
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
}

main();

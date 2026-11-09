import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify, exporterDir, listFiles, pending, referenceDir, sha256File, sha256Text, statSync, upstream } from "./lib.mjs";

/**
 * Builds `manifest.json`: provenance, per-file SHA-256, fidelity and platform tags, the pending
 * list, and a tree hash. No timestamps or host paths, so the output is reproducible.
 */
export function buildManifest() {
  const files = listFiles(referenceDir).filter((path) => path !== "manifest.json");
  const entries = files.map((path) => {
    const full = join(referenceDir, path);
    return { path, sha256: sha256File(full), bytes: statSync(full).size, ...classify(path) };
  });
  const treeSha256 = sha256Text(entries.map((e) => `${e.sha256}  ${e.path}\n`).join(""));
  const upstreamFiles = sha256File(join(exporterDir, "upstream-files.json"));
  return {
    schema: 1,
    source: upstream,
    exporter: {
      name: "swift-fixture-exporter",
      swift: "6.0.3",
      platform: "linux-x86_64",
      upstreamFilesSha256: upstreamFiles,
      note: "Engine files are verbatim upstream; UIKit, CoreGraphics, SwiftUI and CoreText are Linux shims. See docs/fixtures.md.",
    },
    pending,
    treeSha256,
    files: entries,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = buildManifest();
  writeFileSync(join(referenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.files.length} files, tree ${manifest.treeSha256.slice(0, 12)}`);
}

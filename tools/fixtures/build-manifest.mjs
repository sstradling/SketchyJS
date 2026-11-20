import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { acceptedReferences, classify, exporterDir, listFiles, pending, referenceDir, sha256File, sha256Text, statSync, upstream } from "./lib.mjs";

/**
 * Builds `manifest.json`: provenance, per-file SHA-256, fidelity and platform tags, the pending
 * list, and a tree hash. No timestamps or host paths, so the output is reproducible.
 */
export function buildManifest(dir = referenceDir) {
  const files = listFiles(dir).filter((path) => path !== "manifest.json");
  const entries = files.map((path) => {
    const full = join(dir, path);
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
    darwin: {
      name: "darwin-fixture-exporter",
      swift: "6.2",
      platform: "darwin-x86_64",
      sdk: "iphonesimulator",
      minimumOS: "17.0",
      note: "Native groups and darwin/ replays compile pinned Sketchy v1.5.0 against UIKit, CoreGraphics, CoreText and SwiftUI. Linux files stay the shim baseline. stickers/phase3.json adds torn chops, fibers, ribbons, holes, smoothness, and group sheets from that same commit; its provenance object records the Darwin arch, Xcode, and simulator.",
    },
    pending,
    accepted: acceptedReferences(entries),
    treeSha256,
    files: entries,
  };
}

/**
 * Manifest for the Darwin v1.6.0 corpus. Versions come from `provenance.json`
 * so the file records the machine that exported it.
 */
export function buildV16Manifest(dir) {
  const provenance = JSON.parse(readFileSync(join(dir, "provenance.json"), "utf8"));
  const platform = provenance.platform;
  const files = listFiles(dir).filter((path) => path !== "manifest.json");
  const entries = files.map((path) => {
    const full = join(dir, path);
    return { path, sha256: sha256File(full), bytes: statSync(full).size, ...classifyV16(path, platform) };
  });
  const treeSha256 = sha256Text(entries.map((entry) => `${entry.sha256}  ${entry.path}\n`).join(""));
  return {
    schema: 1,
    source: {
      repo: provenance.repo,
      tag: provenance.tag,
      commit: provenance.commit,
    },
    exporter: {
      name: "swift-reference-exporter",
      swift: provenance.swift,
      platform,
      sdk: provenance.sdk,
      minimumOS: provenance.minimumOS,
      note: "Pinned Sketchy sources compiled for the iOS simulator. The Linux shim exporter was not rerun. regression/changed.json is the case diff against v1.5.0.",
    },
    darwin: {
      name: "swift-reference-exporter",
      swift: provenance.swift,
      platform,
      arch: provenance.arch,
      sdk: provenance.sdk,
      sdkVersion: provenance.sdkVersion,
      minimumOS: provenance.minimumOS,
      xcode: provenance.xcode,
      simulator: provenance.simulator,
      simulatorRuntime: provenance.simulatorRuntime,
      hashing: provenance.hashing,
    },
    pending: [],
    accepted: [],
    treeSha256,
    files: entries,
  };
}

function classifyV16(path, platform) {
  if (path.endsWith(".png")) {
    return { kind: "image", fidelity: "native-framework", platform, generator: "swift-reference-exporter" };
  }
  if (path === "regression/changed.json") {
    return { kind: "data", fidelity: "comparison", platform, generator: "diff-v16" };
  }
  if (path === "provenance.json") {
    return { kind: "data", fidelity: "provenance", platform, generator: "swift-reference-exporter" };
  }
  if (path.startsWith("darwin/rng/") || path === "darwin/options/clamps.json") {
    return { kind: "data", fidelity: "verbatim-engine", platform, generator: "swift-reference-exporter" };
  }
  return { kind: "data", fidelity: "native-framework", platform, generator: "swift-reference-exporter" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = buildManifest();
  writeFileSync(join(referenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.files.length} files, tree ${manifest.treeSha256.slice(0, 12)}`);
}

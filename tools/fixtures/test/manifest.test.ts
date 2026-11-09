import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildManifest } from "../build-manifest.mjs";
import { verifyManifest } from "../verify.mjs";

interface Manifest {
  source: { tag: string; commit: string };
  pending: { id: string; needs: string }[];
  files: { path: string; sha256: string; fidelity: string; platform: string }[];
  treeSha256: string;
}

const reference = fileURLToPath(new URL("../../../fixtures/swift-reference/v1.5.0/", import.meta.url));
const temps: string[] = [];

/** Copies the small data fixtures (not the images) into a temp dir with a fresh manifest. */
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "sketchy-manifest-"));
  temps.push(dir);
  for (const part of ["rng", "options"]) cpSync(join(reference, part), join(dir, part), { recursive: true });
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(buildManifest(dir), null, 2)}\n`);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("committed Swift reference manifest", () => {
  const manifest = JSON.parse(readFileSync(join(reference, "manifest.json"), "utf8")) as Manifest;

  it("matches the files on disk", () => {
    expect(verifyManifest()).toEqual([]);
  });

  it("is pinned to Sketchy v1.5.0", () => {
    expect(manifest.source.tag).toBe("v1.5.0");
    expect(manifest.source.commit).toBe("fb17a6e7344f46da994ece07da1505be7d431b16");
  });

  it("contains no timestamps, hostnames or absolute paths", () => {
    const text = JSON.stringify(manifest);
    expect(text).not.toMatch(/generatedAt|timestamp|hostname|\/home\/|\/workspace\//i);
  });

  it("tags every file with fidelity and platform and lists what still needs macOS", () => {
    expect(manifest.files.every((f) => f.fidelity && f.platform)).toBe(true);
    expect(manifest.pending.map((item) => item.id)).toEqual(["reference-image-regeneration"]);
    expect(manifest.files.find((file) => file.path === "strokes/outlines.json")?.platform).toBe("darwin-x86_64");
    expect(manifest.files.find((file) => file.path === "comparison/darwin-linux.json")?.fidelity).toBe("comparison");
  });

  it("is reproducible: rebuilding yields the same manifest", () => {
    expect(JSON.stringify(buildManifest())).toBe(JSON.stringify(buildManifest()));
    const { files, treeSha256 } = buildManifest() as Manifest;
    expect(files).toEqual(manifest.files);
    expect(treeSha256).toBe(manifest.treeSha256);
  });
});

describe("verifyManifest", () => {
  it("passes for an untouched tree", () => {
    expect(verifyManifest(sandbox())).toEqual([]);
  });

  it("detects a modified file", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "rng", "splitmix64.json"), "{}\n");
    expect(verifyManifest(dir).join("\n")).toContain("rng/splitmix64.json: hash differs");
  });

  it("detects an added file and a removed file", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "rng", "extra.json"), "{}\n");
    rmSync(join(dir, "options", "clamps.json"));
    const problems = verifyManifest(dir).join("\n");
    expect(problems).toContain("rng/extra.json: on disk but not in manifest");
    expect(problems).toContain("options/clamps.json: in manifest but missing on disk");
  });

  it("reports a missing manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "sketchy-manifest-"));
    temps.push(dir);
    expect(verifyManifest(dir)[0]).toContain("manifest.json is missing");
  });
});

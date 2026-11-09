import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildManifest } from "../build-manifest.mjs";
import { verifyManifest } from "../verify.mjs";

interface AcceptedReference {
  id: string;
  status: string;
  source: { tag: string; commit: string; paths: string[] };
  followUp: string;
  files: { path: string; sourcePath: string; sha256: string }[];
}

interface Manifest {
  source: { tag: string; commit: string };
  pending: { id: string; needs: string }[];
  accepted: AcceptedReference[];
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

  it("tags every file with fidelity and platform and has no pending macOS groups", () => {
    expect(manifest.files.every((f) => f.fidelity && f.platform)).toBe(true);
    expect(manifest.pending).toEqual([]);
    const images = manifest.accepted.find((item) => item.id === "reference-image-regeneration");
    expect(images?.status).toBe("accepted: upstream copies");
    expect(images?.source).toMatchObject({ tag: "v1.5.0", commit: "fb17a6e7344f46da994ece07da1505be7d431b16", paths: ["docs/images", "Tests/SketchyTests/Fixtures", "LICENSE"] });
    expect(images?.followUp).toContain("DocsGalleryRenderer");
    expect(images?.files.find((file) => file.path === "images/hero.png")?.sourcePath).toBe("docs/images/hero.png");
    expect(images?.files.every((file) => file.sha256 === manifest.files.find((entry) => entry.path === file.path)?.sha256)).toBe(true);
    expect(manifest.files.find((file) => file.path === "strokes/outlines.json")?.platform).toBe("darwin-x86_64");
    expect(manifest.files.find((file) => file.path === "comparison/darwin-linux.json")?.fidelity).toBe("comparison");
  });

  it("is reproducible: rebuilding yields the same manifest", () => {
    expect(JSON.stringify(buildManifest())).toBe(JSON.stringify(buildManifest()));
    const fresh = buildManifest() as Manifest;
    expect(fresh.files).toEqual(manifest.files);
    expect(fresh.treeSha256).toBe(manifest.treeSha256);
    expect(fresh.accepted).toEqual(manifest.accepted);
    expect(fresh.pending).toEqual(manifest.pending);
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

interface ComparisonGroup {
  linux: string;
  structuralMismatches: number;
  maxAbs: number;
}

/** Keys present on only one side, plus list-length mismatches. Numbers that differ are ignored. */
function structuralDifferences(left: unknown, right: unknown, path = "$"): string[] {
  if (Array.isArray(left) && Array.isArray(right)) {
    const problems = left.length === right.length ? [] : [`${path} length ${left.length} vs ${right.length}`];
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      problems.push(...structuralDifferences(left[index], right[index], `${path}[${index}]`));
    }
    return problems;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const problems: string[] = [];
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      if (!(key in leftRecord) || !(key in rightRecord)) problems.push(`${path}.${key}`);
      else problems.push(...structuralDifferences(leftRecord[key], rightRecord[key], `${path}.${key}`));
    }
    return problems;
  }
  return [];
}

function loadFixture(path: string): unknown {
  return JSON.parse(readFileSync(join(reference, path), "utf8"));
}

describe("Darwin and Linux comparison", () => {
  const report = loadFixture("comparison/darwin-linux.json") as { recommendedTolerancePx: number; groups: ComparisonGroup[] };
  const group = (path: string) => report.groups.find((item) => item.linux === path);

  it("keeps the 1e-4 px tolerance and names the two divergent fill files", () => {
    expect(report.recommendedTolerancePx).toBe(0.0001);
    expect(group("fills/fills.json")?.structuralMismatches).toBe(2);
    expect(group("fills/direct-fillers.json")?.structuralMismatches).toBe(2);
    expect(group("options/defaults.json")?.structuralMismatches).toBe(16);
    expect(group("svg/path-parse.json")?.maxAbs).toBeLessThan(1e-12);
  });

  it("records the four-operation sunburst and starburst concave difference", () => {
    const pairs = [
      ["fills/fills.json", "darwin/fills/fills.json", "fill-sunburst-polygon-concave"],
      ["fills/fills.json", "darwin/fills/fills.json", "fill-starburst-polygon-concave"],
      ["fills/direct-fillers.json", "darwin/fills/direct-fillers.json", "filler-sunburst-concave"],
      ["fills/direct-fillers.json", "darwin/fills/direct-fillers.json", "filler-starburst-concave"],
    ] as const;
    for (const [linuxPath, darwinPath, id] of pairs) {
      const linux = (loadFixture(linuxPath) as { cases: { id: string; drawing?: { sets: { ops: unknown[] }[] }; result?: { ops: unknown[] } }[] }).cases.find((item) => item.id === id);
      const darwin = (loadFixture(darwinPath) as { cases: { id: string; drawing?: { sets: { ops: unknown[] }[] }; result?: { ops: unknown[] } }[] }).cases.find((item) => item.id === id);
      const linuxOps = linux?.drawing?.sets[0]?.ops ?? linux?.result?.ops ?? [];
      const darwinOps = darwin?.drawing?.sets[0]?.ops ?? darwin?.result?.ops ?? [];
      expect(linuxOps.length - darwinOps.length).toBe(4);
    }
  });

  it("records the sixteen UIColor mirror fields missing from Darwin defaults", () => {
    const differences = structuralDifferences(loadFixture("options/defaults.json"), loadFixture("darwin/options/defaults.json"));
    const expected = ["fillColor", "strokeColor", "paperColor", "inkColor"].flatMap((color) =>
      ["a", "b", "g", "r"].map((channel) => `${color}.uiColor.${channel}`),
    );
    expect(differences).toHaveLength(16);
    expect(expected.every((suffix) => differences.some((path) => path.endsWith(suffix)))).toBe(true);
    expect(differences.every((path) => expected.some((suffix) => path.endsWith(suffix)))).toBe(true);
  });
});

describe("Darwin fixture contents", () => {
  it("exports stroke outlines, brush layers, sticker contours, placement, frames, and text", () => {
    const strokes = loadFixture("strokes/outlines.json") as { cases: { id: string; outline: unknown[] }[] };
    expect(strokes.cases.map((item) => item.id)).toEqual([
      "polyline-round",
      "polyline-miter-limit-2",
      "polyline-miter-limit-10",
      "polyline-bevel",
      "polyline-curved-bevel",
      "rectangle-round",
    ]);
    expect(strokes.cases.every((item) => item.outline.length > 4)).toBe(true);

    const brushes = loadFixture("brushes/crayon-watercolor.json") as { crayonLine: { commandCount: number }; watercolorRectangle: { commandCount: number } };
    expect(brushes.crayonLine.commandCount).toBeGreaterThan(0);
    expect(brushes.watercolorRectangle.commandCount).toBeGreaterThan(0);

    const stickers = loadFixture("stickers/contours.json") as { cases: { id: string; commands: unknown[] }[] };
    expect(stickers.cases.map((item) => item.id)).toEqual(["smooth", "fullySmooth", "fullySmooth-radius-12", "torn", "hole", "group", "shadow"]);
    expect(stickers.cases.every((item) => item.commands.length > 0)).toBe(true);

    const placement = loadFixture("stickers/image-placement.json") as { tileBudget: number; cases: { placement: string; tileWidth: number }[] };
    expect(placement.tileBudget).toBe(900);
    expect(placement.cases.map((item) => item.placement)).toEqual(["tile", "tile", "stretch", "stretch", "fill", "fill"]);
    expect(placement.cases.every((item) => item.tileWidth >= 4)).toBe(true);

    const animation = loadFixture("animation/frames.json") as { cases: { id: string; frames: unknown[] }[] };
    expect(animation.cases.map((item) => [item.id, item.frames.length])).toEqual([
      ["circle-medium", 4],
      ["rectangle-low", 4],
    ]);

    const text = loadFixture("text/outlines.json") as { cases: { id: string; fontName: string; outline: unknown[] }[] };
    expect(text.cases.map((item) => item.id)).toEqual(["helvetica-sketchy", "helvetica-ag", "system-hello"]);
    expect(text.cases[0]?.fontName).toBe("Helvetica");
    expect(text.cases.every((item) => item.outline.length > 10)).toBe(true);
  });
});

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const referenceDir = join(repoRoot, "fixtures", "swift-reference", "v1.5.0");
export const exporterDir = join(repoRoot, "tools", "swift-fixture-exporter");
export const upstream = {
  repo: "https://github.com/sstradling/Sketchy",
  tag: "v1.5.0",
  commit: "fb17a6e7344f46da994ece07da1505be7d431b16",
};

/** SHA-256 of a file's bytes as lowercase hex. */
export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** SHA-256 of a string as lowercase hex. */
export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Lists files under `dir` as sorted POSIX-style relative paths. */
export function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Metadata per fixture file. `fidelity` says how close the generating code is to upstream:
 * - `verbatim-engine`: only upstream engine files and the Swift standard library produced it.
 * - `shim-dependent`: also passes through a Linux shim (CGPath, UIBezierPath).
 * - `libm-dependent`: uses trigonometry, so values can differ in the last bits per platform.
 * - `upstream-copy`: a file copied unchanged from the pinned upstream checkout.
 */
export function classify(path) {
  if (path.startsWith("images/") || path.startsWith("assets/") || path === "UPSTREAM-LICENSE") {
    return { kind: path.startsWith("images/") ? "image" : "asset", fidelity: "upstream-copy", platform: "any", generator: "import-assets" };
  }
  const base = { kind: "data", generator: "swift-fixture-exporter" };
  if (path.startsWith("rng/") || path.startsWith("options/")) return { ...base, fidelity: "verbatim-engine", platform: "any" };
  if (path === "svg/path-parse.json") return { ...base, fidelity: "libm-dependent", platform: "linux-x86_64" };
  if (path === "fills/scribble.json" || path === "shapes/shapes.json") return { ...base, fidelity: "shim-dependent", platform: "linux-x86_64" };
  return { ...base, fidelity: "libm-dependent", platform: "linux-x86_64" };
}

/** Fixtures the exporter cannot produce on Linux. Each needs the macOS/iOS harness. */
export const pending = [
  { id: "stroke-outlines", needs: "macOS", reason: "StrokeToFill, NativeStrokeOutline, StrokeRibbon and StrokeJoinGeometry use CoreGraphics stroking (copy(strokingWithWidth:)) that the Linux shims do not implement." },
  { id: "crayon-watercolor-layers", needs: "macOS", reason: "CrayonStroke, WatercolorStroke and WatercolorFill depend on CoreGraphics path and clipping behavior." },
  { id: "sticker-backing-contours", needs: "macOS", reason: "StickerBackingBuilder and SilhouetteUnion use CoreGraphics path unions and offsets; also needed for torn and fully smooth edge contours." },
  { id: "sticker-image-placement", needs: "macOS", reason: "StickerImagePainter is SwiftUI and CoreGraphics code; placement rectangles are not exposed as a pure function." },
  { id: "animation-frames", needs: "macOS", reason: "PathVariance and animated frame generation sit behind the SwiftUI render layer." },
  { id: "text-outlines", needs: "macOS", reason: "TextPathConverter uses CoreText glyph outlines and system fonts." },
  { id: "reference-image-regeneration", needs: "macOS", reason: "docs/images are imported as committed upstream files. Regenerating them needs the macOS DocsGalleryRenderer test target." },
  { id: "darwin-float-comparison", needs: "macOS", reason: "All exporter fixtures are linux-x86_64. Comparing them with a Darwin export would show whether libm trigonometry differences exceed the test tolerances." },
];

export { statSync };

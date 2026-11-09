import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { exporterDir, listFiles, referenceDir, sha256File } from "./lib.mjs";

const checkout = join(exporterDir, ".cache", "Sketchy");

/** Reads pixel dimensions from a PNG or GIF header; returns undefined for other formats. */
function dimensions(bytes) {
  if (bytes.subarray(1, 4).toString("ascii") === "PNG") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.subarray(0, 3).toString("ascii") === "GIF") return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  return undefined;
}

function copyTree(fromDir, toDir) {
  for (const path of listFiles(fromDir)) {
    const target = join(toDir, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(fromDir, path), target);
  }
}

/**
 * Copies the upstream documentation images, test assets and license into the reference corpus,
 * then writes `images/catalog.json`. The pinned checkout comes from `prepare.sh`.
 */
function main() {
  copyTree(join(checkout, "docs", "images"), join(referenceDir, "images"));
  copyTree(join(checkout, "Tests", "SketchyTests", "Fixtures"), join(referenceDir, "assets"));
  copyFileSync(join(checkout, "LICENSE"), join(referenceDir, "UPSTREAM-LICENSE"));
  const images = listFiles(join(referenceDir, "images")).filter((p) => p !== "catalog.json");
  const catalog = images.map((path) => {
    const full = join(referenceDir, "images", path);
    const bytes = readFileSync(full);
    const group = path.includes("/") ? path.split("/")[0] : "root";
    return { path, group, format: path.split(".").pop(), bytes: bytes.length, sha256: sha256File(full), ...dimensions(bytes) };
  });
  writeFileSync(join(referenceDir, "images", "catalog.json"), `${JSON.stringify({ source: "docs/images at the pinned upstream commit", images: catalog }, null, 2)}\n`);
  console.log(`imported ${catalog.length} images`);
}

main();

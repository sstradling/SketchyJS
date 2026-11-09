import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { concave, fillStyles, primitives } from "./support/gallery.js";
import { renderSheet, type SheetCell } from "./support/sheet.js";

const directory = fileURLToPath(new URL("../../../docs/examples/phase-1/", import.meta.url));
const update = process.env.UPDATE_EXAMPLES === "1";

const palette = {
  seed: 42n,
  fillColor: [0.18, 0.46, 0.67] as const,
  strokeColor: [0.12, 0.14, 0.18] as const,
  strokeWidth: 2,
  fillSpacing: 8,
};

const sheets: Record<string, string> = {
  "primitives.svg": renderSheet(
    primitives.map(([label, shape]): SheetCell => ({
      label,
      shape,
      options: { ...palette, fillStyle: "hachure", fillAngle: 45 },
    })),
    4,
  ),
  "fills.svg": renderSheet(
    fillStyles.map((style): SheetCell => ({
      label: style,
      shape: concave,
      options: { ...palette, fillStyle: style },
    })),
    3,
  ),
  "svg-path.svg": renderSheet(
    (["center", "inside", "outside"] as const).map((alignment): SheetCell => ({
      label: `svg path, hachure, ${alignment}`,
      shape: primitives.find(([name]) => name === "path")![1],
      options: { ...palette, fillStyle: "hachure", svgFillStrokeAlignment: alignment },
    })),
    3,
  ),
};

/**
 * Golden SVG sheets of the README primitives, every Phase 1 fill and SVG path import. They are
 * checked in under `docs/examples/phase-1/`; `pnpm examples:svg` regenerates them.
 */
describe("phase 1 example sheets", () => {
  it.each(Object.entries(sheets))("%s matches the checked-in sheet", (file, svg) => {
    if (update) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(`${directory}${file}`, svg);
    }
    expect(existsSync(`${directory}${file}`)).toBe(true);
    expect(readFileSync(`${directory}${file}`, "utf8")).toBe(svg);
  });
});

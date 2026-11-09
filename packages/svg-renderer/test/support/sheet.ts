import type { Shape } from "@sketchy-js/core";
import { sketch } from "@sketchy-js/scene/basic";
import type { SketchOptions } from "@sketchy-js/types";
import { renderToSvgString } from "../../src/index.js";

const CELL = 160;
const PAD = 12;
const LABEL = 16;

/** One labelled cell of a contact sheet. */
export interface SheetCell {
  label: string;
  shape: Shape;
  options: Partial<SketchOptions>;
}

/**
 * Renders cells into one SVG contact sheet, `columns` wide. Each cell is a nested `<svg>`
 * with its own `idPrefix`, so clip and mask ids never collide.
 */
export function renderSheet(cells: readonly SheetCell[], columns: number): string {
  const rows = Math.ceil(cells.length / columns);
  const width = columns * (CELL + PAD) + PAD;
  const height = rows * (CELL + LABEL + PAD) + PAD;
  const body = cells.map((cell, i) => {
    const x = PAD + (i % columns) * (CELL + PAD);
    const y = PAD + Math.floor(i / columns) * (CELL + LABEL + PAD);
    const scene = sketch(cell.shape, { width: CELL, height: CELL }, cell.options);
    const svg = renderToSvgString(scene, { idPrefix: `c${i}`, precision: 2 }).replace(
      "<svg ",
      `<svg x="${x}" y="${y}" `,
    );
    const label = `<text x="${x + CELL / 2}" y="${y + CELL + 12}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#444">${cell.label}</text>`;
    return `${svg}${label}`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fffdf8"/>${body.join("")}</svg>\n`;
}

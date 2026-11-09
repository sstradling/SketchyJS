import type { Color, Matrix2D, Path } from "@sketchy-js/types";

/**
 * Formats a coordinate with at most `precision` decimals and no trailing zeros. `-0` and values
 * that round to zero print as `0`.
 */
export function formatNumber(value: number, precision: number): string {
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Serializes a path as compact SVG path data (`M1,2L3,4C...Z`). */
export function pathData(path: Path, precision: number): string {
  const n = (v: number): string => formatNumber(v, precision);
  let d = "";
  for (const op of path) {
    switch (op.op) {
      case "M":
        d += `M${n(op.x)},${n(op.y)}`;
        break;
      case "L":
        d += `L${n(op.x)},${n(op.y)}`;
        break;
      case "Q":
        d += `Q${n(op.cx)},${n(op.cy)},${n(op.x)},${n(op.y)}`;
        break;
      case "C":
        d += `C${n(op.c1x)},${n(op.c1y)},${n(op.c2x)},${n(op.c2y)},${n(op.x)},${n(op.y)}`;
        break;
      case "Z":
        d += "Z";
        break;
    }
  }
  return d;
}

/** `matrix(a b c d e f)` attribute value. */
export function matrixAttribute(m: Matrix2D, precision: number): string {
  return `matrix(${m.map((v) => formatNumber(v, Math.max(precision, 6))).join(" ")})`;
}

/** A CSS color and the opacity carried by the color's own alpha channel. */
export interface CssColor {
  value: string;
  opacity: number;
}

const channel = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

/** Converts a scene `Color` to a CSS value. Strings pass through; tuples become `rgb(...)` plus opacity. */
export function cssColor(color: Color): CssColor {
  if (typeof color === "string") return { value: color, opacity: 1 };
  const [r, g, b, a = 1] = color;
  return {
    value: `rgb(${channel(r)},${channel(g)},${channel(b)})`,
    opacity: Math.min(1, Math.max(0, a)),
  };
}

/** Escapes text for use inside a double-quoted XML attribute. */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

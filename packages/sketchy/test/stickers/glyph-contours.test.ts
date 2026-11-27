import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { path as svgPath, svgPathToOps } from "@sketchy-js/sketchy/core";
import { sketch } from "@sketchy-js/sketchy/scene/basic";
import type { Path } from "@sketchy-js/sketchy/types";
import { clipperBackend } from "../../src/stickers/clipper/adapter.js";
import { resolveGlyphContours } from "../../src/stickers/glyph-contours.js";

/**
 * Solid fills of letters with counters and with overlapping same-winding contours.
 *
 * Even-odd keeps a counter empty and also cancels a region covered by two
 * contours that wind the same way. Fredoka builds `b`, `d`, `g`, `p`, and `q`
 * that way. These cases match Sketchy's GlyphContourResolverTests. San Francisco
 * and Helvetica are not on this machine, so Noto Sans Bold stands in for the
 * "system sans whose letters do not overlap" cases.
 */

type GlyphCommand = {
  type: string;
  x: number;
  y: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};
type GlyphFont = {
  unitsPerEm: number;
  charToGlyph(ch: string): {
    advanceWidth: number;
    getPath(x: number, y: number, size: number): { commands: GlyphCommand[] };
  };
};
const opentype = createRequire(import.meta.url)("opentype.js") as {
  parse(data: Buffer): GlyphFont;
};
const parseFont = (data: Buffer): GlyphFont => opentype.parse(data);

const phrase = "Good Enough!";
const checkedLetters = ["o", "e", "a", "h", "b", "p", "q", "d", "g"];
const notoBold = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf";
const fredoka = new URL("../fonts/Fredoka-SemiBold.ttf", import.meta.url);

type Pt = { x: number; y: number };

describe("glyph contour resolver", () => {
  it("fills the intersection of overlapping squares", () => {
    const d = "M0,0L10,0L10,10L0,10Z M6,6L16,6L16,16L6,16Z";
    const resolved = resolveGlyphContours(d);
    expect(contains(resolved, { x: 8, y: 8 }, "evenodd")).toBe(true);
    expect(contains(resolved, { x: 2, y: 2 }, "evenodd")).toBe(true);
    expect(contains(resolved, { x: 12, y: 12 }, "evenodd")).toBe(true);
    expect(contains(resolved, { x: 12, y: 2 }, "evenodd")).toBe(false);
    expect(contains(d, { x: 8, y: 8 }, "evenodd")).toBe(false);
    const clipper = clipperBackend().union(
      [
        {
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
        },
        {
          points: [
            { x: 6, y: 6 },
            { x: 16, y: 6 },
            { x: 16, y: 16 },
            { x: 6, y: 16 },
          ],
        },
      ],
      "nonzero",
    );
    expect(clipper).toHaveLength(1);
    expect(ringContains({ x: 8, y: 8 }, clipper[0]!.points)).toBe(true);
  });

  it("keeps an opposite-winding hole empty when the stem overlaps", () => {
    const d =
      circle({ x: 15, y: 15 }, 15, false) +
      circle({ x: 15, y: 15 }, 6, true) +
      rect(22, 0, 8, 30, false);
    const overlap = { x: 24, y: 15 };
    expect(contains(d, overlap, "evenodd")).toBe(false);
    expect(contains(d, overlap, "nonzero")).toBe(true);

    const resolved = resolveGlyphContours(d);
    expect(contains(resolved, overlap, "evenodd")).toBe(true);
    expect(contains(resolved, { x: 6, y: 15 }, "evenodd")).toBe(true);
    expect(contains(resolved, { x: 15, y: 15 }, "evenodd")).toBe(false);
    expect(contains(resolved, { x: 40, y: 15 }, "evenodd")).toBe(false);
  });

  it("leaves disjoint contours untouched", () => {
    const d = "M0,0L4,0L4,10L0,10Z M8,0L12,0L12,4L8,4Z";
    expect(resolveGlyphContours(d)).toBe(d);
  });

  it("is idempotent", () => {
    const d =
      circle({ x: 15, y: 15 }, 15, false) +
      circle({ x: 15, y: 15 }, 6, true) +
      rect(22, 0, 8, 30, false);
    const once = resolveGlyphContours(d);
    expect(resolveGlyphContours(once)).toBe(once);
  });

  it("leaves a system-sans Good Enough! path unchanged when contours do not overlap", () => {
    const font = parseFont(readFileSync(notoBold));
    const raw = textPath(font, phrase, 40);
    const resolved = resolveGlyphContours(raw);
    if (!hasSameWindingOverlap(raw)) expect(resolved).toBe(raw);
    assertFilled(raw, resolved, false);
  });

  it("leaves a bold sans Note path unchanged when contours do not overlap", () => {
    const font = parseFont(readFileSync(notoBold));
    const raw = textPath(font, "Note", 48);
    const resolved = resolveGlyphContours(raw);
    if (!hasSameWindingOverlap(raw)) expect(resolved).toBe(raw);
    assertFilled(raw, resolved, false);
  });

  it("keeps counters and does not rewrite single contours of a system sans", () => {
    const font = parseFont(readFileSync(notoBold));
    for (const letter of checkedLetters) assertLetter(font, letter, 40, false);
  });

  it("fills Fredoka's overlapping letters and keeps their counters", () => {
    const font = parseFont(readFileSync(fredoka));
    for (const letter of ["b", "d", "g", "p", "q"]) assertLetter(font, letter, 40, true);
    for (const letter of ["o", "e", "a", "h"]) {
      assertLetter(font, letter, 40, false);
      const raw = textPath(font, letter, 40);
      expect(resolveGlyphContours(raw), letter).toBe(raw);
    }
  });

  it("keeps Fredoka Good Enough! bodies filled and counters empty", () => {
    const font = parseFont(readFileSync(fredoka));
    const raw = textPath(font, phrase, 40);
    const resolved = resolveGlyphContours(raw);
    const samples = sample(raw, 48);
    for (const point of samples.body) expect(contains(resolved, point, "evenodd")).toBe(true);
    for (const point of samples.overlap) expect(contains(resolved, point, "evenodd")).toBe(true);
    for (const point of samples.counters) expect(contains(resolved, point, "evenodd")).toBe(false);
  });

  it("fills the solid-scene overlap and leaves a disjoint glyph byte-identical", () => {
    const overlap = "M0,0L10,0L10,10L0,10Z M6,6L16,6L16,16L6,16Z";
    const scene = sketch(
      svgPath(overlap),
      { width: 16, height: 16 },
      { seed: 1n, fillStyle: "solid" },
    );
    const fill = fillPath(scene);
    expect(containsPath(fill, { x: 8, y: 8 }, "evenodd")).toBe(true);
    expect(contains(overlap, { x: 8, y: 8 }, "evenodd")).toBe(false);

    const disjoint = "M0,0L4,0L4,10L0,10Z M8,0L12,0L12,4L8,4Z";
    expect(resolveGlyphContours(disjoint)).toBe(disjoint);
    const untouched = sketch(
      svgPath(disjoint),
      { width: 12, height: 10 },
      { seed: 1n, fillStyle: "solid" },
    );
    expect(fillPath(untouched)).toEqual(svgPathToOps(disjoint));
  });
});

function assertLetter(
  font: GlyphFont,
  letter: string,
  size: number,
  requireOverlap: boolean,
): void {
  const raw = textPath(font, letter, size);
  const resolved = resolveGlyphContours(raw);
  assertFilled(raw, resolved, requireOverlap);
}

function assertFilled(raw: string, resolved: string, requireOverlap: boolean): void {
  const samples = sample(raw);
  if (requireOverlap) expect(samples.overlap.length).toBeGreaterThan(0);
  if (samples.overlap.length === 0 || !hasSameWindingOverlap(raw)) expect(resolved).toBe(raw);
  for (const point of samples.body) expect(contains(resolved, point, "evenodd")).toBe(true);
  if (hasSameWindingOverlap(raw)) {
    for (const point of samples.overlap) expect(contains(resolved, point, "evenodd")).toBe(true);
  }
  for (const point of samples.counters) expect(contains(resolved, point, "evenodd")).toBe(false);
}

function hasSameWindingOverlap(d: string): boolean {
  const contours = ringsOf(d).filter((ring) => Math.abs(signedArea(ring)) > 0.25);
  if (contours.length < 2) return false;
  const dominant = contours.reduce((best, ring) =>
    Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best,
  );
  const positive = signedArea(dominant) >= 0;
  const solids = contours.filter((ring) => signedArea(ring) >= 0 === positive);
  return solids.length >= 2 && sample(d).overlap.length > 0;
}

type Samples = { body: Pt[]; overlap: Pt[]; counters: Pt[] };

function sample(d: string, steps = 22): Samples {
  const box = boundsOf(d);
  const body: Pt[] = [];
  const overlap: Pt[] = [];
  const counters: Pt[] = [];
  if (!(box.width > 1 && box.height > 1)) return { body, overlap, counters };
  for (let row = 0; row < steps; row++) {
    for (let column = 0; column < steps; column++) {
      const point = {
        x: box.minX + ((column + 0.5) / steps) * box.width,
        y: box.minY + ((row + 0.5) / steps) * box.height,
      };
      const even = contains(d, point, "evenodd");
      const wind = contains(d, point, "nonzero");
      if (!inset(d, point, even, wind)) continue;
      if (even && wind) body.push(point);
      else if (wind && !even) overlap.push(point);
      else if (!even && !wind) counters.push(point);
    }
  }
  return { body, overlap, counters };
}

function inset(d: string, point: Pt, even: boolean, wind: boolean): boolean {
  const shift = 0.45;
  for (const neighbor of [
    { x: point.x + shift, y: point.y },
    { x: point.x - shift, y: point.y },
    { x: point.x, y: point.y + shift },
    { x: point.x, y: point.y - shift },
  ]) {
    if (contains(d, neighbor, "evenodd") !== even) return false;
    if (contains(d, neighbor, "nonzero") !== wind) return false;
  }
  if (!even && !wind) {
    const box = boundsOf(d);
    const pad = Math.min(box.width, box.height) * 0.18;
    if (
      point.x < box.minX + pad ||
      point.x > box.maxX - pad ||
      point.y < box.minY + pad ||
      point.y > box.maxY - pad
    )
      return false;
  }
  return true;
}

function contains(d: string, point: Pt, rule: "evenodd" | "nonzero"): boolean {
  return containsRings(ringsOf(d), point, rule);
}

function containsPath(ops: Path, point: Pt, rule: "evenodd" | "nonzero"): boolean {
  return containsRings(ringsFromOps(ops), point, rule);
}

function containsRings(rings: readonly Pt[][], point: Pt, rule: "evenodd" | "nonzero"): boolean {
  if (rule === "evenodd") {
    let inside = false;
    for (const ring of rings) if (ringContains(point, ring)) inside = !inside;
    return inside;
  }
  let wind = 0;
  for (const ring of rings) wind += winding(point, ring);
  return wind !== 0;
}

function fillPath(scene: ReturnType<typeof sketch>): Path {
  const node = scene.nodes[0];
  if (!node || node.type !== "drawing") throw new Error("expected a drawing");
  const fill = node.drawing.layers.find((layer) => layer.role === "fill");
  if (!fill) throw new Error("expected a fill");
  return fill.paths[0]!;
}

function textPath(font: GlyphFont, text: string, size: number): string {
  let x = 0;
  let d = "";
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    d += commandsToPath(glyph.getPath(x, 0, size).commands);
    x += (glyph.advanceWidth * size) / font.unitsPerEm;
  }
  return d;
}

function commandsToPath(commands: readonly GlyphCommand[]): string {
  let d = "";
  for (const command of commands) {
    if (command.type === "M") d += `M${command.x},${command.y}`;
    else if (command.type === "L") d += `L${command.x},${command.y}`;
    else if (command.type === "Q") d += `Q${command.x1},${command.y1},${command.x},${command.y}`;
    else if (command.type === "C")
      d += `C${command.x1},${command.y1},${command.x2},${command.y2},${command.x},${command.y}`;
    else if (command.type === "Z") d += "Z";
  }
  return d;
}

function rect(x: number, y: number, w: number, h: number, clockwise: boolean): string {
  const maxX = x + w;
  const maxY = y + h;
  return clockwise
    ? `M${x},${y}L${x},${maxY}L${maxX},${maxY}L${maxX},${y}Z`
    : `M${x},${y}L${maxX},${y}L${maxX},${maxY}L${x},${maxY}Z`;
}

function circle(center: Pt, radius: number, clockwise: boolean): string {
  const steps = 48;
  let d = `M${center.x + radius},${center.y}`;
  for (let step = 1; step <= steps; step++) {
    const turns = (step / steps) * Math.PI * 2;
    const angle = clockwise ? -turns : turns;
    d += `L${center.x + Math.cos(angle) * radius},${center.y + Math.sin(angle) * radius}`;
  }
  return `${d}Z`;
}

const ringCache = new Map<string, Pt[][]>();

function ringsOf(d: string): Pt[][] {
  const cached = ringCache.get(d);
  if (cached) return cached;
  const rings = ringsFromOps(svgPathToOps(d));
  ringCache.set(d, rings);
  return rings;
}

function ringsFromOps(ops: Path): Pt[][] {
  const rings: Pt[][] = [];
  let ring: Pt[] = [];
  let last: Pt | undefined;
  const close = (): void => {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
    last = undefined;
  };
  for (const op of ops) {
    if (op.op === "M") {
      if (ring.length > 0) close();
      last = { x: op.x, y: op.y };
      ring = [last];
    } else if (op.op === "L" && last) {
      ring.push({ x: op.x, y: op.y });
      last = { x: op.x, y: op.y };
    } else if (op.op === "Q" && last) {
      flattenQuad(last, { x: op.cx, y: op.cy }, { x: op.x, y: op.y }, ring);
      last = { x: op.x, y: op.y };
    } else if (op.op === "C" && last) {
      flattenCubic(
        last,
        { x: op.c1x, y: op.c1y },
        { x: op.c2x, y: op.c2y },
        { x: op.x, y: op.y },
        ring,
      );
      last = { x: op.x, y: op.y };
    } else if (op.op === "Z") close();
  }
  if (ring.length > 0) close();
  return rings;
}

function flattenQuad(from: Pt, control: Pt, to: Pt, ring: Pt[], depth = 0): void {
  if (depth > 14 || deviation(from, control, to) <= 0.08) {
    ring.push(to);
    return;
  }
  const left = mid(from, control);
  const right = mid(control, to);
  const center = mid(left, right);
  flattenQuad(from, left, center, ring, depth + 1);
  flattenQuad(center, right, to, ring, depth + 1);
}

function flattenCubic(from: Pt, c1: Pt, c2: Pt, to: Pt, ring: Pt[], depth = 0): void {
  if (depth > 14 || Math.max(deviation(from, c1, to), deviation(from, c2, to)) <= 0.08) {
    ring.push(to);
    return;
  }
  const p01 = mid(from, c1);
  const p12 = mid(c1, c2);
  const p23 = mid(c2, to);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const center = mid(p012, p123);
  flattenCubic(from, p01, p012, center, ring, depth + 1);
  flattenCubic(center, p123, p23, to, ring, depth + 1);
}

function deviation(start: Pt, control: Pt, end: Pt): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return Math.hypot(control.x - start.x, control.y - start.y);
  return Math.abs((control.x - start.x) * dy - (control.y - start.y) * dx) / length;
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function boundsOf(d: string): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  const points = ringsOf(d).flat();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function signedArea(ring: readonly Pt[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length; index++) {
    const next = ring[(index + 1) % ring.length]!;
    const point = ring[index]!;
    sum += point.x * next.y - next.x * point.y;
  }
  return sum / 2;
}

function ringContains(point: Pt, ring: readonly Pt[]): boolean {
  const y = point.y + 0.000017;
  let inside = false;
  let previous = ring.length - 1;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const prior = ring[previous]!;
    if (current.y > y !== prior.y > y) {
      const x = ((prior.x - current.x) * (y - current.y)) / (prior.y - current.y) + current.x;
      if (point.x < x) inside = !inside;
    }
    previous = index;
  }
  return inside;
}

function winding(point: Pt, ring: readonly Pt[]): number {
  let wind = 0;
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index]!;
    const end = ring[(index + 1) % ring.length]!;
    if (start.y <= point.y) {
      if (end.y > point.y && cross(start, end, point) > 0) wind += 1;
    } else if (end.y <= point.y && cross(start, end, point) < 0) wind -= 1;
  }
  return wind;
}

function cross(start: Pt, end: Pt, point: Pt): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

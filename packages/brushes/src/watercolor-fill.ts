//
// A clipped wash. The shape is already padded and shifted by the generator.
//
// Port of Sketchy's `WatercolorFill`. Layers are ordinary translucent fills.
// Every command is clipped to the shape (`clip: true`); the clip path is the
// caller's shape, matching `glazeCommands(_:color:clip:)`.

import { flattenPath, noiseSigned, noiseUnit } from "@sketchy-js/core";
import type { Path, PathOp } from "@sketchy-js/plugin";
import type { WatercolorNumbers } from "./watercolor-style.js";

const MASK = (1n << 64n) - 1n;
const f32 = Math.fround;

/** Wrapping add, Swift `&+` on `UInt64`. */
const add = (a: bigint, b: bigint): bigint => (a + b) & MASK;

/** Wrapping multiply, Swift `&*` on `UInt64`. */
const mul = (a: bigint, b: bigint): bigint => (a * b) & MASK;

/** Four-cubic circle constant. Swift `CGPath` ellipse approximation. */
const KAPPA = 0.5522847498307936;

interface Vec {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
  midX: number;
  midY: number;
}

interface PerimeterSample {
  point: Vec;
  tangent: number;
}

/** `RibbonPiece`. */
interface WashPiece {
  path: Path;
  opacity: number;
  t: number;
  evenOdd?: boolean;
}

/** SwiftUI `Path` stores coordinates as `Float`. */
function moveOf(p: Vec): PathOp {
  return { op: "M", x: f32(p.x), y: f32(p.y) };
}

function lineOf(p: Vec): PathOp {
  return { op: "L", x: f32(p.x), y: f32(p.y) };
}

function stored(x: number, y: number): Vec {
  return { x: f32(x), y: f32(y) };
}

/** `WatercolorNumbers` stores these fields as `Float`. */
function storedStyle(style: WatercolorNumbers): WatercolorNumbers {
  return {
    pigment: f32(style.pigment),
    wetness: f32(style.wetness),
    edgeDarkening: f32(style.edgeDarkening),
    layers: style.layers,
    variation: f32(style.variation),
    bleed: f32(style.bleed),
    seed: style.seed,
  };
}

function seedOf(style: WatercolorNumbers): bigint {
  return BigInt(style.seed);
}

/**
 * Ellipse in a rect centered on the origin, then `CGAffineTransform(translation).rotated(by:)`.
 * Starts at the local rightmost point and proceeds toward +y (Core Graphics `addEllipse`).
 */
function ellipsePath(center: Vec, rx: number, ry: number, angle: number): Path {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const place = (x: number, y: number): Vec => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: center.x + x * c - y * s, y: center.y + x * s + y * c };
  };
  const cubic = (
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ): PathOp => {
    const a = place(c1x, c1y);
    const b = place(c2x, c2y);
    const end = place(x, y);
    return {
      op: "C",
      c1x: f32(a.x),
      c1y: f32(a.y),
      c2x: f32(b.x),
      c2y: f32(b.y),
      x: f32(end.x),
      y: f32(end.y),
    };
  };
  const start = place(rx, 0);
  return [
    { op: "M", x: f32(start.x), y: f32(start.y) },
    cubic(rx, ky, kx, ry, 0, ry),
    cubic(-kx, ry, -rx, ky, -rx, 0),
    cubic(-rx, -ky, -kx, -ry, 0, -ry),
    cubic(kx, -ry, rx, -ky, rx, 0),
    { op: "Z" },
  ];
}

/** `WatercolorFill.circle`. */
function circle(center: Vec, radius: number): Path {
  return ellipsePath(center, radius, radius, 0);
}

/** `glazeCommands` with `clip` set. One command per piece. */
function glazeCommands(
  pieces: readonly WashPiece[],
): { paths: Path[]; opacity: number; evenOdd?: boolean; clip: true }[] {
  const commands: { paths: Path[]; opacity: number; evenOdd?: boolean; clip: true }[] = [];
  for (const piece of pieces) {
    const opacity = Math.min(1, Math.max(0, piece.opacity));
    if (!(opacity > 0.004)) continue;
    if (piece.evenOdd) commands.push({ paths: [piece.path], opacity, evenOdd: true, clip: true });
    else commands.push({ paths: [piece.path], opacity, clip: true });
  }
  return commands;
}

/** `WatercolorFill.commands`. */
export function watercolorFillCommands(
  shape: Path,
  style: WatercolorNumbers,
  fillOpacity: number,
): { paths: Path[]; opacity: number; evenOdd?: boolean; clip: true }[] {
  const wash = storedStyle(style);
  const bounds = boundingRect(shape);
  if (
    !bounds ||
    !(wash.pigment > 0) ||
    !(fillOpacity > 0) ||
    !(bounds.width > 1) ||
    !(bounds.height > 1)
  ) {
    return [];
  }
  const pigment = wash.pigment;
  const pieces: WashPiece[] = [
    { path: shape, opacity: Math.min(1, pigment * 0.2 * fillOpacity), t: 0 },
  ];
  const center = { x: bounds.midX, y: bounds.midY };
  for (let layer = 0; layer < wash.layers; layer++) {
    const seed = add(seedOf(wash), mul(BigInt(layer + 1), 0x9e3779b97f4a7c15n));
    const reach = wash.wetness * Math.min(bounds.width, bounds.height) * 0.015;
    const dx = noiseSigned(0.4 + layer, seed) * reach;
    const dy = noiseSigned(1.7 + layer, add(seed, 9n)) * reach;
    const factor = 0.985;
    const moved = transformShape(shape, center, factor, dx * 0.35, dy * 0.35);
    const opacity = pigment * (0.08 + 0.05 * (layer % 2)) * fillOpacity;
    pieces.push({ path: moved, opacity: Math.min(1, opacity), t: layer });
  }
  const outline = perimeter(shape, Math.max(6, Math.min(bounds.width, bounds.height) * 0.045));
  pieces.push(...edgeDabs(outline, center, wash, pigment, fillOpacity));
  pieces.push(...backruns(outline, center, bounds, wash, pigment, fillOpacity));
  pieces.push(...interiorGrain(shape, bounds, wash, pigment, fillOpacity));
  return glazeCommands(pieces);
}

/** `WatercolorFill.scaledAbout` then a translation. Scale is about `center`. */
function transformShape(shape: Path, center: Vec, factor: number, dx: number, dy: number): Path {
  const apply = (x: number, y: number): Vec =>
    stored((x - center.x) * factor + center.x + dx, (y - center.y) * factor + center.y + dy);
  return shape.map((op) => {
    if (op.op === "M" || op.op === "L") {
      const p = apply(op.x, op.y);
      return { op: op.op, x: p.x, y: p.y };
    }
    if (op.op === "Q") {
      const c = apply(op.cx, op.cy);
      const p = apply(op.x, op.y);
      return { op: "Q", cx: c.x, cy: c.y, x: p.x, y: p.y };
    }
    if (op.op === "C") {
      const c1 = apply(op.c1x, op.c1y);
      const c2 = apply(op.c2x, op.c2y);
      const p = apply(op.x, op.y);
      return { op: "C", c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y, x: p.x, y: p.y };
    }
    return { op: "Z" };
  });
}

/** `WatercolorFill.edgeDabs`. */
function edgeDabs(
  outline: readonly PerimeterSample[],
  toward: Vec,
  style: WatercolorNumbers,
  pigment: number,
  fillOpacity: number,
): WashPiece[] {
  const darkening = style.edgeDarkening;
  if (!(darkening > 0.02) || outline.length < 2) return [];
  const pieces: WashPiece[] = [];
  const count = outline.length;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const start = outline[index]!;
    const end = outline[next]!;
    const span = Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y);
    if (span < 0.4 || span > 28) continue;
    const unit0 = noiseUnit(f32(f32(index) * f32(0.23)), add(seedOf(style), 41n));
    const unit1 = noiseUnit(f32(f32(next) * f32(0.23)), add(seedOf(style), 41n));
    const bandWidth = (1.6 + 3.2 * darkening) * (0.7 + style.bleed * 0.25);
    const startInner = stepToward(start.point, toward, bandWidth * (0.75 + 0.4 * unit0));
    const endInner = stepToward(end.point, toward, bandWidth * (0.75 + 0.4 * unit1));
    const area = shoelace(start.point, end.point, endInner, startInner);
    if (Math.abs(area) < 0.5) continue;
    const path =
      area > 0
        ? band(start.point, end.point, endInner, startInner)
        : band(start.point, startInner, endInner, end.point);
    const opacity = pigment * (0.16 + 0.26 * darkening) * fillOpacity * (0.7 + 0.3 * unit0);
    pieces.push({ path, opacity: Math.min(1, opacity), t: index });
  }
  return pieces;
}

/** `WatercolorFill.backruns`. */
function backruns(
  outline: readonly PerimeterSample[],
  toward: Vec,
  bounds: Bounds,
  style: WatercolorNumbers,
  pigment: number,
  fillOpacity: number,
): WashPiece[] {
  if (!(style.bleed > f32(0.05)) || outline.length < 8) return [];
  const reach = Math.min(bounds.width, bounds.height);
  const pieces: WashPiece[] = [];
  for (let bloom = 0; bloom < 2; bloom++) {
    const seed = add(seedOf(style), mul(BigInt(bloom), 0xc2b2ae3dn));
    const unit = noiseUnit(f32(f32(bloom) + f32(0.4)), seed);
    const slot = Math.trunc(f32(unit * f32(outline.length - 1)));
    const anchor = outline[Math.min(outline.length - 1, Math.max(0, slot))]!;
    const inward = stepToward(anchor.point, toward, reach * (0.16 + 0.05 * bloom));
    const radius = reach * (0.11 + 0.04 * style.bleed);
    pieces.push({
      path: cauliflower(inward, radius, seed),
      opacity: pigment * 0.09 * fillOpacity,
      t: bloom,
    });
    pieces.push({
      path: cauliflower(inward, radius * 0.62, add(seed, 5n)),
      opacity: pigment * 0.06 * fillOpacity,
      t: bloom,
    });
  }
  return pieces;
}

/** `WatercolorFill.cauliflower`. The loop is inclusive, then the path closes. */
function cauliflower(center: Vec, radius: number, seed: bigint): Path {
  const ops: PathOp[] = [];
  const count = 22;
  for (let index = 0; index <= count; index++) {
    const angle = (index / count) * 2 * Math.PI;
    const noise = 0.78 + 0.42 * noiseUnit(f32(f32(f32(index) * f32(0.41)) + f32(angle)), seed);
    const lump = 0.88 + 0.18 * Math.sin(angle * 2 + Number(seed % 5n));
    const distance = radius * lump * noise;
    const point = {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
    };
    ops.push(index === 0 ? moveOf(point) : lineOf(point));
  }
  ops.push({ op: "Z" });
  return ops;
}

/** `WatercolorFill.interiorGrain`. */
function interiorGrain(
  shape: Path,
  bounds: Bounds,
  style: WatercolorNumbers,
  pigment: number,
  fillOpacity: number,
): WashPiece[] {
  const count = 8 + Math.trunc(style.variation * 6);
  const pieces: WashPiece[] = [];
  let attempt = 0;
  let placed = 0;
  while (placed < count && attempt < count * 6) {
    const seed = add(seedOf(style), mul(BigInt(attempt), 0x27bb2ee6n));
    const x = bounds.minX + noiseUnit(f32(f32(attempt) * f32(0.17)), seed) * bounds.width;
    const y =
      bounds.minY +
      noiseUnit(f32(f32(f32(attempt) * f32(0.17)) + f32(2)), add(seed, 3n)) * bounds.height;
    const point = { x, y };
    attempt += 1;
    if (!pathContains(shape, point.x, point.y)) continue;
    const unit = noiseUnit(f32(f32(attempt) * f32(0.2)), add(seed, 9n));
    const radius = 0.8 + unit * (2.8 + style.variation * 2);
    const opacity = pigment * fillOpacity * (0.02 + 0.05 * unit);
    pieces.push({ path: circle(point, radius), opacity: Math.min(1, opacity), t: placed });
    placed += 1;
  }
  return pieces;
}

/** `CGPath.contains` with the nonzero rule. Curves are flattened; a fill closes each subpath. */
function pathContains(path: Path, x: number, y: number): boolean {
  let winding = 0;
  for (const sub of flattenPath(path, 0.05)) {
    const pts = sub.points;
    if (pts.length < 3) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const cross = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
      if (a.y <= y) {
        if (b.y > y && cross > 0) winding += 1;
      } else if (b.y <= y && cross < 0) winding -= 1;
    }
  }
  return winding !== 0;
}

/** `WatercolorFill.perimeter`. */
function perimeter(path: Path, spacing: number): PerimeterSample[] {
  const samples: PerimeterSample[] = [];
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  for (const op of path) {
    if (op.op === "M") {
      current = { x: op.x, y: op.y };
      subpathStart = current;
    } else if (op.op === "L") {
      appendSegment(current, { x: op.x, y: op.y }, spacing, samples);
      current = { x: op.x, y: op.y };
    } else if (op.op === "Q") {
      flattenCurve(current, { x: op.x, y: op.y }, [{ x: op.cx, y: op.cy }], spacing, samples);
      current = { x: op.x, y: op.y };
    } else if (op.op === "C") {
      flattenCurve(
        current,
        { x: op.x, y: op.y },
        [
          { x: op.c1x, y: op.c1y },
          { x: op.c2x, y: op.c2y },
        ],
        spacing,
        samples,
      );
      current = { x: op.x, y: op.y };
    } else {
      appendSegment(current, subpathStart, spacing, samples);
      current = subpathStart;
    }
  }
  return samples;
}

/** `WatercolorFill.append`. */
function appendSegment(from: Vec, to: Vec, spacing: number, samples: PerimeterSample[]): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0.5)) return;
  const tangent = Math.atan2(dy, dx);
  const steps = Math.max(1, Math.ceil(length / spacing));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    samples.push({ point: { x: from.x + dx * t, y: from.y + dy * t }, tangent });
  }
}

/** `WatercolorFill.flatten`. */
function flattenCurve(
  from: Vec,
  to: Vec,
  controls: readonly Vec[],
  spacing: number,
  samples: PerimeterSample[],
): void {
  const steps = 8;
  let previous = from;
  const control = controls[0];
  if (!control) return;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const point =
      controls.length === 1
        ? quadPoint(from, control, to, t)
        : cubicPoint(from, control, controls[1] ?? control, to, t);
    appendSegment(previous, point, spacing, samples);
    previous = point;
  }
}

/** `WatercolorFill.quad`. */
function quadPoint(from: Vec, control: Vec, to: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

/** `WatercolorFill.cubic`. */
function cubicPoint(from: Vec, c1: Vec, c2: Vec, to: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
  };
}

/** `WatercolorFill.step`. */
function stepToward(from: Vec, toward: Vec, distance: number): Vec {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0.001)) return from;
  return { x: from.x + (dx / length) * distance, y: from.y + (dy / length) * distance };
}

/** `WatercolorFill.band`. */
function band(a: Vec, b: Vec, c: Vec, d: Vec): Path {
  return [moveOf(a), lineOf(b), lineOf(c), lineOf(d), { op: "Z" }];
}

/** `WatercolorFill.shoelace`. */
function shoelace(a: Vec, b: Vec, c: Vec, d: Vec): number {
  return (
    a.x * b.y -
    b.x * a.y +
    (b.x * c.y - c.x * b.y) +
    (c.x * d.y - d.x * c.y) +
    (d.x * a.y - a.x * d.y)
  );
}

/**
 * `SwiftUI.Path.boundingRect`: the tight box of the path, including curve extrema
 * and excluding control points that sit off the curve.
 */
function boundingRect(path: Path): Bounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cy = 0;
  let hasPen = false;
  const add = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  const pen = (): Vec => (hasPen ? { x: cx, y: cy } : { x: 0, y: 0 });
  for (const op of path) {
    if (op.op === "M") {
      cx = op.x;
      cy = op.y;
      hasPen = true;
      add(cx, cy);
    } else if (op.op === "L") {
      if (!hasPen) add(0, 0);
      add(op.x, op.y);
      cx = op.x;
      cy = op.y;
      hasPen = true;
    } else if (op.op === "Q") {
      const from = pen();
      addQuadBounds(from.x, from.y, op.cx, op.cy, op.x, op.y, add);
      cx = op.x;
      cy = op.y;
      hasPen = true;
    } else if (op.op === "C") {
      const from = pen();
      addCubicBounds(from.x, from.y, op.c1x, op.c1y, op.c2x, op.c2y, op.x, op.y, add);
      cx = op.x;
      cy = op.y;
      hasPen = true;
    }
  }
  if (minX === Infinity) return undefined;
  const width = maxX - minX;
  const height = maxY - minY;
  return { minX, minY, width, height, midX: minX + width / 2, midY: minY + height / 2 };
}

function quadCoord(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

function addQuadBounds(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  add: (x: number, y: number) => void,
): void {
  add(x0, y0);
  add(x2, y2);
  const dx = x0 - 2 * x1 + x2;
  const dy = y0 - 2 * y1 + y2;
  if (Math.abs(dx) > 1e-12) {
    const t = (x0 - x1) / dx;
    if (t > 0 && t < 1) add(quadCoord(x0, x1, x2, t), quadCoord(y0, y1, y2, t));
  }
  if (Math.abs(dy) > 1e-12) {
    const t = (y0 - y1) / dy;
    if (t > 0 && t < 1) add(quadCoord(x0, x1, x2, t), quadCoord(y0, y1, y2, t));
  }
}

function cubicCoord(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Roots of the cubic derivative `3A t^2 + 2B t + C`. */
function cubicDerivativeRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 2 * (3 * p0 - 6 * p1 + 3 * p2);
  const c = 3 * (p1 - p0);
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) <= 1e-12) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-b + s) / (2 * a), (-b - s) / (2 * a)];
}

function addCubicBounds(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  add: (x: number, y: number) => void,
): void {
  add(x0, y0);
  add(x3, y3);
  for (const t of cubicDerivativeRoots(x0, x1, x2, x3)) {
    if (t > 0 && t < 1) add(cubicCoord(x0, x1, x2, x3, t), cubicCoord(y0, y1, y2, y3, t));
  }
  for (const t of cubicDerivativeRoots(y0, y1, y2, y3)) {
    if (t > 0 && t < 1) add(cubicCoord(x0, x1, x2, x3, t), cubicCoord(y0, y1, y2, y3, t));
  }
}

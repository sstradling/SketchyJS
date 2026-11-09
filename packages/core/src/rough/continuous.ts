import type { PathOp } from "@sketchy-js/types";
import { cosf, f, PI, sinf, tanf } from "../f32.js";
import { randOffset, type Pt, type RoughCtx } from "./context.js";
import { rectanglePoints } from "./legacy.js";

/** `RoughCurves.quarterCircleHandle` as `Float`. */
const QUARTER_HANDLE = f(0.5522847498307933);
const THIRD = f(f(1) / f(3));
const TWO_THIRDS = f(f(2) / f(3));

const move = (p: Pt): PathOp => ({ op: "M", x: p[0], y: p[1] });
const cubic = (h1: Pt, h2: Pt, p: Pt): PathOp => ({
  op: "C",
  c1x: h1[0],
  c1y: h1[1],
  c2x: h2[0],
  c2y: h2[1],
  x: p[0],
  y: p[1],
});

/** Per-pass jitter amounts: endpoints use `maxRandomnessOffset * scale`, handles 0.6 of that. */
function passJitter(ctx: RoughCtx, scale: number): { endpoint: number; handle: number } {
  const endpoint = f(ctx.o.maxRandomnessOffset * scale);
  return { endpoint, handle: f(f(ctx.o.maxRandomnessOffset * scale) * f(0.6)) };
}

/** `RoughCurves.jitter(point, by:)`: x draws first, then y. */
function jitterPoint(ctx: RoughCtx, x: number, y: number, amount: number): Pt {
  const jx = f(x + randOffset(ctx, amount));
  const jy = f(y + randOffset(ctx, amount));
  return [jx, jy];
}

function twoPasses(run: (scale: number) => PathOp[]): PathOp[] {
  return [...run(1), ...run(f(1.5))];
}

function ellipsePass(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  scale: number,
): PathOp[] {
  const { endpoint, handle } = passJitter(ctx, scale);
  const east = jitterPoint(ctx, f(cx + rx), cy, endpoint);
  const south = jitterPoint(ctx, cx, f(cy + ry), endpoint);
  const west = jitterPoint(ctx, f(cx - rx), cy, endpoint);
  const north = jitterPoint(ctx, cx, f(cy - ry), endpoint);
  const kx = f(QUARTER_HANDLE * rx);
  const ky = f(QUARTER_HANDLE * ry);
  const h = (x: number, y: number): Pt => jitterPoint(ctx, x, y, handle);
  const hEs1 = h(f(cx + rx), f(cy + ky));
  const hEs2 = h(f(cx + kx), f(cy + ry));
  const hSw1 = h(f(cx - kx), f(cy + ry));
  const hSw2 = h(f(cx - rx), f(cy + ky));
  const hWn1 = h(f(cx - rx), f(cy - ky));
  const hWn2 = h(f(cx - kx), f(cy - ry));
  const hNe1 = h(f(cx + kx), f(cy - ry));
  const hNe2 = h(f(cx + rx), f(cy - ky));
  return [
    move(east),
    cubic(hEs1, hEs2, south),
    cubic(hSw1, hSw2, west),
    cubic(hWn1, hWn2, north),
    cubic(hNe1, hNe2, east),
  ];
}

/** `RoughCurves.ellipseOps`: four cubics per pass, radii already resolved by the caller. */
export function ellipseOps(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): PathOp[] {
  return twoPasses((scale) => ellipsePass(ctx, cx, cy, rx, ry, scale));
}

function arcPass(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
  closed: boolean,
  scale: number,
): PathOp[] {
  const s = start;
  let e = stop;
  while (e < s) e = f(e + f(2 * PI));
  if (f(e - s) > f(2 * PI)) e = f(s + f(2 * PI));
  const { endpoint, handle } = passJitter(ctx, scale);

  const half = f(PI / 2);
  const splits: number[] = [s];
  let b = f(f(Math.floor(f(s / half)) * half) + half);
  while (b < e) {
    if (b > s) splits.push(b);
    b = f(b + half);
  }
  splits.push(e);

  const endpoints = splits.map((angle) =>
    jitterPoint(ctx, f(cx + f(rx * cosf(angle))), f(cy + f(ry * sinf(angle))), endpoint),
  );
  const ops: PathOp[] = [move(endpoints[0]!)];
  for (let i = 0; i < splits.length - 1; i++) {
    const a0 = splits[i]!;
    const a1 = splits[i + 1]!;
    const delta = f(a1 - a0);
    const alpha = f(f(4 / 3) * tanf(f(delta / 4)));
    const c1x = f(cx + f(rx * f(cosf(a0) - f(alpha * sinf(a0)))));
    const c1y = f(cy + f(ry * f(sinf(a0) + f(alpha * cosf(a0)))));
    const c2x = f(cx + f(rx * f(cosf(a1) + f(alpha * sinf(a1)))));
    const c2y = f(cy + f(ry * f(sinf(a1) - f(alpha * cosf(a1)))));
    const h1 = jitterPoint(ctx, c1x, c1y, handle);
    const h2 = jitterPoint(ctx, c2x, c2y, handle);
    const p1 = endpoints[i + 1]!;
    ops.push(cubic(h1, h2, p1));
  }
  if (closed) {
    ops.push({ op: "L", x: cx, y: cy });
    ops.push({ op: "L", x: endpoints[0]![0], y: endpoints[0]![1] });
  }
  return ops;
}

/** `RoughCurves.arcOps`: one cubic per quadrant, closed arcs end in a pie-slice closure. */
export function arcOps(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  stop: number,
  closed: boolean,
): PathOp[] {
  return twoPasses((scale) => arcPass(ctx, cx, cy, rx, ry, start, stop, closed, scale));
}

/** `bowedCubic` shared by lines, polygons and rounded-rectangle edges. */
function bowedCubic(ctx: RoughCtx, a: Pt, b: Pt, handleJitter: number): PathOp {
  const { o } = ctx;
  const dx = f(b[0] - a[0]);
  const dy = f(b[1] - a[1]);
  const mid1: Pt = [f(a[0] + f(dx * THIRD)), f(a[1] + f(dy * THIRD))];
  const mid2: Pt = [f(a[0] + f(dx * TWO_THIRDS)), f(a[1] + f(dy * TWO_THIRDS))];
  const bow = f(f(o.bowing * o.maxRandomnessOffset) / 200);
  const dispX = f(bow * dy);
  const dispY = f(bow * f(a[0] - b[0]));
  const h1x = f(f(mid1[0] + dispX) + randOffset(ctx, handleJitter));
  const h1y = f(f(mid1[1] + dispY) + randOffset(ctx, handleJitter));
  const h2x = f(f(mid2[0] + dispX) + randOffset(ctx, handleJitter));
  const h2y = f(f(mid2[1] + dispY) + randOffset(ctx, handleJitter));
  return cubic([h1x, h1y], [h2x, h2y], b);
}

function polygonPass(
  ctx: RoughCtx,
  points: readonly Pt[],
  close: boolean,
  scale: number,
): PathOp[] {
  if (points.length < 2) return [];
  const { endpoint, handle } = passJitter(ctx, scale);
  const jittered = points.map((p) => jitterPoint(ctx, p[0], p[1], endpoint));
  const ops: PathOp[] = [move(jittered[0]!)];
  const edges = close ? jittered.length : jittered.length - 1;
  for (let i = 0; i < edges; i++) {
    ops.push(bowedCubic(ctx, jittered[i]!, jittered[(i + 1) % jittered.length]!, handle));
  }
  if (close) ops.push({ op: "Z" });
  return ops;
}

/** `RoughCurves.polygonOps`: one continuous closed subpath per pass. */
export function polygonOps(ctx: RoughCtx, points: readonly Pt[]): PathOp[] {
  return twoPasses((scale) => polygonPass(ctx, points, true, scale));
}

/** `RoughCurves.linearPathOps`. */
export function linearPathOps(ctx: RoughCtx, points: readonly Pt[], close: boolean): PathOp[] {
  return twoPasses((scale) => polygonPass(ctx, points, close, scale));
}

/** `RoughCurves.rectangleOps`. */
export function rectangleOps(
  ctx: RoughCtx,
  x: number,
  y: number,
  width: number,
  height: number,
): PathOp[] {
  return polygonOps(ctx, rectanglePoints(x, y, width, height));
}

/** `RoughCurves.doubleLineOps`: two separately jittered `M C` passes. */
export function doubleLineOps(ctx: RoughCtx, [x1, y1]: Pt, [x2, y2]: Pt): PathOp[] {
  const ops: PathOp[] = [];
  for (const scale of [1, f(1.5)]) {
    const { endpoint, handle } = passJitter(ctx, scale);
    const a = jitterPoint(ctx, x1, y1, endpoint);
    const b = jitterPoint(ctx, x2, y2, endpoint);
    ops.push(move(a), bowedCubic(ctx, a, b, handle));
  }
  return ops;
}

function quarterArc(ctx: RoughCtx, a: Pt, b: Pt, cc: Pt, handleJitter: number): PathOp {
  const r1: Pt = [f(a[0] - cc[0]), f(a[1] - cc[1])];
  const r2: Pt = [f(b[0] - cc[0]), f(b[1] - cc[1])];
  const t1: Pt = [f(-r1[1]), r1[0]];
  const t2: Pt = [r2[1], f(-r2[0])];
  const toward: Pt = [f(b[0] - a[0]), f(b[1] - a[1])];
  const sign = f(f(t1[0] * toward[0]) + f(t1[1] * toward[1])) >= 0 ? 1 : -1;
  const h1x = f(f(a[0] + f(f(sign * t1[0]) * QUARTER_HANDLE)) + randOffset(ctx, handleJitter));
  const h1y = f(f(a[1] + f(f(sign * t1[1]) * QUARTER_HANDLE)) + randOffset(ctx, handleJitter));
  const h2x = f(f(b[0] + f(f(sign * t2[0]) * QUARTER_HANDLE)) + randOffset(ctx, handleJitter));
  const h2y = f(f(b[1] + f(f(sign * t2[1]) * QUARTER_HANDLE)) + randOffset(ctx, handleJitter));
  return cubic([h1x, h1y], [h2x, h2y], b);
}

function roundedRectanglePass(
  ctx: RoughCtx,
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
  scale: number,
): PathOp[] {
  const { endpoint, handle } = passJitter(ctx, scale);
  const right = f(x + width);
  const bottom = f(y + height);
  const p = (px: number, py: number): Pt => jitterPoint(ctx, px, py, endpoint);
  const pTlV = p(x, f(y + r));
  const pTlH = p(f(x + r), y);
  const pTrH = p(f(right - r), y);
  const pTrV = p(right, f(y + r));
  const pBrV = p(right, f(bottom - r));
  const pBrH = p(f(right - r), bottom);
  const pBlH = p(f(x + r), bottom);
  const pBlV = p(x, f(bottom - r));
  const ccTl: Pt = [f(x + r), f(y + r)];
  const ccTr: Pt = [f(right - r), f(y + r)];
  const ccBr: Pt = [f(right - r), f(bottom - r)];
  const ccBl: Pt = [f(x + r), f(bottom - r)];
  return [
    move(pTlH),
    bowedCubic(ctx, pTlH, pTrH, handle),
    quarterArc(ctx, pTrH, pTrV, ccTr, handle),
    bowedCubic(ctx, pTrV, pBrV, handle),
    quarterArc(ctx, pBrV, pBrH, ccBr, handle),
    bowedCubic(ctx, pBrH, pBlH, handle),
    quarterArc(ctx, pBlH, pBlV, ccBl, handle),
    bowedCubic(ctx, pBlV, pTlV, handle),
    quarterArc(ctx, pTlV, pTlH, ccTl, handle),
    { op: "Z" },
  ];
}

/** `RoughCurves.roundedRectangleOps`: eight bowed edges and quarter arcs per pass. */
export function roundedRectangleOps(
  ctx: RoughCtx,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number,
): PathOp[] {
  const maxR = f(Math.min(width, height) / 2);
  const r = Math.max(0, Math.min(cornerRadius, maxR));
  if (r <= 0) return rectangleOps(ctx, x, y, width, height);
  return twoPasses((scale) => roundedRectanglePass(ctx, x, y, width, height, r, scale));
}

function eggPass(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  width: number,
  height: number,
  tilt: number,
  scale: number,
): PathOp[] {
  const rx = f(width / 2);
  const ry = f(height / 2);
  const { endpoint, handle } = passJitter(ctx, scale);
  const rxEast = f(rx * f(1 - f(tilt * 0)));
  const rxSouth = f(rx * f(1 - f(tilt * 1)));
  const rxWest = f(rx * f(1 - f(tilt * 0)));
  const rxNorth = f(rx * f(1 - f(tilt * -1)));
  const east = jitterPoint(ctx, f(cx + rxEast), cy, endpoint);
  const south = jitterPoint(ctx, cx, f(cy + ry), endpoint);
  const west = jitterPoint(ctx, f(cx - rxWest), cy, endpoint);
  const north = jitterPoint(ctx, cx, f(cy - ry), endpoint);
  const ky = f(QUARTER_HANDLE * ry);
  const h = (x: number, y: number): Pt => jitterPoint(ctx, x, y, handle);
  const hEs1 = h(f(cx + rxEast), f(cy + ky));
  const hEs2 = h(f(cx + f(QUARTER_HANDLE * rxSouth)), f(cy + ry));
  const hSw1 = h(f(cx - f(QUARTER_HANDLE * rxSouth)), f(cy + ry));
  const hSw2 = h(f(cx - rxWest), f(cy + ky));
  const hWn1 = h(f(cx - rxWest), f(cy - ky));
  const hWn2 = h(f(cx - f(QUARTER_HANDLE * rxNorth)), f(cy - ry));
  const hNe1 = h(f(cx + f(QUARTER_HANDLE * rxNorth)), f(cy - ry));
  const hNe2 = h(f(cx + rxEast), f(cy - ky));
  return [
    move(east),
    cubic(hEs1, hEs2, south),
    cubic(hSw1, hSw2, west),
    cubic(hWn1, hWn2, north),
    cubic(hNe1, hNe2, east),
  ];
}

/** `RoughCurves.eggOps`: four cubics per pass with a tilt-modulated horizontal radius. */
export function eggOps(
  ctx: RoughCtx,
  cx: number,
  cy: number,
  width: number,
  height: number,
  tilt: number,
): PathOp[] {
  return twoPasses((scale) => eggPass(ctx, cx, cy, width, height, tilt, scale));
}

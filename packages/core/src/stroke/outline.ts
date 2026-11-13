import type { BrushCap, BrushJoin, BrushProfile, Path, PathOp } from "@sketchy-js/types";
import {
  arcToCubics,
  dist,
  f32,
  hypot,
  lineIntersection,
  offsetPoint,
  signedAngleDelta,
  unit,
  type Vec,
} from "./math.js";
import { effectiveWidth, thicknessWidth } from "./profile.js";

/** A centerline sample. `outgoing` is set where the tangent breaks at a corner. */
export interface StrokeSample {
  point: Vec;
  tangent: number;
  /** 0 at the start of the subpath, 1 at the end. */
  t: number;
  outgoing?: number;
}

interface RawSample {
  point: Vec;
  tangent: number;
  length: number;
}

type Step =
  | { kind: "line"; at: Vec }
  | { kind: "quad"; to: Vec; control: Vec }
  | { kind: "arc"; center: Vec; radius: number; start: number; sweep: number; end: Vec };

const MIN_SAMPLES = 4;
const MAX_SAMPLES = 64;
const MAX_SPACING = 4;
const PER_CURVE = 4;
const CORNER = 0.18;

type El =
  | { kind: "M"; at: Vec }
  | { kind: "L"; at: Vec }
  | { kind: "Q"; at: Vec; c: Vec }
  | { kind: "C"; at: Vec; c1: Vec; c2: Vec }
  | { kind: "Z" };

/** Splits a path into subpaths of elements. Curves stay curves for adaptive sampling. */
function elements(path: Path): El[][] {
  const subs: El[][] = [];
  let cur: El[] = [];
  for (const op of path) {
    if (op.op === "M") {
      if (cur.length > 0) subs.push(cur);
      cur = [{ kind: "M", at: { x: op.x, y: op.y } }];
    } else if (op.op === "L") cur.push({ kind: "L", at: { x: op.x, y: op.y } });
    else if (op.op === "Q")
      cur.push({ kind: "Q", at: { x: op.x, y: op.y }, c: { x: op.cx, y: op.cy } });
    else if (op.op === "C")
      cur.push({
        kind: "C",
        at: { x: op.x, y: op.y },
        c1: { x: op.c1x, y: op.c1y },
        c2: { x: op.c2x, y: op.c2y },
      });
    else if (op.op === "Z") cur.push({ kind: "Z" });
  }
  if (cur.length > 0) subs.push(cur);
  return subs;
}

function quadPoint(a: Vec, c: Vec, b: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

function cubicPoint(a: Vec, c1: Vec, c2: Vec, b: Vec, t: number): Vec {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * a.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + tt * t * b.x,
    y: uu * u * a.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + tt * t * b.y,
  };
}

function quadLength(a: Vec, c: Vec, b: Vec): number {
  let length = 0;
  let prev = a;
  for (const t of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
    const p = quadPoint(a, c, b, t);
    length += dist(prev, p);
    prev = p;
  }
  return length;
}

function cubicLength(a: Vec, c1: Vec, c2: Vec, b: Vec): number {
  let length = 0;
  let prev = a;
  for (const t of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
    const p = cubicPoint(a, c1, c2, b, t);
    length += dist(prev, p);
    prev = p;
  }
  return length;
}

function clampCount(raw: number): number {
  return Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, raw));
}

function initialTangent(els: readonly El[], index: number): number {
  const move = els[index];
  if (!move || move.kind !== "M") return 0;
  for (let i = index + 1; i < els.length; i++) {
    const el = els[i]!;
    if (el.kind === "L") return Math.atan2(el.at.y - move.at.y, el.at.x - move.at.x);
    if (el.kind === "Q") return Math.atan2(el.c.y - move.at.y, el.c.x - move.at.x);
    if (el.kind === "C") return Math.atan2(el.c1.y - move.at.y, el.c1.x - move.at.x);
    if (el.kind === "M") return 0;
  }
  return 0;
}

/**
 * Adaptive centerline samples of one subpath.
 * Straight segments are spaced at most 4px apart. Curves add samples for curviness.
 * Sketchy's `StrokeToFillConverter.sampleSubpath`.
 */
export function sampleSubpath(els: readonly El[], closed: boolean): StrokeSample[] {
  const raw: RawSample[] = [];
  const outgoing: (number | undefined)[] = [];
  let lastEnd: number | undefined;
  let cursor = { x: 0, y: 0 };
  let start: Vec | undefined;
  let accumulated = 0;

  const note = (tangent: number): void => {
    if (lastEnd === undefined) return;
    const prev = raw[lastEnd];
    if (!prev) return;
    if (Math.abs(signedAngleDelta(prev.tangent, tangent)) >= CORNER) outgoing[lastEnd] = tangent;
  };
  const push = (sample: RawSample, isEnd: boolean): void => {
    raw.push(sample);
    outgoing.push(undefined);
    if (isEnd) lastEnd = raw.length - 1;
  };
  const pushSpan = (
    to: Vec,
    tangent: number,
    length: number,
    count: number,
    at: (t: number) => Vec,
    tangentAt: (t: number) => number,
  ): void => {
    note(tangent);
    for (let i = 1; i <= count; i++) {
      const local = i / count;
      push(
        { point: at(local), tangent: tangentAt(local), length: accumulated + length * local },
        i === count,
      );
    }
    accumulated += length;
    cursor = to;
  };

  els.forEach((el, index) => {
    if (el.kind === "M") {
      cursor = el.at;
      start = el.at;
      push({ point: el.at, tangent: initialTangent(els, index), length: 0 }, false);
      return;
    }
    if (el.kind === "L" || (el.kind === "Z" && start)) {
      const to = el.kind === "Z" ? start! : el.at;
      const length = dist(cursor, to);
      if (!(length > 0)) {
        cursor = to;
        return;
      }
      const tangent = Math.atan2(to.y - cursor.y, to.x - cursor.x);
      const from = cursor;
      pushSpan(
        to,
        tangent,
        length,
        Math.max(2, Math.ceil(length / MAX_SPACING)),
        (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
        () => tangent,
      );
      return;
    }
    if (el.kind === "Q") {
      const length = quadLength(cursor, el.c, el.at);
      if (!(length > 0)) {
        cursor = el.at;
        return;
      }
      const chord = dist(cursor, el.at);
      const poly = dist(cursor, el.c) + dist(el.c, el.at);
      const curviness = chord > 0.001 ? poly / chord : 1;
      const count = clampCount(
        Math.trunc((curviness - 1) * PER_CURVE + Math.ceil(length / MAX_SPACING)),
      );
      const from = cursor;
      const control = el.c;
      const to = el.at;
      pushSpan(
        to,
        Math.atan2(control.y - from.y, control.x - from.x),
        length,
        count,
        (t) => quadPoint(from, control, to, t),
        (t) => {
          const u = 1 - t;
          return Math.atan2(
            2 * u * (control.y - from.y) + 2 * t * (to.y - control.y),
            2 * u * (control.x - from.x) + 2 * t * (to.x - control.x),
          );
        },
      );
      return;
    }
    if (el.kind === "C") {
      const length = cubicLength(cursor, el.c1, el.c2, el.at);
      if (!(length > 0)) {
        cursor = el.at;
        return;
      }
      const chord = dist(cursor, el.at);
      const poly = dist(cursor, el.c1) + dist(el.c1, el.c2) + dist(el.c2, el.at);
      const curviness = chord > 0.001 ? poly / chord : 1;
      const count = clampCount(
        Math.trunc((curviness - 1) * PER_CURVE * 1.2 + Math.ceil(length / MAX_SPACING)),
      );
      const from = cursor;
      const c1 = el.c1;
      const c2 = el.c2;
      const to = el.at;
      pushSpan(
        to,
        Math.atan2(c1.y - from.y, c1.x - from.x),
        length,
        count,
        (t) => cubicPoint(from, c1, c2, to, t),
        (t) => {
          const u = 1 - t;
          const dx =
            3 * u * u * (c1.x - from.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (to.x - c2.x);
          const dy =
            3 * u * u * (c1.y - from.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (to.y - c2.y);
          return Math.atan2(dy, dx);
        },
      );
    }
  });

  if (!(accumulated > 0) || raw.length === 0) return [];
  const inv = 1 / accumulated;
  if (closed && lastEnd !== undefined && raw[0]) {
    const turn = signedAngleDelta(raw[lastEnd]!.tangent, raw[0].tangent);
    if (Math.abs(turn) >= CORNER) outgoing[lastEnd] = raw[0].tangent;
  }
  return raw.map((sample, index) => ({
    point: sample.point,
    tangent: sample.tangent,
    t: sample.length * inv,
    ...(outgoing[index] !== undefined ? { outgoing: outgoing[index] } : {}),
  }));
}

/** Centerlines of every subpath, with tangents rebuilt along the sampled polyline. */
export function centerlines(path: Path): { samples: StrokeSample[]; closed: boolean }[] {
  return elements(path).flatMap((sub) => {
    const closed = sub.some((el) => el.kind === "Z");
    const samples = sampleSubpath(sub, closed);
    if (samples.length < 2) return [];
    return [{ samples, closed }];
  });
}

function bisector(vertex: Vec, incoming: Vec, outgoing: Vec, radius: number): Vec {
  let direction = {
    x: incoming.x - vertex.x + (outgoing.x - vertex.x),
    y: incoming.y - vertex.y + (outgoing.y - vertex.y),
  };
  if (hypot(direction.x, direction.y) < 0.001)
    direction = { x: incoming.x - vertex.x, y: incoming.y - vertex.y };
  const scale = hypot(direction.x, direction.y);
  if (!(scale > 0.001)) return incoming;
  return {
    x: vertex.x + (direction.x / scale) * radius,
    y: vertex.y + (direction.y / scale) * radius,
  };
}

function appendOuter(
  incoming: Vec,
  outgoing: Vec,
  vertex: Vec,
  inTangent: number,
  outTangent: number,
  inHalf: number,
  outHalf: number,
  turn: number,
  join: BrushJoin,
  miterLimit: number,
  steps: Step[],
): void {
  if (join === "bevel") {
    steps.push({ kind: "line", at: outgoing });
    return;
  }
  if (join === "miter") {
    const wedge = Math.PI - Math.abs(turn);
    const formula = 1 / Math.max(Math.sin(wedge / 2), 0.001);
    let tip: Vec | undefined;
    if (formula <= miterLimit) {
      tip = lineIntersection(incoming, unit(inTangent), outgoing, unit(outTangent));
      if (tip) {
        const toTip = { x: tip.x - vertex.x, y: tip.y - vertex.y };
        const toOuter = { x: incoming.x - vertex.x, y: incoming.y - vertex.y };
        if (toTip.x * toOuter.x + toTip.y * toOuter.y <= 0) tip = undefined;
        else {
          const inner =
            lineIntersection(
              offsetPoint(vertex, inTangent, inHalf, turn > 0 ? 1 : -1),
              unit(inTangent),
              offsetPoint(vertex, outTangent, outHalf, turn > 0 ? 1 : -1),
              unit(outTangent),
            ) ?? vertex;
          if (dist(tip, inner) / Math.max(inHalf + outHalf, 0.001) > miterLimit) tip = undefined;
        }
      }
    }
    if (tip) steps.push({ kind: "line", at: tip });
    steps.push({ kind: "line", at: outgoing });
    return;
  }
  if (typeof join === "object") {
    const bulge = Math.min(1, Math.max(0, join.bulge));
    if (bulge <= 0.001) {
      steps.push({ kind: "line", at: outgoing });
      return;
    }
    const mid = { x: (incoming.x + outgoing.x) / 2, y: (incoming.y + outgoing.y) / 2 };
    const hit = lineIntersection(incoming, unit(inTangent), outgoing, unit(outTangent));
    const aim = hit ?? bisector(vertex, incoming, outgoing, inHalf + outHalf);
    let delta = { x: aim.x - mid.x, y: aim.y - mid.y };
    const length = hypot(delta.x, delta.y);
    const cap = Math.max(inHalf, outHalf) * 4;
    if (length > cap && length > 0) {
      delta = { x: (delta.x * cap) / length, y: (delta.y * cap) / length };
    }
    steps.push({
      kind: "quad",
      to: outgoing,
      control: { x: mid.x + delta.x * bulge, y: mid.y + delta.y * bulge },
    });
    return;
  }
  const radiusIn = dist(incoming, vertex);
  const radiusOut = dist(outgoing, vertex);
  const average = (radiusIn + radiusOut) / 2;
  if (!(average > 0.05)) {
    steps.push({ kind: "line", at: outgoing });
    return;
  }
  const start = Math.atan2(incoming.y - vertex.y, incoming.x - vertex.x);
  const end = Math.atan2(outgoing.y - vertex.y, outgoing.x - vertex.x);
  const sweep = signedAngleDelta(start, end);
  steps.push({
    kind: "arc",
    center: vertex,
    radius: radiusIn,
    start,
    sweep,
    end: { x: vertex.x + Math.cos(end) * radiusIn, y: vertex.y + Math.sin(end) * radiusIn },
  });
}

function appendCorner(
  vertex: Vec,
  inTangent: number,
  outTangent: number,
  inHalf: number,
  outHalf: number,
  join: BrushJoin,
  miterLimit: number,
  left: Step[],
  right: Step[],
): void {
  const turn = signedAngleDelta(inTangent, outTangent);
  if (Math.abs(turn) < 0.01) return;
  const incomingHalf = Math.max(0, inHalf);
  const outgoingHalf = Math.max(0, outHalf);
  if (!(incomingHalf > 0.05 || outgoingHalf > 0.05)) return;
  const outerSign = turn > 0 ? -1 : 1;
  const incomingOuter = offsetPoint(vertex, inTangent, incomingHalf, outerSign);
  const outgoingOuter = offsetPoint(vertex, outTangent, outgoingHalf, outerSign);
  const incomingInner = offsetPoint(vertex, inTangent, incomingHalf, -outerSign);
  const outgoingInner = offsetPoint(vertex, outTangent, outgoingHalf, -outerSign);
  const outer: Step[] = [];
  appendOuter(
    incomingOuter,
    outgoingOuter,
    vertex,
    inTangent,
    outTangent,
    incomingHalf,
    outgoingHalf,
    turn,
    join,
    miterLimit,
    outer,
  );
  const inner: Step[] = [];
  const limit = Math.max(incomingHalf, outgoingHalf) * 4 + 1;
  const hit = lineIntersection(incomingInner, unit(inTangent), outgoingInner, unit(outTangent));
  if (hit && dist(hit, vertex) <= limit) {
    const direction = unit(inTangent);
    const forward =
      (hit.x - incomingInner.x) * direction.x + (hit.y - incomingInner.y) * direction.y;
    if (forward > -0.5) inner.push({ kind: "line", at: hit });
  }
  inner.push({ kind: "line", at: outgoingInner });
  if (outerSign > 0) {
    left.push(...outer);
    right.push(...inner);
  } else {
    right.push(...outer);
    left.push(...inner);
  }
}

function stepPoint(step: Step): Vec {
  if (step.kind === "line") return step.at;
  if (step.kind === "quad") return step.to;
  return step.end;
}

function replay(steps: readonly Step[], storeFloat: boolean): PathOp[] {
  const p = (v: Vec): Vec => (storeFloat ? { x: f32(v.x), y: f32(v.y) } : v);
  const ops: PathOp[] = [];
  for (const step of steps) {
    if (step.kind === "line") {
      const at = p(step.at);
      ops.push({ op: "L", x: at.x, y: at.y });
    } else if (step.kind === "quad") {
      const to = p(step.to);
      const c = p(step.control);
      ops.push({ op: "Q", cx: c.x, cy: c.y, x: to.x, y: to.y });
    } else {
      ops.push(...arcToCubics(step.center, step.radius, step.start, step.sweep));
    }
  }
  return ops;
}

function reverseSteps(steps: readonly Step[], storeFloat: boolean): PathOp[] {
  const p = (v: Vec): Vec => (storeFloat ? { x: f32(v.x), y: f32(v.y) } : v);
  const endOf = (step: Step): Vec =>
    step.kind === "line" ? step.at : step.kind === "quad" ? step.to : step.end;
  const ops: PathOp[] = [];
  for (let i = steps.length - 1; i >= 1; i--) {
    const step = steps[i]!;
    const start = endOf(steps[i - 1]!);
    if (step.kind === "line") {
      const at = p(start);
      ops.push({ op: "L", x: at.x, y: at.y });
    } else if (step.kind === "quad") {
      const to = p(start);
      const c = p(step.control);
      ops.push({ op: "Q", cx: c.x, cy: c.y, x: to.x, y: to.y });
    } else {
      ops.push(...arcToCubics(step.center, step.radius, step.start + step.sweep, -step.sweep));
    }
  }
  return ops;
}

function capSteps(from: Vec, to: Vec, cap: BrushCap, tangent: number, end: boolean): Step[] {
  if (cap === "butt") return [{ kind: "line", at: to }];
  const half = dist(from, to) / 2;
  if (cap === "square") {
    const angle = Math.atan2(to.y - from.y, to.x - from.x) + (end ? Math.PI / 2 : -Math.PI / 2);
    const ox = Math.cos(angle) * half;
    const oy = Math.sin(angle) * half;
    return [
      { kind: "line", at: { x: from.x + ox, y: from.y + oy } },
      { kind: "line", at: { x: to.x + ox, y: to.y + oy } },
      { kind: "line", at: to },
    ];
  }
  const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  const outward = end ? tangent : tangent + Math.PI;
  const decreasing = Math.abs(signedAngleDelta(start - Math.PI / 2, outward));
  const increasing = Math.abs(signedAngleDelta(start + Math.PI / 2, outward));
  const sweep = decreasing <= increasing ? -Math.PI : Math.PI;
  return [{ kind: "arc", center, radius: half, start, sweep, end: to }];
}

export interface StrokeOutlineStyle {
  width: number;
  cap: BrushCap;
  join: BrushJoin;
  miterLimit: number;
  profile?: BrushProfile;
  /** Round line and quad coordinates to Float, as SwiftUI.Path does. Arc cubics stay double. */
  floatStorage?: boolean;
}

/**
 * Filled outline of a centerline. Samples Béziers adaptively, offsets by the
 * brush tip and thickness profile, and inserts the join at sharp corners.
 * Closed contours use a uniform width so the join does not seam.
 *
 * This is Sketchy's `StrokeToFillConverter`, including curved bevel.
 */
export function strokeToOutline(path: Path, style: StrokeOutlineStyle): Path {
  if (!(style.width > 0)) return [];
  const store = style.floatStorage !== false;
  const ops: PathOp[] = [];
  for (const sub of elements(path)) {
    const closed = sub.some((el) => el.kind === "Z");
    const samples = sampleSubpath(sub, closed);
    if (samples.length < 2) continue;
    const profile = style.profile;
    const uniform =
      closed && profile ? { ...profile, thicknessProfile: { kind: "uniform" as const } } : profile;
    const halfAt = (t: number, tangent: number): number => {
      const base = uniform ? thicknessWidth(uniform.thicknessProfile, t, style.width) : style.width;
      const width = uniform ? effectiveWidth(uniform.tip, base, tangent) : base;
      return Math.max(0, width) / 2;
    };
    const left: Step[] = [];
    const right: Step[] = [];
    for (const sample of samples) {
      left.push({
        kind: "line",
        at: offsetPoint(sample.point, sample.tangent, halfAt(sample.t, sample.tangent), 1),
      });
      right.push({
        kind: "line",
        at: offsetPoint(sample.point, sample.tangent, halfAt(sample.t, sample.tangent), -1),
      });
      if (sample.outgoing !== undefined) {
        appendCorner(
          sample.point,
          sample.tangent,
          sample.outgoing,
          halfAt(sample.t, sample.tangent),
          halfAt(sample.t, sample.outgoing),
          uniform?.join ?? style.join,
          style.miterLimit,
          left,
          right,
        );
      }
    }
    const firstLeft = left[0];
    const firstRight = right[0];
    const lastLeft = left[left.length - 1];
    const lastRight = right[right.length - 1];
    if (!firstLeft || !firstRight || !lastLeft || !lastRight) continue;
    const startPoint = stepPoint(firstLeft);
    const start = store ? { x: f32(startPoint.x), y: f32(startPoint.y) } : startPoint;
    ops.push({ op: "M", x: start.x, y: start.y });
    if (closed && left.length > 2) {
      ops.push(...replay(left.slice(1), store));
      const lastRightPoint = stepPoint(lastRight);
      const bridge = store
        ? { x: f32(lastRightPoint.x), y: f32(lastRightPoint.y) }
        : lastRightPoint;
      ops.push({ op: "L", x: bridge.x, y: bridge.y });
      ops.push(...reverseSteps(right, store));
      ops.push({ op: "Z" });
    } else {
      ops.push(...replay(left.slice(1), store));
      const cap = uniform?.cap ?? style.cap;
      const endFrom = stepPoint(lastLeft);
      const endTo = stepPoint(lastRight);
      const startTo = stepPoint(firstLeft);
      const startFrom = stepPoint(firstRight);
      // SwiftUI stores the polyline in Float, then `addArc` starts at the original
      // double endpoint. The exported path therefore contains a tiny connector.
      const connect = (from: Vec): void => {
        if (!store || cap !== "round") return;
        if (f32(from.x) === from.x && f32(from.y) === from.y) return;
        ops.push({ op: "L", x: from.x, y: from.y });
      };
      connect(endFrom);
      ops.push(
        ...replay(capSteps(endFrom, endTo, cap, samples[samples.length - 1]!.tangent, true), false),
      );
      ops.push(...reverseSteps(right, store));
      connect(startFrom);
      ops.push(...replay(capSteps(startFrom, startTo, cap, samples[0]!.tangent, false), false));
      ops.push({ op: "Z" });
    }
  }
  return ops;
}

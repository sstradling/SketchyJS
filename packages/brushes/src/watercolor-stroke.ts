//
// Crisp watercolor glazes. Port of Sketchy's `WatercolorStroke`.
//
// `centerlines` replaces operation-set sampling. The wash uses the watercolor
// brush preset: a circular tip and a round join. `BrushProfile.watercolor`
// also stores an opacity-noise curve from `variation`; granules read it.
// Thickness noise is ignored, matching `halfWidth`.

import type { StrokeSample } from "@sketchy-js/core";
import {
  centerlines,
  effectiveWidth,
  noiseSigned,
  noiseUnit,
  noiseUnitPeriodic,
  opacityAt,
  seamBlend,
} from "@sketchy-js/core";
import type { Path, PathOp } from "@sketchy-js/plugin";
import type { WatercolorNumbers } from "./watercolor-style.js";
import { ellipsePath } from "./ellipse.js";
import {
  arcLengthParameters,
  averageCurve,
  resample,
  signedCurvatures,
  smoothScalars,
  stableForwards,
  uadd,
  umul,
} from "./watercolor-math.js";

const f32 = Math.fround;

/** `BrushProfile.watercolor` tip. `effectiveWidth` returns the base width. */
const CIRCULAR_TIP = { roundness: 1, angle: 0, directionSensitive: false };

/** Joins this wash builds. Same cases as `BrushJoin`. */
type StraightJoin = "miter" | "round" | "bevel" | { kind: "curvedBevel"; bulge: number };

/** `BrushProfile.watercolor` join. */
const ROUND_JOIN: StraightJoin = "round";

interface Vec {
  x: number;
  y: number;
}

interface SmoothSample {
  point: Vec;
  t: number;
  forward: number;
  curvature: number;
  radius: number;
  cornerIncoming?: number;
  cornerOutgoing?: number;
}

interface Station {
  center: Vec;
  forward: number;
  outerLeft: Vec;
  outerRight: Vec;
  innerLeft: Vec;
  innerRight: Vec;
  outerRadius: number;
  innerRadius: number;
  curvature: number;
  t: number;
  cornerIncoming?: number;
  cornerOutgoing?: number;
}

interface WashPiece {
  path: Path;
  opacity: number;
  t: number;
  evenOdd?: boolean;
}

interface Pin {
  index: number;
  incoming: number;
  outgoing: number;
}

interface CenterLine {
  samples: readonly StrokeSample[];
  closed: boolean;
}

type SideStep =
  | { kind: "line"; at: Vec }
  | { kind: "quad"; to: Vec; control: Vec }
  | {
      kind: "arc";
      center: Vec;
      radius: number;
      start: number;
      end: number;
      clockwise: boolean;
      endPoint: Vec;
    };

/** SwiftUI `Path` stores coordinates as `Float`. */
function moveOf(p: Vec): PathOp {
  return { op: "M", x: f32(p.x), y: f32(p.y) };
}

function lineOf(p: Vec): PathOp {
  return { op: "L", x: f32(p.x), y: f32(p.y) };
}

function lineXY(x: number, y: number): PathOp {
  return { op: "L", x: f32(x), y: f32(y) };
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

/** `StrokeJoinGeometry.signedAngleDelta`. */
function signedAngleDelta(from: number, to: number): number {
  let delta = to - from;
  const turn = Math.PI * 2;
  while (delta > Math.PI) delta -= turn;
  while (delta <= -Math.PI) delta += turn;
  return delta;
}

function offset(point: Vec, tangent: number, half: number, sign: number): Vec {
  const normal = tangent + Math.PI / 2;
  return {
    x: point.x + Math.cos(normal) * half * sign,
    y: point.y + Math.sin(normal) * half * sign,
  };
}

function unitVec(angle: number): Vec {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function midpoint(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** `StrokeJoinGeometry.lineIntersection`. */
function lineIntersection(a: Vec, da: Vec, b: Vec, db: Vec): Vec | undefined {
  const cross = da.x * db.y - da.y * db.x;
  if (Math.abs(cross) <= 1e-5) return undefined;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = (dx * db.y - dy * db.x) / cross;
  return { x: a.x + da.x * t, y: a.y + da.y * t };
}

/** `StrokeJoinGeometry.bisectorPoint`. */
function bisectorPoint(vertex: Vec, incoming: Vec, outgoing: Vec, radius: number): Vec {
  let direction = {
    x: incoming.x - vertex.x + (outgoing.x - vertex.x),
    y: incoming.y - vertex.y + (outgoing.y - vertex.y),
  };
  if (Math.hypot(direction.x, direction.y) < 0.001) {
    direction = { x: incoming.x - vertex.x, y: incoming.y - vertex.y };
  }
  const scale = Math.hypot(direction.x, direction.y);
  if (!(scale > 0.001)) return incoming;
  return {
    x: vertex.x + (direction.x / scale) * radius,
    y: vertex.y + (direction.y / scale) * radius,
  };
}

/** `StrokeJoinGeometry.arcShouldBeClockwise`. */
function arcShouldBeClockwise(
  center: Vec,
  radius: number,
  start: number,
  end: number,
  toward: Vec,
): boolean {
  let ccw = end - start;
  if (ccw < 0) ccw += Math.PI * 2;
  let cw = start - end;
  if (cw < 0) cw += Math.PI * 2;
  const ccwMid = start + ccw / 2;
  const cwMid = start - cw / 2;
  const ccwPoint = {
    x: center.x + Math.cos(ccwMid) * radius,
    y: center.y + Math.sin(ccwMid) * radius,
  };
  const cwPoint = {
    x: center.x + Math.cos(cwMid) * radius,
    y: center.y + Math.sin(cwMid) * radius,
  };
  return (
    Math.hypot(cwPoint.x - toward.x, cwPoint.y - toward.y) <
    Math.hypot(ccwPoint.x - toward.x, ccwPoint.y - toward.y)
  );
}

/** `StrokeJoinGeometry.acceptedMiter`. */
function acceptedMiter(
  incoming: Vec,
  outgoing: Vec,
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  incomingHalf: number,
  outgoingHalf: number,
  turn: number,
  miterLimit: number,
): Vec | undefined {
  const wedge = Math.PI - Math.abs(turn);
  const formula = 1 / Math.max(Math.sin(wedge / 2), 0.001);
  if (formula > miterLimit) return undefined;
  const tip = lineIntersection(
    incoming,
    unitVec(incomingTangent),
    outgoing,
    unitVec(outgoingTangent),
  );
  if (!tip) return undefined;
  const toTip = { x: tip.x - vertex.x, y: tip.y - vertex.y };
  const toOuter = { x: incoming.x - vertex.x, y: incoming.y - vertex.y };
  if (toTip.x * toOuter.x + toTip.y * toOuter.y <= 0) return undefined;
  const averageWidth = Math.max(incomingHalf + outgoingHalf, 0.001);
  const inner =
    lineIntersection(
      offset(vertex, incomingTangent, incomingHalf, turn > 0 ? 1 : -1),
      unitVec(incomingTangent),
      offset(vertex, outgoingTangent, outgoingHalf, turn > 0 ? 1 : -1),
      unitVec(outgoingTangent),
    ) ?? vertex;
  if (Math.hypot(tip.x - inner.x, tip.y - inner.y) / averageWidth > miterLimit) return undefined;
  return tip;
}

/** `StrokeJoinGeometry.appendRound`. */
function appendRound(incoming: Vec, outgoing: Vec, vertex: Vec, steps: SideStep[]): void {
  const radiusIn = Math.hypot(incoming.x - vertex.x, incoming.y - vertex.y);
  const radiusOut = Math.hypot(outgoing.x - vertex.x, outgoing.y - vertex.y);
  const average = (radiusIn + radiusOut) / 2;
  if (!(average > 0.05)) {
    steps.push({ kind: "line", at: outgoing });
    return;
  }
  if (radiusIn > 0.05 && Math.abs(radiusIn - radiusOut) / Math.max(radiusIn, 0.001) < 0.15) {
    const start = Math.atan2(incoming.y - vertex.y, incoming.x - vertex.x);
    const end = Math.atan2(outgoing.y - vertex.y, outgoing.x - vertex.x);
    const outward = bisectorPoint(vertex, incoming, outgoing, radiusIn);
    const clockwise = arcShouldBeClockwise(vertex, radiusIn, start, end, outward);
    const arcEnd = {
      x: vertex.x + Math.cos(end) * radiusIn,
      y: vertex.y + Math.sin(end) * radiusIn,
    };
    steps.push({
      kind: "arc",
      center: vertex,
      radius: radiusIn,
      start,
      end,
      clockwise,
      endPoint: arcEnd,
    });
    if (Math.hypot(arcEnd.x - outgoing.x, arcEnd.y - outgoing.y) > 0.75) {
      steps.push({ kind: "line", at: outgoing });
    }
    return;
  }
  const chordMid = midpoint(incoming, outgoing);
  const aim = bisectorPoint(vertex, incoming, outgoing, average);
  steps.push({
    kind: "quad",
    to: outgoing,
    control: { x: 2 * aim.x - chordMid.x, y: 2 * aim.y - chordMid.y },
  });
}

/** `StrokeJoinGeometry.appendCurvedBevel`. */
function appendCurvedBevel(
  incoming: Vec,
  outgoing: Vec,
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  incomingHalf: number,
  outgoingHalf: number,
  bulge: number,
  steps: SideStep[],
): void {
  if (!(bulge > 0.001)) {
    steps.push({ kind: "line", at: outgoing });
    return;
  }
  const chordMid = midpoint(incoming, outgoing);
  const miter =
    lineIntersection(incoming, unitVec(incomingTangent), outgoing, unitVec(outgoingTangent)) ??
    bisectorPoint(vertex, incoming, outgoing, incomingHalf + outgoingHalf);
  let delta = { x: miter.x - chordMid.x, y: miter.y - chordMid.y };
  const length = Math.hypot(delta.x, delta.y);
  const cap = Math.max(incomingHalf, outgoingHalf) * 4;
  if (length > cap && length > 0)
    delta = { x: (delta.x * cap) / length, y: (delta.y * cap) / length };
  steps.push({
    kind: "quad",
    to: outgoing,
    control: { x: chordMid.x + delta.x * bulge, y: chordMid.y + delta.y * bulge },
  });
}

/** `StrokeJoinGeometry.appendOuter`. */
function appendOuter(
  incoming: Vec,
  outgoing: Vec,
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  incomingHalf: number,
  outgoingHalf: number,
  turn: number,
  join: StraightJoin,
  miterLimit: number,
  steps: SideStep[],
): void {
  if (join === "bevel") {
    steps.push({ kind: "line", at: outgoing });
    return;
  }
  if (join === "miter") {
    const tip = acceptedMiter(
      incoming,
      outgoing,
      vertex,
      incomingTangent,
      outgoingTangent,
      incomingHalf,
      outgoingHalf,
      turn,
      miterLimit,
    );
    if (tip) steps.push({ kind: "line", at: tip });
    steps.push({ kind: "line", at: outgoing });
    return;
  }
  if (typeof join === "object") {
    appendCurvedBevel(
      incoming,
      outgoing,
      vertex,
      incomingTangent,
      outgoingTangent,
      incomingHalf,
      outgoingHalf,
      Math.min(1, Math.max(0, join.bulge)),
      steps,
    );
    return;
  }
  appendRound(incoming, outgoing, vertex, steps);
}

/** `StrokeJoinGeometry.appendInner`. */
function appendInner(
  incoming: Vec,
  outgoing: Vec,
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  incomingHalf: number,
  outgoingHalf: number,
  steps: SideStep[],
): void {
  const limit = Math.max(incomingHalf, outgoingHalf) * 4 + 1;
  const hit = lineIntersection(
    incoming,
    unitVec(incomingTangent),
    outgoing,
    unitVec(outgoingTangent),
  );
  if (hit && Math.hypot(hit.x - vertex.x, hit.y - vertex.y) <= limit) {
    const direction = unitVec(incomingTangent);
    const forward = (hit.x - incoming.x) * direction.x + (hit.y - incoming.y) * direction.y;
    if (forward > -0.5) steps.push({ kind: "line", at: hit });
  }
  steps.push({ kind: "line", at: outgoing });
}

/** `StrokeJoinGeometry.appendCorner`. */
function appendCorner(
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  incomingHalf: number,
  outgoingHalf: number,
  join: StraightJoin,
  miterLimit: number,
  left: SideStep[],
  right: SideStep[],
): void {
  const turn = signedAngleDelta(incomingTangent, outgoingTangent);
  if (Math.abs(turn) < 0.01) return;
  const inHalf = Math.max(0, incomingHalf);
  const outHalf = Math.max(0, outgoingHalf);
  if (!(inHalf > 0.05 || outHalf > 0.05)) return;
  const outerSign = turn > 0 ? -1 : 1;
  const incomingOuter = offset(vertex, incomingTangent, inHalf, outerSign);
  const outgoingOuter = offset(vertex, outgoingTangent, outHalf, outerSign);
  const incomingInner = offset(vertex, incomingTangent, inHalf, -outerSign);
  const outgoingInner = offset(vertex, outgoingTangent, outHalf, -outerSign);
  const outer: SideStep[] = [];
  appendOuter(
    incomingOuter,
    outgoingOuter,
    vertex,
    incomingTangent,
    outgoingTangent,
    inHalf,
    outHalf,
    turn,
    join,
    Math.max(1, miterLimit),
    outer,
  );
  const inner: SideStep[] = [];
  appendInner(
    incomingInner,
    outgoingInner,
    vertex,
    incomingTangent,
    outgoingTangent,
    inHalf,
    outHalf,
    inner,
  );
  if (outerSign > 0) {
    left.push(...outer);
    right.push(...inner);
  } else {
    right.push(...outer);
    left.push(...inner);
  }
}

/** `StrokeJoinGeometry.flatten`. */
function flattenSteps(steps: readonly SideStep[], start: Vec): Vec[] {
  let cursor = start;
  const points: Vec[] = [];
  for (const step of steps) {
    if (step.kind === "line") {
      points.push(step.at);
      cursor = step.at;
    } else if (step.kind === "quad") {
      for (let index = 1; index <= 8; index++) {
        const t = index / 8;
        const u = 1 - t;
        points.push({
          x: u * u * cursor.x + 2 * u * t * step.control.x + t * t * step.to.x,
          y: u * u * cursor.y + 2 * u * t * step.control.y + t * t * step.to.y,
        });
      }
      cursor = step.to;
    } else {
      let sweep = step.end - step.start;
      if (step.clockwise) {
        if (sweep > 0) sweep -= Math.PI * 2;
      } else if (sweep < 0) sweep += Math.PI * 2;
      for (let index = 1; index <= 8; index++) {
        const angle = step.start + (sweep * index) / 8;
        points.push({
          x: step.center.x + Math.cos(angle) * step.radius,
          y: step.center.y + Math.sin(angle) * step.radius,
        });
      }
      const last = points[points.length - 1];
      if (last && Math.hypot(last.x - step.endPoint.x, last.y - step.endPoint.y) > 0.75) {
        points.push(step.endPoint);
      }
      cursor = step.endPoint;
    }
  }
  return points;
}

/** `StrokeJoinGeometry.sidePolylines`. */
function sidePolylines(
  vertex: Vec,
  incomingTangent: number,
  outgoingTangent: number,
  incomingHalf: number,
  outgoingHalf: number,
  join: StraightJoin,
  miterLimit: number,
): { left: Vec[]; right: Vec[] } {
  const incomingLeft = offset(vertex, incomingTangent, Math.max(0, incomingHalf), 1);
  const incomingRight = offset(vertex, incomingTangent, Math.max(0, incomingHalf), -1);
  const left: SideStep[] = [];
  const right: SideStep[] = [];
  appendCorner(
    vertex,
    incomingTangent,
    outgoingTangent,
    incomingHalf,
    outgoingHalf,
    join,
    miterLimit,
    left,
    right,
  );
  return {
    left: [incomingLeft, ...flattenSteps(left, incomingLeft)],
    right: [incomingRight, ...flattenSteps(right, incomingRight)],
  };
}

/** `WatercolorStroke.ellipse`, via `CGPath(ellipseIn:transform:)` at angle 0. */
function ellipse(center: Vec, radius: number): Path {
  return ellipsePath(center.x, center.y, 0, radius * 2, radius * 2).map((op): PathOp => {
    if (op.op === "M" || op.op === "L") return { op: op.op, x: f32(op.x), y: f32(op.y) };
    if (op.op === "C") {
      return {
        op: "C",
        c1x: f32(op.c1x),
        c1y: f32(op.c1y),
        c2x: f32(op.c2x),
        c2y: f32(op.c2y),
        x: f32(op.x),
        y: f32(op.y),
      };
    }
    if (op.op === "Q")
      return { op: "Q", cx: f32(op.cx), cy: f32(op.cy), x: f32(op.x), y: f32(op.y) };
    return { op: "Z" };
  });
}

/** `glazeCommands`. One command per piece. */
function glazeCommands(
  pieces: readonly WashPiece[],
): { paths: Path[]; opacity: number; evenOdd?: boolean }[] {
  const commands: { paths: Path[]; opacity: number; evenOdd?: boolean }[] = [];
  for (const piece of pieces) {
    const opacity = Math.min(1, Math.max(0, piece.opacity));
    if (!(opacity > 0.004)) continue;
    if (piece.evenOdd) commands.push({ paths: [piece.path], opacity, evenOdd: true });
    else commands.push({ paths: [piece.path], opacity });
  }
  return commands;
}

/** `WatercolorStroke.commands`. */
export function watercolorStrokeCommands(
  path: Path,
  width: number,
  style: WatercolorNumbers,
  strokeOpacity: number,
  miterLimit = 10,
): { paths: Path[]; opacity: number; evenOdd?: boolean }[] {
  const wash = storedStyle(style);
  if (!(width >= 0.5) || !(strokeOpacity > 0) || !(wash.pigment > 0)) return [];
  const lines = centerlines(path);
  let line = lines[0];
  if (!line) return [];
  for (const candidate of lines) {
    if (candidate.samples.length > line.samples.length) line = candidate;
  }
  const pieces: WashPiece[] = [];
  for (let layer = wash.layers - 1; layer >= 0; layer -= 1) {
    pieces.push(
      ...glaze(line, width, wash, strokeOpacity, layer, layer === 0, 1 - 0.12 * layer, miterLimit),
    );
  }
  pieces.push(...granules(line, width, wash, strokeOpacity));
  pieces.push(...feathers(line, width, wash, strokeOpacity));
  return glazeCommands(pieces);
}

/** `WatercolorStroke.glaze`. */
function glaze(
  line: CenterLine,
  width: number,
  style: WatercolorNumbers,
  strokeOpacity: number,
  layer: number,
  edged: boolean,
  strength: number,
  miterLimit: number,
): WashPiece[] {
  const built = stations(line, width, style, layer);
  if (built.length < 2) return [];
  const darkening = style.edgeDarkening;
  const pigment = style.pigment * strength;
  const core = Math.min(1, pigment * (0.34 + 0.08 * (1 - darkening)) * strokeOpacity);
  const pieces: WashPiece[] = [
    { path: ribbon(built, line.closed, ROUND_JOIN, miterLimit), opacity: core, t: 0.5 },
  ];
  if (edged) {
    pieces.push(
      ...brokenRim(
        built,
        pigment * strokeOpacity,
        darkening,
        uadd(seedOf(style), umul(BigInt(layer), 17n)),
        line.closed,
      ),
    );
  }
  return pieces;
}

/** `WatercolorStroke.brokenRim`. */
function brokenRim(
  built: readonly Station[],
  pigment: number,
  darkening: number,
  seed: bigint,
  closed: boolean,
): WashPiece[] {
  if (!(darkening > 0.02) || built.length < 2) return [];
  const pieces: WashPiece[] = [];
  const count = built.length;
  const limit = closed ? count : count - 1;
  for (let index = 0; index < limit; index++) {
    const start = built[index]!;
    const end = built[(index + 1) % count]!;
    if (start.cornerIncoming !== undefined || end.cornerIncoming !== undefined) continue;
    const gate = noiseUnit(f32(start.t * 3.4), uadd(seed, 71n));
    const flicker = noiseUnit(f32(start.t * 9.5), uadd(seed, 93n));
    const presence = Math.max(0, (gate - 0.22) / 0.78) * (0.25 + 0.75 * flicker);
    if (presence < 0.18) continue;
    const pool = noiseUnit(f32(start.t * 5.1), uadd(seed, 5n));
    const opacity = Math.min(
      1,
      pigment * (0.12 + 0.7 * darkening) * presence * (0.35 + 1.2 * pool),
    );
    for (const side of [1, -1]) {
      const turn = (start.curvature + end.curvature) * 0.5;
      const inside = turn > 0.02 ? 1 : turn < -0.02 ? -1 : 0;
      if (inside !== 0 && side === inside && Math.abs(turn) > 0.045) continue;
      const sidePool = side > 0 ? opacity : opacity * (0.55 + 0.45 * pool);
      pieces.push(...sideRim(start, end, side, presence, sidePool));
    }
  }
  return pieces;
}

/** `WatercolorStroke.sideRim`. */
function sideRim(
  start: Station,
  end: Station,
  side: number,
  presence: number,
  opacity: number,
): WashPiece[] {
  const startOuter = side > 0 ? start.outerLeft : start.outerRight;
  const endOuter = side > 0 ? end.outerLeft : end.outerRight;
  const startHalf = Math.max(
    0.5,
    Math.hypot(startOuter.x - start.center.x, startOuter.y - start.center.y),
  );
  const endHalf = Math.max(0.5, Math.hypot(endOuter.x - end.center.x, endOuter.y - end.center.y));
  const startDepth = Math.min(startHalf * 0.62, startHalf * (0.1 + 0.28 * presence));
  const endDepth = Math.min(endHalf * 0.62, endHalf * (0.1 + 0.28 * presence));
  const startMid = mix(startOuter, start.center, startDepth / startHalf);
  const endMid = mix(endOuter, end.center, endDepth / endHalf);
  const startDeep = mix(startOuter, start.center, Math.min(0.7, (startDepth * 2.4) / startHalf));
  const endDeep = mix(endOuter, end.center, Math.min(0.7, (endDepth * 2.4) / endHalf));
  return [
    { path: quad(startOuter, endOuter, endMid, startMid), opacity, t: start.t },
    { path: quad(startMid, endMid, endDeep, startDeep), opacity: opacity * 0.55, t: start.t },
  ];
}

/** `WatercolorStroke.ribbon`. */
function ribbon(
  built: readonly Station[],
  closed: boolean,
  join: StraightJoin,
  miterLimit: number,
): Path {
  const first = built[0];
  const last = built[built.length - 1];
  if (!first || !last) return [];
  const leftEdge = contour(built, true, join, miterLimit);
  const rightEdge = contour(built, false, join, miterLimit);
  const leftFirst = leftEdge[0];
  const rightFirst = rightEdge[0];
  const rightLast = rightEdge[rightEdge.length - 1];
  if (!leftFirst || !rightFirst || !rightLast) return [];
  const ops: PathOp[] = [moveOf(leftFirst)];
  for (const point of leftEdge.slice(1)) ops.push(lineOf(point));
  if (!closed) {
    addCap(
      ops,
      leftEdge[leftEdge.length - 1] ?? last.outerLeft,
      last.center,
      rightLast,
      last.forward,
    );
  } else ops.push(lineOf(rightLast));
  for (const point of rightEdge.slice(0, -1).reverse()) ops.push(lineOf(point));
  if (!closed) addCap(ops, rightFirst, first.center, leftFirst, first.forward + Math.PI);
  ops.push({ op: "Z" });
  return ops;
}

/** `WatercolorStroke.contour`. */
function contour(
  built: readonly Station[],
  left: boolean,
  join: StraightJoin,
  miterLimit: number,
): Vec[] {
  const first = built[0];
  if (!first) return [];
  const points = [left ? first.outerLeft : first.outerRight];
  let index = 1;
  while (index < built.length) {
    const here = built[index]!;
    if (
      here.cornerIncoming !== undefined &&
      here.cornerOutgoing !== undefined &&
      index + 1 < built.length
    ) {
      const next = built[index + 1]!;
      const prev = built[index - 1]!;
      const lines = sidePolylines(
        here.center,
        here.cornerIncoming,
        here.cornerOutgoing,
        prev.outerRadius,
        next.outerRadius,
        join,
        miterLimit,
      );
      points.push(...(left ? lines.left : lines.right));
      points.push(left ? next.outerLeft : next.outerRight);
      index += 2;
      continue;
    }
    points.push(left ? here.outerLeft : here.outerRight);
    index += 1;
  }
  return points;
}

/** `WatercolorStroke.addCap`. */
function addCap(ops: PathOp[], from: Vec, center: Vec, to: Vec, forward: number): void {
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  const end = Math.atan2(to.y - center.y, to.x - center.x);
  let sweep = end - start;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const mid = start + sweep / 2;
  if (Math.abs(Math.atan2(Math.sin(mid - forward), Math.cos(mid - forward))) > Math.PI / 2) {
    sweep += sweep > 0 ? -2 * Math.PI : 2 * Math.PI;
  }
  const startRadius = Math.hypot(from.x - center.x, from.y - center.y);
  const endRadius = Math.hypot(to.x - center.x, to.y - center.y);
  for (let step = 1; step <= 8; step++) {
    const u = step / 8;
    const angle = start + sweep * u;
    const radius = startRadius * (1 - u) + endRadius * u;
    ops.push(lineXY(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius));
  }
}

/** `WatercolorStroke.feathers`. */
function feathers(
  line: CenterLine,
  width: number,
  style: WatercolorNumbers,
  strokeOpacity: number,
): WashPiece[] {
  const center = smoothedCenterline(line.samples, line.closed);
  if (center.length < 2) return [];
  const amount = style.bleed * 0.7 + style.variation * 0.55;
  if (!(amount > 0.05)) return [];
  const pieces: WashPiece[] = [];
  for (let index = 0; index < 5; index++) {
    const seed = uadd(uadd(seedOf(style), umul(BigInt(index), 0x9e3779b97f4a7c15n)), 200n);
    const along = noiseUnit(f32(index), seed);
    const t = line.closed ? along : 0.14 + along * 0.72;
    const side = noiseUnit(f32(index), uadd(seed, 9n)) > 0.5 ? 1 : -1;
    const size = noiseUnit(f32(index), uadd(seed, 17n));
    const sample = sampleCenter(center, t);
    const located: StrokeSample = { point: sample.point, tangent: sample.forward, t: sample.t };
    const half = halfWidth(located, sample.forward, width, style, 0, line);
    const wobble = edgeWobble(sample.t, side, width, style, 0, line.closed);
    const edge = Math.max(half * 0.45, half + wobble);
    const radius = half * (0.2 + 0.14 * size);
    const reach = edge - radius * 0.35;
    const normal = sample.forward + Math.PI / 2;
    const dot = {
      x: sample.point.x + Math.cos(normal) * side * reach,
      y: sample.point.y + Math.sin(normal) * side * reach,
    };
    pieces.push({
      path: bleedBlob(dot, radius, seed),
      opacity: Math.min(0.5, style.pigment * strokeOpacity * (0.4 + 0.18 * size)),
      t: sample.t,
    });
  }
  return pieces;
}

/** `WatercolorStroke.bleedBlob`. Inclusive loop, then close. */
function bleedBlob(center: Vec, radius: number, seed: bigint): Path {
  const ops: PathOp[] = [];
  const count = 14;
  for (let index = 0; index <= count; index++) {
    const angle = (index / count) * 2 * Math.PI;
    const noise = 0.72 + 0.5 * noiseUnit(f32(f32(index) * f32(0.73)), uadd(seed, BigInt(index)));
    const lump = 0.85 + 0.22 * Math.sin(angle * 3 + Number(seed % 7n));
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

/** `WatercolorStroke.granules`. */
function granules(
  line: CenterLine,
  width: number,
  style: WatercolorNumbers,
  strokeOpacity: number,
): WashPiece[] {
  const center = smoothedCenterline(line.samples, line.closed);
  if (center.length < 2) return [];
  const pieces: WashPiece[] = [];
  const speckCount = 11 + Math.round(style.variation * 6);
  for (let index = 0; index < speckCount; index++) {
    const seed = uadd(seedOf(style), umul(BigInt(index), 0x9e3779b97f4a7c15n));
    const along = noiseUnit(f32(index), uadd(seed, 41n));
    const across = noiseSigned(index, uadd(seed, 87n));
    const size = noiseUnit(f32(index), uadd(seed, 13n));
    const tone = noiseUnit(f32(index), uadd(seed, 59n));
    const t = line.closed ? along : 0.07 + along * 0.86;
    placeSpeck(t, across, size, tone, 1, center, width, style, strokeOpacity, line, pieces);
    if (!(noiseUnit(f32(index), uadd(seed, 101n)) > 0.78)) continue;
    for (let mate = 0; mate < 2; mate++) {
      const mateSeed = uadd(seed, umul(BigInt(mate + 1), 0xbf58476d1ce4e5b9n));
      placeSpeck(
        Math.min(0.94, Math.max(0.06, t + noiseSigned(mate + 1, mateSeed) * 0.03)),
        Math.min(1, Math.max(-1, across * 0.55 + noiseSigned(mate + 5, uadd(mateSeed, 7n)) * 0.45)),
        noiseUnit(f32(mate + 2), uadd(mateSeed, 3n)),
        tone * 0.85,
        0.65,
        center,
        width,
        style,
        strokeOpacity,
        line,
        pieces,
      );
    }
  }
  return pieces;
}

/** `WatercolorStroke.placeSpeck`. */
function placeSpeck(
  t: number,
  across: number,
  size: number,
  tone: number,
  radiusScale: number,
  center: readonly SmoothSample[],
  width: number,
  style: WatercolorNumbers,
  strokeOpacity: number,
  line: CenterLine,
  pieces: WashPiece[],
): void {
  const sample = sampleCenter(center, t);
  const located: StrokeSample = { point: sample.point, tangent: sample.forward, t: sample.t };
  const half = halfWidth(located, sample.forward, width, style, 2, line);
  const radius = half * (0.04 + 0.07 * size) * radiusScale;
  if (!(radius >= 0.3)) return;
  const normal = sample.forward + Math.PI / 2;
  const reach = across * half * 0.62;
  const fade = line.closed ? 1 : tipScale(sample.t);
  const profile = alongOpacity(sample.t, line.closed, style, strokeOpacity);
  const opacity = style.pigment * profile * fade * (0.12 + 0.16 * tone) * radiusScale;
  pieces.push({
    path: ellipse(
      {
        x: sample.point.x + Math.cos(normal) * reach,
        y: sample.point.y + Math.sin(normal) * reach,
      },
      radius,
    ),
    opacity: Math.min(1, opacity),
    t: sample.t,
  });
}

/** `WatercolorStroke.sampleCenter`. */
function sampleCenter(center: readonly SmoothSample[], t: number): SmoothSample {
  const first = center[0]!;
  if (center.length < 2) return first;
  const last = center[center.length - 1]!;
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  let low = 0;
  let high = center.length - 1;
  while (high - low > 1) {
    const mid = Math.trunc((low + high) / 2);
    if (center[mid]!.t < t) low = mid;
    else high = mid;
  }
  const start = center[low]!;
  const end = center[high]!;
  const span = Math.max(0.0001, end.t - start.t);
  const u = Math.min(1, Math.max(0, (t - start.t) / span));
  return {
    point: {
      x: start.point.x + (end.point.x - start.point.x) * u,
      y: start.point.y + (end.point.y - start.point.y) * u,
    },
    t,
    forward: Math.atan2(
      Math.sin(start.forward) * (1 - u) + Math.sin(end.forward) * u,
      Math.cos(start.forward) * (1 - u) + Math.cos(end.forward) * u,
    ),
    curvature: start.curvature * (1 - u) + end.curvature * u,
    radius: start.radius * (1 - u) + end.radius * u,
  };
}

/** `WatercolorStroke.stations`. */
function stations(
  line: CenterLine,
  width: number,
  style: WatercolorNumbers,
  layer: number,
): Station[] {
  const center = smoothedCenterline(line.samples, line.closed);
  if (center.length < 2) return [];
  const halves = smoothScalars(
    center.map((sample) => {
      const located: StrokeSample = { point: sample.point, tangent: sample.forward, t: sample.t };
      return halfWidth(located, sample.forward, width, style, layer, line);
    }),
    6,
    line.closed,
  );
  let lefts = halves.slice();
  let rights = halves.slice();
  for (let index = 0; index < center.length; index++) {
    const half = halves[index]!;
    const sample = center[index]!;
    if (!(sample.radius < half * 1.05)) continue;
    const limit = Math.max(half * 0.72, sample.radius * 0.92);
    if (sample.curvature > 0) lefts[index] = Math.min(half, limit);
    else if (sample.curvature < 0) rights[index] = Math.min(half, limit);
  }
  lefts = smoothScalars(lefts, 8, line.closed);
  rights = smoothScalars(rights, 8, line.closed);
  return center.map((sample, index) => {
    let left = lefts[index]!;
    let right = rights[index]!;
    const leftWobble = edgeWobble(sample.t, 1, width, style, 0, line.closed);
    const rightWobble = edgeWobble(sample.t, -1, width, style, 0, line.closed);
    if (layer === 0) {
      left += leftWobble;
      right += rightWobble;
    } else {
      const flutter =
        signedAt(sample.t, 11, uadd(seedOf(style), umul(BigInt(layer), 23n)), line.closed) *
        width *
        0.012;
      const step = width * 0.012 * layer + flutter;
      left += leftWobble + step;
      right += rightWobble + step;
    }
    left = Math.max(0.35, left);
    right = Math.max(0.35, right);
    const normalAngle = sample.forward + Math.PI / 2;
    const nx = Math.cos(normalAngle);
    const ny = Math.sin(normalAngle);
    const point = sample.point;
    const innerScale = 1 - 0.22 * style.edgeDarkening;
    return {
      center: point,
      forward: sample.forward,
      outerLeft: { x: point.x + nx * left, y: point.y + ny * left },
      outerRight: { x: point.x - nx * right, y: point.y - ny * right },
      innerLeft: { x: point.x + nx * left * innerScale, y: point.y + ny * left * innerScale },
      innerRight: { x: point.x - nx * right * innerScale, y: point.y - ny * right * innerScale },
      outerRadius: Math.max(left, right),
      innerRadius: Math.max(left, right) * innerScale,
      curvature: sample.curvature,
      t: sample.t,
      ...(sample.cornerIncoming !== undefined ? { cornerIncoming: sample.cornerIncoming } : {}),
      ...(sample.cornerOutgoing !== undefined ? { cornerOutgoing: sample.cornerOutgoing } : {}),
    };
  });
}

/** `WatercolorStroke.edgeWobble`. */
function edgeWobble(
  t: number,
  side: number,
  width: number,
  style: WatercolorNumbers,
  layer: number,
  closed: boolean,
): number {
  const amount = style.bleed * 0.7 + style.variation * 0.55;
  if (!(amount > 0.02)) return 0;
  const seed = uadd(uadd(seedOf(style), umul(BigInt(layer), 19n)), side > 0 ? 5n : 31n);
  const low = signedAt(t, 4.2, seed, closed);
  const mid = signedAt(t, 8.5, uadd(seed, 13n), closed);
  const high = signedAt(t, 15, uadd(seed, 27n), closed);
  let wobble = (low * 0.55 + mid * 0.32 + high * 0.28) * width * 0.42 * amount;
  const gate = noiseUnit(f32(t * 6.5 + (side > 0 ? 0.4 : 1.7)), uadd(seed, 47n));
  if (gate > 0.66) wobble += ((gate - 0.66) / 0.34) * width * 0.28 * amount;
  const dry = noiseUnit(f32(t * 8.4 + (side > 0 ? 0.2 : 2.4)), uadd(seed, 90n));
  if (dry < 0.28) wobble -= width * 0.22 * amount * ((0.28 - dry) / 0.28);
  const inward = -width * 0.2 * amount;
  if (wobble < inward) wobble = inward;
  return wobble * (closed ? 1 : tipFade(t));
}

/** `WatercolorStroke.tipFade`. */
function tipFade(t: number): number {
  const edge = Math.min(Math.max(0, t), Math.max(0, 1 - t));
  if (!(edge < 0.2)) return 1;
  const mixAmount = edge / 0.2;
  return mixAmount * mixAmount * (3 - 2 * mixAmount);
}

/** `WatercolorStroke.smoothedCenterline`. */
function smoothedCenterline(samples: readonly StrokeSample[], closed: boolean): SmoothSample[] {
  const pins = sharpCornerPins(samples, closed);
  if (pins.length > 0) return smoothPinnedCenterline(samples, pins, closed);
  return smoothWholeCenterline(samples, closed);
}

/** `WatercolorStroke.sharpCornerPins`. */
function sharpCornerPins(samples: readonly StrokeSample[], closed: boolean): Pin[] {
  const count = samples.length;
  if (count < 3) return [];
  const pins: Pin[] = [];
  const start = closed ? 0 : 1;
  const end = closed ? count : count - 1;
  for (let index = start; index < end; index++) {
    const previous = samples[(index - 1 + count) % count]!.point;
    const here = samples[index]!.point;
    const next = samples[(index + 1) % count]!.point;
    const incoming = Math.atan2(here.y - previous.y, here.x - previous.x);
    const outgoing = Math.atan2(next.y - here.y, next.x - here.x);
    if (Math.abs(signedAngleDelta(incoming, outgoing)) >= 0.45)
      pins.push({ index, incoming, outgoing });
  }
  return pins;
}

/** `WatercolorStroke.smoothPinnedCenterline`. */
function smoothPinnedCenterline(
  samples: readonly StrokeSample[],
  pins: readonly Pin[],
  closed: boolean,
): SmoothSample[] {
  const anchors = pins.map((pin) => pin.index);
  if (!closed) {
    if (anchors[0] !== 0) anchors.unshift(0);
    if (anchors[anchors.length - 1] !== samples.length - 1) anchors.push(samples.length - 1);
  }
  const result: SmoothSample[] = [];
  if (closed) {
    for (let pinIndex = 0; pinIndex < pins.length; pinIndex++) {
      const start = pins[pinIndex]!;
      const end = pins[(pinIndex + 1) % pins.length]!;
      const span = spanSamples(samples, start.index, end.index);
      let smoothed = smoothWholeCenterline(span, false);
      const spanFirst = span[0];
      const spanLast = span[span.length - 1];
      if (spanFirst && spanLast) snapEnds(smoothed, spanFirst.point, spanLast.point);
      const first = smoothed[0];
      if (pinIndex === 0 && first) {
        first.cornerIncoming = start.incoming;
        first.cornerOutgoing = start.outgoing;
      }
      if (pinIndex < pins.length - 1) {
        const last = smoothed[smoothed.length - 1];
        if (last) {
          last.cornerIncoming = end.incoming;
          last.cornerOutgoing = end.outgoing;
        }
      }
      if (pinIndex > 0) smoothed = smoothed.slice(1);
      result.push(...smoothed);
    }
    if (result.length > 0) result.pop();
    return result;
  }
  for (let index = 0; index < anchors.length - 1; index++) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const span = samples.slice(start, end + 1);
    let smoothed = smoothWholeCenterline(span, false);
    const spanFirst = span[0];
    const spanLast = span[span.length - 1];
    if (spanFirst && spanLast) snapEnds(smoothed, spanFirst.point, spanLast.point);
    if (index > 0) smoothed = smoothed.slice(1);
    const pin = pins.find((item) => item.index === end);
    const last = smoothed[smoothed.length - 1];
    if (pin && last && end !== samples.length - 1) {
      last.cornerIncoming = pin.incoming;
      last.cornerOutgoing = pin.outgoing;
    }
    result.push(...smoothed);
  }
  return result;
}

/** `WatercolorStroke.spanSamples`. */
function spanSamples(samples: readonly StrokeSample[], start: number, end: number): StrokeSample[] {
  if (start <= end) return samples.slice(start, end + 1);
  return [...samples.slice(start), ...samples.slice(0, end + 1)];
}

/** `WatercolorStroke.snapEnds`. */
function snapEnds(samples: SmoothSample[], first: Vec, last: Vec): void {
  const start = samples[0];
  const end = samples[samples.length - 1];
  if (!start || !end) return;
  start.point = first;
  end.point = last;
  const points = samples.map((sample) => sample.point);
  const forwards = stableForwards(points, false);
  const curvatures = smoothScalars(signedCurvatures(points, forwards, false), 4, false);
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!;
    sample.forward = forwards[index] ?? 0;
    const curvature = curvatures[index] ?? 0;
    sample.curvature = curvature;
    sample.radius = 1 / Math.max(0.0004, Math.abs(curvature));
  }
}

/** `WatercolorStroke.smoothWholeCenterline`. */
function smoothWholeCenterline(samples: readonly StrokeSample[], closed: boolean): SmoothSample[] {
  if (samples.length < 2) return [];
  let curve = resample(
    samples.map((sample) => sample.point),
    samples.map((sample) => sample.t),
    2,
    closed,
  );
  if (curve.length < 2) return [];
  curve = averageCurve(curve, 5, closed);
  curve = averageCurve(curve, 5, closed);
  curve = averageCurve(curve, 5, closed);
  curve = resample(
    curve.map((sample) => sample.point),
    curve.map((sample) => sample.t),
    2,
    closed,
  );
  curve = averageCurve(curve, 3, closed);
  if (curve.length < 2) return [];
  const forwards = stableForwards(
    curve.map((sample) => sample.point),
    closed,
  );
  const curvatures = smoothScalars(
    signedCurvatures(
      curve.map((sample) => sample.point),
      forwards,
      closed,
    ),
    4,
    closed,
  );
  const times = arcLengthParameters(
    curve.map((sample) => sample.point),
    closed,
  );
  return curve.map((sample, index) => {
    const curvature = curvatures[index] ?? 0;
    return {
      point: sample.point,
      t: times[index] ?? 0,
      forward: forwards[index] ?? 0,
      curvature,
      radius: 1 / Math.max(0.0004, Math.abs(curvature)),
    };
  });
}

/** `WatercolorStroke.halfWidth`. `style` and `layer` are unused, as in Swift. */
function halfWidth(
  sample: StrokeSample,
  forward: number,
  width: number,
  style: WatercolorNumbers,
  layer: number,
  line: CenterLine,
): number {
  void style;
  void layer;
  const tip = effectiveWidth(CIRCULAR_TIP, width, forward);
  return Math.max(0.2, tip * 0.5 * (line.closed ? 1 : tipScale(sample.t)));
}

/** `WatercolorStroke.mix`. */
function mix(from: Vec, to: Vec, amount: number): Vec {
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}

/** `WatercolorStroke.quad`. */
function quad(a: Vec, b: Vec, c: Vec, d: Vec): Path {
  return [moveOf(a), lineOf(b), lineOf(c), lineOf(d), { op: "Z" }];
}

/** `WatercolorStroke.tipScale`. */
function tipScale(t: number): number {
  const edge = Math.min(Math.max(0, t), Math.max(0, 1 - t));
  if (edge >= 0.2) return 1;
  const amount = edge / 0.2;
  return 0.72 + 0.28 * (amount * amount * (3 - 2 * amount));
}

/**
 * `WatercolorStroke.alongOpacity`.
 * The profile is the noise curve `BrushProfile.watercolor` stores when `variation > 0.001`.
 */
function alongOpacity(
  t: number,
  closed: boolean,
  style: WatercolorNumbers,
  strokeOpacity: number,
): number {
  let join = 1;
  let raw = 1;
  if (style.variation > 0.001) {
    const profile = {
      kind: "noise" as const,
      noise: {
        minimum: 0.42,
        maximum: 1,
        variation: Math.min(1, style.variation * 1.25),
        seed: uadd(seedOf(style), 17n),
        frequency: 1.5,
      },
    };
    join = opacityAt(profile, 0, true);
    raw = opacityAt(profile, t, closed);
  }
  const blended = closed ? seamBlend(raw, join, t, 0.08) : raw;
  return Math.min(1, Math.max(0, blended * strokeOpacity));
}

/** `WatercolorStroke.signed`. */
function signedAt(t: number, cycles: number, seed: bigint, closed: boolean): number {
  if (closed) {
    const cells = Math.max(1, Math.round(cycles));
    return noiseUnitPeriodic(f32(f32(t) * f32(cells)), cells, seed) * 2 - 1;
  }
  return noiseSigned(t * cycles, seed);
}

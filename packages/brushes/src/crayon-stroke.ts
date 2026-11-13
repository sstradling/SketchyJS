import type { Path, PathOp } from "@sketchy-js/plugin";
import { ellipsePath } from "./ellipse.js";

/** One wax layer: a filled path and the opacity multiplied onto the stroke color. */
export interface CrayonPass {
  path: Path;
  opacity: number;
}

/** Numeric crayon settings. `seed` is carried separately so the plugin schema stays numeric. */
export interface CrayonNumbers {
  grain: number;
  edgeRoughness: number;
  widthVariation: number;
  opacityVariation: number;
  passes: number;
  baseOpacity: number;
  baseSoftness: number;
  grit: number;
  flakeSize: number;
}

interface Sample {
  x: number;
  y: number;
  tangent: number;
}

const MASK = (1n << 64n) - 1n;
const add = (a: bigint, b: bigint): bigint => (a + b) & MASK;
const mul = (a: bigint, b: bigint): bigint => (a * b) & MASK;

/** `CrayonStroke.unit`: deterministic value in 0...1. */
function unit(seed: bigint, pass: number, index: number, channel: number): number {
  let x = add(seed, 0x9e3779b97f4a7c15n);
  const mix = (value: bigint, n: number, k: bigint): bigint => value ^ mul(BigInt(n), k);
  x = mix(x, pass, 0xbf58476d1ce4e5b9n);
  x = mix(x, index, 0x94d049bb133111ebn);
  x = mix(x, channel, 0xd1b54a32d192ed03n);
  x = mul(x ^ (x >> 30n), 0xbf58476d1ce4e5b9n);
  x = mul(x ^ (x >> 27n), 0x94d049bb133111ebn);
  x = x ^ (x >> 31n);
  return Number(x % 10000n) / 9999;
}

const dist = (a: Sample, b: { x: number; y: number }): number => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): { x: number; y: number } => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function cubicAt(
  p0: Sample,
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + tt * t * p3.y,
  };
}

/** Samples engine operations the way `CrayonStroke.subpaths` does (about every 2px). */
export function crayonSamples(path: Path): { samples: Sample[]; closed: boolean }[] {
  const result: { samples: Sample[]; closed: boolean }[] = [];
  let current: Sample[] = [];
  let start: { x: number; y: number } | undefined;
  let cursor = { x: 0, y: 0 };
  let closed = false;
  const flush = (): void => {
    if (current.length >= 2) result.push({ samples: current, closed });
    current = [];
    start = undefined;
    closed = false;
  };
  const pushLine = (end: { x: number; y: number }): void => {
    const length = Math.hypot(end.x - cursor.x, end.y - cursor.y);
    if (!(length > 0.01)) {
      cursor = end;
      return;
    }
    const tangent = Math.atan2(end.y - cursor.y, end.x - cursor.x);
    const startsHere = current.length === 1;
    const steps = Math.max(1, Math.ceil(length / 2));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const p = lerp(cursor, end, t);
      current.push({ x: p.x, y: p.y, tangent });
    }
    if (startsHere && current[0]) current[0] = { ...current[0], tangent };
    cursor = end;
  };
  for (const op of path) {
    if (op.op === "M") {
      flush();
      cursor = { x: op.x, y: op.y };
      start = cursor;
      current = [{ x: cursor.x, y: cursor.y, tangent: 0 }];
    } else if (op.op === "L") pushLine({ x: op.x, y: op.y });
    else if (op.op === "C") {
      const end = { x: op.x, y: op.y };
      const c1 = { x: op.c1x, y: op.c1y };
      const c2 = { x: op.c2x, y: op.c2y };
      const length =
        Math.hypot(c1.x - cursor.x, c1.y - cursor.y) +
        Math.hypot(c2.x - c1.x, c2.y - c1.y) +
        Math.hypot(end.x - c2.x, end.y - c2.y);
      if (!(length > 0.01)) {
        cursor = end;
        continue;
      }
      const startsHere = current.length === 1;
      const steps = Math.min(48, Math.max(2, Math.ceil(length / 2)));
      const origin = { ...cursor, tangent: 0 };
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const point = cubicAt(origin, c1, c2, end, t);
        const prev = cubicAt(origin, c1, c2, end, Math.max(0, t - 0.02));
        current.push({
          x: point.x,
          y: point.y,
          tangent: Math.atan2(point.y - prev.y, point.x - prev.x),
        });
      }
      if (startsHere && current[1] && current[0])
        current[0] = { ...current[0], tangent: current[1].tangent };
      cursor = end;
    } else if (op.op === "Z" && start) {
      if (Math.hypot(cursor.x - start.x, cursor.y - start.y) > 0.01) pushLine(start);
      closed = true;
    }
  }
  flush();
  return result;
}

function stampEllipses(
  into: PathOp[],
  samples: readonly Sample[],
  width: number,
  style: CrayonNumbers,
  seed: bigint,
  kind: "base" | "grit",
  pass: number,
  serialStart: number,
): void {
  if (samples.length < 2) return;
  if (kind === "base") {
    const softness = style.baseSoftness;
    const step = Math.max(0.4, width * 0.2);
    let traveled = 0;
    let next = 0;
    let serial = serialStart;
    const budget = serial + 8000;
    for (let index = 1; index < samples.length; index++) {
      const start = samples[index - 1]!;
      const end = samples[index]!;
      const span = dist(start, end);
      if (!(span > 0.01)) continue;
      while (next <= traveled + span && serial < budget) {
        const t = Math.min(1, Math.max(0, (next - traveled) / span));
        const point = lerp(start, end, t);
        const normal = end.tangent + Math.PI / 2;
        const swell = unit(seed, 0, serial, 6) - 0.5;
        const wobble = 1 + style.widthVariation * swell * 0.22;
        const drift = (unit(seed, 1, serial, 8) - 0.5) * width * softness * 0.1;
        const center = {
          x: point.x + Math.cos(normal) * drift,
          y: point.y + Math.sin(normal) * drift,
        };
        const along = Math.max(step * 2.4, width * 0.9);
        into.push(
          ...ellipsePath(
            center.x,
            center.y,
            end.tangent,
            along,
            width * (1.08 + softness * 0.28) * wobble,
          ),
        );
        serial += 1;
        next += step;
      }
      traveled += span;
    }
    return;
  }
  const flake = Math.max(0.45, width * (0.16 + 0.15 * style.flakeSize));
  const speck = Math.max(0.28, flake * 0.34);
  const step = Math.max(0.4, flake * 0.62);
  const rows = Math.min(4, Math.max(2, Math.ceil((width * 0.55) / flake)));
  let traveled = 0;
  let next = step * 0.35;
  let serial = serialStart;
  const budget = serial + 10000;
  const lateral = (pass === 0 ? 0 : pass % 2 === 0 ? -1 : 1) * width * 0.06;
  for (let index = 1; index < samples.length; index++) {
    const start = samples[index - 1]!;
    const end = samples[index]!;
    const span = dist(start, end);
    if (!(span > 0.01)) continue;
    while (next <= traveled + span && serial < budget) {
      const t = Math.min(1, Math.max(0, (next - traveled) / span));
      emitGrit(
        into,
        lerp(start, end, t),
        end.tangent,
        width,
        flake,
        speck,
        rows,
        style,
        seed,
        pass,
        serial,
        lateral,
      );
      serial += 1;
      next += step * (0.82 + 0.36 * unit(seed, pass, serial, 2));
    }
    traveled += span;
  }
}

function emitGrit(
  into: PathOp[],
  point: { x: number; y: number },
  tangent: number,
  width: number,
  flake: number,
  speck: number,
  rows: number,
  style: CrayonNumbers,
  seed: bigint,
  pass: number,
  serial: number,
  lateralBias: number,
): void {
  const normal = tangent + Math.PI / 2;
  const edge = style.edgeRoughness;
  const tear = (unit(seed, pass, serial, 4) - 0.5) * width * edge * 0.34;
  const center = {
    x: point.x + Math.cos(normal) * (lateralBias + tear),
    y: point.y + Math.sin(normal) * (lateralBias + tear),
  };
  const angle = tangent + (unit(seed, pass, serial, 5) - 0.5) * edge * 0.9;
  const band = width * (0.34 + 0.16 * unit(seed, pass, serial, 30) * (0.35 + edge));
  const clumpScale = pass === 0 ? 1 : 0.62;
  const clumpKeep = Math.min(0.97, 0.58 + style.grit * 0.38 - style.grain * 0.18);
  const speckKeep = Math.min(0.7, 0.1 + style.grit * 0.4 - style.grain * 0.16);
  for (let row = 0; row < rows; row++) {
    const span = Math.max(rows - 1, 1);
    const across = (row / span - 0.5) * band * 2;
    const radial = Math.abs(across) / Math.max(band, 0.01);
    const keep = radial < 0.8 ? clumpKeep : clumpKeep * (0.55 + 0.35 * edge);
    const rowIndex = Number(add(mul(BigInt(serial), 17n), BigInt(row)));
    if (unit(seed, pass, rowIndex, 11) <= keep) {
      const alongIndex = Number(add(BigInt(serial), BigInt(row)));
      const jAlong = (unit(seed, pass, alongIndex, 12) - 0.5) * flake * 0.85;
      const jAcross = (unit(seed, pass, alongIndex, 13) - 0.5) * flake * 0.55;
      const length = flake * clumpScale * (0.9 + 0.85 * unit(seed, pass, alongIndex, 14));
      const thickness = flake * clumpScale * (0.48 + 0.55 * unit(seed, pass, alongIndex, 15));
      into.push(
        ...ellipsePath(
          center.x + Math.cos(angle) * jAlong + Math.cos(normal) * (across + jAcross),
          center.y + Math.sin(angle) * jAlong + Math.sin(normal) * (across + jAcross),
          angle + (unit(seed, pass, alongIndex, 16) - 0.5) * 1.1,
          length,
          thickness,
        ),
      );
    }
    const speckIndex = Number(add(mul(BigInt(serial), 13n), BigInt(row)));
    if (unit(seed, pass, speckIndex, 17) <= speckKeep) {
      const alongIndex = Number(add(BigInt(serial), BigInt(row)));
      const acrossSpeck = (unit(seed, pass, alongIndex, 18) - 0.5) * band * 1.7;
      into.push(
        ...ellipsePath(
          center.x + Math.cos(normal) * acrossSpeck,
          center.y + Math.sin(normal) * acrossSpeck,
          angle + (unit(seed, pass, alongIndex, 19) - 0.5),
          speck * (0.65 + 0.8 * unit(seed, pass, alongIndex, 20)),
          speck * (0.4 + 0.45 * unit(seed, pass, alongIndex, 21)),
        ),
      );
    }
  }
  const haloHalf = (width * (1.08 + style.baseSoftness * 0.28)) / 2;
  if (unit(seed, pass, serial, 22) < edge * (0.42 + style.grit * 0.28)) {
    const side = unit(seed, pass, serial, 23) < 0.5 ? -1 : 1;
    const out = haloHalf + width * (0.01 + 0.06 * unit(seed, pass, serial, 24));
    const crumb = flake * (0.36 + 0.4 * unit(seed, pass, serial, 25));
    into.push(
      ...ellipsePath(
        center.x + Math.cos(normal) * side * out,
        center.y + Math.sin(normal) * side * out,
        angle + (unit(seed, pass, serial, 26) - 0.5) * 1.4,
        crumb,
        crumb * 0.58,
      ),
    );
  }
  if (unit(seed, pass, serial, 27) < edge * 0.42) {
    const side = unit(seed, pass, serial, 28) < 0.5 ? -1 : 1;
    const out = haloHalf + width * (0.05 + 0.1 * unit(seed, pass, serial, 29));
    const crumb = flake * 0.36 * (0.7 + unit(seed, pass, serial, 31));
    into.push(
      ...ellipsePath(
        center.x + Math.cos(normal) * side * out + Math.cos(angle) * flake * 0.2,
        center.y + Math.sin(normal) * side * out + Math.sin(angle) * flake * 0.2,
        angle,
        crumb,
        crumb * 0.7,
      ),
    );
  }
}

/**
 * Crayon passes for one centerline. Sketchy's `CrayonStroke.passes`: halo, core, then grit.
 * `seed` is the resolved grain seed (`Options.seed` replaces the default of 1).
 */
export function crayonPasses(
  path: Path,
  width: number,
  style: CrayonNumbers,
  seed: bigint,
): CrayonPass[] {
  if (width < 0.25) return [];
  const subs = crayonSamples(path);
  if (subs.length === 0) return [];
  const halo: PathOp[] = [];
  const core: PathOp[] = [];
  subs.forEach((sub, index) => {
    const serial = index * 20000;
    const softness = style.baseSoftness;
    const step = Math.max(0.4, width * 0.2);
    let traveled = 0;
    let next = 0;
    let serialN = serial;
    const budget = serial + 8000;
    for (let i = 1; i < sub.samples.length; i++) {
      const start = sub.samples[i - 1]!;
      const end = sub.samples[i]!;
      const span = dist(start, end);
      if (!(span > 0.01)) continue;
      while (next <= traveled + span && serialN < budget) {
        const t = Math.min(1, Math.max(0, (next - traveled) / span));
        const point = lerp(start, end, t);
        const normal = end.tangent + Math.PI / 2;
        const swell = unit(seed, 0, serialN, 6) - 0.5;
        const wobble = 1 + style.widthVariation * swell * 0.22;
        const drift = (unit(seed, 1, serialN, 8) - 0.5) * width * softness * 0.1;
        const center = {
          x: point.x + Math.cos(normal) * drift,
          y: point.y + Math.sin(normal) * drift,
        };
        const along = Math.max(step * 2.4, width * 0.9);
        halo.push(
          ...ellipsePath(
            center.x,
            center.y,
            end.tangent,
            along,
            width * (1.08 + softness * 0.28) * wobble,
          ),
        );
        core.push(
          ...ellipsePath(
            center.x,
            center.y,
            end.tangent,
            along * 0.96,
            width * (0.88 + softness * 0.06) * wobble,
          ),
        );
        serialN += 1;
        next += step;
      }
      traveled += span;
    }
  });
  const passes: CrayonPass[] = [];
  const base = style.baseOpacity;
  const haloOpacity = Math.max(0.14, base * (0.22 + 0.12 * style.baseSoftness));
  if (halo.length > 0) passes.push({ path: halo, opacity: haloOpacity });
  if (core.length > 0) passes.push({ path: core, opacity: base });
  for (let pass = 0; pass < style.passes; pass++) {
    const marks: PathOp[] = [];
    subs.forEach((sub, index) => {
      stampEllipses(
        marks,
        sub.samples,
        width,
        style,
        seed,
        "grit",
        pass,
        index * 20000 + pass * 3000,
      );
    });
    if (marks.length === 0) continue;
    const fade = style.passes === 1 ? 0 : pass / (style.passes - 1);
    passes.push({
      path: marks,
      opacity: Math.max(0.72, 0.96 - style.opacityVariation * fade * 0.28),
    });
  }
  return passes;
}

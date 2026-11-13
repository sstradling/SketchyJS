import type { BrushCap, BrushProfile, Path, PathOp } from "@sketchy-js/types";
import { centerlines, type StrokeSample } from "./outline.js";
import { arcToCubics } from "./math.js";
import { effectiveWidth, opacityAt, seamBlend, thicknessWidth } from "./profile.js";

/** One filled piece of a variable-opacity stroke, with the opacity it contributes. */
export interface RibbonPiece {
  path: Path;
  opacity: number;
}

const line = (x: number, y: number): PathOp => ({ op: "L", x, y });

function sidePoint(
  sample: StrokeSample,
  half: number,
  shift: number,
  sign: number,
): { x: number; y: number } {
  const normal = sample.tangent + Math.PI / 2;
  const along = Math.cos(normal);
  const across = Math.sin(normal);
  const cx = sample.point.x + along * shift;
  const cy = sample.point.y + across * shift;
  return { x: cx + along * half * sign, y: cy + across * half * sign };
}

function circle(cx: number, cy: number, radius: number): Path {
  if (!(radius > 0)) return [];
  const cubics = arcToCubics({ x: cx, y: cy }, radius, 0, Math.PI * 2);
  const first = cubics[0];
  if (!first || first.op !== "C") return [];
  const start = {
    x: cx + radius,
    y: cy,
  };
  return [{ op: "M", x: start.x, y: start.y }, ...cubics, { op: "Z" }];
}

/**
 * Non-overlapping quads along a centerline, plus caps. Neighbouring quads share
 * an edge so a luminance mask does not darken the join. Sketchy's `StrokeRibbon`.
 */
export function ribbonPieces(
  samples: readonly StrokeSample[],
  closed: boolean,
  cap: BrushCap,
  geometry: (sample: StrokeSample) => { half: number; opacity: number },
): RibbonPiece[] {
  if (samples.length < 2) return [];
  const pieces: RibbonPiece[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const start = samples[i]!;
    const end = samples[i + 1]!;
    const a = geometry(start);
    const b = geometry(end);
    if (a.half < 0.04 && b.half < 0.04) continue;
    const opacity = Math.min(1, Math.max(0, (a.opacity + b.opacity) * 0.5));
    if (opacity <= 0.001) continue;
    const l0 = sidePoint(start, a.half, 0, 1);
    const r0 = sidePoint(start, a.half, 0, -1);
    const l1 = sidePoint(end, b.half, 0, 1);
    const r1 = sidePoint(end, b.half, 0, -1);
    pieces.push({
      opacity,
      path: [
        { op: "M", x: l0.x, y: l0.y },
        line(l1.x, l1.y),
        line(r1.x, r1.y),
        line(r0.x, r0.y),
        { op: "Z" },
      ],
    });
  }
  if (!closed && cap !== "butt") {
    for (const sample of [samples[0]!, samples[samples.length - 1]!]) {
      const geo = geometry(sample);
      if (geo.half < 0.04) continue;
      const opacity = Math.min(1, Math.max(0, geo.opacity));
      if (opacity <= 0.001) continue;
      const normal = sample.tangent + Math.PI / 2;
      const cx = sample.point.x + Math.cos(normal) * 0;
      const cy = sample.point.y + Math.sin(normal) * 0;
      if (cap === "round") {
        pieces.push({ opacity, path: circle(cx, cy, geo.half) });
      } else {
        const outward = sample === samples[0] ? sample.tangent + Math.PI : sample.tangent;
        const left = sidePoint(sample, geo.half, 0, 1);
        const right = sidePoint(sample, geo.half, 0, -1);
        const ex = Math.cos(outward) * geo.half;
        const ey = Math.sin(outward) * geo.half;
        pieces.push({
          opacity,
          path: [
            { op: "M", x: left.x, y: left.y },
            line(left.x + ex, left.y + ey),
            line(right.x + ex, right.y + ey),
            line(right.x, right.y),
            { op: "Z" },
          ],
        });
      }
    }
  }
  return pieces;
}

/**
 * Variable-opacity quads for one centerline, faintest first, so overlaps keep
 * the higher opacity. Closed contours blend toward the opacity at `t = 0`.
 */
export function opacityRibbon(
  path: Path,
  width: number,
  brush: BrushProfile,
  strokeOpacity: number,
): RibbonPiece[] {
  if (width < 0.2 || !(strokeOpacity > 0)) return [];
  const pieces: RibbonPiece[] = [];
  const uniform =
    brush.opacityProfile.kind === "uniform"
      ? 1
      : opacityAt(brush.opacityProfile, 0, true) * strokeOpacity;
  for (const line of centerlines(path)) {
    const widthBrush = line.closed
      ? { ...brush, thicknessProfile: { kind: "uniform" as const } }
      : brush;
    const opacityAtT = (t: number): number => {
      const raw = opacityAt(brush.opacityProfile, t, line.closed) * strokeOpacity;
      const blended = line.closed ? seamBlend(raw, uniform, t, 0.06) : raw;
      return Math.min(1, Math.max(0, blended));
    };
    pieces.push(
      ...ribbonPieces(line.samples, line.closed, brush.cap, (sample) => {
        const multiplier = thicknessWidth(widthBrush.thicknessProfile, sample.t, width);
        const local = effectiveWidth(widthBrush.tip, multiplier, sample.tangent);
        return { half: Math.max(0, local) / 2, opacity: opacityAtT(sample.t) };
      }),
    );
  }
  return pieces.filter((piece) => piece.opacity > 0.004).sort((a, b) => a.opacity - b.opacity);
}

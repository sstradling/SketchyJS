import { Rng, type Shape, type SketchDrawing } from "@sketchy-js/core";
import type { EdgeRing, PluginContext } from "@sketchy-js/plugin";
import type { Color, Matrix2D, Path, StickerBacking, StickerEdge } from "@sketchy-js/types";
import { contourPath, controlBounds, isCorner } from "./contour.js";
import {
  dropDuplicatePasses,
  flattenPath,
  outlineOps,
  transformOps,
  type Centerline,
} from "./flatten.js";
import { guideRings } from "./guide.js";
import { contains, centroid, resample, signedArea, type Pt } from "./geom.js";
import { offsetClosed } from "./offset.js";
import { chop } from "./chop.js";
import { aim, continuousOutline } from "./smooth.js";
import { fullySmoothEdge } from "./edges/fully-smooth.js";
import { smoothEdge } from "./edges/smooth.js";
import { tornEdge } from "./edges/torn.js";

const MASK = (1n << 64n) - 1n;
const wrap = (value: bigint): bigint => value & MASK;
const TEAR_SEED = 0xa11ce571c4e0n;
const TEAR_MIX = 0x571c4e5eed00n;

/**
 * One painted sticker command, in the same shape as the Darwin contour fixture.
 * Renderers turn these into scene layers; tests compare them to the fixture.
 */
export interface StickerCommand {
  style: "fill" | "stroke";
  color: { r: number; g: number; b: number; a: number };
  path: Path;
  bounds: [number, number, number, number];
  cap: "round";
  join: "round" | "bevel";
  miterLimit: number;
  fillRule: "evenOdd" | "winding";
  inverseClip: boolean;
  maskOpacity: number;
  opacityMaskBlur: number;
  lineWidth?: number;
  sheetShadow?: {
    rgba: [number, number, number, number];
    opacity: number;
    x: number;
    y: number;
    radius: number;
  };
  clip?: Path;
}

export interface StickerBuild {
  centerlines: Centerline[];
  commands: StickerCommand[];
}

const edgeContext = {
  rng: new Rng(1n),
  quality: "final" as const,
  maxOps: 200_000,
  warn() {},
} as unknown as PluginContext;

/**
 * Smoothed outline centerlines. The backing width does not move these points.
 *
 * Request flow: scene host generates the drawing (fill first, so the outline
 * seed matches Sketchy), then calls this. Guides come from the shape, not from
 * the rough outline.
 */
export function stickerCenterlines(
  drawing: SketchDrawing,
  shape: Shape,
  backing: StickerBacking,
  transform?: Matrix2D,
): Centerline[] {
  if (!(backing.width > 0)) return [];
  let ops = outlineOps(drawing.sets);
  if (transform && shape.kind === "path") ops = transformOps(ops, transform);
  const unique = dropDuplicatePasses(flattenPath(ops));
  const guides = guideRings(shape).map((guide) =>
    transform && shape.kind === "path"
      ? { ...guide, points: guide.points.map((point) => apply(point, transform)) }
      : guide,
  );
  const amplitude =
    Math.max(0, drawing.options.maxRandomnessOffset) * Math.max(drawing.options.roughness, 0) * 1.5;
  return unique.map((piece) => {
    const aimed = aim(piece.points, piece.closed, guides, backing.smoothness, amplitude);
    return {
      points: resample(aimed, piece.closed, 2.5),
      closed: piece.closed,
      source: piece.points,
    };
  });
}

/**
 * Commands painted before the sketch. Empty when the backing width is zero.
 * Closed rings become one even-odd sheet. Open rings become a paper ribbon.
 */
export function stickerCommands(
  drawing: SketchDrawing,
  shape: Shape,
  backing: StickerBacking,
  transform?: Matrix2D,
): StickerBuild {
  const centerlines = stickerCenterlines(drawing, shape, backing, transform);
  if (centerlines.length === 0) return { centerlines, commands: [] };
  const strokeWidth =
    shape.kind === "path"
      ? (drawing.options.svgStrokeWidth ?? drawing.options.strokeWidth)
      : drawing.options.strokeWidth;
  const outward = backing.width + Math.max(0, strokeWidth) / 2;
  if (!(outward > 0)) return { centerlines, commands: [] };
  const commands = commandsFor(
    centerlines,
    outward,
    backing,
    asSeed(drawing.options.seed),
    strokeWidth,
  );
  return { centerlines, commands };
}

/**
 * One sheet for rings that are already in canvas space. Group backing passes
 * the sticker width here; each part's stroke is already in the ring.
 */
export function commandsForLines(
  lines: readonly Centerline[],
  outward: number,
  backing: StickerBacking,
  seed: bigint | undefined,
): StickerCommand[] {
  if (!(outward > 0) || lines.length === 0) return [];
  return closedCommands(
    lines.filter((line) => line.points.length >= 3),
    outward,
    backing,
    seed,
    channels(backing.color),
    sheetShadow(backing),
  );
}

function commandsFor(
  lines: readonly Centerline[],
  outward: number,
  backing: StickerBacking,
  seed: bigint | undefined,
  strokeWidth: number,
): StickerCommand[] {
  const paper = channels(backing.color);
  const shadow = sheetShadow(backing);
  const commands: StickerCommand[] = [];
  const closed = lines.filter((line) => line.closed);
  const open = lines.filter((line) => !line.closed);
  if (closed.length > 0)
    commands.push(...closedCommands(closed, outward, backing, seed, paper, shadow));
  const ribbon = Math.max(0, strokeWidth) + backing.width * 2;
  if (ribbon > 0) {
    open.forEach((line, index) => {
      if (line.points.length < 2) return;
      const torn = isTorn(backing.edge);
      const continuous = isFully(backing.edge);
      let points = line.points;
      if (torn) {
        const tear = tearSettings(backing, seed);
        points = chop(
          points,
          false,
          tear.depth,
          tear.length,
          tear.jaggedness,
          wrap(tear.seed + BigInt(index) + 0x0f1en),
        );
      } else if (continuous && isFully(backing.edge)) {
        points = continuousOutline(line.points, false, Math.max(0, backing.edge.radius));
      }
      const path = contourPath(points, false, !torn, continuous);
      commands.push(
        command(path, "stroke", paper, {
          lineWidth: ribbon,
          join: torn ? "bevel" : "round",
          miterLimit: 4,
          fillRule: "winding",
          shadow,
        }),
      );
    });
  }
  return commands;
}

interface Tear {
  depth: number;
  length: number;
  jaggedness: number;
  seed: bigint;
}

function isTorn(edge: StickerEdge): edge is Extract<StickerEdge, { kind: "torn" }> {
  return typeof edge === "object" && edge.kind === "torn";
}

function isFully(edge: StickerEdge): edge is Extract<StickerEdge, { kind: "fullySmooth" }> {
  return typeof edge === "object" && edge.kind === "fullySmooth";
}

function tearSettings(backing: StickerBacking, seed: bigint | undefined): Tear {
  const edge = backing.edge;
  const depth = isTorn(edge)
    ? edge.depth > 0
      ? edge.depth
      : Math.max(3, backing.width * 0.55)
    : 0;
  const length = isTorn(edge) ? Math.max(4, edge.length) : 16;
  const jaggedness = isTorn(edge) ? Math.min(1, Math.max(0, edge.jaggedness)) : 0;
  return { depth, length, jaggedness, seed: wrap((seed ?? TEAR_SEED) ^ TEAR_MIX) };
}

function closedCommands(
  lines: readonly Centerline[],
  outward: number,
  backing: StickerBacking,
  seed: bigint | undefined,
  paper: StickerCommand["color"],
  shadow: StickerCommand["sheetShadow"],
): StickerCommand[] {
  const rings = lines.filter((line) => line.points.length >= 3);
  if (rings.length === 0) return [];
  if (isFully(backing.edge)) {
    const input = {
      rings: rings.map((line, index) => ringOf(line, nestingDepth(index, rings) % 2 === 1)),
      margin: outward,
      smoothness: backing.smoothness,
    };
    const out = fullySmoothEdge.generate(
      input,
      { radius: Math.max(0, backing.edge.radius) },
      edgeContext,
    );
    return [command(concat(out.map((ring) => ring.path)), "fill", paper, { shadow })];
  }
  const torn = isTorn(backing.edge);
  const tear = tearSettings(backing, seed);
  const offsets: Pt[][] = [];
  let failed = false;
  for (let index = 0; index < rings.length; index++) {
    const line = rings[index]!;
    const signed = nestingDepth(index, rings) % 2 === 0 ? outward : -outward;
    const ring = offsetClosed(line.points, signed);
    if (!ring) {
      if (signed < 0) {
        offsets.push(line.points.slice());
        continue;
      }
      failed = true;
      break;
    }
    offsets.push(ring);
  }
  if (!failed && offsets.length === rings.length) {
    const paths = torn
      ? offsets.map((points, index) => {
          const one = tornEdge.generate(
            {
              rings: [
                { points, corner: points.map((_, i) => isCorner(points, i, true)), hole: false },
              ],
              margin: outward,
              smoothness: backing.smoothness,
            },
            {
              depth: tear.depth,
              length: tear.length,
              jaggedness: tear.jaggedness,
              ...halves(wrap(tear.seed + BigInt(index))),
            },
            edgeContext,
          );
          return one[0]!.path;
        })
      : smoothEdge
          .generate(
            {
              rings: offsets.map((points, index) => ({
                points,
                corner: points.map((_, i) => isCorner(points, i, true)),
                hole: nestingDepth(index, rings) % 2 === 1,
              })),
              margin: outward,
              smoothness: backing.smoothness,
            },
            {},
            edgeContext,
          )
          .map((ring) => ring.path);
    return [command(concat(paths), "fill", paper, { shadow })];
  }
  const curved = !torn;
  const path = concat(rings.map((line) => contourPath(line.points, true, curved, false)));
  const dilation = Math.max(outward * 2, 0.5);
  return [
    command(path, "fill", paper, { shadow }),
    command(path, "stroke", paper, { lineWidth: dilation, miterLimit: 1, shadow }),
  ];
}

function ringOf(line: Centerline, hole: boolean): EdgeRing & { source: Pt[] } {
  return {
    points: line.points,
    corner: line.points.map((_, index) => isCorner(line.points, index, true)),
    hole,
    source: line.source,
  };
}

function halves(seed: bigint): { seedHi: number; seedLo: number } {
  return { seedHi: Number((seed >> 32n) & 0xffffffffn), seedLo: Number(seed & 0xffffffffn) };
}

function nestingDepth(index: number, lines: readonly Centerline[]): number {
  const sample = centroid(lines[index]!.points);
  const area = Math.abs(signedArea(lines[index]!.points));
  let depth = 0;
  for (let other = 0; other < lines.length; other++) {
    if (other === index) continue;
    if (!(Math.abs(signedArea(lines[other]!.points)) > area * 1.02)) continue;
    if (contains(sample, lines[other]!.points)) depth += 1;
  }
  return depth;
}

function concat(paths: readonly Path[]): Path {
  return paths.flat();
}

function command(
  path: Path,
  style: "fill" | "stroke",
  color: StickerCommand["color"],
  extra: {
    lineWidth?: number;
    join?: "round" | "bevel";
    miterLimit?: number;
    fillRule?: "evenOdd" | "winding";
    shadow?: StickerCommand["sheetShadow"];
  },
): StickerCommand {
  return {
    style,
    color,
    path,
    bounds: controlBounds(path),
    cap: "round",
    join: extra.join ?? "round",
    miterLimit: extra.miterLimit ?? 10,
    fillRule: extra.fillRule ?? "evenOdd",
    inverseClip: false,
    maskOpacity: 1,
    opacityMaskBlur: 0,
    ...(extra.lineWidth !== undefined ? { lineWidth: extra.lineWidth } : {}),
    ...(extra.shadow ? { sheetShadow: extra.shadow } : {}),
  };
}

function sheetShadow(backing: StickerBacking): StickerCommand["sheetShadow"] {
  const shadow = backing.shadow;
  if (!shadow) return undefined;
  const opacity = Math.min(1, Math.max(0, shadow.opacity));
  if (!(opacity > 0.004)) return undefined;
  if (!(shadow.radius > 0.05 || Math.abs(shadow.x) > 0.05 || Math.abs(shadow.y) > 0.05))
    return undefined;
  const color = channels(shadow.color);
  return {
    rgba: [color.r, color.g, color.b, color.a],
    opacity,
    x: shadow.x,
    y: shadow.y,
    radius: Math.max(0, shadow.radius),
  };
}

/** Accepts a CSS hex color or a 0...1 tuple. Unknown strings stay black. */
export function channels(color: Color): { r: number; g: number; b: number; a: number } {
  if (typeof color !== "string") {
    const [r, g, b, a = 1] = color;
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a };
  }
  const text = color.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (!hex) return { r: 0, g: 0, b: 0, a: 1 };
  let h = hex[1]!;
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const channel = (i: number): number => Number.parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: channel(0), g: channel(2), b: channel(4), a: h.length >= 8 ? channel(6) : 1 };
}

function asSeed(seed: bigint | number | undefined): bigint | undefined {
  if (seed === undefined) return undefined;
  return typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed));
}

function apply(point: Pt, [a, b, c, d, e, f]: Matrix2D): Pt {
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

export { type Centerline };

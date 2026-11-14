import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  circle,
  generateDrawing,
  line,
  path,
  rectangle,
  roundedRectangle,
  type Shape,
} from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import { appendStickerImage, resolveImagePlacement } from "@sketchy-js/stickers/image";
import {
  commandsForLines,
  groupCommands,
  offsetClosed,
  simplifyTornRing,
  stickerCommands,
  stickerLayers,
  TORN_SIMPLIFY_EPSILON,
  type GroupPart,
  type StickerCommand,
} from "@sketchy-js/stickers";
import type { DrawLayer, Matrix2D, Path, StickerBacking } from "@sketchy-js/types";
import { basicSketchy } from "../src/basic.js";
import { createFillStage } from "../src/fill-stage.js";

const phase3 = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/swift-reference/v1.5.0/stickers/phase3.json", import.meta.url),
    "utf8",
  ),
) as {
  cases: {
    id: string;
    storedSmoothness: number;
    simplifyEpsilon?: number;
    preSimplifyRings?: { closed: boolean; startIndex: number; points: [number, number][] }[];
    offsetBeforeTear?: {
      closed: boolean;
      startIndex: number;
      distance: number;
      points: [number, number][];
    }[];
    parts?: {
      shape: string;
      center?: [number, number];
      diameter?: number;
      rect?: [number, number, number, number];
      cornerRadius?: number;
      transform: [number, number, number, number, number, number];
      strokeWidth: number;
      roughness: number;
      bowing: number;
      maxRandomnessOffset: number;
      seed: string;
    }[];
    groupTransform?: [number, number, number, number, number, number];
    centerlines: { closed: boolean; points: [number, number][] }[];
    input?: {
      imageOpacity?: number;
      imageScale?: number;
      imageSize?: [number, number];
      placement?: "tile" | "stretch" | "fill";
      width?: number;
      seed?: string;
      tearDepth?: number;
      tearLength?: number;
      tearJaggedness?: number;
    };
    commands: {
      style: string;
      path: unknown[];
      lineWidth?: number;
      fillRule?: string;
      cap?: string;
      join?: string;
      miterLimit?: number;
      bounds?: [number, number, number, number];
      color?: { r: number; g: number; b: number; a: number };
      stickerImage?: {
        imageSize: [number, number];
        opacity: number;
        placement: string;
        scale: number;
        tileWidth: number;
      };
    }[];
  }[];
};

const white = [1, 1, 1, 1] as const;

function sheet(
  partial: Partial<StickerBacking> & Pick<StickerBacking, "width" | "smoothness" | "edge">,
): StickerBacking {
  return { color: [...white], ...partial };
}

function drawingOf(shape: Shape, options: ReturnType<typeof resolveSketchOptions>) {
  const fill = basicSketchy.resolveSpec("fill", { kind: options.fillStyle });
  const drawing = generateDrawing(shape, options, createFillStage({ fill, options, report() {} }));
  if (!drawing) throw new Error("empty drawing");
  return drawing;
}

function part(
  shape: Shape,
  options: Parameters<typeof resolveSketchOptions>[0],
  transform?: Matrix2D,
): GroupPart {
  const resolved = resolveSketchOptions(options);
  return {
    shape,
    options: resolved,
    drawing: drawingOf(shape, resolved),
    ...(transform ? { transform } : {}),
  };
}

type ComparedCommand = StickerCommand & {
  stickerImage?: {
    opacity: number;
    placement: string;
    scale: number;
    tileWidth: number;
    imageSize: [number, number];
  };
};

function maxDelta(
  actual: {
    centerlines: { closed: boolean; points: { x: number; y: number }[] }[];
    commands: ComparedCommand[];
  },
  expected: (typeof phase3.cases)[number],
): number {
  expect(actual.centerlines.length, "centerline count").toBe(expected.centerlines.length);
  expect(actual.commands.length, "command count").toBe(expected.commands.length);
  let max = 0;
  let where = "start";
  actual.centerlines.forEach((line, index) => {
    const exp = expected.centerlines[index]!;
    expect(line.closed).toBe(exp.closed);
    expect(line.points.length, `${expected.id} centerline ${index}`).toBe(exp.points.length);
    line.points.forEach((pt, i) => {
      const dx = Math.abs(pt.x - exp.points[i]![0]);
      const dy = Math.abs(pt.y - exp.points[i]![1]);
      if (dx > max || dy > max) where = `centerline ${index} pt ${i}`;
      max = Math.max(max, dx, dy);
    });
  });
  actual.commands.forEach((command, index) => {
    const exp = expected.commands[index]!;
    expect(command.style).toBe(exp.style);
    expect(command.path.length, `${expected.id} command ${index} ops`).toBe(exp.path.length);
    if (command.lineWidth !== undefined)
      expect(command.lineWidth).toBeCloseTo(exp.lineWidth ?? NaN, 6);
    if (exp.fillRule) expect(command.fillRule).toBe(exp.fillRule);
    if (exp.cap) expect(command.cap).toBe(exp.cap);
    if (exp.join) expect(command.join).toBe(exp.join);
    if (exp.miterLimit !== undefined) expect(command.miterLimit).toBeCloseTo(exp.miterLimit, 6);
    if (exp.color) {
      const parts = [
        Math.abs(command.color.r - exp.color.r),
        Math.abs(command.color.g - exp.color.g),
        Math.abs(command.color.b - exp.color.b),
        Math.abs(command.color.a - exp.color.a),
      ];
      parts.forEach((d, i) => {
        if (d > max)
          where = `${expected.id} color ${index} ch ${i} ${command.color.r},${command.color.g},${command.color.b},${command.color.a} vs ${exp.color!.r},${exp.color!.g},${exp.color!.b},${exp.color!.a}`;
      });
      max = Math.max(max, ...parts);
    }
    if (exp.bounds) {
      const tight = pathBounds(command.path);
      tight.forEach((value, i) => {
        const d = Math.abs(value - exp.bounds![i]!);
        if (d > max)
          where = `${expected.id} bounds ${index} #${i} ${tight.join(",")} vs ${exp.bounds?.join(",")}`;
        max = Math.max(max, d);
      });
    }
    if (exp.stickerImage) {
      expect(command.stickerImage, `${expected.id} image`).toBeDefined();
      const image = command.stickerImage!;
      expect(image.placement).toBe(exp.stickerImage.placement);
      const parts = [
        Math.abs(image.opacity - exp.stickerImage.opacity),
        Math.abs(image.scale - exp.stickerImage.scale),
        Math.abs(image.tileWidth - exp.stickerImage.tileWidth),
        Math.abs(image.imageSize[0] - exp.stickerImage.imageSize[0]),
        Math.abs(image.imageSize[1] - exp.stickerImage.imageSize[1]),
      ];
      parts.forEach((d, i) => {
        if (d > max)
          where = `${expected.id} stickerImage #${i} ${JSON.stringify(image)} vs ${JSON.stringify(exp.stickerImage)}`;
      });
      max = Math.max(max, ...parts);
    }
    command.path.forEach((op, i) => {
      const row = exp.path[i] as unknown[];
      expect(op.op).toBe(row[0]);
      const nums =
        op.op === "Z" ? [] : Object.values(op).filter((v): v is number => typeof v === "number");
      nums.forEach((n, k) => {
        const d = Math.abs(n - (row[k + 1] as number));
        if (d > max) where = `${expected.id} op ${index}:${i} #${k}`;
        max = Math.max(max, d);
      });
    });
  });
  void where;
  return max;
}

/** Rotates each closed ring onto the fixture's start vertex, then rebuilds the sheet. */
function alignedGroup(
  actual: ReturnType<typeof groupCommands>,
  expected: (typeof phase3.cases)[number],
  backing: StickerBacking,
  seed: bigint,
) {
  const centerlines = actual.centerlines.map((line, index) => {
    const exp = expected.centerlines[index]!;
    if (!line.closed || line.points.length !== exp.points.length) return line;
    let best = Infinity;
    let at = 0;
    for (let shift = 0; shift < exp.points.length; shift++) {
      let worst = 0;
      for (let i = 0; i < line.points.length; i++) {
        const e = exp.points[(i + shift) % exp.points.length]!;
        worst = Math.max(
          worst,
          Math.abs(line.points[i]!.x - e[0]),
          Math.abs(line.points[i]!.y - e[1]),
        );
      }
      if (worst < best) {
        best = worst;
        at = shift;
      }
    }
    const start = (line.points.length - at) % line.points.length;
    const points = line.points.slice(start).concat(line.points.slice(0, start));
    return { ...line, points, source: points };
  });
  return {
    centerlines,
    commands: commandsForLines(centerlines, backing.width, backing, seed),
  };
}

function rootsInUnit(a: number, b: number, c: number): number[] {
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) out.push(t);
    }
    return out;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return out;
  const root = Math.sqrt(disc);
  for (const t of [(-b + root) / (2 * a), (-b - root) / (2 * a)]) {
    if (t > 0 && t < 1) out.push(t);
  }
  return out;
}

function cubicAt(p0: number, c1: number, c2: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1;
}

function quadAt(p0: number, c: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

/** Tight bounds of the drawn curves. Control-point bounds sit outside the ink. */
function pathBounds(path: Path): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let x = 0;
  let y = 0;
  const take = (px: number, py: number) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };
  for (const op of path) {
    if (op.op === "Z") continue;
    if (op.op === "M" || op.op === "L") {
      take(op.x, op.y);
      x = op.x;
      y = op.y;
      continue;
    }
    if (op.op === "Q") {
      take(op.x, op.y);
      const ax = x - 2 * op.cx + op.x;
      const bx = 2 * (op.cx - x);
      const ay = y - 2 * op.cy + op.y;
      const by = 2 * (op.cy - y);
      const times = [...rootsInUnit(ax, bx, op.cx - x), ...rootsInUnit(ay, by, op.cy - y)];
      for (const t of times) take(quadAt(x, op.cx, op.x, t), quadAt(y, op.cy, op.y, t));
      x = op.x;
      y = op.y;
      continue;
    }
    take(op.x, op.y);
    const times = [
      ...rootsInUnit(
        -x + 3 * op.c1x - 3 * op.c2x + op.x,
        2 * (x - 2 * op.c1x + op.c2x),
        op.c1x - x,
      ),
      ...rootsInUnit(
        -y + 3 * op.c1y - 3 * op.c2y + op.y,
        2 * (y - 2 * op.c1y + op.c2y),
        op.c1y - y,
      ),
    ];
    for (const t of times) {
      take(cubicAt(x, op.c1x, op.c2x, op.x, t), cubicAt(y, op.c1y, op.c2y, op.y, t));
    }
    x = op.x;
    y = op.y;
  }
  return [minX, minY, maxX - minX, maxY - minY];
}

function paintColor(layer: DrawLayer): { r: number; g: number; b: number; a: number } {
  const paint = layer.paint;
  if (paint.kind !== "solid" || typeof paint.color === "string") return { r: 0, g: 0, b: 0, a: 1 };
  const [r, g, b, a = 1] = paint.color;
  return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: (paint.alpha ?? 1) * a };
}

const byId = new Map(phase3.cases.map((item) => [item.id, item]));

describe("phase 3 Darwin sticker parity", () => {
  it("stores smoothness 1.5 as 1", () => {
    expect(byId.get("smoothness-1.5")?.storedSmoothness).toBe(1);
    expect(byId.get("smoothness-0.5")?.storedSmoothness).toBe(0.5);
  });

  it("torn-chop", () => {
    const expected = byId.get("torn-chop")!;
    const backing = sheet({
      width: 14,
      smoothness: 1,
      edge: { kind: "torn", depth: 8, length: 18, jaggedness: 0 },
    });
    const shape = rectangle(40, 40, 140, 90);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 3,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it("hole-smaller-than-margin", () => {
    const expected = byId.get("hole-smaller-than-margin")!;
    const backing = sheet({ width: 20, smoothness: 1, edge: "smooth" });
    const shape = path("M 30 30 H 190 V 190 H 30 Z M 100 100 H 112 V 112 H 100 Z");
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 4,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it("open-ribbon", () => {
    const expected = byId.get("open-ribbon")!;
    const backing = sheet({ width: 10, smoothness: 0.2, edge: "smooth" });
    const shape = line(20, 60, 190, 64);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 3,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    const start = actual.commands[0]?.path[0];
    expect(actual.commands[0]?.cap).toBe("round");
    expect(start).toMatchObject({ op: "M", x: 20, y: 60 });
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it.each([0.5, 1.5])("smoothness %s", (smoothness) => {
    const id = smoothness === 0.5 ? "smoothness-0.5" : "smoothness-1.5";
    const expected = byId.get(id)!;
    const backing = sheet({ width: 12, smoothness, edge: "smooth" });
    const shape = rectangle(36, 46, 148, 110);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 3,
      roughness: 1,
      bowing: 1,
      maxRandomnessOffset: 2,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    expect(maxDelta(actual, expected)).toBeLessThanOrEqual(1e-4);
  });

  it("group-hole", () => {
    const expected = byId.get("group-hole")!;
    const backing = sheet({ width: 12, smoothness: 1, edge: "smooth" });
    const shape = path("M 24 24 H 196 V 196 H 24 Z M 78 78 H 142 V 142 H 78 Z");
    const built = groupCommands(
      [part(shape, { seed: 42n, strokeWidth: 3, roughness: 0, stickerBacking: backing })],
      backing,
      42n,
    );
    expect(maxDelta(alignedGroup(built, expected, backing, 42n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("group-transform", () => {
    const expected = byId.get("group-transform")!;
    const backing = sheet({ width: 10, smoothness: 1, edge: "smooth" });
    const transform: Matrix2D = [
      0.9396926207859084, 0.3420201433256687, -0.3420201433256687, 0.9396926207859084, 28, 14,
    ];
    const shape = rectangle(40, 36, 80, 50);
    const built = groupCommands(
      [part(shape, { seed: 3n, strokeWidth: 4, roughness: 0, stickerBacking: backing }, transform)],
      backing,
      3n,
    );
    expect(maxDelta(alignedGroup(built, expected, backing, 3n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("group-overlapping", () => {
    const expected = byId.get("group-overlapping")!;
    const backing = sheet({ width: 12, smoothness: 1, edge: "smooth" });
    const options = {
      strokeWidth: 0,
      roughness: 0,
      bowing: 0,
      maxRandomnessOffset: 0,
      stickerBacking: backing,
    };
    const built = groupCommands(
      [
        part(rectangle(0, 0, 100, 100), { seed: 1n, ...options }),
        part(rectangle(60, 0, 100, 100), { seed: 2n, ...options }),
      ],
      backing,
      1n,
    );
    expect(built.centerlines).toHaveLength(1);
    expect(maxDelta(alignedGroup(built, expected, backing, 1n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("group-corner-sharing", () => {
    const expected = byId.get("group-corner-sharing")!;
    const backing = sheet({ width: 8, smoothness: 1, edge: "smooth" });
    const options = {
      strokeWidth: 0,
      roughness: 0,
      bowing: 0,
      maxRandomnessOffset: 0,
      stickerBacking: backing,
    };
    const built = groupCommands(
      [
        part(rectangle(0, 0, 50, 50), { seed: 1n, ...options }),
        part(rectangle(50, 50, 50, 50), { seed: 2n, ...options }),
      ],
      backing,
      1n,
    );
    expect(maxDelta(alignedGroup(built, expected, backing, 1n), expected)).toBeLessThanOrEqual(
      1e-4,
    );
  });

  it("paper-fibers", () => {
    const expected = byId.get("paper-fibers")!;
    const backing = sheet({
      width: 12,
      smoothness: 1,
      edge: "smooth",
      color: [0.95, 0.9, 0.75, 1],
      texture: { amount: 0.5, scale: 10, seed: 5n },
    });
    const shape = rectangle(30, 28, 100, 70);
    const options = resolveSketchOptions({
      seed: 42n,
      strokeWidth: 2,
      roughness: 0,
      stickerBacking: backing,
    });
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    const layers = stickerLayers(actual.commands, backing, 42n);
    const fibers = layers
      .filter((layer) => layer.role === "texture")
      .map((layer): StickerCommand => ({
        style: "stroke",
        color: paintColor(layer),
        path: layer.paths[0] ?? [],
        bounds: pathBounds(layer.paths[0] ?? []),
        cap: "round",
        join: "round",
        miterLimit: 10,
        fillRule: "evenOdd",
        inverseClip: false,
        maskOpacity: 1,
        opacityMaskBlur: 0,
        ...(layer.strokeWidth !== undefined ? { lineWidth: layer.strokeWidth } : {}),
      }));
    // Speck alpha is 0.7. Fiber RGB is the paper color shaded by 0.28 + 0.4 * amount.
    expect(fibers[1]?.color.a).toBeCloseTo(0.7, 6);
    expect(
      maxDelta(
        { centerlines: actual.centerlines, commands: [...actual.commands, ...fibers] },
        expected,
      ),
    ).toBeLessThanOrEqual(1e-4);
  });

  it("image-hole", () => {
    const expected = byId.get("image-hole")!;
    const backing = sheet({
      width: 12,
      smoothness: 0.9,
      edge: { kind: "fullySmooth", radius: 0 },
    });
    const shape = path("M16 16 H144 V144 H16 Z M50 50 H110 V110 H50 Z");
    const options = resolveSketchOptions({
      seed: 9n,
      strokeWidth: 2,
      roughness: 1.2,
      stickerBacking: backing,
    });
    const input = expected.input!;
    const actual = stickerCommands(drawingOf(shape, options), shape, backing);
    const sheetPath = actual.commands[0]?.path ?? [];
    const imageBacking = {
      ...backing,
      image: {
        source: {
          href: "data:image/png;base64,aaaa",
          width: input.imageSize![0],
          height: input.imageSize![1],
        },
        placement: input.placement!,
        scale: input.imageScale!,
        opacity: input.imageOpacity!,
      },
    };
    const imageLayer = appendStickerImage([], imageBacking, [sheetPath])[0]?.stickerImage;
    const placed = resolveImagePlacement({
      placement: input.placement!,
      scale: input.imageScale!,
      imageWidth: input.imageSize![0],
      imageHeight: input.imageSize![1],
      mask: {
        x: actual.commands[0]!.bounds[0],
        y: actual.commands[0]!.bounds[1],
        width: actual.commands[0]!.bounds[2],
        height: actual.commands[0]!.bounds[3],
      },
    });
    const withImage = {
      ...actual,
      commands: [
        ...actual.commands,
        {
          ...actual.commands[0]!,
          color: { r: 0, g: 0, b: 0, a: 0 },
          stickerImage: {
            opacity: imageLayer!.opacity,
            placement: imageLayer!.placement,
            scale: imageLayer!.scale,
            tileWidth: placed.tileWidth,
            imageSize: [imageLayer!.width, imageLayer!.height] as [number, number],
          },
        },
      ],
    };
    expect(maxDelta(withImage, expected)).toBeLessThanOrEqual(1e-4);
  });

  it.each(["group-torn", "group-torn-2", "group-torn-3", "group-torn-4"])("%s", (id) => {
    const expected = byId.get(id)!;
    const input = expected.input!;
    const backing = sheet({
      width: input.width!,
      smoothness: expected.storedSmoothness,
      edge: {
        kind: "torn",
        depth: input.tearDepth!,
        length: input.tearLength!,
        jaggedness: input.tearJaggedness!,
      },
    });
    const built = groupCommands(
      (expected.parts ?? []).map((item) =>
        part(
          tornShape(item),
          {
            seed: BigInt(item.seed),
            strokeWidth: item.strokeWidth,
            roughness: item.roughness,
            bowing: item.bowing,
            maxRandomnessOffset: item.maxRandomnessOffset,
            stickerBacking: backing,
          },
          item.transform,
        ),
      ),
      backing,
      BigInt(input.seed!),
      expected.groupTransform,
    );
    const pre = expected.preSimplifyRings ?? [];
    expect(built.centerlines.length).toBe(pre.length);
    // The port's union equals Swift's ring up to rotation and component order.
    // The start vertex itself is not Swift's: each torn ring starts at min x, then min y.
    expect(
      cyclicRingDelta(
        built.centerlines.map((line) => line.source),
        pre,
      ),
    ).toBeLessThanOrEqual(1e-4);
    for (const line of built.centerlines) {
      const first = line.source[0]!;
      for (const point of line.source) {
        const earlier = point.x < first.x || (point.x === first.x && point.y < first.y);
        expect(earlier).toBe(false);
      }
    }
    // Swift's own ring, with Swift's start, through simplify, offset, tear, and commands.
    const fromSwift = pre.map((ring) => {
      const source = ring.points.map(([x, y]) => ({ x, y }));
      const points = simplifyTornRing(source, TORN_SIMPLIFY_EPSILON);
      return { points, closed: true, source };
    });
    expect(fromSwift.length).toBe(expected.centerlines.length);
    fromSwift.forEach((line, index) => {
      const center = expected.centerlines[index]!;
      expect(line.points.length).toBe(center.points.length);
      line.points.forEach((point, i) => {
        expect(Math.abs(point.x - center.points[i]![0])).toBeLessThanOrEqual(1e-4);
        expect(Math.abs(point.y - center.points[i]![1])).toBeLessThanOrEqual(1e-4);
      });
      const offset = offsetClosed(line.points, expected.offsetBeforeTear![index]!.distance);
      const expectedOffset = expected.offsetBeforeTear![index]!.points;
      expect(offset?.length).toBe(expectedOffset.length);
      offset?.forEach((point, i) => {
        expect(Math.abs(point.x - expectedOffset[i]![0])).toBeLessThanOrEqual(1e-4);
        expect(Math.abs(point.y - expectedOffset[i]![1])).toBeLessThanOrEqual(1e-4);
      });
    });
    // Epsilon 0.9 must not reproduce a centerline that 1.8 actually thins.
    // group-torn-2 drops only points farther than 1.8, so 0.9 leaves both rings unchanged.
    const coarserMisses = pre.some((ring, index) => {
      const raw = ring.points.map(([x, y]) => ({ x, y }));
      const atCoarser = simplifyTornRing(raw, 0.9);
      const center = expected.centerlines[index]!;
      if (atCoarser.length !== center.points.length) return true;
      return atCoarser.some(
        (point, pointIndex) =>
          Math.abs(point.x - center.points[pointIndex]![0]) > 1e-4 ||
          Math.abs(point.y - center.points[pointIndex]![1]) > 1e-4,
      );
    });
    expect(coarserMisses).toBe(id !== "group-torn-2");
    expect(
      maxDelta(
        {
          centerlines: fromSwift,
          commands: commandsForLines(fromSwift, backing.width, backing, BigInt(input.seed!)),
        },
        expected,
      ),
    ).toBeLessThanOrEqual(1e-4);
  });
});

function tornShape(item: NonNullable<(typeof phase3.cases)[number]["parts"]>[number]): Shape {
  if (item.shape === "circle") return circle(item.center![0], item.center![1], item.diameter!);
  const [x, y, width, height] = item.rect!;
  if (item.shape === "roundedRectangle") {
    return roundedRectangle(x, y, width, height, item.cornerRadius!);
  }
  return rectangle(x, y, width, height);
}

/** Worst point error of the best rotation, then the best pairing of rings. */
function cyclicRingDelta(
  actual: { x: number; y: number }[][],
  expected: { points: [number, number][] }[],
): number {
  if (actual.length !== expected.length) return Infinity;
  let best = Infinity;
  const used = Array<boolean>(actual.length).fill(false);
  const visit = (index: number, worst: number) => {
    if (worst >= best) return;
    if (index === expected.length) {
      best = worst;
      return;
    }
    for (let ring = 0; ring < actual.length; ring++) {
      if (used[ring]) continue;
      used[ring] = true;
      visit(index + 1, Math.max(worst, rotationDelta(actual[ring]!, expected[index]!.points)));
      used[ring] = false;
    }
  };
  visit(0, 0);
  return best;
}

function rotationDelta(actual: { x: number; y: number }[], expected: [number, number][]): number {
  if (actual.length !== expected.length) return Infinity;
  let best = Infinity;
  for (let shift = 0; shift < expected.length; shift++) {
    let worst = 0;
    for (let i = 0; i < actual.length; i++) {
      const point = expected[(i + shift) % expected.length]!;
      worst = Math.max(worst, Math.abs(actual[i]!.x - point[0]), Math.abs(actual[i]!.y - point[1]));
      if (worst >= best) break;
    }
    if (worst < best) best = worst;
  }
  return best;
}

import { generateDrawing, type Shape } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import {
  groupCommands,
  multiply,
  stickerCommands,
  stickerLayers,
  type GroupPart,
} from "@sketchy-js/stickers";
import type {
  Drawing,
  DrawLayer,
  Matrix2D,
  Path,
  Scene,
  SceneNode,
  Size,
  SketchOptions,
  StickerBacking,
} from "@sketchy-js/types";
import { assembleDrawing } from "./assemble.js";
import { buildScene, type DrawItem, type FillResolver } from "./build.js";
import { createFillStage } from "./fill-stage.js";
import { computeSvgTransform, transformPath, IDENTITY } from "./transform.js";
import type { RoughView } from "./view.js";

/**
 * One drawing inside a `SketchGroup`, plus an affine transform in group space.
 *
 * `offset`, `scale`, and `rotate` move the geometry. Stroke width, sticker
 * width, and shadow offset stay in pixels; they are not multiplied by the scale.
 * Routing: `SketchGroup.build` reads `view.contents()` and bakes this matrix
 * into path coordinates instead of setting a node transform.
 */
export class SketchPart {
  constructor(
    readonly view: RoughView,
    readonly transform: Matrix2D = IDENTITY,
  ) {}

  offset(x = 0, y = 0): SketchPart {
    return new SketchPart(this.view, multiply(this.transform, [1, 0, 0, 1, x, y]));
  }

  scale(value: number, anchor: { x: number; y: number } = { x: 0, y: 0 }): SketchPart {
    const back: Matrix2D = [1, 0, 0, 1, -anchor.x, -anchor.y];
    const sc: Matrix2D = [value, 0, 0, value, 0, 0];
    const shift: Matrix2D = [1, 0, 0, 1, anchor.x, anchor.y];
    return new SketchPart(this.view, multiply(this.transform, multiply(multiply(back, sc), shift)));
  }

  rotate(radians: number, anchor: { x: number; y: number } = { x: 0, y: 0 }): SketchPart {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const back: Matrix2D = [1, 0, 0, 1, -anchor.x, -anchor.y];
    const rot: Matrix2D = [cos, sin, -sin, cos, 0, 0];
    const shift: Matrix2D = [1, 0, 0, 1, anchor.x, anchor.y];
    return new SketchPart(
      this.view,
      multiply(this.transform, multiply(multiply(back, rot), shift)),
    );
  }

  transformBy(matrix: Matrix2D): SketchPart {
    return new SketchPart(this.view, multiply(this.transform, matrix));
  }
}

/**
 * Several drawings that share one sticker sheet. A part's own `stickerBacking`
 * is ignored while the group has one, so internal edges do not grow a second halo.
 * SVG paths keep authored coordinates (`fit` is off) and then take the part transform.
 */
export class SketchGroup {
  constructor(
    readonly parts: readonly (RoughView | SketchPart)[],
    readonly backing?: StickerBacking,
    readonly transform: Matrix2D = IDENTITY,
    readonly seed?: bigint,
  ) {}

  withBacking(backing?: StickerBacking): SketchGroup {
    return new SketchGroup(this.parts, backing, this.transform, this.seed);
  }

  transformBy(matrix: Matrix2D): SketchGroup {
    return new SketchGroup(this.parts, this.backing, multiply(this.transform, matrix), this.seed);
  }

  /** Sheet first, then each part's ink. Widths are not scaled by `transform`. */
  build(size: Size): Scene {
    const parts = this.parts.map((part) =>
      part instanceof SketchPart ? part : new SketchPart(part),
    );
    const resolver = parts[0]?.view.registry();
    if (!resolver) return { version: 1, size, nodes: [] };
    if (!this.backing || !(this.backing.width > 0)) {
      const nodes = parts.flatMap((part) =>
        inkNodes(part, multiply(part.transform, this.transform), resolver, size, true),
      );
      return { version: 1, size, nodes };
    }
    const inputs: GroupPart[] = [];
    const ink: SceneNode[] = [];
    for (const part of parts) {
      const placement = multiply(part.transform, this.transform);
      for (const item of part.view.contents()) {
        const options = resolveSketchOptions(withoutBacking(item.options));
        const drawing = generateOne(resolver, item.shape, options, item.fill);
        if (!drawing) continue;
        inputs.push({ shape: item.shape, options, drawing, transform: placement });
        // Groups do not fit SVG paths to the canvas. The part transform is baked
        // into coordinates so stroke and backing widths stay in pixels.
        const fitted = assembleDrawing(drawing, size, false);
        ink.push({ type: "drawing", drawing: bake(fitted, placement) });
      }
    }
    // Path parts already received `placement` inside `groupCommands` via the
    // centerline transform. Their ink stays in authored coordinates plus placement,
    // applied here because assembleDrawing was told not to fit.
    const sheet = groupCommands(inputs, this.backing, this.seed ?? asSeed(inputs[0]?.options.seed));
    const sheetNode: SceneNode = {
      type: "drawing",
      drawing: {
        shape: "path",
        outline: [],
        layers: stickerLayers(
          sheet.commands,
          this.backing,
          this.seed ?? asSeed(inputs[0]?.options.seed),
        ),
      },
    };
    return { version: 1, size, nodes: [sheetNode, ...ink] };
  }
}

/**
 * Builds a scene and, for each shape that set `stickerBacking`, paints the sheet
 * before that shape's ink. A basic scene does not import this module.
 */
export function buildStickerScene(
  resolver: FillResolver,
  items: readonly DrawItem[],
  size: Size,
): Scene {
  const scene = buildScene(
    resolver,
    items.map((item) => ({ ...item, options: withoutBacking(item.options) })),
    size,
  );
  if (scene.nodes.length !== items.length) return scene;
  const nodes = scene.nodes.map((node, index) => {
    const backing = items[index]?.options.stickerBacking;
    if (!backing || node.type !== "drawing") return node;
    const item = items[index]!;
    const options = resolveSketchOptions(item.options);
    const drawing = generateOne(resolver, item.shape, options, item.fill);
    if (!drawing) return node;
    const built = stickerCommands(drawing, item.shape, backing);
    const sheetLayers = stickerLayers(built.commands, backing, asSeed(options.seed));
    const layers: readonly DrawLayer[] =
      item.shape.kind === "path"
        ? bake(
            { shape: "path", outline: [], layers: sheetLayers },
            computeSvgTransform(item.shape.d, size),
          ).layers
        : sheetLayers;
    return { ...node, drawing: { ...node.drawing, layers: [...layers, ...node.drawing.layers] } };
  });
  return { ...scene, nodes };
}

function generateOne(resolver: FillResolver, shape: Shape, options: SketchOptions, fill: unknown) {
  const spec = fill ?? { kind: options.fillStyle };
  const resolved = resolver.resolveSpec("fill", spec);
  return generateDrawing(shape, options, createFillStage({ fill: resolved, options, report() {} }));
}

function inkNodes(
  part: SketchPart,
  matrix: Matrix2D,
  resolver: FillResolver,
  size: Size,
  ownSheet: boolean,
): SceneNode[] {
  return part.view.contents().flatMap((item) => {
    const scene = buildStickerScene(
      resolver,
      ownSheet ? [item] : [{ ...item, options: withoutBacking(item.options) }],
      size,
    );
    return scene.nodes.map((node) => {
      if (node.type !== "drawing") return node;
      const fit = item.shape.kind === "path" ? IDENTITY : matrix;
      return { type: "drawing" as const, drawing: bake(node.drawing, fit) };
    });
  });
}

function withoutBacking(options: Partial<SketchOptions>): Partial<SketchOptions> {
  const { stickerBacking: _backing, ...rest } = options;
  return rest;
}

function asSeed(seed: bigint | number | undefined): bigint | undefined {
  if (seed === undefined) return undefined;
  return typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed));
}

function bake(drawing: Drawing, matrix: Matrix2D): Drawing {
  if (matrix.every((v, i) => v === IDENTITY[i])) return drawing;
  const path = (p: Path): Path => transformPath(p, matrix);
  return {
    ...drawing,
    outline: drawing.outline.map(path),
    layers: drawing.layers.map((layer) => ({
      ...layer,
      paths: layer.paths.map(path),
      ...(layer.clip ? { clip: { ...layer.clip, paths: layer.clip.paths.map(path) } } : {}),
    })),
  };
}

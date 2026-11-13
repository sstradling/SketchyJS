import type { Path, PathOp, Scene, SceneNode } from "@sketchy-js/types";

const MASK = (1n << 64n) - 1n;
const add = (a: bigint, b: bigint): bigint => (a + b) & MASK;
const mul = (a: bigint, b: bigint): bigint => (a * b) & MASK;

/** How far each frame may move a point, as a fraction of the point's magnitude. */
export interface VarianceConfig {
  /** At least 2. Sketchy's presets use 4. */
  steps: number;
  /** 0.005, 0.01, 0.05, and 0.1 are the very-low, low, medium, and high presets. */
  variance: number;
  /** Stable seed. The same seed replays the same frames. */
  seed: bigint;
}

/**
 * Offset of one path point. Sketchy's `PathVarianceGenerator.computeOffset`.
 * The hash is the golden-ratio mix of the step seed and the point index.
 */
export function varianceOffset(
  point: { x: number; y: number },
  step: number,
  index: number,
  config: VarianceConfig,
): { x: number; y: number } {
  if (!(config.variance > 0)) return { x: 0, y: 0 };
  const base = config.seed & MASK;
  const stepSeed = add(base, mul(BigInt(step), 0x9e3779b97f4a7c15n));
  const hash1 = add(stepSeed, mul(BigInt(index), 0x517cc1b727220a95n));
  const hash2 = add(stepSeed, mul(BigInt(index + 1000), 0x517cc1b727220a95n));
  const unit = (hash: bigint): number => {
    const n = Math.fround(Number(hash % 2000000n));
    return Math.fround(Math.fround(n / 1000000) - 1);
  };
  const magnitude = Math.fround(
    Math.max(Math.abs(Math.fround(point.x)), Math.abs(Math.fround(point.y)), Math.fround(10)),
  );
  const scale = Math.fround(magnitude * Math.fround(config.variance));
  return { x: Math.fround(unit(hash1) * scale), y: Math.fround(unit(hash2) * scale) };
}

/** One animation frame of a path. Point order matches Sketchy's compact path (end, then controls). */
export function varyPath(path: Path, step: number, config: VarianceConfig): Path {
  let index = 0;
  const moved = (x: number, y: number, at: number): { x: number; y: number } => {
    const delta = varianceOffset({ x, y }, step, at, config);
    return { x: x + delta.x, y: y + delta.y };
  };
  return path.map((op): PathOp => {
    if (op.op === "M" || op.op === "L") {
      const p = moved(op.x, op.y, index++);
      return { op: op.op, x: p.x, y: p.y };
    }
    if (op.op === "Q") {
      const end = moved(op.x, op.y, index);
      const c = moved(op.cx, op.cy, index + 1);
      index += 2;
      return { op: "Q", x: end.x, y: end.y, cx: c.x, cy: c.y };
    }
    if (op.op === "C") {
      const end = moved(op.x, op.y, index);
      const c1 = moved(op.c1x, op.c1y, index + 1);
      const c2 = moved(op.c2x, op.c2y, index + 2);
      index += 3;
      return { op: "C", x: end.x, y: end.y, c1x: c1.x, c1y: c1.y, c2x: c2.x, c2y: c2.y };
    }
    return { op: "Z" };
  });
}

function varyNode(node: SceneNode, step: number, config: VarianceConfig): SceneNode {
  if (node.type === "group") {
    return {
      ...node,
      children: node.children.map((child) => varyNode(child, step, config)),
    };
  }
  return {
    ...node,
    drawing: {
      ...node.drawing,
      outline: node.drawing.outline.map((path) => varyPath(path, step, config)),
      layers: node.drawing.layers.map((layer) => ({
        ...layer,
        paths: layer.paths.map((path) => varyPath(path, step, config)),
        ...(layer.clip
          ? {
              clip: {
                ...layer.clip,
                paths: layer.clip.paths.map((path) => varyPath(path, step, config)),
              },
            }
          : {}),
      })),
    },
  };
}

/**
 * Frame `index` of `scene`. The frame number wraps, so a loop can run forever.
 * Every path point moves by a seeded offset; the scene structure does not change.
 */
export function generateFrame(scene: Scene, config: VarianceConfig, index: number): Scene {
  const steps = Math.max(2, config.steps);
  const step = ((index % steps) + steps) % steps;
  return { ...scene, nodes: scene.nodes.map((node) => varyNode(node, step, { ...config, steps })) };
}

/** Every frame, in order. Building this once is the precompute step. */
export function precomputeFrames(scene: Scene, config: VarianceConfig): Scene[] {
  const steps = Math.max(2, config.steps);
  return Array.from({ length: steps }, (_, step) => generateFrame(scene, config, step));
}

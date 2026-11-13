import {
  type FillRegionSpec,
  type FillStage,
  type OperationSet,
  type Pt,
  type RoughCtx,
  createGeometryKit,
  createRoughKit,
  svgPathToOps,
} from "@sketchy-js/core";
import { computedHachureGap, effectiveFillWeight } from "@sketchy-js/core/options";
import type {
  AnyPlugin,
  FillInput,
  FillPart,
  FillRegion,
  Path,
  PathOp,
  PluginContext,
  Point,
} from "@sketchy-js/plugin";
import type { Diagnostic, SketchOptions } from "@sketchy-js/types";
import { bridgeShapeOptions } from "./options-resolve.js";
import type { ResolvedPlugin } from "./registry.js";

/** Largest operation count a fill may emit before the host drops it (`PluginContext.maxOps`). */
export const DEFAULT_MAX_OPS = 200_000;

const ELLIPSE_RING_STEPS = 48;

const toPoints = (points: readonly Pt[]): Point[] => points.map(([x, y]) => ({ x, y }));

const polygonPath = (points: readonly Point[]): Path => [
  ...points.map((p, i): PathOp =>
    i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y },
  ),
  { op: "Z" },
];

function ringOf(points: readonly Point[]): FillRegion["rings"][number] {
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { points, closed: true, length };
}

function boundsOf(points: readonly Point[]): FillRegion["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Converts a core region description to the plugin-facing `FillRegion`. */
export function toFillRegion(spec: FillRegionSpec): FillRegion {
  if (spec.kind === "svgPath") return svgPathRegion(spec.d);
  let points: Point[];
  let shape: FillRegion["shape"];
  if (spec.kind === "polygon") points = toPoints(spec.points);
  else if (spec.kind === "ellipse") {
    points = Array.from({ length: ELLIPSE_RING_STEPS }, (_, i) => {
      const angle = (i / ELLIPSE_RING_STEPS) * Math.PI * 2;
      return { x: spec.cx + spec.rx * Math.cos(angle), y: spec.cy + spec.ry * Math.sin(angle) };
    });
    shape = { kind: "ellipse", cx: spec.cx, cy: spec.cy, rx: spec.rx, ry: spec.ry };
  } else {
    points = toPoints(spec.points);
    shape = {
      kind: "arc",
      cx: spec.cx,
      cy: spec.cy,
      rx: spec.rx,
      ry: spec.ry,
      start: spec.start,
      stop: spec.stop,
    };
  }
  const base = {
    rings: [ringOf(points)],
    path: polygonPath(points),
    bounds: boundsOf(points),
    fillRule: "nonzero" as const,
  };
  return shape ? { ...base, shape } : base;
}

/** An SVG path wash: the path text is the shape, with no solid-fill jitter. */
function svgPathRegion(d: string): FillRegion {
  const path = svgPathToOps(d);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of path) {
    if (op.op === "Z") continue;
    const xs = op.op === "C" ? [op.c1x, op.c2x, op.x] : op.op === "Q" ? [op.cx, op.x] : [op.x];
    const ys = op.op === "C" ? [op.c1y, op.c2y, op.y] : op.op === "Q" ? [op.cy, op.y] : [op.y];
    for (const x of xs) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    for (const y of ys) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  return {
    rings: [],
    path,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    fillRule: "nonzero",
    shape: { kind: "path" },
  };
}

const finitePath = (path: Path): boolean =>
  path.every((op) => Object.values(op).every((v) => typeof v === "string" || Number.isFinite(v)));

/**
 * Maps plugin parts to Sketchy operation sets: each `area` path becomes a `fillPath` set and
 * each `strokes` centerline a `fillSketch` set. Parts with non-finite numbers or too many
 * operations are dropped with a diagnostic.
 */
export function partsToSets(
  parts: readonly FillPart[],
  pluginId: string,
  maxOps: number,
  report: (d: Diagnostic) => void,
  regionPath: Path = [],
): OperationSet[] {
  const sets: OperationSet[] = [];
  let total = 0;
  for (const part of parts) {
    const paths = part.kind === "area" ? part.paths : part.centerlines;
    for (const path of paths) {
      if (!finitePath(path)) {
        report({
          code: "fill-non-finite",
          message: `${pluginId} produced non-finite coordinates; the part was dropped`,
          plugin: pluginId,
        });
        continue;
      }
      total += path.length;
      if (total > maxOps) {
        report({
          code: "fill-max-ops",
          message: `${pluginId} exceeded ${maxOps} operations; the part was dropped`,
          plugin: pluginId,
        });
        continue;
      }
      const clip =
        part.kind === "area" && part.clipPath
          ? part.clipPath
          : part.clip === "region"
            ? regionPath
            : undefined;
      const opacity = part.kind === "area" ? part.paint?.alpha : undefined;
      const fillRule = part.kind === "area" ? part.fillRule : undefined;
      sets.push({
        type: part.kind === "area" ? "fillPath" : "fillSketch",
        ops: path,
        ...(clip ? { clip } : {}),
        ...(opacity !== undefined ? { opacity } : {}),
        ...(fillRule ? { fillRule } : {}),
      });
    }
  }
  return sets;
}

/** What `createFillStage` needs besides the plugin. */
export interface FillStageInit {
  readonly fill: ResolvedPlugin | undefined;
  readonly options: SketchOptions;
  readonly report: (d: Diagnostic) => void;
  readonly maxOps?: number;
}

/**
 * Builds the `FillStage` the core generator calls at Sketchy's draw-order point. It runs the
 * fill plugin with a context bound to the shape's shared random stream (stream `"shared"`) or a
 * forked substream (`"isolated"`), then maps its parts to operation sets.
 *
 * Without a plugin (an unregistered or unsupported style) the stage emits nothing and consumes
 * no random values.
 */
export function createFillStage(init: FillStageInit): FillStage {
  const { fill, options, report } = init;
  const maxOps = init.maxOps ?? DEFAULT_MAX_OPS;
  return {
    paintsArea: () => fill?.plugin.paints === "area",
    expandsSvgPath: () => fill?.plugin.id === "watercolor",
    run(spec: FillRegionSpec, ctx: RoughCtx): readonly OperationSet[] {
      if (!fill) return [];
      const plugin: AnyPlugin = fill.plugin;
      const rough = createRoughKit(ctx);
      const pluginCtx: PluginContext = {
        rng: plugin.stream === "shared" ? ctx.rng : ctx.rng.fork(`fill:${plugin.id}`),
        geom: createGeometryKit(rough),
        quality: "final",
        maxOps,
        warn: (code, message) => report({ code, message, plugin: plugin.id }),
      };
      const input: FillInput = {
        region: spec.kind === "svgPath" ? svgPathRegion(spec.d) : toFillRegion(spec),
        fill: {
          weight: effectiveFillWeight(options.strokeWidth, options.fillWeight),
          gap: computedHachureGap(options.strokeWidth, options.fillWeight, options.fillSpacing),
          angle: options.fillAngle,
          color: options.fillColor,
          opacity: options.fillOpacity,
          strokeWidth: options.strokeWidth,
          ...(options.scribbleTightnessPattern
            ? { pattern: options.scribbleTightnessPattern }
            : {}),
        },
      };
      const resolved = bridgeShapeOptions(
        plugin,
        fill.options,
        fill.explicit,
        options as unknown as Record<string, unknown>,
      );
      // Plugin `generate` is a plain function property (definePlugin), not a method using `this`.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const generate = plugin.generate as unknown as (
        i: FillInput,
        o: Record<string, unknown>,
        c: PluginContext,
      ) => readonly FillPart[];
      return partsToSets(
        generate(input, resolved, pluginCtx),
        plugin.id,
        maxOps,
        report,
        input.region.path,
      );
    },
  };
}

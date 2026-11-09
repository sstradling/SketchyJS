import { f, generateDrawing, type Shape } from "@sketchy-js/core";
import {
  defaultSketchOptions,
  effectiveFillWeight,
  resolveSketchOptions,
} from "@sketchy-js/core/options";
import type {
  Diagnostic,
  PluginUse,
  Scene,
  SceneNode,
  Size,
  SketchOptions,
} from "@sketchy-js/types";
import { assembleDrawing } from "./assemble.js";
import { PluginNotRegisteredError } from "./errors.js";
import { createFillStage } from "./fill-stage.js";
import type { ResolvedPlugin } from "./registry.js";

/** The slice of a registry the builder needs. `SketchyRegistry` implements it. */
export interface FillResolver {
  resolveSpec(kind: "fill", spec: unknown): ResolvedPlugin;
}

/** One shape with the options and fill specification in effect when it was drawn. */
export interface DrawItem {
  readonly shape: Shape;
  readonly options: Partial<SketchOptions>;
  /** A plugin object, `plugin.with(...)` reference, or `{ kind, ...options }` spec; overrides `fillStyle`. */
  readonly fill?: unknown;
}

/** Styles Sketchy's renderer paints itself; they are not generator fills in this phase. */
const RENDERER_STYLES: ReadonlySet<string> = new Set(["scribble", "watercolor"]);

/** Sketchy's `fillSpacingPattern`: one full pass per multiplier with growing fill weight. */
function spacingPasses(o: SketchOptions): SketchOptions[] {
  const pattern = o.fillSpacingPattern;
  if (!pattern || pattern.length === 0) return [o];
  const weight = effectiveFillWeight(o.strokeWidth, o.fillWeight);
  return pattern.map((multiplier, index) => ({
    ...o,
    fillSpacing: f(o.fillSpacing * multiplier),
    fillWeight: f(weight * f(1 + f(index * f(0.01)))),
  }));
}

/** True when the brush profile asks for rendering Phase 1 does not implement. */
function hasUnsupportedBrush(o: SketchOptions): boolean {
  const { cap: _cap, join: _join, ...rest } = o.brushProfile;
  const { cap: _dc, join: _dj, ...defaults } = defaultSketchOptions().brushProfile;
  return JSON.stringify(rest) !== JSON.stringify(defaults);
}

/** Resolves the fill plugin of an item, reporting (not throwing) for unavailable built-in styles. */
function resolveFill(
  resolver: FillResolver,
  item: DrawItem,
  o: SketchOptions,
  report: (d: Diagnostic) => void,
): ResolvedPlugin | undefined {
  if (item.fill !== undefined) return resolver.resolveSpec("fill", item.fill);
  try {
    return resolver.resolveSpec("fill", { kind: o.fillStyle });
  } catch (error) {
    if (!(error instanceof PluginNotRegisteredError)) throw error;
    const known = RENDERER_STYLES.has(o.fillStyle);
    report({
      code: known ? "fill-style-unsupported" : "fill-not-registered",
      message: known
        ? `fill style "${o.fillStyle}" is not available yet; no fill was drawn`
        : `fill style "${o.fillStyle}" is not registered; no fill was drawn`,
    });
    return undefined;
  }
}

/**
 * Builds a renderer-independent `Scene` from drawn shapes.
 *
 * Request flow: `RoughView.build(size)` or the functional `sketch()` -> here -> per item:
 * `resolveSketchOptions` -> `createFillStage` (fill plugin) -> core `generateDrawing`
 * (one seeded stream, Sketchy draw order) -> `assembleDrawing` (layers) -> scene node. A
 * `fillSpacingPattern` produces one node per pass, like Sketchy's repeated renders.
 *
 * @param resolver registry that resolves fill plugins
 * @param items shapes in paint order
 * @param size canvas size; SVG paths are fitted into it
 */
export function buildScene(resolver: FillResolver, items: readonly DrawItem[], size: Size): Scene {
  const nodes: SceneNode[] = [];
  const diagnostics: Diagnostic[] = [];
  const uses = new Map<string, PluginUse>();
  const seen = new Set<string>();
  const report = (d: Diagnostic): void => {
    const key = `${d.code}|${d.plugin ?? ""}|${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(d);
  };

  for (const item of items) {
    const base = resolveSketchOptions(item.options);
    if (hasUnsupportedBrush(base))
      report({
        code: "brush-unsupported",
        message: "brush profiles are not implemented yet; a plain stroke was drawn",
      });
    if (base.stickerBacking)
      report({
        code: "sticker-unsupported",
        message: "sticker backing is not implemented yet and was ignored",
      });
    const fill = resolveFill(resolver, item, base, report);
    if (fill)
      uses.set(fill.plugin.id, {
        id: fill.plugin.id,
        version: fill.plugin.version,
        api: fill.plugin.api,
      });
    for (const options of spacingPasses(base)) {
      const stage = createFillStage({ fill, options, report });
      const generated = generateDrawing(item.shape, options, stage);
      if (!generated) {
        report({
          code: "shape-empty",
          message: `${item.shape.kind} has no points and was skipped`,
        });
        continue;
      }
      nodes.push({ type: "drawing", drawing: assembleDrawing(generated, size) });
    }
  }
  return {
    version: 1,
    size,
    nodes,
    ...(uses.size > 0 ? { plugins: [...uses.values()] } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

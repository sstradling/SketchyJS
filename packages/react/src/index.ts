import {
  createElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { generateFrame, type VarianceConfig } from "@sketchy-js/animate";
import { sketch, type ViewOptions } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import type { Scene, Size } from "@sketchy-js/types";

type Shapes = Parameters<typeof sketch>[0];

/**
 * React bindings for a SketchyJS scene.
 *
 * This package renders SVG. It does not import the canvas renderer, so an app
 * can use React without Canvas. Stickers do not import this package.
 *
 * Request flow: `useSketch` calls `sketch` (the basic scene). `SketchySvg`
 * turns that scene into an SVG string and exposes it as an image to assistive
 * tech. Pass `label`. The paths themselves are not text.
 */

export interface SketchProps {
  readonly shapes: Shapes;
  readonly size: Size;
  readonly options?: ViewOptions;
  /** Accessible name. Required so the drawing is not an unlabeled image. */
  readonly label: string;
  readonly background?: string;
}

/** Stable key so two equal option objects share one scene. Bigints survive the encoding. */
export function sketchValueKey(value: unknown): string {
  const encoded = JSON.stringify(value, (_key: string, item: unknown): unknown =>
    typeof item === "bigint" ? `${item}n` : item,
  );
  return encoded ?? "";
}

/**
 * Builds a scene. The memo key is the value of `shapes`, `size`, and `options`,
 * not their object identity. A new options object with the same fields does not redraw.
 */
export function useSketch(shapes: Shapes, size: Size, options?: ViewOptions): Scene {
  const key = sketchValueKey({ shapes, size, options });
  // The dependency is `key`, the value of the arguments, so a new object with the same fields does not redraw.
  return useMemo(() => sketch(shapes, size, options), [key]);
}

/** Animation settings for `useSketchAnimation`. `intervalMs` defaults to Sketchy's medium speed. */
export interface SketchAnimationConfig extends VarianceConfig {
  intervalMs?: number;
}

/**
 * The current animation frame of `scene`. The frame advances on `intervalMs`.
 * Equal configs share the schedule; a new object with the same fields does not reset it.
 */
export function useSketchAnimation(scene: Scene, config: SketchAnimationConfig): Scene {
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const sceneKey = useMemo(() => sketchValueKey(scene), [scene]);
  const configKey = sketchValueKey({
    steps: config.steps,
    variance: config.variance,
    seed: config.seed,
  });
  const interval = config.intervalMs ?? 300;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    const steps = Math.max(2, config.steps);
    const id = setInterval(() => {
      setFrame((current) => (current + 1) % steps);
    }, interval);
    return () => clearInterval(id);
  }, [sceneKey, configKey, interval, config.steps]);
  return useMemo(
    () =>
      generateFrame(
        sceneRef.current,
        { steps: config.steps, variance: config.variance, seed: config.seed },
        frame,
      ),
    [sceneKey, configKey, frame, config.steps, config.variance, config.seed],
  );
}

/** Phase of an animated contour, in points. `elapsed` is seconds. */
export function useContourPhase(speed: number, running = true): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!running || typeof requestAnimationFrame !== "function") return undefined;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      setPhase(((now - start) / 1000) * speed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speed, running]);
  return phase;
}

/** Renders a scene as SVG. Canvas is a separate package the caller may use instead. */
export function SketchySvg({
  scene,
  label,
  background,
}: {
  scene: Scene;
  label: string;
  background?: string;
}): ReactElement {
  const reactId = useId();
  const idPrefix = `sk${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const svg = renderToSvgString(scene, {
    idPrefix,
    ...(background ? { background } : {}),
  });
  return createElement("div", {
    role: "img",
    "aria-label": label,
    dangerouslySetInnerHTML: { __html: svg },
  });
}

/** `useSketch` plus `SketchySvg`. */
export function Sketchy({ shapes, size, options, label, background }: SketchProps): ReactElement {
  const scene = useSketch(shapes, size, options);
  return createElement(SketchySvg, {
    scene,
    label,
    ...(background ? { background } : {}),
  });
}

export type { ViewOptions };

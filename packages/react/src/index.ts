import { createElement, useEffect, useMemo, useState, type ReactElement } from "react";
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

/** Builds a scene. Memoize `shapes`, `size`, and `options` to avoid redrawing. */
export function useSketch(shapes: Shapes, size: Size, options?: ViewOptions): Scene {
  return useMemo(() => sketch(shapes, size, options), [shapes, size, options]);
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
  const svg = renderToSvgString(scene, {
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

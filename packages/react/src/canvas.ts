import { createElement, useEffect, useRef, type ReactElement } from "react";
import { renderToCanvas, type Canvas2D } from "@sketchy-js/canvas-renderer";
import type { Scene } from "@sketchy-js/types";

/**
 * Canvas binding. Import this from `@sketchy-js/react/canvas`.
 *
 * The main React entry does not import the canvas renderer, so an app can use
 * `Sketchy` without Canvas. This file is the opt-in.
 *
 * Request flow: the effect reads a 2D context and calls `renderToCanvas`.
 */

export function SketchyCanvas({ scene, label }: { scene: Scene; label: string }): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!context) return;
    renderToCanvas(scene, context as unknown as Canvas2D);
  }, [scene]);
  return createElement("canvas", {
    ref,
    width: scene.size.width,
    height: scene.size.height,
    role: "img",
    "aria-label": label,
  });
}

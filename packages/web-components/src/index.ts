import { circle, ellipse, path, rectangle, type Shape } from "@sketchy-js/core";
import { sketch, type ViewOptions } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import type { Scene, Size } from "@sketchy-js/types";

/**
 * Custom elements that draw a seeded sketch as SVG.
 *
 * Registration is explicit: importing this module does not call
 * `customElements.define`. The element does not load the canvas renderer.
 *
 * Request flow: attributes -> `sceneFromAttributes` -> `sketch` -> SVG string
 * written into the element. Set `label` so the host can copy it to `aria-label`.
 */

export interface SketchAttributes {
  shape?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  diameter?: string;
  d?: string;
  seed?: string;
  fill?: string;
  label?: string;
}

/** Builds the scene an element would draw. Useful without a DOM. */
export function sceneFromAttributes(
  attrs: SketchAttributes,
  size: Size = { width: 200, height: 160 },
): Scene {
  const shape = shapeFrom(attrs);
  const options: ViewOptions = {
    ...(attrs.seed ? { seed: BigInt(attrs.seed) } : {}),
    ...(attrs.fill ? { fillStyle: attrs.fill as NonNullable<ViewOptions["fillStyle"]> } : {}),
  };
  return sketch(shape, size, options);
}

function shapeFrom(attrs: SketchAttributes): Shape {
  const n = (value: string | undefined, fallback: number): number => {
    const parsed = value === undefined ? fallback : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  if (attrs.shape === "circle") {
    return circle(n(attrs.x, 80), n(attrs.y, 80), n(attrs.diameter, 60));
  }
  if (attrs.shape === "ellipse") {
    return ellipse(n(attrs.x, 80), n(attrs.y, 80), n(attrs.width, 100), n(attrs.height, 60));
  }
  if (attrs.shape === "path" && attrs.d) return path(attrs.d);
  return rectangle(n(attrs.x, 20), n(attrs.y, 20), n(attrs.width, 120), n(attrs.height, 80));
}

type ElementHost = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  innerHTML: string;
};

/** Paints `host` from its attributes. Tests pass a fake element. */
export function paintSketchyElement(host: ElementHost, size?: Size): Scene {
  const read = (name: string): string | undefined => host.getAttribute(name) ?? undefined;
  const take = (name: string): { [key: string]: string } => {
    const value = read(name);
    return value === undefined ? {} : { [name]: value };
  };
  const scene = sceneFromAttributes(
    {
      ...take("shape"),
      ...take("x"),
      ...take("y"),
      ...take("width"),
      ...take("height"),
      ...take("diameter"),
      ...take("d"),
      ...take("seed"),
      ...take("fill"),
      ...take("label"),
    },
    size ?? {
      width: Number(read("canvas-width") ?? 200),
      height: Number(read("canvas-height") ?? 160),
    },
  );
  host.innerHTML = renderToSvgString(scene);
  const label = read("label");
  if (label) host.setAttribute("aria-label", label);
  host.setAttribute("role", "img");
  return scene;
}

interface CustomElementRegistryLike {
  get(name: string): unknown;
  define(name: string, constructor: CustomElementConstructor): void;
}

/**
 * Registers `<sketchy-shape>`. Call this once from the app.
 * `registry` defaults to the browser's `customElements`.
 */
export function registerSketchyElements(registry?: CustomElementRegistryLike): void {
  const target =
    registry ?? (globalThis as { customElements?: CustomElementRegistryLike }).customElements;
  if (!target) throw new Error("registerSketchyElements needs a CustomElementRegistry");
  if (target.get("sketchy-shape")) return;
  const SketchyShape = class extends HTMLElement {
    connectedCallback(): void {
      paintSketchyElement(this);
    }
  };
  target.define("sketchy-shape", SketchyShape);
}

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

/** Integer seed, or a clear error. An empty attribute means "use the default seed". */
export function seedFromAttribute(value: string | undefined): bigint | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`seed must be an integer, received ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

/** Builds the scene an element would draw. Useful without a DOM. */
export function sceneFromAttributes(
  attrs: SketchAttributes,
  size: Size = { width: 200, height: 160 },
): Scene {
  const shape = shapeFrom(attrs);
  const seed = seedFromAttribute(attrs.seed);
  const options: ViewOptions = {
    ...(seed !== undefined ? { seed } : {}),
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

/** Paints `host` from its attributes. `idPrefix` keeps clip ids unique per element. */
export function paintSketchyElement(host: ElementHost, size?: Size, idPrefix = "sk"): Scene {
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
  host.innerHTML = renderToSvgString(scene, { idPrefix });
  const label = read("label");
  if (label) host.setAttribute("aria-label", label);
  host.setAttribute("role", "img");
  return scene;
}

const OBSERVED = [
  "shape",
  "x",
  "y",
  "width",
  "height",
  "diameter",
  "d",
  "seed",
  "fill",
  "label",
  "canvas-width",
  "canvas-height",
] as const;

let nextElementId = 0;

interface CustomElementRegistryLike {
  get(name: string): unknown;
  /** `never` lets a happy-dom or jsdom registry satisfy this without a cast. */
  define(name: string, constructor: never): void;
}

/**
 * Registers a sketchy element. The default tag is `sketchy-shape`.
 * Importing this module does not register anything.
 *
 * `ElementBase` is the realm's `HTMLElement` (happy-dom and jsdom each have their own).
 */
type HostConstructor = new () => {
  isConnected: boolean;
  innerHTML: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

export function defineSketchyElement(
  tagName = "sketchy-shape",
  registry?: CustomElementRegistryLike,
  ElementBase?: HostConstructor,
): void {
  const discovered = globalThis.HTMLElement;
  const Base: HostConstructor | undefined =
    ElementBase ??
    (typeof discovered === "function" ? discovered : undefined);
  if (!Base) {
    throw new Error(
      "defineSketchyElement needs HTMLElement. In Node, pass the window's HTMLElement from happy-dom or jsdom.",
    );
  }
  const target =
    registry ?? (globalThis as { customElements?: CustomElementRegistryLike }).customElements;
  if (!target) throw new Error("defineSketchyElement needs a CustomElementRegistry");
  if (target.get(tagName)) return;
  const SketchyShape = class extends Base {
    static observedAttributes: readonly string[] = OBSERVED;
    readonly sketchyPrefix = `sk${++nextElementId}`;

    connectedCallback(): void {
      this.paint();
    }

    attributeChangedCallback(): void {
      if (this.isConnected) this.paint();
    }

    private paint(): void {
      try {
        paintSketchyElement(this, undefined, this.sketchyPrefix);
        this.removeAttribute("data-sketchy-error");
      } catch (error) {
        this.innerHTML = "";
        this.setAttribute(
          "data-sketchy-error",
          error instanceof Error ? error.message : "invalid attributes",
        );
      }
    }
  };
  target.define(tagName, SketchyShape as never);
}

/** Registers `<sketchy-shape>`. Call this once from the app. */
export function registerSketchyElements(
  registry?: CustomElementRegistryLike,
  ElementBase?: HostConstructor,
): void {
  defineSketchyElement("sketchy-shape", registry, ElementBase);
}

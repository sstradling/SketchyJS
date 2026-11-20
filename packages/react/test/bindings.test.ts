import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react-dom/test-utils";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { circle, rectangle } from "@sketchy-js/core";
import { pitShadow } from "@sketchy-js/scene";
import { sketch } from "@sketchy-js/scene/basic";
import { SketchyCanvas } from "../src/canvas.js";
import { Sketchy, sketchValueKey, useSketch, useSketchAnimation } from "../src/index.js";

const size = { width: 80, height: 60 };
const shape = rectangle(8, 8, 40, 30);

function installDom(): Window {
  const window = new Window();
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = window;
  globals.document = window.document;
  globals.HTMLElement = window.HTMLElement;
  globals.Node = window.Node;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  return window;
}

describe("React bindings", () => {
  it("paints SketchyCanvas through renderToCanvas", () => {
    const window = installDom();
    const calls: string[] = [];
    const proto = window.HTMLCanvasElement.prototype as unknown as {
      getContext: (this: HTMLCanvasElement) => unknown;
    };
    proto.getContext = function getContext(this: HTMLCanvasElement) {
      const context: Record<string, unknown> = { canvas: this };
      return new Proxy(context, {
        get(target, property) {
          if (property in target) return target[property as string];
          if (typeof property !== "string") return undefined;
          return (..._args: unknown[]) => {
            calls.push(property);
          };
        },
        set(target, property, value) {
          target[property as string] = value;
          return true;
        },
      });
    };
    const scene = sketch(shape, size, { seed: 4n, fillStyle: "hachure" });
    const root = createRoot(document.body);
    act(() => {
      root.render(createElement(SketchyCanvas, { scene, label: "canvas" }));
    });
    expect(calls, calls.join(",")).toEqual(expect.arrayContaining(["beginPath", "stroke"]));
    root.unmount();
  });

  it("gives two scenes on one page different SVG ids", () => {
    const options = {
      seed: 3n,
      fillStyle: "solid" as const,
      fillColor: [1, 1, 1, 1] as const,
      interiorShades: [pitShadow()],
    };
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(Sketchy, { shapes: circle(40, 40, 50), size, label: "one", options }),
        createElement(Sketchy, { shapes: circle(40, 40, 50), size, label: "two", options }),
      ),
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("memoizes useSketch on the option values", () => {
    const seen: unknown[] = [];
    function Probe({ options }: { options: { seed: bigint } }) {
      seen.push(useSketch(shape, size, options));
      return null;
    }
    installDom();
    const root = createRoot(document.body);
    act(() => {
      root.render(createElement(Probe, { options: { seed: 4n } }));
    });
    act(() => {
      root.render(createElement(Probe, { options: { seed: 4n } }));
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBe(seen[1]);
    root.unmount();
    expect(sketchValueKey({ seed: 4n })).toBe(sketchValueKey({ seed: 4n }));
    expect(sketchValueKey({ seed: 4n })).not.toBe(sketchValueKey({ seed: 5n }));
  });

  it("returns a different animation frame after the interval", async () => {
    const frames: string[] = [];
    function Probe() {
      const scene = useSketch(shape, size, { seed: 2n });
      const frame = useSketchAnimation(scene, {
        steps: 4,
        variance: 0.05,
        seed: 2n,
        intervalMs: 20,
      });
      frames.push(JSON.stringify(frame.nodes[0]));
      return null;
    }
    installDom();
    const root = createRoot(document.body);
    act(() => {
      root.render(createElement(Probe));
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    root.unmount();
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.some((frame) => frame !== frames[0])).toBe(true);
  });
});

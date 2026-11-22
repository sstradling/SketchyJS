import { createHash } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { rectangle } from "@sketchy-js/sketchy/core";
import { basicSketchy, sketch } from "@sketchy-js/sketchy/scene/basic";
import { buildStickerScene } from "@sketchy-js/sketchy/scene/stickers";
import { renderToSvgString } from "@sketchy-js/sketchy/svg";
import { renderToCanvas } from "@sketchy-js/sketchy/canvas";
import { Sketchy, useSketch, useSketchAnimation } from "@sketchy-js/react";
import { SketchyCanvas } from "@sketchy-js/react/canvas";
import { defineSketchyElement } from "@sketchy-js/sketchy/web-components";

/**
 * Seeded examples rendered from the packed tarballs. The smoke runner hashes
 * each string and compares it with tools/consumer-smoke/hashes.json.
 */

const shape = rectangle(10, 10, 40, 30);
const size = { width: 80, height: 60 };

const react = renderToStaticMarkup(
  createElement(Sketchy, {
    shapes: shape,
    size,
    label: "seeded rectangle",
    options: { seed: 7n, fillStyle: "hachure" },
  }),
);

const window = new Window();
defineSketchyElement("sketchy-shape", window.customElements, window.HTMLElement);
const element = window.document.createElement("sketchy-shape");
element.setAttribute("seed", "7");
element.setAttribute("shape", "rectangle");
window.document.body.appendChild(element);

const calls = [];
const context = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === "canvas") return { width: size.width, height: size.height };
      if (typeof property !== "string") return undefined;
      return (...args) => {
        calls.push([property, args]);
        return context;
      };
    },
    set(_target, property, value) {
      calls.push(["set", property, value]);
      return true;
    },
  },
);
renderToCanvas(sketch(shape, size, { seed: 7n, fillStyle: "hachure" }), context);

const sticker = buildStickerScene(
  basicSketchy,
  [
    {
      shape,
      options: {
        seed: 7n,
        fillStyle: "solid",
        fillColor: [0.2, 0.25, 0.3, 1],
        stickerBacking: { width: 6, smoothness: 1, edge: "smooth", color: [0.93, 0.9, 0.82, 1] },
      },
    },
  ],
  size,
);

globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
const canvasCalls = [];
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  const recording = { canvas: this };
  return new Proxy(recording, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property !== "string") return undefined;
      return () => {
        canvasCalls.push(property);
      };
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
};
const frames = [];
function Animated() {
  const scene = useSketch(shape, size, { seed: 7n, fillStyle: "hachure" });
  const frame = useSketchAnimation(scene, { steps: 4, variance: 0.05, seed: 7n, intervalMs: 1000 });
  frames.push(
    JSON.stringify(frame.nodes[0]?.drawing?.layers?.[0]?.paths?.[0]?.slice?.(0, 2) ?? null),
  );
  return createElement(SketchyCanvas, { scene, label: "canvas" });
}
const mount = window.document.createElement("div");
window.document.body.appendChild(mount);
const root = createRoot(mount);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 1;
try {
  await act(async () => {
    root.render(createElement(Animated));
  });
} finally {
  globalThis.setInterval = realSetInterval;
  root.unmount();
}
if (!canvasCalls.includes("fill") && !canvasCalls.includes("stroke")) {
  throw new Error("SketchyCanvas did not call renderToCanvas");
}

const hash = (text) => createHash("sha256").update(text).digest("hex");
const output = {
  react: hash(react),
  element: hash(element.innerHTML),
  canvas: hash(JSON.stringify(calls)),
  stickers: hash(renderToSvgString(sticker)),
  canvasComponent: hash(canvasCalls.join(",")),
  animation: hash(frames[0] ?? ""),
};
console.log(JSON.stringify(output));

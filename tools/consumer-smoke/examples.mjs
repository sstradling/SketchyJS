import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { rectangle } from "@sketchy-js/core";
import { basicSketchy, sketch } from "@sketchy-js/scene/basic";
import { buildStickerScene } from "@sketchy-js/scene/stickers";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import { renderToCanvas } from "@sketchy-js/canvas-renderer";
import { Sketchy } from "@sketchy-js/react";
import { defineSketchyElement } from "@sketchy-js/web-components";

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

const hash = (text) => createHash("sha256").update(text).digest("hex");
const output = {
  react: hash(react),
  element: hash(element.innerHTML),
  canvas: hash(JSON.stringify(calls)),
  stickers: hash(renderToSvgString(sticker)),
};
console.log(JSON.stringify(output));

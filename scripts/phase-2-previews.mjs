import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";
import { curve, linearPath, rectangle } from "../packages/core/dist/index.js";
import { basicSketchy, sketch } from "../packages/scene/dist/basic.js";
import { renderToSvgString } from "../packages/svg-renderer/dist/index.js";
import { renderToCanvas } from "../packages/canvas-renderer/dist/index.js";
import { crayon } from "../packages/brushes/dist/crayon.js";
import { watercolor, watercolorFill } from "../packages/brushes/dist/watercolor.js";
import { generateFrame } from "../packages/animate/dist/index.js";

const out = new URL("../docs/examples/phase-2/", import.meta.url);

mkdirSync(out, { recursive: true });

const size = { width: 220, height: 160 };
const scribble = sketch(rectangle(16, 16, 188, 128), size, {
  seed: 42n,
  fillStyle: "scribble",
  fillColor: "#1d4e89",
  strokeColor: "#1a1a1a",
  strokeWidth: 2,
});
const bevel = sketch(
  linearPath([
    { x: 24, y: 40 },
    { x: 90, y: 36 },
    { x: 80, y: 120 },
    { x: 190, y: 70 },
  ]),
  size,
  {
    seed: 3n,
    strokeWidth: 14,
    strokeColor: "#9a3412",
    fillColor: [0, 0, 0, 0],
    brushProfile: {
      tip: { roundness: 1, angle: 0, directionSensitive: false },
      thicknessProfile: { kind: "uniform" },
      cap: "round",
      join: { kind: "curvedBevel", bulge: 0.65 },
      opacityProfile: { kind: "uniform" },
    },
  },
);
const wax = basicSketchy
  .use(crayon)
  .view()
  .with({
    seed: 42n,
    strokeWidth: 10,
    strokeColor: "#7c2d12",
    fillColor: [0, 0, 0, 0],
    brushProfile: {
      tip: { roundness: 1, angle: 0, directionSensitive: false },
      thicknessProfile: { kind: "uniform" },
      cap: "round",
      join: "round",
      opacityProfile: { kind: "uniform" },
      crayon: {
        grain: 0.28,
        edgeRoughness: 0.75,
        widthVariation: 0.18,
        opacityVariation: 0.35,
        passes: 2,
        baseOpacity: 0.8,
        baseSoftness: 0.5,
        grit: 0.92,
        flakeSize: 1.45,
        seed: 1n,
      },
    },
  })
  .draw(
    curve([
      { x: 16, y: 140 },
      { x: 70, y: 30 },
      { x: 140, y: 140 },
      { x: 200, y: 40 },
    ]),
  )
  .build(size);

const washProfile = {
  tip: { roundness: 1, angle: 0, directionSensitive: false },
  thicknessProfile: { kind: "uniform" },
  cap: "round",
  join: "round",
  opacityProfile: { kind: "uniform" },
  watercolor: {
    pigment: 0.72,
    wetness: 0.6,
    edgeDarkening: 0.75,
    layers: 3,
    variation: 0.45,
    bleed: 0.5,
    seed: 1,
  },
};
const wash = basicSketchy
  .use(watercolor)
  .use(watercolorFill)
  .view()
  .with({
    seed: 42n,
    strokeWidth: 12,
    strokeColor: "#1e4d6b",
    fillStyle: "watercolor",
    fillColor: "#3d7ea6",
    brushProfile: washProfile,
  })
  .draw(rectangle(28, 28, 164, 104))
  .build(size);

const base = sketch(rectangle(30, 36, 150, 90), size, {
  seed: 42n,
  strokeWidth: 3,
  strokeColor: "#1e3a5f",
  fillColor: [0, 0, 0, 0],
});

const scenes = [
  ["scribble", scribble],
  ["curved-bevel", bevel],
  ["crayon", wax],
  ["watercolor", wash],
  ["animation-0", generateFrame(base, { steps: 4, variance: 0.05, seed: 42n }, 0)],
  ["animation-1", generateFrame(base, { steps: 4, variance: 0.05, seed: 42n }, 1)],
  ["animation-2", generateFrame(base, { steps: 4, variance: 0.05, seed: 42n }, 2)],
];

for (const [name, scene] of scenes) {
  const svg = renderToSvgString(scene, { background: "#f7f4ee" });
  writeFileSync(new URL(`${name}.svg`, out), svg);
  const svgPng = new Resvg(svg, { fitTo: { mode: "width", value: scene.size.width } })
    .render()
    .asPng();
  const canvas = createCanvas(scene.size.width, scene.size.height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f7f4ee";
  context.fillRect(0, 0, scene.size.width, scene.size.height);
  renderToCanvas(scene, context);
  const canvasPng = canvas.toBuffer("image/png");
  const { loadImage } = await import("@napi-rs/canvas");
  const left = await loadImage(svgPng);
  const right = await loadImage(canvasPng);
  const side = createCanvas(scene.size.width * 2 + 24, scene.size.height + 36);
  const g = side.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, side.width, side.height);
  g.fillStyle = "#222";
  g.font = "16px sans-serif";
  g.fillText("SVG", 8, 22);
  g.fillText("Canvas", scene.size.width + 32, 22);
  g.drawImage(left, 0, 36);
  g.drawImage(right, scene.size.width + 24, 36);
  writeFileSync(new URL(`${name}.png`, out), side.toBuffer("image/png"));
  console.log(name, scene.size.width, "svg", svg.length);
}

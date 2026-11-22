import { createCanvas } from "@napi-rs/canvas";
import { Worker } from "node:worker_threads";
import { rectangle } from "@sketchy-js/sketchy/core";
import { sketch } from "@sketchy-js/sketchy/scene/basic";
import { renderToCanvas } from "@sketchy-js/sketchy/canvas";

/**
 * Compares a dense scene drawn on the main thread with the same draw inside a
 * worker. OffscreenCanvas is the browser form of that split. This run uses
 * worker_threads because Node has no OffscreenCanvas. The result decides
 * whether a worker renderer ships in this phase.
 */

const size = { width: 640, height: 480 };
const shapes = [];
for (let y = 0; y < 6; y++) {
  for (let x = 0; x < 8; x++) {
    shapes.push(rectangle(16 + x * 76, 16 + y * 76, 64, 60));
  }
}
const scene = sketch(shapes, size, { seed: 42n, fillStyle: "hachure", fillSpacing: 2 });
const json = JSON.parse(
  JSON.stringify(scene, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
);

function draw(value) {
  const canvas = createCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  renderToCanvas(value, context);
  return canvas;
}

function time(fn, n) {
  const samples = [];
  for (let i = 0; i < n; i++) samples.push(fn());
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const options = { seed: 42n, fillStyle: "hachure", fillSpacing: 2 };
sketch(shapes, size, options);
const generationMs = time(() => {
  const start = globalThis.performance.now();
  sketch(shapes, size, options);
  return globalThis.performance.now() - start;
}, 8);

const paintCanvas = createCanvas(size.width, size.height);
const paintContext = paintCanvas.getContext("2d");
renderToCanvas(scene, paintContext);
const paintMs = time(() => {
  const start = globalThis.performance.now();
  renderToCanvas(scene, paintContext);
  return globalThis.performance.now() - start;
}, 8);

draw(scene);
const mainMs = time(() => {
  const start = globalThis.performance.now();
  draw(scene);
  return globalThis.performance.now() - start;
}, 8);

const workerUrl = new URL("./worker.mjs", import.meta.url);
const worker = new Worker(workerUrl, {
  workerData: { scene: json, width: size.width, height: size.height },
});
const workerMs = await new Promise((resolve, reject) => {
  worker.once("message", (message) => resolve(message.median));
  worker.once("error", reject);
});
await worker.terminate();

const benefit = mainMs - workerMs;
const result = {
  scene: "48 hachure rectangles, 640×480, seed 42, spacing 2",
  generationMedianMs: Number(generationMs.toFixed(2)),
  paintMedianMs: Number(paintMs.toFixed(2)),
  mainThreadMedianMs: Number(mainMs.toFixed(2)),
  workerMedianMs: Number(workerMs.toFixed(2)),
  workerFasterMs: Number(benefit.toFixed(2)),
  decision: benefit > mainMs * 0.2 ? "ship a worker renderer" : "defer OffscreenCanvas",
};
console.log(JSON.stringify(result, null, 2));

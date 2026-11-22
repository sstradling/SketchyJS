import { createCanvas } from "@napi-rs/canvas";
import { parentPort, workerData } from "node:worker_threads";
import { renderToCanvas } from "@sketchy-js/sketchy/canvas";

const { scene, width, height } = workerData;

function once() {
  const canvas = createCanvas(width, height);
  renderToCanvas(scene, canvas.getContext("2d"));
}

once();
const samples = [];
for (let i = 0; i < 8; i++) {
  const start = globalThis.performance.now();
  once();
  samples.push(globalThis.performance.now() - start);
}
samples.sort((a, b) => a - b);
parentPort.postMessage({ median: samples[Math.floor(samples.length / 2)] });

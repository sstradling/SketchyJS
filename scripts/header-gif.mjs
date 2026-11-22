import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { polygon, circle, line, roundedRectangle } from "../packages/sketchy/dist/core.js";
import { basicSketchy } from "../packages/sketchy/dist/scene/basic.js";
import { buildStickerScene } from "../packages/sketchy/dist/scene/stickers.js";
import { renderToCanvas } from "../packages/sketchy/dist/canvas.js";

/**
 * README wordmark. The leading S is a white paper sticker. The exclamation
 * mark boils by cycling seeds. Every other letter keeps its seed.
 *
 *   pnpm --filter @sketchy-js/sketchy build && node scripts/header-gif.mjs
 */

const width = 960;
const height = 240;
const cell = 15;
const letterW = 5 * cell;
const gap = 12;
const originX = 108;
const originY = 52;

const bitmaps = {
  S: ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00000", "00000", "00100"],
};

const letters = ["S", "K", "E", "T", "C", "H", "Y", "!"];

const looks = {
  S: {
    fillStyle: "hachure",
    fillColor: "#1d4e89",
    strokeColor: "#163a66",
    seed: 4n,
    sticker: true,
  },
  K: { fillStyle: "crossHatch", fillColor: "#b42318", strokeColor: "#7f1d1d", seed: 5n },
  E: { fillStyle: "hachure", fillColor: "#15803d", strokeColor: "#14532d", seed: 6n },
  T: { fillStyle: "dots", fillColor: "#6d28d9", strokeColor: "#4c1d95", seed: 8n },
  C: { fillStyle: "zigzag", fillColor: "#c2410c", strokeColor: "#9a3412", seed: 9n },
  H: { fillStyle: "zigzagLine", fillColor: "#0f766e", strokeColor: "#115e59", seed: 10n },
  Y: { fillStyle: "hachure", fillColor: "#be185d", strokeColor: "#9d174d", seed: 11n },
  "!": { fillStyle: "hachure", fillColor: "#a16207", strokeColor: "#854d0e", seed: 21n },
};

/** Seeds for the exclamation mark. The palindrome returns to the first frame. */
const boilSeeds = [21n, 22n, 23n, 24n, 25n, 24n, 23n, 22n];

const sticker = {
  width: 9,
  smoothness: 0.8,
  edge: "smooth",
  color: "#fffdf8",
  texture: { amount: 0.22, scale: 1.4, seed: 3n },
  shadow: { opacity: 0.16, x: 1.5, y: 2, radius: 2.5, color: "#4a433a" },
};

/** Closed rings around the ink cells of a bitmap. One ring per connected outline. */
function ringsFromBitmap(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const on = (x, y) => y >= 0 && x >= 0 && y < h && x < w && rows[y][x] === "1";
  const next = new Map();
  const add = (ax, ay, bx, by) => {
    const key = `${ax},${ay}`;
    const list = next.get(key) ?? [];
    list.push(`${bx},${by}`);
    next.set(key, list);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const rings = [];
  for (const start of next.keys()) {
    while ((next.get(start) ?? []).length > 0) {
      const ring = [];
      let cursor = start;
      for (let guard = 0; guard < w * h * 8; guard++) {
        const [x, y] = cursor.split(",").map(Number);
        ring.push({ x, y });
        const list = next.get(cursor);
        if (!list || list.length === 0) break;
        cursor = list.pop();
        if (cursor === start) break;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  return rings;
}

function place(ring, ox) {
  return ring.map((point) => ({ x: ox + point.x * cell, y: originY + point.y * cell }));
}

function letterShapes(glyph, ox) {
  return ringsFromBitmap(bitmaps[glyph]).map((ring) => polygon(place(ring, ox)));
}

function ink(glyph, seed) {
  const look = looks[glyph];
  return {
    fillStyle: look.fillStyle,
    fillColor: look.fillColor,
    strokeColor: look.strokeColor,
    strokeWidth: 2.4,
    fillWeight: 1.4,
    fillSpacing: glyph === "T" ? 5 : 3.5,
    roughness: 1.35,
    bowing: 0.9,
    seed,
    ...(look.sticker ? { stickerBacking: sticker } : {}),
  };
}

function backgroundItems() {
  const paper = {
    shape: roundedRectangle(16, 14, width - 32, height - 28, 18),
    options: {
      seed: 1n,
      roughness: 0.6,
      bowing: 0.4,
      strokeWidth: 2.2,
      strokeColor: "#2b2b2b",
      fillStyle: "solid",
      fillColor: "#f6f1e4",
    },
  };
  const rules = [];
  for (let y = 46; y < height - 30; y += 22) {
    rules.push({
      shape: line(36, y, width - 36, y),
      options: {
        seed: 2n,
        roughness: 0.35,
        bowing: 0.2,
        strokeWidth: 1.1,
        strokeColor: "#b7cbe6",
        fillStyle: "solid",
        fillColor: [0, 0, 0, 0],
        fillOpacity: 0,
      },
    });
  }
  const margin = {
    shape: line(78, 28, 78, height - 28),
    options: {
      seed: 2n,
      roughness: 0.4,
      strokeWidth: 1.4,
      strokeColor: "#e07a7a",
      fillStyle: "solid",
      fillColor: [0, 0, 0, 0],
      fillOpacity: 0,
    },
  };
  const hole = (y, seed) => ({
    shape: circle(48, y, 16),
    options: {
      seed,
      roughness: 0.5,
      strokeWidth: 1.2,
      strokeColor: "#c4b8a8",
      fillStyle: "solid",
      fillColor: "#fffdf8",
    },
  });
  return [paper, ...rules, margin, hole(78, 2n), hole(168, 3n)];
}

function sceneFor(bangSeed) {
  const items = backgroundItems();
  letters.forEach((glyph, index) => {
    const ox = originX + index * (letterW + gap);
    const seed = glyph === "!" ? bangSeed : looks[glyph].seed;
    const options = ink(glyph, seed);
    for (const shape of letterShapes(glyph, ox)) items.push({ shape, options });
  });
  return buildStickerScene(basicSketchy, items, { width, height });
}

function render(scene) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  renderToCanvas(scene, context, { background: "#f6f1e4" });
  return context.getImageData(0, 0, width, height).data;
}

function paletteFrom(frames) {
  const counts = new Map();
  for (const data of frames) {
    for (let i = 0; i < data.length; i += 16) {
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 255);
  const colors = ranked.map(([key]) => [(key >> 10) << 3, ((key >> 5) & 31) << 3, (key & 31) << 3]);
  const bucket = new Uint8Array(32768);
  bucket.fill(255);
  for (let index = 0; index < colors.length; index++) {
    const [r, g, b] = colors[index];
    bucket[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)] = index;
  }
  for (let key = 0; key < bucket.length; key++) {
    if (bucket[key] !== 255) continue;
    const r = (key >> 10) << 3;
    const g = ((key >> 5) & 31) << 3;
    const b = (key & 31) << 3;
    let best = 0;
    let bestD = Infinity;
    for (let index = 0; index < colors.length; index++) {
      const color = colors[index];
      const d = (color[0] - r) ** 2 + (color[1] - g) ** 2 + (color[2] - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = index;
      }
    }
    bucket[key] = best;
  }
  return { colors, bucket };
}

function indexFrame(data, bucket) {
  const out = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = bucket[((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)];
  }
  return out;
}

function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map();
  const reset = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    next = eoi + 1;
  };
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  const emit = (code) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(buffer & 255);
      buffer >>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const key = `${prefix},${indices[i]}`;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      reset();
    } else {
      dict.set(key, next);
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
      next++;
    }
    prefix = indices[i];
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) bytes.push(buffer & 255);
  return bytes;
}

function subBlocks(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    parts.push(chunk.length, ...chunk);
  }
  parts.push(0);
  return parts;
}

function gif(frames, colors) {
  const minCodeSize = 8;
  const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
  const screen = [width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255, 0xf7, 0, 0];
  const table = [];
  for (let i = 0; i < 256; i++) {
    const color = colors[i] ?? [0, 0, 0];
    table.push(color[0], color[1], color[2]);
  }
  const loop = [
    0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01,
    0x00, 0x00, 0x00,
  ];
  const images = [];
  for (const indices of frames) {
    images.push(
      0x21,
      0xf9,
      0x04,
      0x04,
      12,
      0,
      0,
      0,
      0x2c,
      0,
      0,
      0,
      0,
      width & 255,
      (width >> 8) & 255,
      height & 255,
      (height >> 8) & 255,
      0,
      minCodeSize,
      ...subBlocks(lzw(indices, minCodeSize)),
    );
  }
  return Uint8Array.from([header, screen, table, loop, images, [0x3b]].flat(Infinity));
}

const rendered = boilSeeds.map((seed) => render(sceneFor(seed)));
const column = (index) => originX + index * (letterW + gap);
const hashColumn = (data, x0) => {
  let hash = 0;
  const x1 = Math.min(width, x0 + letterW);
  for (let y = 0; y < height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      hash = (Math.imul(hash, 33) + data[i] + data[i + 1] + data[i + 2]) >>> 0;
    }
  }
  return hash;
};
if (hashColumn(rendered[0], column(0)) !== hashColumn(rendered[2], column(0)))
  throw new Error("the sticker S changed between boil frames");
for (const index of [1, 2, 3, 4, 5, 6]) {
  if (hashColumn(rendered[0], column(index)) !== hashColumn(rendered[2], column(index)))
    throw new Error(`letter ${letters[index]} changed between boil frames`);
}
if (hashColumn(rendered[0], column(7)) === hashColumn(rendered[2], column(7)))
  throw new Error("the exclamation mark did not boil");
const { colors, bucket } = paletteFrom(rendered);
const encoded = gif(
  rendered.map((frame) => indexFrame(frame, bucket)),
  colors,
);
const out = new URL("../docs/images/header.gif", import.meta.url);
mkdirSync(new URL("../docs/images/", import.meta.url), { recursive: true });
writeFileSync(out, encoded);
const still = createCanvas(width, height);
renderToCanvas(sceneFor(boilSeeds[0]), still.getContext("2d"), { background: "#f6f1e4" });
writeFileSync("/tmp/sketchyjs-header-still.png", still.toBuffer("image/png"));
console.log(
  `wrote ${out.pathname} ${encoded.length} bytes, ${width}x${height}, ${boilSeeds.length} frames`,
);

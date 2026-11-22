import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { createCanvas, ImageData, loadImage } from "@napi-rs/canvas";
import opentype from "opentype.js";
import { path as svgPath } from "../packages/sketchy/dist/core.js";
import { RoughView } from "../packages/sketchy/dist/scene/basic.js";
import { SketchGroup, SketchPart } from "../packages/sketchy/dist/scene/stickers.js";
import { renderToCanvas } from "../packages/sketchy/dist/canvas.js";

/**
 * README wordmark. Parameters match Sketchy's scripts/readme-header/render.mjs
 * (Bungee at 112px, the notebook card, and each letter's fill). Two changes:
 * the S is one white paper sticker, and the exclamation mark boils by seed.
 *
 *   pnpm --filter @sketchy-js/sketchy build && node scripts/header-gif.mjs
 *
 * Bungee is SIL Open Font License 1.1. See scripts/fonts/OFL.txt. The font is
 * only an input to this script. It is not shipped in either package.
 */

const W = 800;
const H = 200;
const CARD = { x: 10, y: 8, w: 780, h: 180, r: 14 };
const FONT_SIZE = 112;
const CAP = FONT_SIZE * 0.72;
const LINE_GAP = CAP / 4;
const BASELINE = 140;
const FIRST_LINE = BASELINE - LINE_GAP * Math.floor((BASELINE - CARD.y - 14) / LINE_GAP);
const MARGIN_X = 72;
const TRACKING = 9;
const SUPERSAMPLE = 4;
const OUT_W = W * 2;
const OUT_H = H * 2;

/**
 * rough.js hachureAngle 90 draws horizontal lines, which is SketchyJS
 * fillAngle 0. hachureGap is a pixel gap; fillSpacing is that gap divided
 * by the fill weight.
 */
const styles = {
  S: {
    stroke: "#132358",
    fill: "#1f3a93",
    fillStyle: "hachure",
    hachureAngle: -41,
    hachureGap: 5,
    fillWeight: 1.6,
    roughness: 1.4,
    strokeWidth: 2.4,
    bowing: 1,
  },
  k: {
    stroke: "#73221a",
    fill: "#c0392b",
    fillStyle: "crossHatch",
    hachureAngle: -30,
    hachureGap: 8.5,
    fillWeight: 1.2,
    roughness: 2.2,
    strokeWidth: 3,
    bowing: 4,
  },
  e: {
    stroke: "#12492a",
    fill: "#1e7a46",
    fillStyle: "zigzag",
    hachureAngle: 45,
    hachureGap: 7,
    fillWeight: 1.3,
    roughness: 1.2,
    strokeWidth: 2,
    bowing: 1,
  },
  t: {
    stroke: "#411f4f",
    fill: "#6c3483",
    fillStyle: "dots",
    hachureGap: 6.5,
    fillWeight: 2.2,
    roughness: 1,
    strokeWidth: 2.2,
    bowing: 0.5,
  },
  c: {
    stroke: "#7f3200",
    fill: "#d35400",
    fillStyle: "dashed",
    hachureAngle: 30,
    hachureGap: 6,
    fillWeight: 1.6,
    dashOffset: 8,
    dashGap: 5,
    roughness: 0.6,
    strokeWidth: 2.6,
    bowing: 0.5,
  },
  h: {
    stroke: "#0a4953",
    fill: "#117a8b",
    fillStyle: "zigzagLine",
    hachureAngle: 0,
    hachureGap: 8,
    zigzagOffset: 4,
    fillWeight: 1.2,
    roughness: 1.6,
    strokeWidth: 1.6,
    bowing: 2,
  },
  y: {
    stroke: "#7b1e3a",
    fill: "#e8a0b4",
    fillStyle: "solid",
    roughness: 1.7,
    strokeWidth: 2.8,
    bowing: 3,
  },
  "!": {
    stroke: "#6e5907",
    fill: "#b7950b",
    fillStyle: "hachure",
    fillAngle: 0,
    // Gap is fillWeight * fillSpacing. 1.8 * 1.8 ≈ 3.2px, the reference stem's band pitch.
    fillSpacing: 1.8,
    fillWeight: 1.8,
    roughness: 1.8,
    strokeWidth: 2.2,
    bowing: 2,
  },
};

const word = "Sketchy!";
const sticker = {
  width: 8,
  smoothness: 1,
  edge: "smooth",
  color: "#ffffff",
  shadow: { opacity: 0.7, x: 1, y: 5, radius: 16, color: "#000000" },
};
const bangSeeds = [1414n, 1616n, 1818n, 2019n, 1818n, 1616n];

const font = opentype.parse(readFileSync(new URL("./fonts/Bungee-Regular.ttf", import.meta.url)));

/** Closed SVG path. opentype.js omits Z; an open contour becomes a sticker ribbon. */
function glyphPath(commands) {
  let d = "";
  let open = false;
  const close = () => {
    if (!open) return;
    d += "Z";
    open = false;
  };
  for (const command of commands) {
    if (command.type === "M") {
      close();
      d += `M${command.x} ${command.y}`;
      open = true;
    } else if (command.type === "L") d += `L${command.x} ${command.y}`;
    else if (command.type === "Q") d += `Q${command.x1} ${command.y1} ${command.x} ${command.y}`;
    else if (command.type === "C")
      d += `C${command.x1} ${command.y1} ${command.x2} ${command.y2} ${command.x} ${command.y}`;
    else if (command.type === "Z") close();
  }
  close();
  return d;
}

function placedGlyphs() {
  const scale = FONT_SIZE / font.unitsPerEm;
  const glyphs = [...word].map((ch) => ({ ch, glyph: font.charToGlyph(ch) }));
  const total = glyphs.reduce(
    (sum, { glyph }) => sum + glyph.advanceWidth * scale + TRACKING,
    -TRACKING,
  );
  const areaL = MARGIN_X + 10;
  const areaR = CARD.x + CARD.w - 14;
  let x = areaL + (areaR - areaL - total) / 2;
  return glyphs.map(({ ch, glyph }) => {
    const at = x;
    // Horizontal hachure loses lines once the shape sits a few hundred points
    // from the origin. The bang is drawn there and the part is moved into place.
    const local = ch === "!";
    const commands = glyph.getPath(local ? 0 : x, local ? 0 : BASELINE, FONT_SIZE).commands;
    const contours = commands.filter((command) => command.type === "M").length;
    x += glyph.advanceWidth * scale + TRACKING;
    return { ch, d: glyphPath(commands), contours, at, local };
  });
}

function viewOptions(style, seed, withSticker) {
  const gap = style.hachureGap ?? style.fillWeight * 4;
  return {
    seed,
    roughness: style.roughness,
    bowing: style.bowing,
    strokeColor: style.stroke,
    strokeWidth: style.strokeWidth,
    fillStyle: style.fillStyle,
    fillColor: style.fill,
    fillWeight: style.fillWeight,
    fillSpacing: style.fillSpacing ?? gap / style.fillWeight,
    fillAngle: style.fillAngle ?? (style.hachureAngle ?? 0) - 90,
    ...(style.dashOffset !== undefined ? { dashOffset: style.dashOffset } : {}),
    ...(style.dashGap !== undefined ? { dashGap: style.dashGap } : {}),
    ...(style.zigzagOffset !== undefined ? { zigzagOffset: style.zigzagOffset } : {}),
    ...(style.fillStyle === "solid" ? { roughness: style.roughness } : {}),
    ...(withSticker ? { stickerBacking: sticker } : {}),
  };
}

function letterScene(bangSeed) {
  const glyphs = placedGlyphs();
  let seed = 7;
  const parts = glyphs.map(({ ch, d, contours, at, local }) => {
    const style = styles[ch];
    const letterSeed = ch === "!" ? bangSeed : BigInt(seed * 101);
    seed += 1;
    if (ch === "S" && contours !== 1)
      throw new Error(`S has ${contours} contours; the sticker needs one closed outline`);
    const view = new RoughView().with(viewOptions(style, letterSeed, ch === "S")).draw(svgPath(d));
    const part = new SketchPart(view);
    return local ? part.offset(at, BASELINE) : part;
  });
  const scene = new SketchGroup(parts).build({ width: W, height: H });
  keepOneStickerSheet(scene);
  return scene;
}

/** The rough outline is drawn twice. Keep the larger paper shape and drop a retrace. */
function keepOneStickerSheet(scene) {
  for (const node of scene.nodes) {
    if (node.type !== "drawing") continue;
    const sheets = node.drawing.layers.filter(
      (layer) => layer.role === "sheet" && !layer.strokeWidth,
    );
    if (sheets.length === 0) continue;
    const sized = sheets.map((layer) => ({ layer, area: pathArea(layer.paths[0]) }));
    const biggest = Math.max(...sized.map((item) => item.area));
    if (sized.some((item) => item.area < biggest * 0.8))
      throw new Error("S sticker has a fragment that is not the glyph outline");
    const keep = sized.find((item) => item.area === biggest)?.layer;
    const layers = node.drawing.layers;
    const keepAt = layers.indexOf(keep);
    const kept = layers.filter((layer, index) => {
      if (layer.role !== "sheet" && layer.role !== "sheet-shadow") return true;
      if (layer.strokeWidth) return false;
      if (layer === keep) return true;
      return layer.role === "sheet-shadow" && index === keepAt - 1;
    });
    if (keep) {
      // Bungee's notch is narrower than the margin, so a geometric offset
      // fills the counter. A round stroke keeps one shape and an 8pt margin.
      const margin = sticker.width * 2;
      const rim = 1.6;
      const at = kept.indexOf(keep);
      kept.splice(at, 0, {
        role: "stroke",
        paths: keep.paths,
        fillRule: "nonzero",
        paint: { kind: "solid", color: "#3f3a34" },
        strokeWidth: margin + rim * 2,
        cap: "round",
        join: "round",
      });
      kept.push({
        role: "stroke",
        paths: keep.paths,
        fillRule: "nonzero",
        paint: { kind: "solid", color: sticker.color },
        strokeWidth: margin,
        cap: "round",
        join: "round",
      });
    }
    node.drawing.layers = kept;
  }
}

function pathArea(ops) {
  if (!ops) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    for (const key of ["x", "y", "c1x", "c1y", "c2x", "c2y", "cx", "cy"]) {
      if (typeof op[key] !== "number") continue;
      if (key.endsWith("x")) {
        minX = Math.min(minX, op[key]);
        maxX = Math.max(maxX, op[key]);
      } else {
        minY = Math.min(minY, op[key]);
        maxY = Math.max(maxY, op[key]);
      }
    }
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(ctx) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2.5;
  ctx.shadowBlur = 3;
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
  ctx.fillStyle = "#fdf9ee";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
  ctx.clip();
  ctx.strokeStyle = "#9cc3e6";
  ctx.lineWidth = 1;
  for (let y = FIRST_LINE; y < CARD.y + CARD.h - 6; y += LINE_GAP) {
    ctx.beginPath();
    ctx.moveTo(CARD.x, y);
    ctx.lineTo(CARD.x + CARD.w, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.strokeStyle = "#e57373";
  ctx.lineWidth = 1.4;
  ctx.moveTo(MARGIN_X, CARD.y);
  ctx.lineTo(MARGIN_X, CARD.y + CARD.h);
  ctx.stroke();
  ctx.beginPath();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 0.7;
  ctx.moveTo(MARGIN_X + 4, CARD.y);
  ctx.lineTo(MARGIN_X + 4, CARD.y + CARD.h);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const fraction of [0.3, 0.7]) {
    ctx.beginPath();
    ctx.arc(CARD.x + 30, CARD.y + CARD.h * fraction, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#efe8d6";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ddd3bb";
    ctx.stroke();
  }
  ctx.restore();
}

function raster(bangSeed) {
  const big = createCanvas(W * SUPERSAMPLE, H * SUPERSAMPLE);
  const ctx = big.getContext("2d");
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
  drawCard(ctx);
  renderToCanvas(letterScene(bangSeed), ctx);
  const out = createCanvas(OUT_W, OUT_H);
  const paint = out.getContext("2d");
  paint.imageSmoothingEnabled = true;
  paint.imageSmoothingQuality = "high";
  paint.drawImage(big, 0, 0, OUT_W, OUT_H);
  return unpremultiply(paint.getImageData(0, 0, OUT_W, OUT_H).data);
}

/** Downscaling blends edge pixels with transparent black. Divide the color back out. */
function unpremultiply(data) {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    out[i + 3] = alpha;
    if (alpha === 0) continue;
    out[i] = Math.min(255, Math.round((data[i] * 255) / alpha));
    out[i + 1] = Math.min(255, Math.round((data[i + 1] * 255) / alpha));
    out[i + 2] = Math.min(255, Math.round((data[i + 2] * 255) / alpha));
  }
  return out;
}

function medianCut(samples, count) {
  let boxes = [samples];
  while (boxes.length < count) {
    boxes.sort((a, b) => range(b) - range(a));
    const box = boxes.shift();
    if (!box || box.length < 2) {
      if (box) boxes.push(box);
      break;
    }
    const channel = widest(box);
    box.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(box.length / 2);
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const color of box) {
      sum[0] += color[0];
      sum[1] += color[1];
      sum[2] += color[2];
    }
    return [
      Math.round(sum[0] / box.length),
      Math.round(sum[1] / box.length),
      Math.round(sum[2] / box.length),
    ];
  });
}

function range(box) {
  let best = 0;
  for (let channel = 0; channel < 3; channel++) {
    let lo = 255;
    let hi = 0;
    for (const color of box) {
      lo = Math.min(lo, color[channel]);
      hi = Math.max(hi, color[channel]);
    }
    best = Math.max(best, hi - lo);
  }
  return best;
}

function widest(box) {
  let best = 0;
  let channel = 0;
  for (let index = 0; index < 3; index++) {
    let lo = 255;
    let hi = 0;
    for (const color of box) {
      lo = Math.min(lo, color[index]);
      hi = Math.max(hi, color[index]);
    }
    if (hi - lo > best) {
      best = hi - lo;
      channel = index;
    }
  }
  return channel;
}

function nearest(palette, r, g, b, start = 0) {
  let best = start;
  let bestD = Infinity;
  for (let index = start; index < palette.length; index++) {
    const color = palette[index];
    const d = (color[0] - r) ** 2 + (color[1] - g) ** 2 + (color[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = index;
    }
  }
  return best;
}

function dither(data, palette) {
  const px = new Float32Array(data.length);
  px.set(data);
  const out = new Uint8Array(OUT_W * OUT_H);
  const spill = (x, y, er, eg, eb, amount) => {
    if (x < 0 || y < 0 || x >= OUT_W || y >= OUT_H) return;
    if (data[(y * OUT_W + x) * 4 + 3] < 128) return;
    const i = (y * OUT_W + x) * 4;
    px[i] += er * amount;
    px[i + 1] += eg * amount;
    px[i + 2] += eb * amount;
  };
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const i = (y * OUT_W + x) * 4;
      if (data[i + 3] < 128) {
        out[y * OUT_W + x] = 0;
        continue;
      }
      const r = Math.max(0, Math.min(255, px[i]));
      const g = Math.max(0, Math.min(255, px[i + 1]));
      const b = Math.max(0, Math.min(255, px[i + 2]));
      const index = nearest(palette, r, g, b, 1);
      out[y * OUT_W + x] = index;
      const color = palette[index];
      spill(x + 1, y, r - color[0], g - color[1], b - color[2], 7 / 16);
      spill(x - 1, y + 1, r - color[0], g - color[1], b - color[2], 3 / 16);
      spill(x, y + 1, r - color[0], g - color[1], b - color[2], 5 / 16);
      spill(x + 1, y + 1, r - color[0], g - color[1], b - color[2], 1 / 16);
    }
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
      if (next === 1 << codeSize && codeSize < 12) codeSize += 1;
      next += 1;
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
  const screen = [OUT_W & 255, (OUT_W >> 8) & 255, OUT_H & 255, (OUT_H >> 8) & 255, 0xf7, 0, 0];
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
      0x09,
      10,
      0,
      0,
      0,
      0x2c,
      0,
      0,
      0,
      0,
      OUT_W & 255,
      (OUT_W >> 8) & 255,
      OUT_H & 255,
      (OUT_H >> 8) & 255,
      0,
      minCodeSize,
      ...subBlocks(lzw(indices, minCodeSize)),
    );
  }
  return Uint8Array.from([header, screen, table, loop, images, [0x3b]].flat(Infinity));
}

function hashColumn(data, x0, x1) {
  let hash = 0;
  for (let y = 40; y < OUT_H - 20; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * OUT_W + x) * 4;
      hash = (Math.imul(hash, 33) + data[i] + data[i + 1] + data[i + 2]) >>> 0;
    }
  }
  return hash;
}

const rendered = bangSeeds.map((seed) => raster(seed));
if (rendered[0][3] !== 0) throw new Error("the GIF corner is not transparent");
const sBox = [Math.round(OUT_W * 0.12), Math.round(OUT_W * 0.24)];
const bangBox = [Math.round(OUT_W * 0.78), Math.round(OUT_W * 0.9)];
if (hashColumn(rendered[0], sBox[0], sBox[1]) !== hashColumn(rendered[2], sBox[0], sBox[1]))
  throw new Error("the sticker S changed between boil frames");
if (
  hashColumn(rendered[0], bangBox[0], bangBox[1]) ===
  hashColumn(rendered[2], bangBox[0], bangBox[1])
)
  throw new Error("the exclamation mark did not boil");

const samples = [];
for (const data of rendered) {
  for (let i = 0; i < data.length; i += 48) {
    if (data[i + 3] < 128) continue;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }
}
const palette = [[0, 0, 0], ...medianCut(samples, 127)];
while (palette.length < 256) palette.push(palette[palette.length - 1] ?? [0, 0, 0]);
const encoded = gif(
  rendered.map((frame) => dither(frame, palette)),
  palette,
);

const gifUrl = new URL("../docs/images/header.gif", import.meta.url);
mkdirSync(new URL("../docs/images/", import.meta.url), { recursive: true });
writeFileSync(gifUrl, encoded);

const still = createCanvas(OUT_W, OUT_H);
still
  .getContext("2d")
  .putImageData(new ImageData(new Uint8ClampedArray(rendered[0]), OUT_W, OUT_H), 0, 0);
const reference = await loadImage(
  await download(
    "https://raw.githubusercontent.com/sstradling/Sketchy/master/docs/images/header.png",
  ),
);
function comparisonRow(background) {
  const row = createCanvas(reference.width + OUT_W + 24, Math.max(reference.height, OUT_H));
  const paint = row.getContext("2d");
  paint.fillStyle = background;
  paint.fillRect(0, 0, row.width, row.height);
  paint.drawImage(reference, 0, 0);
  paint.drawImage(still, reference.width + 24, 0);
  return row;
}
const light = comparisonRow("#ffffff");
const dark = comparisonRow("#0d1117");
const side = createCanvas(light.width, light.height + dark.height + 16);
const ctx = side.getContext("2d");
ctx.fillStyle = "#808080";
ctx.fillRect(0, 0, side.width, side.height);
ctx.drawImage(light, 0, 0);
ctx.drawImage(dark, 0, light.height + 16);
const artifacts = "/opt/cursor/artifacts";
mkdirSync(artifacts, { recursive: true });
writeFileSync(`${artifacts}/header-side-by-side.png`, side.toBuffer("image/png"));
writeFileSync(`${artifacts}/header.gif`, encoded);
console.log(
  `wrote ${gifUrl.pathname} ${encoded.length} bytes, ${OUT_W}x${OUT_H}, ${bangSeeds.length} frames`,
);

function download(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve, reject);
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

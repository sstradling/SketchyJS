import { build } from "esbuild";
import { TextDecoder } from "node:util";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = (file) => `${root}packages/sketchy/dist/${file}`;

/**
 * Entry points measured. `budget` is a gzip ceiling in KB: the check fails only when an entry
 * is over its ceiling. The basic SVG scene ceiling is 42 KB. Being under a ceiling is success.
 */
const entries = [
  {
    name: "basic SVG scene (scene/basic + svg-renderer)",
    code: `import { sketch } from "@sketchy-js/sketchy/scene/basic";
import { renderToSvgString } from "@sketchy-js/sketchy/svg";
import { rectangle } from "@sketchy-js/sketchy/core";
export const out = renderToSvgString(sketch(rectangle(0, 0, 10, 10), { width: 10, height: 10 }));`,
    ceiling: 42,
    forbid: ["clipper2", "renderToCanvas"],
  },
  {
    name: "core: all shapes, outlines, SVG parser (plan 12-18 KB)",
    code: `export * from "@sketchy-js/sketchy/core";`,
    ceiling: 18,
    forbid: ["clipper2", "renderToCanvas", "renderToSvg"],
  },
  {
    name: "fills: basic built-ins, contour and wash excluded",
    code: `export { builtinFills } from "@sketchy-js/sketchy/fills";`,
    ceiling: 16,
  },
  {
    name: "scene/basic only",
    code: `export { sketch } from "@sketchy-js/sketchy/scene/basic";`,
  },
  {
    name: "svg-renderer only (plan 5-9 KB)",
    code: `export { renderToSvgString, renderToSvgElement } from "@sketchy-js/sketchy/svg";`,
    ceiling: 9,
  },
  {
    name: "one fill plugin (hachure)",
    code: `export { hachure } from "@sketchy-js/sketchy/fills/hachure";`,
  },
  {
    name: "canvas-renderer (plan ceiling 12 KB)",
    code: `export { renderToCanvas } from "@sketchy-js/sketchy/canvas";`,
    ceiling: 12,
  },
  {
    name: "brushes entry (plan ceiling 20 KB)",
    code: `export { crayon, watercolor, watercolorFill } from "@sketchy-js/sketchy/brushes";`,
    ceiling: 20,
  },
  {
    name: "animate (frame generator)",
    code: `export { generateFrame, precomputeFrames } from "@sketchy-js/sketchy/animate";`,
  },
  {
    name: "animate controller (createAnimation)",
    code: `export { createAnimation } from "@sketchy-js/sketchy/animate";`,
  },
  {
    name: "brushes/crayon subpath",
    code: `export { crayon } from "@sketchy-js/sketchy/brushes/crayon";`,
  },
  {
    name: "stickers entry (sheet, edges, paper, group union)",
    code: `export { stickerCommands, stickerLayers, paper, smoothEdge, groupCommands } from "@sketchy-js/sketchy/stickers";`,
    ceiling: 18,
  },
  {
    name: "stickers/image (experimental placement)",
    code: `export { resolveImagePlacement } from "@sketchy-js/sketchy/stickers/image";`,
  },
  {
    name: "sticker scene (scene/stickers + sheets + image)",
    code: `export { SketchGroup, buildStickerScene } from "@sketchy-js/sketchy/scene/stickers";`,
    ceiling: 65,
  },
  {
    name: "stickers/clipper adapter",
    code: `export { clipperBackend } from "@sketchy-js/sketchy/stickers/clipper";`,
    ceiling: 22,
  },
  {
    name: "fills/contour",
    code: `export { contour } from "@sketchy-js/sketchy/fills/contour";`,
    ceiling: 8,
  },
  {
    name: "fills/wash",
    code: `export { wash } from "@sketchy-js/sketchy/fills/wash";`,
    ceiling: 8,
  },
  {
    name: "react (SVG scene, no canvas)",
    code: `export { Sketchy, useSketch } from "@sketchy-js/react";`,
    ceiling: 42,
  },
  {
    name: "web-components",
    code: `export { registerSketchyElements, sceneFromAttributes } from "@sketchy-js/sketchy/web-components";`,
    ceiling: 42,
  },
  {
    name: "scene/silhouette",
    code: `export { treeShadow, footAnchor, silhouetteScene } from "@sketchy-js/sketchy/scene/silhouette";`,
    ceiling: 2,
  },
];

const alias = {
  "@sketchy-js/sketchy/scene/basic": dist("scene/basic.js"),
  "@sketchy-js/sketchy/core/options": dist("core/options.js"),
  "@sketchy-js/sketchy/svg": dist("svg.js"),
  "@sketchy-js/sketchy/core": dist("core.js"),
  "@sketchy-js/sketchy/fills/hachure": dist("fills/hachure.js"),
  "@sketchy-js/sketchy/fills/contour": dist("fills/contour.js"),
  "@sketchy-js/sketchy/fills/wash": dist("fills/wash.js"),
  "@sketchy-js/sketchy/fills": dist("fills.js"),
  "@sketchy-js/sketchy/plugin/schema": dist("plugin/schema.js"),
  "@sketchy-js/sketchy/plugin": dist("plugin.js"),
  "@sketchy-js/sketchy/types": dist("types.js"),
  "@sketchy-js/sketchy/canvas": dist("canvas.js"),
  "@sketchy-js/sketchy/brushes": dist("brushes.js"),
  "@sketchy-js/sketchy/brushes/crayon": dist("brushes/crayon.js"),
  "@sketchy-js/sketchy/animate": dist("animate.js"),
  "@sketchy-js/sketchy/scene/stickers": dist("scene/stickers.js"),
  "@sketchy-js/sketchy/scene/silhouette": dist("scene/silhouette.js"),
  "@sketchy-js/react": `${root}packages/react/dist/index.js`,
  "@sketchy-js/react/canvas": `${root}packages/react/dist/canvas.js`,
  "@sketchy-js/sketchy/web-components": dist("web-components.js"),
  "@sketchy-js/sketchy/stickers": dist("stickers.js"),
  "@sketchy-js/sketchy/stickers/image": dist("stickers/image.js"),
  "@sketchy-js/sketchy/stickers/clipper": dist("stickers/clipper.js"),
};

let failed = false;
for (const entry of entries) {
  const result = await build({
    stdin: { contents: entry.code, resolveDir: root, loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    treeShaking: true,
    platform: "neutral",
    mainFields: ["module", "main"],
    write: false,
    logLevel: "error",
    alias,
    external: ["react", "react/jsx-runtime", "react-dom"],
  });
  const bytes = result.outputFiles[0].contents;
  const text = new TextDecoder().decode(bytes);
  for (const token of entry.forbid ?? []) {
    if (text.includes(token)) {
      console.error(`${entry.name} contains ${token}`);
      failed = true;
    }
  }
  const gz = gzipSync(bytes, { level: 9 }).length;
  const kb = (gz / 1024).toFixed(1);
  let verdict = "";
  if (entry.ceiling) {
    const used = gz / 1024;
    failed ||= used > entry.ceiling;
    verdict = ` (ceiling ${entry.ceiling} KB gzip: ${used > entry.ceiling ? "OVER" : "within"})`;
  }
  console.log(`${entry.name}: ${(bytes.length / 1024).toFixed(1)} KB min, ${kb} KB gzip${verdict}`);
}
process.exit(failed ? 1 : 0);

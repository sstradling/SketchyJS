import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = (pkg, file = "index.js") => `${root}packages/${pkg}/dist/${file}`;

/**
 * Entry points measured. `budget` is a gzip ceiling in KB: the check fails only when an entry
 * is over its ceiling. The basic SVG scene ceiling is 42 KB. Being under a ceiling is success.
 */
const entries = [
  {
    name: "basic SVG scene (scene/basic + svg-renderer)",
    code: `import { sketch } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import { rectangle } from "@sketchy-js/core";
export const out = renderToSvgString(sketch(rectangle(0, 0, 10, 10), { width: 10, height: 10 }));`,
    ceiling: 42,
  },
  {
    name: "core: all shapes, outlines, SVG parser (plan 12-18 KB)",
    code: `export * from "@sketchy-js/core";`,
    ceiling: 18,
  },
  {
    name: "fills: all nine (plan 7-12 KB)",
    code: `export { builtinFills } from "@sketchy-js/fills";`,
    ceiling: 12,
  },
  {
    name: "scene/basic only",
    code: `export { sketch } from "@sketchy-js/scene/basic";`,
  },
  {
    name: "svg-renderer only (plan 5-9 KB)",
    code: `export { renderToSvgString, renderToSvgElement } from "@sketchy-js/svg-renderer";`,
    ceiling: 9,
  },
  {
    name: "one fill plugin (hachure)",
    code: `export { hachure } from "@sketchy-js/fills/hachure";`,
  },
  {
    name: "canvas-renderer (plan ceiling 12 KB)",
    code: `export { renderToCanvas } from "@sketchy-js/canvas-renderer";`,
    ceiling: 12,
  },
  {
    name: "brushes entry (plan ceiling 20 KB)",
    code: `export { crayon, watercolor, watercolorFill } from "@sketchy-js/brushes";`,
    ceiling: 20,
  },
  {
    name: "animate (frame generator)",
    code: `export { generateFrame, precomputeFrames } from "@sketchy-js/animate";`,
  },
  {
    name: "animate controller (createAnimation)",
    code: `export { createAnimation } from "@sketchy-js/animate";`,
  },
  {
    name: "brushes/crayon subpath",
    code: `export { crayon } from "@sketchy-js/brushes/crayon";`,
  },
];

const alias = {
  "@sketchy-js/scene/basic": dist("scene", "basic.js"),
  "@sketchy-js/core/options": dist("core", "options.js"),
  "@sketchy-js/svg-renderer": dist("svg-renderer"),
  "@sketchy-js/core": dist("core"),
  "@sketchy-js/fills/hachure": dist("fills", "hachure.js"),
  "@sketchy-js/fills": dist("fills"),
  "@sketchy-js/plugin/schema": dist("plugin", "schema.js"),
  "@sketchy-js/plugin": dist("plugin"),
  "@sketchy-js/types": dist("types"),
  "@sketchy-js/canvas-renderer": dist("canvas-renderer"),
  "@sketchy-js/brushes": dist("brushes"),
  "@sketchy-js/brushes/crayon": dist("brushes", "crayon.js"),
  "@sketchy-js/animate": dist("animate"),
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
  });
  const bytes = result.outputFiles[0].contents;
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

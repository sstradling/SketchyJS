import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = (pkg, file = "index.js") => `${root}packages/${pkg}/dist/${file}`;

/** Entry points measured; `budget` is the plan's gzip range in KB (Phase 1: basic SVG scene import). */
const entries = [
  {
    name: "basic SVG scene (scene/basic + svg-renderer)",
    code: `import { sketch } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "@sketchy-js/svg-renderer";
import { rectangle } from "@sketchy-js/core";
export const out = renderToSvgString(sketch(rectangle(0, 0, 10, 10), { width: 10, height: 10 }));`,
    budget: [28, 42],
  },
  {
    name: "scene/basic only",
    code: `export { sketch } from "@sketchy-js/scene/basic";`,
  },
  {
    name: "svg-renderer only",
    code: `export { renderToSvgString } from "@sketchy-js/svg-renderer";`,
  },
  {
    name: "one fill plugin (hachure)",
    code: `export { hachure } from "@sketchy-js/fills/hachure";`,
  },
];

const alias = {
  "@sketchy-js/scene/basic": dist("scene", "basic.js"),
  "@sketchy-js/core/options": dist("core", "options.js"),
  "@sketchy-js/svg-renderer": dist("svg-renderer"),
  "@sketchy-js/core": dist("core"),
  "@sketchy-js/fills/hachure": dist("fills", "hachure.js"),
  "@sketchy-js/fills": dist("fills"),
  "@sketchy-js/plugin": dist("plugin"),
  "@sketchy-js/types": dist("types"),
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
  if (entry.budget) {
    const [min, max] = entry.budget;
    const used = gz / 1024;
    failed ||= used > max;
    verdict = ` (plan band ${min}-${max} KB gzip: ${used > max ? "OVER" : used < min ? "below band" : "within band"})`;
  }
  console.log(`${entry.name}: ${(bytes.length / 1024).toFixed(1)} KB min, ${kb} KB gzip${verdict}`);
}
process.exit(failed ? 1 : 0);

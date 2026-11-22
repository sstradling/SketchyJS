import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const file = (path: string) =>
  fileURLToPath(new URL(`./packages/sketchy/src/${path}`, import.meta.url));

/** Tests import the public subpaths, resolved to source so they run without a build. */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@sketchy-js\/sketchy\/plugin\/schema$/,
        replacement: file("plugin/schema/index.ts"),
      },
      { find: /^@sketchy-js\/sketchy\/core\/options$/, replacement: file("core/options/index.ts") },
      { find: /^@sketchy-js\/sketchy\/scene\/basic$/, replacement: file("scene/basic.ts") },
      { find: /^@sketchy-js\/sketchy\/scene\/stickers$/, replacement: file("scene/stickers.ts") },
      {
        find: /^@sketchy-js\/sketchy\/scene\/silhouette$/,
        replacement: file("scene/silhouette.ts"),
      },
      {
        find: /^@sketchy-js\/sketchy\/stickers\/image$/,
        replacement: file("stickers/image/index.ts"),
      },
      {
        find: /^@sketchy-js\/sketchy\/stickers\/clipper$/,
        replacement: file("stickers/clipper/adapter.ts"),
      },
      { find: /^@sketchy-js\/sketchy\/brushes\/crayon$/, replacement: file("brushes/crayon.ts") },
      {
        find: /^@sketchy-js\/sketchy\/brushes\/watercolor$/,
        replacement: file("brushes/watercolor.ts"),
      },
      { find: /^@sketchy-js\/sketchy\/fills\/([A-Za-z]+)$/, replacement: file("fills/$1.ts") },
      { find: /^@sketchy-js\/sketchy\/types$/, replacement: file("types/index.ts") },
      { find: /^@sketchy-js\/sketchy\/plugin$/, replacement: file("plugin/index.ts") },
      { find: /^@sketchy-js\/sketchy\/core$/, replacement: file("core/index.ts") },
      { find: /^@sketchy-js\/sketchy\/fills$/, replacement: file("fills/index.ts") },
      { find: /^@sketchy-js\/sketchy\/brushes$/, replacement: file("brushes/index.ts") },
      { find: /^@sketchy-js\/sketchy\/stickers$/, replacement: file("stickers/index.ts") },
      { find: /^@sketchy-js\/sketchy\/scene$/, replacement: file("scene/index.ts") },
      { find: /^@sketchy-js\/sketchy\/svg$/, replacement: file("svg/index.ts") },
      { find: /^@sketchy-js\/sketchy\/canvas$/, replacement: file("canvas/index.ts") },
      { find: /^@sketchy-js\/sketchy\/animate$/, replacement: file("animate/index.ts") },
      {
        find: /^@sketchy-js\/sketchy\/web-components$/,
        replacement: file("web-components/index.ts"),
      },
      { find: /^@sketchy-js\/sketchy$/, replacement: file("index.ts") },
      {
        find: /^@sketchy-js\/react\/canvas$/,
        replacement: fileURLToPath(new URL("./packages/react/src/canvas.ts", import.meta.url)),
      },
      {
        find: /^@sketchy-js\/react$/,
        replacement: fileURLToPath(new URL("./packages/react/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "tools/*/test/**/*.test.ts"],
    environment: "node",
  },
});

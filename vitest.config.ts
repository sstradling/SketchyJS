import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (name: string, file = "index.ts") =>
  fileURLToPath(new URL(`./packages/${name}/src/${file}`, import.meta.url));

const packages = [
  "types",
  "plugin",
  "core",
  "fills",
  "brushes",
  "stickers",
  "scene",
  "svg-renderer",
];

/** Tests import workspace packages from source, so they run without a build. */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@sketchy-js\/plugin\/schema$/, replacement: src("plugin", "schema/index.ts") },
      { find: /^@sketchy-js\/scene\/basic$/, replacement: src("scene", "basic.ts") },
      {
        find: /^@sketchy-js\/fills\/([A-Za-z]+)$/,
        replacement: fileURLToPath(new URL("./packages/fills/src/$1.ts", import.meta.url)),
      },
      { find: /^@sketchy-js\/core\/options$/, replacement: src("core", "options/index.ts") },
      ...packages.map((name) => ({
        find: new RegExp(`^@sketchy-js/${name}$`),
        replacement: src(name),
      })),
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "tools/*/test/**/*.test.ts"],
    environment: "node",
  },
});

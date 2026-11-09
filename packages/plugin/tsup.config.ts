import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", schema: "src/schema/index.ts" },
  format: ["esm"],
  dts: { compilerOptions: { composite: false } },
  tsconfig: "tsconfig.build.json",
  clean: true,
  sourcemap: true,
  target: "es2022",
  treeshake: true,
  splitting: false,
});

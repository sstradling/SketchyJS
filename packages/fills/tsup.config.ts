import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    solid: "src/solid.ts",
    hachure: "src/hachure.ts",
    zigzag: "src/zigzag.ts",
    crossHatch: "src/crossHatch.ts",
    dots: "src/dots.ts",
    dashed: "src/dashed.ts",
    zigzagLine: "src/zigzagLine.ts",
    sunBurst: "src/sunBurst.ts",
    starBurst: "src/starBurst.ts",
    scribble: "src/scribble.ts",
  },
  format: ["esm"],
  dts: { compilerOptions: { composite: false } },
  tsconfig: "tsconfig.build.json",
  clean: true,
  sourcemap: true,
  target: "es2022",
  treeshake: true,
  splitting: true,
});

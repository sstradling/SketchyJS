import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

export interface SizeRow {
  backend: string;
  jsGzip: number;
  wasmGzip: number;
  note: string;
}

const require = createRequire(import.meta.url);

async function bundleGzip(code: string, resolveDir: string): Promise<number> {
  const result = await build({
    stdin: { contents: code, resolveDir, loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    platform: "browser",
    external: [
      "node:*",
      "fs",
      "path",
      "crypto",
      "module",
      "url",
      "worker_threads",
      "child_process",
    ],
    logLevel: "silent",
  });
  return gzipSync(result.outputFiles[0]?.text ?? "", { level: 9 }).length;
}

/** Gzip size of each candidate as a consumer would bundle only the operations a sticker needs. */
export async function measureSizes(root: string): Promise<SizeRow[]> {
  const wasmDir = require.resolve("clipper2-wasm/package.json").replace("package.json", "dist/es/");
  return [
    {
      backend: "clipper2-ts",
      jsGzip: await bundleGzip(
        `import { union, inflatePaths, FillRule, JoinType, EndType } from "clipper2-ts"; console.log(union, inflatePaths, FillRule, JoinType, EndType);`,
        root,
      ),
      wasmGzip: 0,
      note: "named imports of union, inflatePaths and enums; library marked sideEffects: false",
    },
    {
      backend: "clipper2-wasm",
      jsGzip: await bundleGzip(
        `import f from "clipper2-wasm/dist/es/clipper2z.js"; console.log(f);`,
        root,
      ),
      wasmGzip: gzipSync(readFileSync(`${wasmDir}clipper2z.wasm`), { level: 9 }).length,
      note: "Emscripten glue plus clipper2z.wasm; async init and manual delete() of every native object",
    },
    {
      backend: "polygon-clipping",
      jsGzip: await bundleGzip(
        `import { union } from "polygon-clipping"; console.log(union);`,
        root,
      ),
      wasmGzip: 0,
      note: "union only; offset code is extra (the round-dilation helper in this benchmark is about 1 KB)",
    },
  ];
}

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Typechecks every ts and tsx fence in package READMEs against the repo path
 * map and the DOM lib. HTML fences are examples, not programs.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const base = ts.readConfigFile(join(root, "tsconfig.base.json"), ts.sys.readFile).config;
const scratch = join(tmpdir(), "sketchy-readme-types");
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });

const files = [];
for (const dir of readdirSync(join(root, "packages")).sort()) {
  const readmePath = join(root, "packages", dir, "README.md");
  let text;
  try {
    text = readFileSync(readmePath, "utf8");
  } catch {
    continue;
  }
  const pattern = /```(ts|tsx)\n([\s\S]*?)```/g;
  let match;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    index += 1;
    const name = `${dir}-${index}.${match[1] === "tsx" ? "tsx" : "ts"}`;
    const file = join(scratch, name);
    writeFileSync(file, match[2] ?? "");
    files.push({ file, readme: `packages/${dir}/README.md`, index });
  }
}

const options = {
  ...base.compilerOptions,
  noEmit: true,
  jsx: "react-jsx",
  lib: ["es2022", "dom"],
  types: [],
  skipLibCheck: true,
  noUnusedLocals: false,
  noUnusedParameters: false,
  baseUrl: root,
  paths: {
    ...base.compilerOptions.paths,
    "@sketchy-js/brushes/crayon": ["packages/brushes/src/crayon.ts"],
    "@sketchy-js/brushes/watercolor": ["packages/brushes/src/watercolor.ts"],
    "@sketchy-js/react/canvas": ["packages/react/src/canvas.ts"],
    react: ["packages/react/node_modules/@types/react/index.d.ts"],
    "react/jsx-runtime": ["packages/react/node_modules/@types/react/jsx-runtime.d.ts"],
  },
};
const parsed = ts.convertCompilerOptionsFromJson(options, root, "readme");
if (parsed.errors.length > 0) {
  console.error(ts.formatDiagnostics(parsed.errors, ts.createCompilerHost(options)));
  process.exit(1);
}
const program = ts.createProgram(
  files.map((entry) => entry.file),
  parsed.options,
);
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
  const file = diagnostic.file?.fileName ?? "";
  return files.some((entry) => entry.file === file);
});
if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}
console.log(`readme typecheck ok: ${files.length} snippets`);

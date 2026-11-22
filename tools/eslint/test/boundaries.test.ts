import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bannedHits,
  collectRepoProblems,
  domProblems,
  importProblems,
  packageProblems,
  undeclaredAreaProblems,
} from "../../../scripts/check-boundaries.mjs";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const boundaries = JSON.parse(readFileSync(join(repo, "tools", "boundaries.json"), "utf8")) as {
  areas: Record<string, string[]>;
  domAreas: string[];
  bannedInPureGeometry: {
    globals: string[];
    members: string[];
    newExpressions: string[];
  };
};

describe("folder boundaries", () => {
  it("rejects a dynamic import from core into canvas", () => {
    const problems = importProblems(
      [{ rel: "core/leak.ts", text: 'export const pending = import("../canvas/index.js");' }],
      boundaries.areas,
    );
    expect(problems).toEqual(["core/leak.ts: core cannot import canvas"]);
  });

  it("rejects a backtick-literal dynamic import", () => {
    const problems = importProblems(
      [{ rel: "core/tick.ts", text: "export const pending = import(`../canvas/index.js`);" }],
      boundaries.areas,
    );
    expect(problems).toEqual(["core/tick.ts: core cannot import canvas"]);
  });

  it("rejects a side-effect import and an export-from", () => {
    const problems = importProblems(
      [
        { rel: "core/side.ts", text: 'import "../svg/index.js";\n' },
        { rel: "core/reexport.ts", text: 'export { renderToCanvas } from "../canvas/index.js";\n' },
      ],
      boundaries.areas,
    );
    expect(problems).toEqual([
      "core/side.ts: core cannot import svg",
      "core/reexport.ts: core cannot import canvas",
    ]);
  });

  it("allows a core import of plugin", () => {
    expect(
      importProblems(
        [{ rel: "core/ok.ts", text: 'export { x } from "../plugin/index.js";\n' }],
        boundaries.areas,
      ),
    ).toEqual([]);
  });

  it("fails when a src directory is not an area", () => {
    expect(undeclaredAreaProblems(["core", "widgets"], boundaries.areas)).toEqual([
      "packages/sketchy/src/widgets is not declared in tools/boundaries.json",
    ]);
  });

  it("bans DOM globals in a new area unless it is listed as a DOM area", () => {
    const areas = { ...boundaries.areas, experimental: [] };
    const files = [{ rel: "experimental/host.ts", text: "export const el = document.body;\n" }];
    expect(domProblems(files, { ...boundaries, areas }).length).toBeGreaterThan(0);
    expect(
      domProblems(files, {
        ...boundaries,
        areas,
        domAreas: [...boundaries.domAreas, "experimental"],
      }),
    ).toEqual([]);
  });

  it("does not treat a local named document as the DOM global", () => {
    expect(
      bannedHits("const document = host.document;\n", boundaries.bannedInPureGeometry),
    ).toEqual([]);
  });

  it("does not let one binding hide the same global elsewhere in the file", () => {
    const text =
      "function hide() { const document = host.document; }\nexport const el = document.body;\n";
    expect(bannedHits(text, boundaries.bannedInPureGeometry)).toContain("document");
  });

  it("requires sketchy to have no peers and clipper as a dependency, and react to depend only on sketchy", () => {
    expect(
      packageProblems("sketchy", {
        name: "@sketchy-js/sketchy",
        sideEffects: false,
        dependencies: {},
        peerDependencies: { react: ">=18" },
      }),
    ).toEqual([
      "sketchy: peerDependencies must be empty",
      "sketchy: clipper2-ts must be a regular dependency",
    ]);
    expect(
      packageProblems("react", {
        name: "@sketchy-js/react",
        sideEffects: false,
        dependencies: { "@sketchy-js/sketchy": "workspace:*", "clipper2-ts": "1.0.0" },
        peerDependencies: { react: ">=18", "react-dom": ">=18" },
      }),
    ).toEqual([
      "react: dependencies must be only @sketchy-js/sketchy",
      "react: the only peer is react",
    ]);
  });

  it("accepts the repository", () => {
    expect(collectRepoProblems(repo)).toEqual([]);
  });
});

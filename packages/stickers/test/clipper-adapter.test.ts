import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clipperBackend } from "../src/clipper/adapter.js";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("clipper adapter", () => {
  it("is the only module that imports clipper2-ts", () => {
    const root = new URL("../src", import.meta.url);
    const hits = sources(root.pathname).filter((file) =>
      readFileSync(file, "utf8").includes("clipper2-ts"),
    );
    expect(hits.map((file) => file.split("/").slice(-2).join("/"))).toEqual(["clipper/adapter.ts"]);
  });

  it("unions two overlapping squares into one ring", () => {
    const square = (x: number, y: number, w: number, h: number) => ({
      points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
    });
    const backend = clipperBackend();
    const unioned = backend.union([square(0, 0, 10, 10), square(5, 0, 10, 10)], "nonzero");
    expect(unioned.length).toBe(1);
    const offset = backend.offset(unioned, 1, "round");
    expect(offset.length).toBeGreaterThan(0);
    expect(offset[0]!.points.length).toBeGreaterThan(4);
  });
});

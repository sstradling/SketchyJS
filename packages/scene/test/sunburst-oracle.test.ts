import { describe, expect, it } from "vitest";
import { Rng, type Pt } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import { basicSketchy } from "../src/basic.js";
import { createFillStage } from "../src/fill-stage.js";
import { toFixtureOps } from "./support/compare-sets.js";
import {
  compareOps,
  fixtureOptions,
  generateFixtureDrawing,
  fixtureShape,
  loadSwift,
  TOLERANCE,
  type FixtureOp,
  type FixtureSet,
} from "./support/swift.js";

/**
 * Oracle policy for radial (sunburst/starburst) fills: Darwin is canonical. Linux Swift evaluates
 * `sinf`/`cosf` with glibc, which differs from the correctly rounded value by one `Float` ulp for
 * some angles; a ray that grazes a polygon vertex then crosses the 1e-5 margin of
 * `LineHelper.inRange` on one platform only. Only the concave polygon is affected, by exactly one
 * ray (four operations). The ray-level mechanism is pinned in `packages/fills/test/line-helper.test.ts`.
 */
interface FillCase {
  id: string;
  shape: { kind: string; args: Record<string, unknown> };
  options: Record<string, unknown>;
  drawing: { sets: FixtureSet[] };
}
interface DirectCase {
  id: string;
  options: Record<string, unknown>;
  polygon: Pt[];
  result: { ops: FixtureOp[] };
}

const radial = (id: string): boolean => /sunburst|starburst/.test(id);
const concave = (id: string): boolean => /concave/.test(id);

const darwinFills = loadSwift<{ cases: FillCase[] }>("darwin", "fills/fills.json").cases.filter(
  (c) => radial(c.id),
);
const linuxFills = loadSwift<{ cases: FillCase[] }>("linux", "fills/fills.json").cases;
const darwinDirect = loadSwift<{ cases: DirectCase[] }>(
  "darwin",
  "fills/direct-fillers.json",
).cases.filter((c) => radial(c.id));
const linuxDirect = loadSwift<{ cases: DirectCase[] }>("linux", "fills/direct-fillers.json").cases;

const sketchOps = (sets: FixtureSet[]): number => sets.reduce((n, s) => n + s.ops.length, 0);

describe("sunburst/starburst oracle policy (Darwin canonical)", () => {
  it.each(darwinFills.map((c) => [c.id, c] as const))(
    "fills.json %s: TypeScript matches Darwin",
    (id, c) => {
      const drawing = generateFixtureDrawing(fixtureShape(c.shape), c.options)!;
      expect(drawing.sets.map((s) => s.ops.length)).toEqual(
        c.drawing.sets.map((s) => s.ops.length),
      );
      const linux = linuxFills.find((l) => l.id === id)!;
      if (concave(id)) {
        expect(sketchOps(linux.drawing.sets) - sketchOps(c.drawing.sets)).toBe(4);
      } else {
        expect(sketchOps(linux.drawing.sets)).toBe(sketchOps(c.drawing.sets));
      }
    },
  );

  it.each(darwinDirect.map((c) => [c.id, c] as const))("direct-fillers.json %s", (id, c) => {
    const options = resolveSketchOptions(fixtureOptions(c.options));
    const fill = basicSketchy.resolveSpec("fill", { kind: options.fillStyle });
    const stage = createFillStage({ fill, options, report: () => undefined });
    const sets = stage.run(
      { kind: "polygon", points: c.polygon },
      { o: options, rng: new Rng(options.seed ?? 0n) },
    );
    const mine = toFixtureOps(sets[0]!.ops);
    expect(compareOps(mine, c.result.ops).maxDelta).toBeLessThanOrEqual(TOLERANCE);
    const linux = linuxDirect.find((l) => l.id === id)!;
    expect(linux.result.ops.length - c.result.ops.length).toBe(concave(id) ? 4 : 0);
  });

  it("the documented counts hold: 316 operations on Darwin and 320 on Linux", () => {
    const direct = (rows: DirectCase[]) =>
      rows.find((c) => c.id === "filler-sunburst-concave")!.result.ops.length;
    expect(direct(darwinDirect)).toBe(316);
    expect(direct(linuxDirect)).toBe(320);
  });
});

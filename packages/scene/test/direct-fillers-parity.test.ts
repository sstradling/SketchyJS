import { describe, expect, it } from "vitest";
import { Rng, type Pt, type RoughCtx } from "@sketchy-js/core";
import { resolveSketchOptions } from "@sketchy-js/core/options";
import { basicSketchy } from "../src/basic.js";
import { createFillStage } from "../src/fill-stage.js";
import { toFixtureOps } from "./support/compare-sets.js";
import {
  compareOps,
  fixtureOptions,
  loadSwift,
  TOLERANCE,
  type FixtureOp,
} from "./support/swift.js";

interface DirectCase {
  id: string;
  options: Record<string, unknown>;
  polygon: Pt[];
  result: { type: string; ops: FixtureOp[] };
}

const cases = loadSwift<{ cases: DirectCase[] }>("darwin", "fills/direct-fillers.json").cases;

describe("Darwin direct filler fixtures", () => {
  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const options = resolveSketchOptions(fixtureOptions(c.options));
    const fill = basicSketchy.resolveSpec("fill", { kind: options.fillStyle });
    const stage = createFillStage({ fill, options, report: () => undefined });
    const ctx: RoughCtx = { o: options, rng: new Rng(options.seed ?? 0n) };
    const sets = stage.run({ kind: "polygon", points: c.polygon }, ctx);
    expect(sets.map((s) => s.type)).toEqual([c.result.type]);
    const cmp = compareOps(toFixtureOps(sets[0]!.ops), c.result.ops);
    expect(cmp.message).toBeUndefined();
    expect(cmp.maxDelta).toBeLessThanOrEqual(TOLERANCE);
  });
});

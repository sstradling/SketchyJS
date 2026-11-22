import { describe, expect, it } from "vitest";
import { compareSets } from "./support/compare-sets.js";
import {
  fixtureShape,
  generateFixtureDrawing,
  loadSwift,
  TOLERANCE,
  type FixtureSet,
} from "./support/swift.js";

interface FillCase {
  id: string;
  shape: { kind: string; args: Record<string, unknown> };
  options: Record<string, unknown>;
  drawing: { sets: FixtureSet[] };
}

const cases = loadSwift<{ cases: FillCase[] }>("darwin", "fills/fills.json").cases;

describe("Darwin fill fixtures: shapes with fills", () => {
  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    const drawing = generateFixtureDrawing(fixtureShape(c.shape), c.options);
    expect(drawing).toBeDefined();
    const cmp = compareSets(drawing!, c.drawing.sets);
    expect(cmp.sameSets).toBe(true);
    cmp.perSet.forEach((set, index) => {
      expect(set.message, `set ${index}`).toBeUndefined();
      expect(set.maxDelta).toBeLessThanOrEqual(TOLERANCE);
    });
  });
});

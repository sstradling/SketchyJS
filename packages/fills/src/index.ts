import type { FillPlugin } from "@sketchy-js/plugin";
import { crossHatch } from "./crossHatch.js";
import { dashed } from "./dashed.js";
import { dots } from "./dots.js";
import { hachure } from "./hachure.js";
import { solid } from "./solid.js";
import { starBurst } from "./starBurst.js";
import { sunBurst } from "./sunBurst.js";
import { zigzag } from "./zigzag.js";
import { zigzagLine } from "./zigzagLine.js";

export { crossHatch, dashed, dots, hachure, solid, starBurst, sunBurst, zigzag, zigzagLine };

/** Every Phase 1 fill plugin, in registration order. Importing this pulls in all of them. */
export const builtinFills: readonly FillPlugin[] = [
  solid,
  hachure,
  zigzag,
  crossHatch,
  dots,
  dashed,
  zigzagLine,
  sunBurst,
  starBurst,
];

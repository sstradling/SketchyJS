import type { FillPlugin } from "@sketchy-js/plugin";
import { crossHatch } from "./crossHatch.js";
import { dashed } from "./dashed.js";
import { dots } from "./dots.js";
import { hachure } from "./hachure.js";
import { solid } from "./solid.js";
import { starBurst } from "./starBurst.js";
import { sunBurst } from "./sunBurst.js";
import { contour } from "./contour.js";
import { scribble } from "./scribble.js";
import { wash } from "./wash.js";
import { zigzag } from "./zigzag.js";
import { zigzagLine } from "./zigzagLine.js";

export {
  contour,
  crossHatch,
  dashed,
  dots,
  hachure,
  scribble,
  solid,
  starBurst,
  sunBurst,
  wash,
  zigzag,
  zigzagLine,
};
export { skyWash, scaleWash } from "./wash.js";

/** Built-in fill plugins, in registration order. Importing this pulls in all of them. */
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
  scribble,
  contour,
  wash,
];

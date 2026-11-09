import {
  arc,
  circle,
  curve,
  egg,
  ellipse,
  line,
  linearPath,
  path,
  polygon,
  rectangle,
  roundedRectangle,
  type Shape,
} from "@sketchy-js/core";
import type { FillStyle } from "@sketchy-js/types";

/** The primitives shown in Sketchy's README, each fitted to a 160 x 160 cell. */
export const primitives: readonly (readonly [name: string, shape: Shape])[] = [
  ["line", line(10, 150, 150, 10)],
  ["rectangle", rectangle(15, 25, 130, 110)],
  ["ellipse", ellipse(80, 80, 140, 90)],
  ["circle", circle(80, 80, 120)],
  [
    "linearPath",
    linearPath([
      { x: 10, y: 130 },
      { x: 50, y: 30 },
      { x: 90, y: 120 },
      { x: 150, y: 20 },
    ]),
  ],
  [
    "polygon",
    polygon([
      { x: 80, y: 10 },
      { x: 150, y: 60 },
      { x: 125, y: 145 },
      { x: 35, y: 145 },
      { x: 10, y: 60 },
    ]),
  ],
  ["arc", arc(80, 80, 130, 100, 0.4, 4.2, true)],
  [
    "curve",
    curve([
      { x: 10, y: 120 },
      { x: 50, y: 30 },
      { x: 110, y: 130 },
      { x: 150, y: 40 },
    ]),
  ],
  ["roundedRectangle", roundedRectangle(15, 25, 130, 110, 24)],
  ["egg", egg(80, 80, 110, 140, 0.4)],
  ["path", path("M20 140 C20 40 140 40 140 140 L80 100 Z")],
];

/** Every fill style Phase 1 implements. */
export const fillStyles: readonly FillStyle[] = [
  "solid",
  "hachure",
  "zigzag",
  "crossHatch",
  "dots",
  "dashed",
  "zigzagLine",
  "sunBurst",
  "starBurst",
];

/** A concave polygon so radial and hatch fills show clipping against the outline. */
export const concave: Shape = polygon([
  { x: 10, y: 10 },
  { x: 150, y: 10 },
  { x: 150, y: 60 },
  { x: 80, y: 60 },
  { x: 80, y: 150 },
  { x: 10, y: 150 },
]);

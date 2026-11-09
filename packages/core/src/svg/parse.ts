/** Kinds of parsed SVG path commands; shorthand and relative forms are already expanded. */
export type SvgCommandType = "move" | "line" | "cubic" | "quad" | "arc" | "close";

/** One absolute SVG path command (`SVGCommand`). Unused fields are zero or `false`. */
export interface SvgCommand {
  type: SvgCommandType;
  x: number;
  y: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  rx: number;
  ry: number;
  rotation: number;
  largeArc: boolean;
  sweep: boolean;
}

type Coords = "absolute" | "relative";
type Builder = (n: number[], last: SvgCommand | undefined, coords: Coords) => SvgCommand;

const blank = (type: SvgCommandType, x = 0, y = 0): SvgCommand => ({
  type,
  x,
  y,
  c1x: x,
  c1y: y,
  c2x: x,
  c2y: y,
  rx: 0,
  ry: 0,
  rotation: 0,
  largeArc: false,
  sweep: false,
});

const quad = (cx: number, cy: number, x: number, y: number): SvgCommand => ({
  ...blank("quad", x, y),
  c1x: cx,
  c1y: cy,
  c2x: cx,
  c2y: cy,
});

const cubic = (
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x: number,
  y: number,
): SvgCommand => ({ ...blank("cubic", x, y), c1x, c1y, c2x, c2y });

const move: Builder = (n) => blank("move", n[0], n[1]);
const line: Builder = (n) => blank("line", n[0], n[1]);
const lineVertical: Builder = (n, last, coords) =>
  blank("line", coords === "absolute" ? (last?.x ?? 0) : 0, n[0]);
const lineHorizontal: Builder = (n, last, coords) =>
  blank("line", n[0], coords === "absolute" ? (last?.y ?? 0) : 0);
const quadBroken: Builder = (n) => quad(n[0]!, n[1]!, n[2]!, n[3]!);
const cubeBroken: Builder = (n) => cubic(n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!);

/** Reflected control point of a smooth curve. Only a same-kind predecessor contributes its control. */
function reflected(
  last: SvgCommand | undefined,
  kind: SvgCommandType,
  pick: "c1" | "c2",
  coords: Coords,
): [number, number] {
  const lastPoint: [number, number] = [last?.x ?? 0, last?.y ?? 0];
  let lastControl: [number, number] =
    pick === "c1" ? [last?.c1x ?? 0, last?.c1y ?? 0] : [last?.c2x ?? 0, last?.c2y ?? 0];
  if ((last?.type ?? "line") !== kind) lastControl = lastPoint;
  let control: [number, number] = [lastPoint[0] - lastControl[0], lastPoint[1] - lastControl[1]];
  if (coords === "absolute") control = [control[0] + lastPoint[0], control[1] + lastPoint[1]];
  return control;
}

const quadSmooth: Builder = (n, last, coords) => {
  const [cx, cy] = reflected(last, "quad", "c1", coords);
  return quad(cx, cy, n[0]!, n[1]!);
};
const cubeSmooth: Builder = (n, last, coords) => {
  const [cx, cy] = reflected(last, "cubic", "c2", coords);
  return cubic(cx, cy, n[0]!, n[1]!, n[2]!, n[3]!);
};
const arc: Builder = (n) => ({
  ...blank("arc", n[5], n[6]),
  c1x: 0,
  c1y: 0,
  c2x: 0,
  c2y: 0,
  rx: n[0]!,
  ry: n[1]!,
  rotation: n[2]!,
  largeArc: n[3]! !== 0,
  sweep: n[4]! !== 0,
});
const close: Builder = () => blank("close");

const COMMANDS: Record<string, readonly [Coords, number, Builder]> = {
  M: ["absolute", 2, move],
  m: ["relative", 2, move],
  L: ["absolute", 2, line],
  l: ["relative", 2, line],
  V: ["absolute", 1, lineVertical],
  v: ["relative", 1, lineVertical],
  H: ["absolute", 1, lineHorizontal],
  h: ["relative", 1, lineHorizontal],
  Q: ["absolute", 4, quadBroken],
  q: ["relative", 4, quadBroken],
  T: ["absolute", 2, quadSmooth],
  t: ["relative", 2, quadSmooth],
  C: ["absolute", 6, cubeBroken],
  c: ["relative", 6, cubeBroken],
  S: ["absolute", 4, cubeSmooth],
  s: ["relative", 4, cubeSmooth],
  A: ["absolute", 7, arc],
  a: ["relative", 7, arc],
  Z: ["absolute", 0, close],
  z: ["absolute", 0, close],
};

/**
 * Splits the text between two commands into numbers (`SVGPath.parseNumbers`). Sketchy's rules are
 * kept: a second `.` or a sign starts a new number, `+` is dropped, an unparsable run is skipped,
 * and arc flags written without separators (`a5 5 0 1010 10`) are not split.
 */
export function parseNumbers(text: string): number[] {
  const result: number[] = [];
  let start: number | undefined;
  let hasDecimal = false;
  let inExponent = false;
  let lastChar = " ";

  const flush = (end: number): void => {
    if (start === undefined) return;
    const sub = text.slice(start, end);
    if (sub.length > 0) {
      const value = Number(sub);
      if (!Number.isNaN(value)) result.push(value);
    }
    start = undefined;
    hasDecimal = false;
    inExponent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch >= "0" && ch <= "9") {
      if (start === undefined) start = i;
    } else if (ch === ".") {
      if (start === undefined) {
        start = i;
        hasDecimal = true;
      } else if (hasDecimal && !inExponent) {
        flush(i);
        start = i;
        hasDecimal = true;
      } else {
        hasDecimal = true;
      }
    } else if (ch === "-" || ch === "+") {
      if (start !== undefined) {
        if (!(inExponent && (lastChar === "e" || lastChar === "E"))) {
          flush(i);
          if (ch === "-") start = i;
        }
      } else if (ch === "-") {
        start = i;
      }
    } else if (ch === "e" || ch === "E") {
      if (start !== undefined) inExponent = true;
    } else if (start !== undefined) {
      flush(i);
    }
    lastChar = ch;
  }
  if (start !== undefined) flush(text.length);
  return result;
}

function toRelative(command: SvgCommand, other: SvgCommand | undefined): SvgCommand {
  if (!other) return command;
  if (command.type === "arc") return { ...command, x: command.x + other.x, y: command.y + other.y };
  return {
    ...command,
    c1x: command.c1x + other.x,
    c1y: command.c1y + other.y,
    c2x: command.c2x + other.x,
    c2y: command.c2y + other.y,
    x: command.x + other.x,
    y: command.y + other.y,
  };
}

/**
 * Parses an SVG path string into absolute commands (`SVGPath`).
 *
 * Quirks kept from Sketchy because the fixtures depend on them: repeated `M` parameters become
 * further moves (no implicit lineto), relative `H`/`V` add a zero offset to the other axis,
 * a `Z` point is the subpath start, and smooth commands read the previous *unresolved* command
 * within one run of parameters.
 */
export function parseSvgPath(d: string): SvgCommand[] {
  const commands: SvgCommand[] = [];
  let builder: Builder = move;
  let coords: Coords = "absolute";
  let increment = 2;
  let numbers = "";

  const subpathStart = (): [number, number] => {
    for (let i = commands.length - 1; i >= 0; i--) {
      const c = commands[i]!;
      if (c.type === "move" || c.type === "close") return [c.x, c.y];
    }
    return [0, 0];
  };

  const finish = (): void => {
    const nums = parseNumbers(numbers);
    const raw: SvgCommand[] = [];
    let last = commands.at(-1);
    if (increment === 0) {
      last = builder([], last, coords);
      raw.push(last);
    } else {
      const count = Math.floor(nums.length / increment) * increment;
      for (let i = 0; i < count; i += increment) {
        last = builder(nums.slice(i, i + increment), last, coords);
        raw.push(last);
      }
    }
    for (const command of raw) {
      let resolved = coords === "relative" ? toRelative(command, commands.at(-1)) : command;
      if (resolved.type === "close") {
        const [sx, sy] = subpathStart();
        resolved = { ...resolved, x: sx, y: sy, c1x: sx, c1y: sy, c2x: sx, c2y: sy };
      }
      commands.push(resolved);
    }
    numbers = "";
  };

  for (const ch of d) {
    const spec = COMMANDS[ch];
    if (spec) {
      finish();
      [coords, increment, builder] = spec;
    } else {
      numbers += ch;
    }
  }
  finish();
  return commands;
}

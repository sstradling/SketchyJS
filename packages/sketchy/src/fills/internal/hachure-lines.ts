import { cosf, f, PI, sinf, sqrtf, tanf } from "./f32.js";
import {
  intersection,
  linePolygonIntersections,
  makeLine,
  type FillLine,
  type Line,
  type Pt,
} from "./line-helper.js";

/** What hachure line generation needs from the fill input. */
export interface HachureParams {
  /** Fill angle in degrees (screen coordinates, 0 horizontal, positive clockwise). */
  readonly angle: number;
  /** `computedHachureGap`: fill weight times spacing. */
  readonly gap: number;
  /** Outline width, used when the gap is not positive. */
  readonly strokeWidth: number;
}

/** `RoughMath.polygonBounds`. */
export function polygonBounds(points: readonly Pt[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const first = points[0];
  if (!first) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let [minX, minY] = first;
  let [maxX, maxY] = first;
  for (const p of points.slice(1)) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  return { minX, maxX, minY, maxY };
}

const SIN_FLAT = f(1e-4);
const SIN_STEEP = f(0.9999);

/** `HachureScanner`: walks parallel scan lines across a bounding box. */
class HachureScanner {
  private pos: number;
  private readonly deltaX: number;
  private readonly hGap: number;
  private readonly sLeft: Line | undefined;
  private readonly sRight: Line | undefined;

  constructor(
    private readonly top: number,
    private readonly bottom: number,
    private readonly left: number,
    private readonly right: number,
    private readonly gap: number,
    private readonly sinAngle: number,
    cosAngle: number,
    private readonly tanAngle: number,
  ) {
    if (Math.abs(sinAngle) < SIN_FLAT) {
      this.pos = f(left + gap);
      this.deltaX = 0;
      this.hGap = 0;
    } else if (Math.abs(sinAngle) > SIN_STEEP) {
      this.pos = f(top + gap);
      this.deltaX = 0;
      this.hGap = 0;
    } else {
      this.deltaX = f(f(bottom - top) * Math.abs(tanAngle));
      this.pos = f(left - Math.abs(this.deltaX));
      this.hGap = Math.abs(f(gap / cosAngle));
      this.sLeft = makeLine([left, bottom], [left, top]);
      this.sRight = makeLine([right, bottom], [right, top]);
    }
  }

  nextLine(): FillLine | undefined {
    const { top, bottom, left, right, gap, sinAngle, tanAngle } = this;
    if (Math.abs(sinAngle) < SIN_FLAT) {
      if (this.pos < right) {
        const line: FillLine = { start: [this.pos, top], end: [this.pos, bottom] };
        this.pos = f(this.pos + gap);
        return line;
      }
    } else if (Math.abs(sinAngle) > SIN_STEEP) {
      if (this.pos < bottom) {
        const line: FillLine = { start: [left, this.pos], end: [right, this.pos] };
        this.pos = f(this.pos + gap);
        return line;
      }
    } else if (this.pos < f(right + this.deltaX)) {
      const halfDelta = f(this.deltaX / 2);
      let x1 = f(this.pos - halfDelta);
      let x2 = f(this.pos + halfDelta);
      let y1 = bottom;
      let y2 = top;
      while ((x1 < left && x2 < left) || (x1 > right && x2 > right)) {
        this.pos = f(this.pos + this.hGap);
        x1 = f(this.pos - halfDelta);
        x2 = f(this.pos + halfDelta);
        if (this.pos > f(right + this.deltaX)) return undefined;
      }
      const scanLine = makeLine([x1, y1], [x2, y2]);
      const hitLeft = this.sLeft && intersection(scanLine, this.sLeft);
      if (hitLeft) [x1, y1] = hitLeft;
      const hitRight = this.sRight && intersection(scanLine, this.sRight);
      if (hitRight) [x2, y2] = hitRight;
      if (tanAngle > 0) {
        x1 = f(right - f(x1 - left));
        x2 = f(right - f(x2 - left));
      }
      const line: FillLine = { start: [x1, y1], end: [x2, y2] };
      this.pos = f(this.pos + this.hGap);
      return line;
    }
    return undefined;
  }
}

/**
 * `HachureFiller.hachureLines`: parallel lines at the fill angle clipped to a polygon by pairing
 * sorted scan-line intersections (even-odd). Returns no lines for fewer than three points.
 */
export function hachureLines(points: readonly Pt[], params: HachureParams): FillLine[] {
  if (points.length < 3) return [];
  const { minX, maxX, minY, maxY } = polygonBounds(points);
  const angle = f(f(f(90 - params.angle) * PI) / 180);
  let gap = params.gap;
  if (gap < 0) gap = f(params.strokeWidth * 4);
  gap = Math.max(gap, f(0.1));
  const sinAngle = sinf(angle);
  const cosAngle = cosf(angle);
  const tanAngle = tanf(angle);
  const scanner = new HachureScanner(
    f(minY - 1),
    f(maxY + 1),
    f(minX - 1),
    f(maxX + 1),
    gap,
    sinAngle,
    cosAngle,
    tanAngle,
  );
  const lines: FillLine[] = [];
  for (let scan = scanner.nextLine(); scan; scan = scanner.nextLine()) {
    const hits = linePolygonIntersections(scan.start, scan.end, points);
    const byX = Math.abs(sinAngle) < SIN_FLAT;
    hits.sort((a, b) => (byX ? a[0] - b[0] : a[1] - b[1]));
    for (let i = 0; i < hits.length - 1; i += 2) {
      lines.push({ start: [hits[i]![0], hits[i]![1]], end: [hits[i + 1]![0], hits[i + 1]![1]] });
    }
  }
  return lines;
}

interface EllipseFrame {
  sinAlpha: number;
  cosAlpha: number;
  gapPrime: number;
  aspectRatio: number;
}

function ellipseFrame(
  rx: number,
  ry: number,
  fillAngle: number,
  gap: number,
): EllipseFrame | undefined {
  const aspectRatio = f(ry / rx);
  const phi = f(f(fillAngle * PI) / 180);
  const sinPhi = sinf(phi);
  const cosPhi = cosf(phi);
  const arCos = f(aspectRatio * cosPhi);
  const hyp = sqrtf(f(f(f(arCos * aspectRatio) * cosPhi) + f(sinPhi * sinPhi)));
  if (!(hyp > 0 && Number.isFinite(hyp))) return undefined;
  const sinAlpha = f(arCos / hyp);
  const cosAlpha = f(sinPhi / hyp);
  const a = f(ry * cosAlpha);
  const b = f(rx * sinAlpha);
  const scale = sqrtf(f(f(a * a) + f(b * b)));
  if (!(Number.isFinite(scale) && scale > 0)) return undefined;
  const gapPrime = f(f(gap * scale) / ry);
  if (!(Number.isFinite(gapPrime) && gapPrime > 0)) return undefined;
  return { sinAlpha, cosAlpha, gapPrime, aspectRatio };
}

function mapCirclePoint(x: number, y: number, cx: number, cy: number, fr: EllipseFrame): Pt {
  const dx = f(x - cx);
  const dy = f(y - cy);
  return [
    f(f(cx + f(dx * fr.cosAlpha)) + f(dy * fr.sinAlpha)),
    f(cy + f(fr.aspectRatio * f(f(f(-dx) * fr.sinAlpha) + f(dy * fr.cosAlpha)))),
  ];
}

/**
 * `HachureFiller.hachureEllipse`: evenly spaced chords of an ellipse, computed in the circle the
 * ellipse maps to. Differs from the polygon scan, so it is a separate path in every fill.
 */
export function hachureEllipse(
  cx: number,
  cy: number,
  rxIn: number,
  ryIn: number,
  params: HachureParams,
): FillLine[] {
  const rx = Math.abs(rxIn);
  const ry = Math.abs(ryIn);
  if (!(rx > 0 && ry > 0)) return [];
  let gap = params.gap;
  if (gap <= 0) gap = f(params.strokeWidth * 4);
  if (!(gap > 0)) return [];
  const frame = ellipseFrame(rx, ry, params.angle, gap);
  if (!frame) return [];
  const span = f(rx * 2);
  const step = frame.gapPrime;
  if (!(Number.isFinite(span) && Number.isFinite(step) && step > 0)) return [];
  const packed = Math.floor(f(f(span - f(0.5)) / step)) + 1;
  let count = Math.max(1, packed);
  while (count > 1 && f(span - f(step * f(count - 1))) <= f(0.5)) count -= 1;
  const used = f(step * f(Math.max(0, count - 1)));
  const margin = Math.max(0, f(f(span - used) / 2));
  let xPos = f(f(cx - rx) + margin);
  const lines: FillLine[] = [];
  for (let i = 0; i < count; i++) {
    const delta = f(cx - xPos);
    const radicand = f(f(rx * rx) - f(delta * delta));
    if (radicand > 0) {
      const half = sqrtf(radicand);
      lines.push({
        start: mapCirclePoint(xPos, f(cy - half), cx, cy, frame),
        end: mapCirclePoint(xPos, f(cy + half), cx, cy, frame),
      });
    }
    xPos = f(xPos + step);
  }
  return lines;
}

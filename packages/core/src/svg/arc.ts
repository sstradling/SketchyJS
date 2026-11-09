/** A cubic Bézier segment produced by arc conversion: two control points and the end point. */
export interface ArcCubic {
  readonly c1x: number;
  readonly c1y: number;
  readonly c2x: number;
  readonly c2y: number;
  readonly x: number;
  readonly y: number;
}

/** Result of converting one SVG arc command (`SVGArcConverter.Conversion`). */
export type ArcConversion =
  | { readonly kind: "omitted" }
  | { readonly kind: "line" }
  | {
      readonly kind: "cubic";
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
      readonly deltaAngle: number;
      readonly curves: readonly ArcCubic[];
    };

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const length = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  if (!(length > 0)) return 0;
  const clamped = Math.max(-1, Math.min(1, dot / length));
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  return sign * Math.acos(clamped);
}

function ellipsePoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phi: number,
  theta: number,
): [number, number] {
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return [
    cx + rx * cosT * cosPhi - ry * sinT * sinPhi,
    cy + rx * cosT * sinPhi + ry * sinT * cosPhi,
  ];
}

function ellipseDerivative(rx: number, ry: number, phi: number, theta: number): [number, number] {
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return [-rx * sinT * cosPhi - ry * cosT * sinPhi, -rx * sinT * sinPhi + ry * cosT * cosPhi];
}

function segmentCubic(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phi: number,
  theta1: number,
  theta2: number,
  end: readonly [number, number] | undefined,
): ArcCubic {
  const alpha = (4 / 3) * Math.tan((theta2 - theta1) / 4);
  const p1 = ellipsePoint(cx, cy, rx, ry, phi, theta1);
  const p2 = ellipsePoint(cx, cy, rx, ry, phi, theta2);
  const d1 = ellipseDerivative(rx, ry, phi, theta1);
  const d2 = ellipseDerivative(rx, ry, phi, theta2);
  return {
    c1x: p1[0] + alpha * d1[0],
    c1y: p1[1] + alpha * d1[1],
    c2x: p2[0] - alpha * d2[0],
    c2y: p2[1] - alpha * d2[1],
    x: end ? end[0] : p2[0],
    y: end ? end[1] : p2[1],
  };
}

/**
 * Converts an endpoint-parameterized SVG arc to cubic Béziers (`SVGArcConverter.convert`,
 * SVG 1.1 implementation notes F.6.5 and F.6.6).
 *
 * Identical endpoints are omitted before the zero-radius rule applies; a zero radius becomes a
 * straight line; radii too small for the endpoints are scaled up. All arithmetic is `Double`.
 */
export function convertArc(
  start: readonly [number, number],
  end: readonly [number, number],
  inputRx: number,
  inputRy: number,
  xAxisRotation: number,
  largeArc: boolean,
  sweep: boolean,
): ArcConversion {
  if (start[0] === end[0] && start[1] === end[1]) return { kind: "omitted" };
  let rx = Math.abs(inputRx);
  let ry = Math.abs(inputRy);
  if (!(rx > 0 && ry > 0)) return { kind: "line" };

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (start[0] - end[0]) / 2;
  const dy = (start[1] - end[1]) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const radiiCheck = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (radiiCheck > 1) {
    const factor = Math.sqrt(radiiCheck);
    rx *= factor;
    ry *= factor;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const numerator = Math.max(0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2);
  const denominator = rx2 * y1p2 + ry2 * x1p2;
  const sign = largeArc === sweep ? -1 : 1;
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator);
  const cxp = coefficient * ((rx * y1p) / ry);
  const cyp = coefficient * ((-ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (start[0] + end[0]) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (start[1] + end[1]) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const startAngle = vectorAngle(1, 0, ux, uy);
  let deltaAngle = vectorAngle(ux, uy, vx, vy);
  if (!sweep && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  else if (sweep && deltaAngle < 0) deltaAngle += 2 * Math.PI;

  const count = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2) - 1e-12));
  const segmentDelta = deltaAngle / count;
  const curves: ArcCubic[] = [];
  for (let i = 0; i < count; i++) {
    const theta1 = startAngle + i * segmentDelta;
    const theta2 = theta1 + segmentDelta;
    curves.push(
      segmentCubic(cx, cy, rx, ry, phi, theta1, theta2, i === count - 1 ? end : undefined),
    );
  }
  return { kind: "cubic", cx, cy, rx, ry, deltaAngle, curves };
}

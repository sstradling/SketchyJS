import type { PathOp } from "@sketchy-js/sketchy/types";

/**
 * Typed copy of `tools/swift-reference-exporter/close-ring.mjs`.
 * Swift `Circle` omits `closeSubpath`; the closed-width-z export inserts one `Z`
 * per outline subpath before rendering. Keep the two copies identical.
 */
export function closeRingContours(ops: readonly PathOp[]): PathOp[] {
  const closed: PathOp[] = [];
  let open = false;
  for (const op of ops) {
    if (op.op === "M" && open) {
      closed.push({ op: "Z" });
      open = false;
    }
    closed.push(op);
    if (op.op === "M") open = true;
    if (op.op === "Z") open = false;
  }
  if (open) closed.push({ op: "Z" });
  return closed;
}

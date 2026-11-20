/**
 * Close each outline subpath.
 *
 * Swift `Circle` is a closed shape, but `RoughCurves.ellipseOps` does not emit
 * `closeSubpath`. `closed-width-z.json` inserts one `Z` at the end of every
 * outline subpath before the renderer runs, so the 6% join blend and crayon wax
 * see a closed contour. Rounded rectangles already close themselves; running
 * this again does not add a second `Z`.
 *
 * `ExportV16.closedWidthZDocument` is the Swift copy of this step. A future
 * `export.sh` writes `strokes/closed-width-z.json` through that function.
 * Do not hand-edit the committed fixture.
 *
 * @param {readonly { op?: string, 0?: string }[]} ops
 */
export function closeRingContours(ops) {
  const closed = [];
  let open = false;
  const kind = (op) => op.op ?? op[0];
  const closeOp = () => (ops[0]?.op === undefined ? ["Z"] : { op: "Z" });
  for (const op of ops) {
    if (kind(op) === "M" && open) {
      closed.push(closeOp());
      open = false;
    }
    closed.push(op);
    if (kind(op) === "M") open = true;
    if (kind(op) === "Z") open = false;
  }
  if (open) closed.push(closeOp());
  return closed;
}

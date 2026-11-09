import { describe, expect, it } from "vitest";
import { RoughView, sketch } from "@sketchy-js/scene/basic";
import { renderToSvgString } from "../src/index.js";
import { concave, fillStyles, primitives } from "./support/gallery.js";

const size = { width: 160, height: 160 };
const base = {
  seed: 7n,
  fillColor: [0.18, 0.46, 0.67] as const,
  strokeColor: [0.12, 0.14, 0.18] as const,
};

/** Verifies tags are balanced and attribute quotes are closed; enough for generated, escaped output. */
function assertWellFormed(svg: string): void {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z-:]+="[^"<]*")*)\s*(\/?)>/g)) {
    const [, closing, tag, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) expect(stack.pop()).toBe(tag);
    else stack.push(tag!);
  }
  expect(stack).toEqual([]);
  expect(svg.replace(/<[^>]*>/g, "")).toBe("");
}

/** Open shapes have no fill in Sketchy. */
const closed = new Set([
  "rectangle",
  "ellipse",
  "circle",
  "polygon",
  "arc",
  "roundedRectangle",
  "egg",
  "path",
]);

describe("shapes -> scene -> SVG", () => {
  it.each(primitives)("renders %s with an outline and, when closed, a fill", (name, shape) => {
    const svg = renderToSvgString(sketch(shape, size, { ...base, fillStyle: "hachure" }));
    assertWellFormed(svg);
    expect(svg).toMatch(/stroke="rgb\(31,36,46\)"/);
    if (closed.has(name)) expect(svg).toMatch(/stroke="rgb\(46,117,171\)"/);
    else expect(svg).not.toMatch(/stroke="rgb\(46,117,171\)"/);
  });

  it.each(fillStyles)("renders the %s fill", (style) => {
    const svg = renderToSvgString(sketch(concave, size, { ...base, fillStyle: style }));
    assertWellFormed(svg);
    expect(svg).toContain("rgb(46,117,171)");
    if (style === "solid") expect(svg).toMatch(/fill="rgb\(46,117,171\)"/);
    else expect(svg).toMatch(/stroke="rgb\(46,117,171\)"/);
  });

  it("is deterministic for a seed and changes with it", () => {
    const render = (seed: bigint) =>
      renderToSvgString(
        sketch(primitives[3]![1], size, { ...base, seed, fillStyle: "crossHatch" }),
      );
    expect(render(1n)).toBe(render(1n));
    expect(render(1n)).not.toBe(render(2n));
  });

  it("builder and functional APIs produce identical output", () => {
    const shape = primitives[1]![1];
    const viaBuilder = new RoughView()
      .with({ ...base, fillStyle: "dots" })
      .draw(shape)
      .build(size);
    const viaFunction = sketch(shape, size, { ...base, fillStyle: "dots" });
    expect(renderToSvgString(viaBuilder)).toBe(renderToSvgString(viaFunction));
  });

  it("stacks shapes in draw order", () => {
    const scene = new RoughView()
      .with(base)
      .draw(primitives[1]![1])
      .draw(primitives[3]![1])
      .build(size);
    const svg = renderToSvgString(scene);
    assertWellFormed(svg);
    expect(svg.match(/<g>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("SVG path import", () => {
  const d = "M20 140 C20 40 140 40 140 140 L80 100 Z";

  it("clips pattern fills to the path when aligned inside", () => {
    const svg = renderToSvgString(
      sketch({ kind: "path", d }, size, {
        ...base,
        fillStyle: "hachure",
        svgFillStrokeAlignment: "inside",
      }),
    );
    assertWellFormed(svg);
    expect(svg).toContain("<clipPath");
  });

  it("clips pattern lines to the path regardless of stroke alignment", () => {
    const svg = renderToSvgString(
      sketch({ kind: "path", d }, size, {
        ...base,
        fillStyle: "hachure",
        svgFillStrokeAlignment: "outside",
      }),
    );
    assertWellFormed(svg);
    expect(svg).toContain("<clipPath");
    expect(svg).not.toContain("<mask");
  });

  it("needs no clip for center alignment", () => {
    const svg = renderToSvgString(
      sketch({ kind: "path", d }, size, {
        ...base,
        fillStyle: "solid",
        svgFillStrokeAlignment: "center",
      }),
    );
    expect(svg).not.toContain("<clipPath");
    expect(svg).not.toContain("<mask");
  });
});

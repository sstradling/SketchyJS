import { describe, expect, it } from "vitest";
import type { DrawLayer, Path, Scene } from "@sketchy-js/types";
import {
  renderToSvgElement,
  renderToSvgString,
  type SvgDocumentLike,
  type SvgElementLike,
} from "../src/index.js";
import { cssColor, escapeAttribute, formatNumber, pathData } from "../src/format.js";

const line: Path = [
  { op: "M", x: 1, y: 2 },
  { op: "L", x: 3.14159, y: -0.0001 },
];
const square: Path = [
  { op: "M", x: 0, y: 0 },
  { op: "L", x: 10, y: 0 },
  { op: "L", x: 10, y: 10 },
  { op: "Z" },
];

function sceneOf(layers: DrawLayer[], extra: Partial<Scene> = {}): Scene {
  return {
    version: 1,
    size: { width: 100, height: 50 },
    nodes: [{ type: "drawing", drawing: { shape: "line", outline: [], layers } }],
    ...extra,
  };
}

describe("format helpers", () => {
  it("rounds, trims and normalizes negative zero", () => {
    expect(formatNumber(1.23456, 3)).toBe("1.235");
    expect(formatNumber(2, 3)).toBe("2");
    expect(formatNumber(-0.0001, 3)).toBe("0");
    expect(formatNumber(0.5, 0)).toBe("1");
  });

  it("serializes every operation kind", () => {
    const d = pathData(
      [
        { op: "M", x: 0, y: 0 },
        { op: "L", x: 1, y: 1 },
        { op: "Q", cx: 2, cy: 2, x: 3, y: 3 },
        { op: "C", c1x: 4, c1y: 4, c2x: 5, c2y: 5, x: 6, y: 6 },
        { op: "Z" },
      ],
      3,
    );
    expect(d).toBe("M0,0L1,1Q2,2,3,3C4,4,5,5,6,6Z");
  });

  it("converts tuple colors to rgb plus opacity and passes strings through", () => {
    expect(cssColor([1, 0, 0.5, 0.25])).toEqual({ value: "rgb(255,0,128)", opacity: 0.25 });
    expect(cssColor("#abc")).toEqual({ value: "#abc", opacity: 1 });
    expect(cssColor([2, -1, 0])).toEqual({ value: "rgb(255,0,0)", opacity: 1 });
  });

  it("escapes attribute text", () => {
    expect(escapeAttribute(`a&b"c<d>`)).toBe("a&amp;b&quot;c&lt;d&gt;");
  });
});

describe("renderToSvgString", () => {
  it("writes the root element with viewBox and size", () => {
    const svg = renderToSvgString(sceneOf([]));
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"><g/></svg>',
    );
  });

  it("renders a stroke layer with round caps and joins by default", () => {
    const svg = renderToSvgString(
      sceneOf([
        {
          role: "stroke",
          paths: [line],
          fillRule: "nonzero",
          paint: { kind: "solid", color: [0, 0, 0] },
          strokeWidth: 2,
        },
      ]),
    );
    expect(svg).toContain('d="M1,2L3.142,0"');
    expect(svg).toContain(
      'fill="none" stroke="rgb(0,0,0)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    );
    expect(svg).not.toContain("stroke-opacity");
  });

  it("honours cap, join, miter limit and alpha", () => {
    const svg = renderToSvgString(
      sceneOf([
        {
          role: "stroke",
          paths: [line],
          fillRule: "nonzero",
          paint: { kind: "solid", color: "red", alpha: 0.5 },
          strokeWidth: 1.5,
          cap: "square",
          join: "miter",
          miterLimit: 4,
        },
      ]),
    );
    expect(svg).toContain('stroke-opacity="0.5"');
    expect(svg).toContain('stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="4"');
  });

  it("falls back to round for curved bevel joins", () => {
    const svg = renderToSvgString(
      sceneOf([
        {
          role: "stroke",
          paths: [line],
          fillRule: "nonzero",
          paint: { kind: "solid", color: "red" },
          strokeWidth: 1,
          join: { kind: "curvedBevel", bulge: 0.5 },
        },
      ]),
    );
    expect(svg).toContain('stroke-linejoin="round"');
  });

  it("renders filled areas with fill rule and opacity", () => {
    const svg = renderToSvgString(
      sceneOf([
        {
          role: "fill",
          paths: [square],
          fillRule: "evenodd",
          paint: { kind: "solid", color: [0, 1, 0, 0.4], alpha: 0.5 },
        },
      ]),
    );
    expect(svg).toContain('fill="rgb(0,255,0)" fill-opacity="0.2" fill-rule="evenodd"');
  });

  it("resolves paper paint from the background option and shape paints to currentColor", () => {
    const svg = renderToSvgString(
      sceneOf([
        { role: "sheet", paths: [square], fillRule: "nonzero", paint: { kind: "paper" } },
        { role: "fill", paths: [square], fillRule: "nonzero", paint: { kind: "fill", alpha: 0.5 } },
      ]),
      { background: "#fffaf0" },
    );
    expect(svg).toContain('<rect width="100" height="50" fill="#fffaf0"/>');
    expect(svg).toContain('fill="#fffaf0"');
    expect(svg).toContain('fill="currentColor" fill-opacity="0.5"');
  });

  it("emits a clipPath once for layers sharing a clip", () => {
    const clip = { paths: [square], fillRule: "nonzero" as const };
    const layer: DrawLayer = {
      role: "fill-pattern",
      paths: [line],
      fillRule: "nonzero",
      paint: { kind: "solid", color: "black" },
      strokeWidth: 1,
      clip,
    };
    const svg = renderToSvgString(sceneOf([layer, layer]), { idPrefix: "t" });
    expect(svg.match(/<clipPath/g)).toHaveLength(1);
    expect(svg.match(/clip-path="url\(#t-clip-0\)"/g)).toHaveLength(2);
    expect(svg).toContain(
      '<clipPath id="t-clip-0"><path d="M0,0L10,0L10,10Z" clip-rule="nonzero"/></clipPath>',
    );
  });

  it("renders an inverse clip as a mask so the shape keeps its fill rule", () => {
    const svg = renderToSvgString(
      sceneOf([
        {
          role: "fill",
          paths: [line],
          fillRule: "nonzero",
          paint: { kind: "solid", color: "black" },
          strokeWidth: 4,
          clip: { paths: [square], fillRule: "evenodd", inverse: true },
        },
      ]),
    );
    expect(svg).toContain('<mask id="sk-mask-0" maskUnits="userSpaceOnUse"');
    expect(svg).toContain('<path d="M0,0L10,0L10,10Z" fill="#000" fill-rule="evenodd"/>');
    expect(svg).toContain('mask="url(#sk-mask-0)"');
    expect(svg).not.toContain("<clipPath");
  });

  it("applies node transforms and nests groups", () => {
    const svg = renderToSvgString({
      version: 1,
      size: { width: 10, height: 10 },
      nodes: [
        {
          type: "group",
          transform: [1, 0, 0, 1, 5, 6],
          children: [{ type: "drawing", drawing: { shape: "line", outline: [], layers: [] } }],
        },
      ],
    });
    expect(svg).toContain('<g transform="matrix(1 0 0 1 5 6)"><g/></g>');
  });

  it("rejects an invalid precision", () => {
    expect(() => renderToSvgString(sceneOf([]), { precision: -1 })).toThrow(RangeError);
    expect(() => renderToSvgString(sceneOf([]), { precision: 1.5 })).toThrow(RangeError);
  });

  it("respects the precision option", () => {
    const layer: DrawLayer = {
      role: "stroke",
      paths: [line],
      fillRule: "nonzero",
      paint: { kind: "solid", color: "k" },
      strokeWidth: 1,
    };
    expect(renderToSvgString(sceneOf([layer]), { precision: 1 })).toContain('d="M1,2L3.1,0"');
  });
});

describe("renderToSvgElement", () => {
  interface FakeNode extends SvgElementLike {
    tag: string;
    attrs: Record<string, string>;
    kids: FakeNode[];
  }
  const fakeDocument: SvgDocumentLike = {
    createElementNS(namespace, name) {
      expect(namespace).toBe("http://www.w3.org/2000/svg");
      const node: FakeNode = {
        tag: name,
        attrs: {},
        kids: [],
        setAttribute(k, v) {
          node.attrs[k] = v;
        },
        appendChild(child) {
          node.kids.push(child as FakeNode);
        },
      };
      return node;
    },
  };

  it("builds the same tree as the string renderer", () => {
    const scene = sceneOf([
      {
        role: "stroke",
        paths: [line],
        fillRule: "nonzero",
        paint: { kind: "solid", color: "red" },
        strokeWidth: 1,
      },
    ]);
    const root = renderToSvgElement(scene, { document: fakeDocument }) as FakeNode;
    expect(root.tag).toBe("svg");
    expect(root.attrs.viewBox).toBe("0 0 100 50");
    expect(root.kids[0]!.kids[0]!.attrs.stroke).toBe("red");
  });

  it("needs a document outside the browser", () => {
    expect(() => renderToSvgElement(sceneOf([]))).toThrow(/options\.document/);
  });
});

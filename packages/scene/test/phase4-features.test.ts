import { describe, expect, it } from "vitest";
import { arc, path, rectangle } from "@sketchy-js/core";
import { contour, wash } from "@sketchy-js/fills";
import { basicSketchy } from "../src/basic.js";
import { sketchScene } from "../src/functional.js";
import { footAnchor, treeShadow } from "../src/silhouette.js";
import { pitShadow } from "../src/shades.js";
import { generateFixtureDrawing } from "./support/swift.js";

const fills = basicSketchy.use(contour).use(wash);

describe("phase 4 fills and shades", () => {
  it("clips a contour SVG hole with the even-odd rule", () => {
    const scene = sketchScene(
      fills,
      path("M10 10 H110 V90 H10 Z M40 30 H80 V70 H40 Z"),
      { width: 140, height: 120 },
      {
        fillStyle: "contour",
        seed: 1n,
        fillAngle: 0,
        fillSpacing: 4,
        contourIntensity: 0,
        fillColor: [0, 0, 0, 1],
      },
    );
    const drawing = scene.nodes[0]?.type === "drawing" ? scene.nodes[0].drawing : undefined;
    const clips =
      drawing?.layers.flatMap((layer) => (layer.clip ? [layer.clip.fillRule] : [])) ?? [];
    expect(clips).toContain("evenodd");
    expect(
      drawing?.layers.some((layer) => layer.role === "fill" || layer.role === "fill-pattern"),
    ).toBe(true);
  });

  it("draws a wash with more than one stroke width", () => {
    const scene = sketchScene(
      fills,
      rectangle(8, 8, 180, 90),
      { width: 200, height: 120 },
      {
        fillStyle: "wash",
        seed: 3n,
        fillColor: [0.2, 0.45, 0.8, 1],
      },
    );
    const widths =
      scene.nodes[0]?.type === "drawing"
        ? scene.nodes[0].drawing.layers.flatMap((layer) =>
            layer.role === "fill" && layer.strokeWidth !== undefined ? [layer.strokeWidth] : [],
          )
        : [];
    expect(widths.length).toBeGreaterThan(1);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(4);
  });

  it("flattens an arc contour to one unscaled set", () => {
    const drawing = generateFixtureDrawing(arc(40, 40, 80, 60, 0.2, 4, true), {
      fillStyle: "contour",
      seed: "3",
      contourFalloff: 1,
      fillSpacing: 6,
    });
    const bands = drawing?.sets.filter((set) => set.type === "fillSketch") ?? [];
    expect(bands.length).toBe(1);
    expect(bands[0]?.fillLineScale).toBeUndefined();
    const polygon = generateFixtureDrawing(rectangle(10, 10, 80, 60), {
      fillStyle: "contour",
      seed: "3",
      contourFalloff: 1,
      fillSpacing: 6,
      contourIntensity: 1,
    });
    const scales = (polygon?.sets ?? [])
      .map((set) => set.fillLineScale)
      .filter((scale) => scale !== undefined);
    expect(scales.length).toBeGreaterThan(1);
  });

  it("paints a pit shadow without changing the solid fill", () => {
    const size = { width: 100, height: 80 };
    const plain = sketchScene(basicSketchy, rectangle(10, 10, 60, 40), size, {
      seed: 4n,
      fillStyle: "solid",
      fillColor: [0.8, 0.2, 0.2, 1],
    });
    const shaded = sketchScene(basicSketchy, rectangle(10, 10, 60, 40), size, {
      seed: 4n,
      fillStyle: "solid",
      fillColor: [0.8, 0.2, 0.2, 1],
      interiorShades: [pitShadow()],
    });
    const paths = (scene: typeof plain, role: string): string =>
      JSON.stringify(
        scene.nodes[0]?.type === "drawing"
          ? scene.nodes[0].drawing.layers
              .filter((layer) => layer.role === role)
              .map((layer) => layer.paths)
          : [],
      );
    expect(paths(plain, "fill")).toBe(paths(shaded, "fill"));
    expect(paths(plain, "stroke")).toBe(paths(shaded, "stroke"));
    const shade =
      shaded.nodes[0]?.type === "drawing"
        ? shaded.nodes[0].drawing.layers.find((layer) => layer.role === "shade")
        : undefined;
    expect(shade?.shade?.kind).toBe("innerShadow");
    expect(shade?.fillRule).toBe("evenodd");
  });
});

describe("silhouette shadow", () => {
  it("pins the tree shadow on the middle of the lowest opaque row", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    const set = (x: number, y: number): void => {
      const i = (y * 4 + x) * 4;
      pixels[i] = 10;
      pixels[i + 1] = 20;
      pixels[i + 2] = 30;
      pixels[i + 3] = 255;
    };
    set(1, 1);
    set(2, 2);
    set(3, 2);
    const image = { width: 4, height: 4, pixels };
    expect(footAnchor(image)).toEqual({ x: 3, y: 2.5 });
    const shadow = treeShadow(image, { x: 40, y: 70 });
    expect(shadow.color).toEqual([22 / 255, 48 / 255, 14 / 255, 1]);
    expect(shadow.opacity).toBeCloseTo(0.42, 5);
    expect(shadow.transform).toEqual([1, 0, -0.58, 0.32, 0, 0]);
    expect(shadow.anchor).toEqual({ x: 3, y: 2.5 });
    expect(shadow.position).toEqual({ x: 40, y: 70 });
  });
});

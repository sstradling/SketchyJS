import { describe, expect, it } from "vitest";
import { paintSketchyElement, sceneFromAttributes } from "../src/index.js";

describe("sketchy-shape", () => {
  it("builds a seeded SVG scene without a canvas renderer", () => {
    const scene = sceneFromAttributes(
      { shape: "rectangle", seed: "42", fill: "hachure", label: "A seeded rectangle" },
      { width: 160, height: 100 },
    );
    const host = {
      attrs: new Map<string, string>([
        ["shape", "rectangle"],
        ["seed", "42"],
        ["fill", "hachure"],
        ["label", "A seeded rectangle"],
      ]),
      html: "",
      getAttribute(name: string) {
        return this.attrs.get(name) ?? null;
      },
      setAttribute(name: string, value: string) {
        this.attrs.set(name, value);
      },
      get innerHTML() {
        return this.html;
      },
      set innerHTML(value: string) {
        this.html = value;
      },
    };
    paintSketchyElement(host, { width: 160, height: 100 });
    expect(host.innerHTML.startsWith("<svg ")).toBe(true);
    expect(host.innerHTML).toContain("<path");
    expect(host.getAttribute("role")).toBe("img");
    expect(host.getAttribute("aria-label")).toBe("A seeded rectangle");
    expect(scene.nodes.length).toBe(1);
  });
});

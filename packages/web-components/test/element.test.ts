import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import {
  defineSketchyElement,
  paintSketchyElement,
  sceneFromAttributes,
  seedFromAttribute,
} from "../src/index.js";

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

  it("rejects a seed that is not an integer", () => {
    expect(() => seedFromAttribute("nope")).toThrow(/seed must be an integer/);
    expect(seedFromAttribute(undefined)).toBeUndefined();
    expect(seedFromAttribute("42")).toBe(42n);
  });

  it("re-renders when an attribute changes and keeps ids unique", () => {
    const window = new Window();
    defineSketchyElement("sketchy-shape", window.customElements, window.HTMLElement);
    const first = window.document.createElement("sketchy-shape");
    const second = window.document.createElement("sketchy-shape");
    first.setAttribute("seed", "7");
    second.setAttribute("seed", "7");
    first.setAttribute("shape", "path");
    second.setAttribute("shape", "path");
    first.setAttribute("d", "M10 10 H90 V70 H10 Z M30 30 H60 V50 H30 Z");
    second.setAttribute("d", "M10 10 H90 V70 H10 Z M30 30 H60 V50 H30 Z");
    window.document.body.append(first, second);
    const before = first.innerHTML;
    expect(before).toContain("<svg ");
    expect(first.innerHTML).not.toBe(second.innerHTML);
    const ids = [...`${first.innerHTML}${second.innerHTML}`.matchAll(/\sid="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(ids).size).toBe(ids.length);
    first.setAttribute("seed", "9");
    expect(first.innerHTML).not.toBe(before);
    first.setAttribute("seed", "nope");
    expect(first.getAttribute("data-sketchy-error")).toMatch(/seed must be an integer/);
  });
});

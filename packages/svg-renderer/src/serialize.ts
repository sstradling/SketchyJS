import { escapeAttribute } from "./format.js";
import type { SvgElement } from "./tree.js";

/** Serializes an element tree as an XML string (self-closing for childless elements). */
export function serializeSvg(node: SvgElement): string {
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttribute(v)}"`)
    .join("");
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map(serializeSvg).join("")}</${node.tag}>`;
}

/** The slice of the DOM `Document` the renderer needs, so no DOM typings are required. */
export interface SvgDocumentLike {
  createElementNS(namespace: string, name: string): SvgElementLike;
}

/** The slice of the DOM `Element` the renderer needs. */
export interface SvgElementLike {
  setAttribute(name: string, value: string): void;
  appendChild(child: SvgElementLike): unknown;
}

/** Builds DOM elements for a tree with `document.createElementNS`. */
export function toDom(node: SvgElement, document: SvgDocumentLike): SvgElementLike {
  const element = document.createElementNS("http://www.w3.org/2000/svg", node.tag);
  for (const [k, v] of Object.entries(node.attrs)) element.setAttribute(k, v);
  for (const child of node.children) element.appendChild(toDom(child, document));
  return element;
}

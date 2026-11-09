/** A minimal SVG element description shared by the string and DOM serializers. */
export interface SvgElement {
  tag: string;
  attrs: Readonly<Record<string, string>>;
  children: readonly SvgElement[];
}

/** Creates an element description. Attributes with `undefined` values are dropped. */
export function el(
  tag: string,
  attrs: Readonly<Record<string, string | undefined>> = {},
  children: readonly SvgElement[] = [],
): SvgElement {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) kept[key] = value;
  return { tag, attrs: kept, children };
}

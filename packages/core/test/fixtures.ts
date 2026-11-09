import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../fixtures/swift-reference/v1.5.0/", import.meta.url));

/** Loads a JSON fixture from the pinned Swift reference corpus. */
export function loadFixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(root + relativePath, "utf8")) as T;
}

/** Decodes a number that the exporter may have written as "NaN", "Infinity" or "-Infinity". */
export function decodeNumber(value: number | string): number {
  if (typeof value === "number") return value;
  if (value === "NaN") return Number.NaN;
  if (value === "Infinity") return Number.POSITIVE_INFINITY;
  if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
  throw new Error(`not a number: ${value}`);
}

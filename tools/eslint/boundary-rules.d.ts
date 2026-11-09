import type { Linter } from "eslint";

export const boundaries: {
  packages: Record<string, { dependencies: string[]; peers?: string[]; optionalPeers?: string[] }>;
  pureGeometryPackages: string[];
};
export function importRestrictions(name: string): Record<string, unknown>;
export function determinismRules(): Record<string, unknown>;
export function packageOverrides(): Linter.Config[];

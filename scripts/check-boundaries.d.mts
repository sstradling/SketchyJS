export function relativeSpecifiers(text: string): string[];
export function areaOf(rel: string): string | null;
export function importProblems(
  files: { rel: string; text: string }[],
  areas: Record<string, string[]>,
): string[];
export function undeclaredAreaProblems(dirs: string[], areas: Record<string, string[]>): string[];
export function domProblems(
  files: { rel: string; text: string }[],
  boundaries: {
    areas: Record<string, string[]>;
    domAreas?: string[];
    bannedInPureGeometry: {
      globals: string[];
      members: string[];
      newExpressions: string[];
    };
  },
): string[];
export function bannedHits(
  text: string,
  banned: { globals: string[]; members: string[]; newExpressions: string[] },
): string[];
export function packageProblems(
  name: string,
  pkg: {
    name?: string;
    sideEffects?: boolean;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  },
): string[];
export function collectRepoProblems(repo?: string): string[];

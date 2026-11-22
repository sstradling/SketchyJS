export function tsupEntries(source: string): Record<string, string>;
export function entryProblems(input: {
  exportsMap: Record<string, unknown>;
  typedocEntryPoints: string[];
  tsupSource: string;
}): string[];

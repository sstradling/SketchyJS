/** Plugin API version of this package. Bump `minor` for additive changes and `major` for breaking ones. */
export const PLUGIN_API_VERSION = { major: 1, minor: 1 } as const;

/** A plugin API version string, `"major.minor"`. */
export type PluginApi = `${number}.${number}`;

/** The four plugin kinds. */
export type PluginKind = "brush" | "fill" | "texture" | "edge";

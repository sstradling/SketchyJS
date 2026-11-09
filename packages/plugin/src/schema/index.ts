export { resolveOptions } from "./resolve.js";
export type { ResolveMode, ResolveResult, OptionDiagnostic } from "./resolve.js";
export { validateSchema, validateDefinition } from "./validate.js";
export { toJsonSchema } from "./json-schema.js";
export type { JsonSchema } from "./json-schema.js";
export { hashOptions, canonicalJson } from "./hash.js";
export { checkPluginApi, assertPluginApi } from "./compat.js";
export type { ApiCheck } from "./compat.js";
export { PluginOptionError, PluginApiError } from "./errors.js";

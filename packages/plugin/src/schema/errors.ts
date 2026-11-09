/** Thrown in strict mode when an option is out of range, wrongly typed or unknown. */
export class PluginOptionError extends Error {
  override readonly name = "PluginOptionError";
  constructor(
    readonly code: string,
    readonly option: string,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown when a plugin needs a newer (or an unsupported) plugin API than the host provides. */
export class PluginApiError extends Error {
  override readonly name = "PluginApiError";
  constructor(
    readonly code: "api-invalid" | "api-major-mismatch" | "api-minor-too-high",
    message: string,
  ) {
    super(message);
  }
}

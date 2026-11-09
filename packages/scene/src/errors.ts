/** Thrown by `Sketchy.use` when a different plugin already owns the same kind and id. */
export class PluginRegistrationError extends Error {
  override readonly name = "PluginRegistrationError";
}

/** Thrown when a plugin id is requested that no registry entry or plugin object provides. */
export class PluginNotRegisteredError extends Error {
  override readonly name = "PluginNotRegisteredError";
}

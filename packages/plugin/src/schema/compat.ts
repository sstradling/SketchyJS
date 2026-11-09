import { PLUGIN_API_VERSION } from "../version.js";
import { PluginApiError } from "./errors.js";

export type ApiCheck = { ok: true } | { ok: false; error: PluginApiError };

/**
 * Checks a plugin's declared API against the host's. Majors must match; the plugin's minor must
 * not exceed the host's. The message names the plugin and the fix.
 */
export function checkPluginApi(
  pluginId: string,
  api: string,
  host: { major: number; minor: number } = PLUGIN_API_VERSION,
): ApiCheck {
  const match = /^(\d+)\.(\d+)$/.exec(api);
  if (!match) {
    return {
      ok: false,
      error: new PluginApiError(
        "api-invalid",
        `${pluginId} declares api "${api}", which is not "major.minor"`,
      ),
    };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== host.major) {
    return {
      ok: false,
      error: new PluginApiError(
        "api-major-mismatch",
        `${pluginId} needs plugin API ${api}, host provides ${host.major}.${host.minor}. ${major > host.major ? "Upgrade @sketchy-js/scene." : "Update the plugin."}`,
      ),
    };
  }
  if (minor > host.minor) {
    return {
      ok: false,
      error: new PluginApiError(
        "api-minor-too-high",
        `${pluginId} needs plugin API ${api}, host provides ${host.major}.${host.minor}. Upgrade @sketchy-js/scene.`,
      ),
    };
  }
  return { ok: true };
}

/** Like `checkPluginApi` but throws the `PluginApiError`. */
export function assertPluginApi(
  pluginId: string,
  api: string,
  host?: { major: number; minor: number },
): void {
  const result = checkPluginApi(pluginId, api, host);
  if (!result.ok) throw result.error;
}

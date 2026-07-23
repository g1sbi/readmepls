import { DEFAULT_INSTANCE_URL } from "./config.js";

export const MARKER_ID = "readmepls-marker";
const MARKER_JS = "content-marker.js";

export interface ScriptingLike {
  registerContentScripts(
    scripts: chrome.scripting.RegisteredContentScript[],
  ): Promise<void>;
  unregisterContentScripts(
    filter?: chrome.scripting.ContentScriptFilter,
  ): Promise<void>;
}

export interface PermissionsLike {
  contains(p: chrome.permissions.Permissions): Promise<boolean>;
}

/** Registration for a custom instance's origin, or null when it's the default
 *  SaaS origin (already covered by the static content_scripts entry). */
export function buildMarkerRegistration(
  instanceUrl: string,
): chrome.scripting.RegisteredContentScript | null {
  let origin: string;
  try {
    origin = new URL(instanceUrl).origin;
  } catch {
    return null;
  }
  if (origin === new URL(DEFAULT_INSTANCE_URL).origin) return null;
  return {
    id: MARKER_ID,
    matches: [`${origin}/*`],
    js: [MARKER_JS],
    runAt: "document_start",
  };
}

/** Idempotently (un)register the marker content script for a custom instance,
 *  but only when host permission for that origin is already granted. */
export async function syncMarkerRegistration(
  scripting: ScriptingLike,
  permissions: PermissionsLike,
  instanceUrl: string,
): Promise<void> {
  // Clearing first keeps re-registration idempotent across instanceUrl changes.
  await scripting
    .unregisterContentScripts({ ids: [MARKER_ID] })
    .catch(() => {});
  const reg = buildMarkerRegistration(instanceUrl);
  if (!reg) return;
  if (!(await permissions.contains({ origins: reg.matches }))) return;
  await scripting.registerContentScripts([reg]);
}

import { hasMarker, EXTENSION_READY_EVENT } from "$lib/extension/detect.js";

let installed = $state(false);
let wired = false;

export const extensionStore = {
  get installed() {
    return installed;
  },
};

/** Wire detection once on the client: read the document_start marker, and
 *  listen for the late-injection event (self-host scripts register post-load). */
export function initExtensionDetection(): void {
  if (typeof document !== "undefined" && hasMarker(document)) installed = true;
  if (typeof window !== "undefined" && !wired) {
    wired = true;
    window.addEventListener(EXTENSION_READY_EVENT, () => (installed = true));
  }
}

/** Test seam: restore the pre-detection state between cases. */
export function resetExtensionDetection(): void {
  installed = false;
}

import { hasMarker } from "$lib/extension/detect.js";

let installed = $state(false);

export const extensionStore = {
  get installed() {
    return installed;
  },
};

/** Wire detection once on the client: the extension's static content script
 *  stamps its marker at document_start, so it's present by the time this runs. */
export function initExtensionDetection(): void {
  if (typeof document !== "undefined" && hasMarker(document)) installed = true;
}

/** Test seam: restore the pre-detection state between cases. */
export function resetExtensionDetection(): void {
  installed = false;
}

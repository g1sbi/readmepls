/** DOM marker the web app reads to detect the installed extension. Stamped by
 *  the content script at document_start so it's present before app JS runs. */
export const EXTENSION_READY_EVENT = "readmepls:extension-ready";

export function stampMarker(doc: Document, version: string): void {
  doc.documentElement.dataset.readmeplsExtension = version;
  doc.defaultView?.dispatchEvent(
    new CustomEvent(EXTENSION_READY_EVENT, { detail: { version } }),
  );
}

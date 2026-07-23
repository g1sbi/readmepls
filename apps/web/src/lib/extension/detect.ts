/** The marker the extension's content script stamps on <html>, and the event
 *  it fires. The web app reads both to know the extension is installed. */
export const EXTENSION_READY_EVENT = "readmepls:extension-ready";

export function hasMarker(doc: Document): boolean {
  return doc.documentElement.dataset.readmeplsExtension != null;
}

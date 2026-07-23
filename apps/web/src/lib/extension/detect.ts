/** The extension's static content script stamps this attribute on <html> at
 *  document_start; the web app reads it to know the extension is installed. */
export function hasMarker(doc: Document): boolean {
  return doc.documentElement.dataset.readmeplsExtension != null;
}

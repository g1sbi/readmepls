/** DOM marker the web app reads to detect the installed extension. Stamped by
 *  the content script at document_start so it's present before app JS runs. */
export function stampMarker(doc: Document, version: string): void {
  doc.documentElement.dataset.readmeplsExtension = version;
}

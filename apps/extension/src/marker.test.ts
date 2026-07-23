import { describe, it, expect } from "vitest";
import { stampMarker, EXTENSION_READY_EVENT } from "./marker.js";

function fakeDoc() {
  const dispatched: Event[] = [];
  const doc = {
    documentElement: { dataset: {} as Record<string, string> },
    defaultView: { dispatchEvent: (e: Event) => (dispatched.push(e), true) },
  } as unknown as Document;
  return { doc, dispatched };
}

describe("stampMarker", () => {
  it("stamps the version on the document element", () => {
    const { doc } = fakeDoc();
    stampMarker(doc, "0.2.0");
    expect(doc.documentElement.dataset.readmeplsExtension).toBe("0.2.0");
  });

  it("fires a readmepls:extension-ready event on the window", () => {
    const { doc, dispatched } = fakeDoc();
    stampMarker(doc, "0.2.0");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(EXTENSION_READY_EVENT);
  });
});

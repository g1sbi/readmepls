import { describe, it, expect } from "vitest";
import { stampMarker } from "./marker.js";

function fakeDoc() {
  const doc = {
    documentElement: { dataset: {} as Record<string, string> },
  } as unknown as Document;
  return { doc };
}

describe("stampMarker", () => {
  it("stamps the version on the document element", () => {
    const { doc } = fakeDoc();
    stampMarker(doc, "0.2.1");
    expect(doc.documentElement.dataset.readmeplsExtension).toBe("0.2.1");
  });
});

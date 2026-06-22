import { describe, it, expect } from "vitest";
import { deriveCardState } from "./card-state.js";

describe("deriveCardState", () => {
  it("is processing when no content is linked yet", () => {
    expect(deriveCardState(null)).toBe("processing");
    expect(deriveCardState(undefined)).toBe("processing");
  });
  it("maps extract_status to a card state", () => {
    expect(deriveCardState({ extract_status: "ok" })).toBe("ready");
    expect(deriveCardState({ extract_status: "partial" })).toBe("partial");
    expect(deriveCardState({ extract_status: "failed" })).toBe("failed");
    expect(deriveCardState({ extract_status: "pending" })).toBe("processing");
  });
});
